/**
 * Бүртгэл, нэвтрэлт.
 *
 * Нууц үгийг `scrypt`-ээр давсалж hash-лана — Node-д суурилагдсан тул нэмэлт
 * сан хэрэггүй бөгөөд буцаан задлах боломжгүй. Сервер нууц үгийг хэзээ ч
 * задлан хадгалдаггүй.
 */

import { randomBytes, randomInt, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

import type { Account } from '../../app/src/shared/protocol';
import { getPool } from './db';
import { sendEmail, verificationEmail } from './email';

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
/** Session хэдэн хоног хүчинтэй байх. */
const SESSION_DAYS = 60;

export const MIN_USERNAME = 2;
export const MAX_USERNAME = 16;
export const MIN_PASSWORD = 6;

/** Баталгаажуулах код хэдэн минут хүчинтэй байх. */
const CODE_TTL_MINUTES = 15;
/** Нэг кодыг хэдэн удаа буруу оруулж болох. */
const MAX_CODE_ATTEMPTS = 5;
/** Код дахин илгээх хооронд хэдэн секунд хүлээх. */
const RESEND_COOLDOWN_SECONDS = 60;

export class AuthError extends Error {}

export type { Account };

/** Нэрийг харьцуулахад ашиглах хэлбэр — том/жижиг үсэг ялгахгүй. */
const normalise = (username: string): string => username.trim().toLowerCase();

function validate(username: string, password: string, email: string): void {
  const name = username.trim();
  if (name.length < MIN_USERNAME || name.length > MAX_USERNAME) {
    throw new AuthError(`Нэр ${MIN_USERNAME}–${MAX_USERNAME} тэмдэгт байх ёстой.`);
  }
  if (!/^[\p{L}\p{N}_ -]+$/u.test(name)) {
    throw new AuthError('Нэрэнд үсэг, тоо, зай, доогуур зураас л орно.');
  }
  if (password.length < MIN_PASSWORD) {
    throw new AuthError(`Нууц үг дор хаяж ${MIN_PASSWORD} тэмдэгт байх ёстой.`);
  }
  if (!isEmail(email)) {
    throw new AuthError('Имэйл хаяг буруу байна.');
  }
}

/**
 * Имэйлийн энгийн шалгалт. Жинхэнэ баталгаа нь код илгээж хүлээн авах явдал
 * тул энд зөвхөн илэрхий алдааг барина.
 */
function isEmail(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length <= 254 && /^[^\s@]+@[^\s@.]+\.[^\s@]+$/.test(trimmed);
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await scryptAsync(password, salt, KEY_LENGTH);
  return `${salt.toString('hex')}:${key.toString('hex')}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, keyHex] = stored.split(':');
  if (!saltHex || !keyHex) return false;
  const key = await scryptAsync(password, Buffer.from(saltHex, 'hex'), KEY_LENGTH);
  const expected = Buffer.from(keyHex, 'hex');
  // Урт нь зөрвөл timingSafeEqual алдаа шиднэ — эхлээд шалгана.
  if (expected.length !== key.length) return false;
  return timingSafeEqual(key, expected);
}

/** Шинэ хэрэглэгч бүртгэж, session нээгээд баталгаажуулах код илгээнэ. */
export async function register(
  username: string,
  password: string,
  email: string,
): Promise<{ account: Account; token: string }> {
  validate(username, password, email);
  const name = username.trim();
  const address = email.trim();
  const pool = getPool();

  const existing = await pool.query(
    'SELECT username_key, email_key FROM users WHERE username_key = $1 OR email_key = $2',
    [normalise(name), normalise(address)],
  );
  for (const row of existing.rows as Array<{ username_key: string; email_key: string | null }>) {
    if (row.username_key === normalise(name)) {
      throw new AuthError('Энэ нэр аль хэдийн бүртгэгдсэн байна.');
    }
    if (row.email_key === normalise(address)) {
      throw new AuthError('Энэ имэйлээр бүртгэл үүссэн байна.');
    }
  }

  const inserted = await pool.query<{ id: string }>(
    `INSERT INTO users (username, username_key, password, email, email_key)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [name, normalise(name), await hashPassword(password), address, normalise(address)],
  );

  const account: Account = {
    id: inserted.rows[0].id,
    username: name,
    email: address,
    emailVerified: false,
  };
  await issueCode(account);
  return { account, token: await openSession(account.id) };
}

// ── Имэйл баталгаажуулалт ──────────────────────────────────────────────────

/** 6 оронтой код үүсгэж, hash-лан хадгалаад имэйлээр илгээнэ. */
async function issueCode(account: Account): Promise<void> {
  if (!account.email) return;
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const expires = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000);

  await getPool().query(
    `INSERT INTO email_codes (user_id, code_hash, expires_at, attempts, sent_at)
     VALUES ($1, $2, $3, 0, now())
     ON CONFLICT (user_id) DO UPDATE
       SET code_hash = $2, expires_at = $3, attempts = 0, sent_at = now()`,
    [account.id, await hashPassword(code), expires],
  );

  const message = verificationEmail(account.username, code);
  await sendEmail({ to: account.email, ...message });
}

/** Кодыг шалгаж, зөв бол имэйлийг баталгаажуулсанд тооцно. */
export async function verifyEmail(userId: string, code: string): Promise<Account> {
  const pool = getPool();
  const found = await pool.query<{ code_hash: string; attempts: number; expired: boolean }>(
    `SELECT code_hash, attempts, expires_at < now() AS expired
       FROM email_codes WHERE user_id = $1`,
    [userId],
  );
  const row = found.rows[0];
  if (!row) throw new AuthError('Код олдсонгүй. Дахин илгээнэ үү.');
  if (row.expired) throw new AuthError('Кодын хугацаа дууссан. Дахин илгээнэ үү.');
  if (row.attempts >= MAX_CODE_ATTEMPTS) {
    throw new AuthError('Хэт олон удаа буруу оруулсан. Дахин илгээнэ үү.');
  }

  if (!(await verifyPassword(code.trim(), row.code_hash))) {
    await pool.query('UPDATE email_codes SET attempts = attempts + 1 WHERE user_id = $1', [userId]);
    const left = MAX_CODE_ATTEMPTS - row.attempts - 1;
    throw new AuthError(`Код буруу байна. ${left > 0 ? `${left} оролдлого үлдлээ.` : ''}`.trim());
  }

  await pool.query('UPDATE users SET email_verified = true WHERE id = $1', [userId]);
  await pool.query('DELETE FROM email_codes WHERE user_id = $1', [userId]);
  const account = await accountById(userId);
  if (!account) throw new AuthError('Хэрэглэгч олдсонгүй.');
  return account;
}

/** Кодыг дахин илгээнэ. Хэт олон дахин илгээхээс сэргийлнэ. */
export async function resendCode(userId: string): Promise<void> {
  const account = await accountById(userId);
  if (!account) throw new AuthError('Хэрэглэгч олдсонгүй.');
  if (account.emailVerified) throw new AuthError('Имэйл аль хэдийн баталгаажсан байна.');

  const last = await getPool().query<{ wait: number }>(
    `SELECT GREATEST(0, $2 - EXTRACT(EPOCH FROM (now() - sent_at)))::int AS wait
       FROM email_codes WHERE user_id = $1`,
    [userId, RESEND_COOLDOWN_SECONDS],
  );
  const wait = last.rows[0]?.wait ?? 0;
  if (wait > 0) throw new AuthError(`${wait} секундын дараа дахин оролдоно уу.`);

  await issueCode(account);
}

async function accountById(userId: string): Promise<Account | null> {
  const result = await getPool().query<{
    id: string;
    username: string;
    email: string | null;
    email_verified: boolean;
  }>('SELECT id, username, email, email_verified FROM users WHERE id = $1', [userId]);
  const row = result.rows[0];
  return row
    ? {
        id: row.id,
        username: row.username,
        email: row.email ?? undefined,
        emailVerified: row.email_verified,
      }
    : null;
}

/** Нэвтрэх. Нэр эсвэл нууц үг буруу бол ижил мессеж — аль нь буруу болохыг задруулахгүй. */
export async function login(
  username: string,
  password: string,
): Promise<{ account: Account; token: string }> {
  const pool = getPool();
  const found = await pool.query<{
    id: string;
    username: string;
    password: string;
    email: string | null;
    email_verified: boolean;
  }>(
    'SELECT id, username, password, email, email_verified FROM users WHERE username_key = $1',
    [normalise(username)],
  );

  const row = found.rows[0];
  const ok = row ? await verifyPassword(password, row.password) : false;
  if (!row || !ok) throw new AuthError('Нэр эсвэл нууц үг буруу байна.');

  const account: Account = {
    id: row.id,
    username: row.username,
    email: row.email ?? undefined,
    emailVerified: row.email_verified,
  };
  return { account, token: await openSession(account.id) };
}

async function openSession(userId: string): Promise<string> {
  const token = `${randomUUID()}${randomUUID()}`.replace(/-/g, '');
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await getPool().query(
    'INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, $3)',
    [token, userId, expires],
  );
  return token;
}

/** Session token-оор хэрэглэгчийг олно. Хүчингүй бол `null`. */
export async function accountForToken(token: string): Promise<Account | null> {
  if (!token) return null;
  const result = await getPool().query<{
    id: string;
    username: string;
    email: string | null;
    email_verified: boolean;
  }>(
    `SELECT u.id, u.username, u.email, u.email_verified FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token = $1 AND s.expires_at > now()`,
    [token],
  );
  const row = result.rows[0];
  return row
    ? {
        id: row.id,
        username: row.username,
        email: row.email ?? undefined,
        emailVerified: row.email_verified,
      }
    : null;
}

export async function logout(token: string): Promise<void> {
  await getPool().query('DELETE FROM sessions WHERE token = $1', [token]);
}
