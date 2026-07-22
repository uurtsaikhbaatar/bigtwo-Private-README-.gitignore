/**
 * Бүртгэл, нэвтрэлт.
 *
 * Нууц үгийг `scrypt`-ээр давсалж hash-лана — Node-д суурилагдсан тул нэмэлт
 * сан хэрэггүй бөгөөд буцаан задлах боломжгүй. Сервер нууц үгийг хэзээ ч
 * задлан хадгалдаггүй.
 */

import { randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

import { getPool } from './db';

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

export class AuthError extends Error {}

export interface Account {
  id: string;
  username: string;
}

/** Нэрийг харьцуулахад ашиглах хэлбэр — том/жижиг үсэг ялгахгүй. */
const normalise = (username: string): string => username.trim().toLowerCase();

function validate(username: string, password: string): void {
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

/** Шинэ хэрэглэгч бүртгэж, session нээнэ. */
export async function register(
  username: string,
  password: string,
): Promise<{ account: Account; token: string }> {
  validate(username, password);
  const name = username.trim();
  const pool = getPool();

  const existing = await pool.query('SELECT 1 FROM users WHERE username_key = $1', [
    normalise(name),
  ]);
  if (existing.rowCount) throw new AuthError('Энэ нэр аль хэдийн бүртгэгдсэн байна.');

  const inserted = await pool.query<{ id: string }>(
    'INSERT INTO users (username, username_key, password) VALUES ($1, $2, $3) RETURNING id',
    [name, normalise(name), await hashPassword(password)],
  );
  const account: Account = { id: inserted.rows[0].id, username: name };
  return { account, token: await openSession(account.id) };
}

/** Нэвтрэх. Нэр эсвэл нууц үг буруу бол ижил мессеж — аль нь буруу болохыг задруулахгүй. */
export async function login(
  username: string,
  password: string,
): Promise<{ account: Account; token: string }> {
  const pool = getPool();
  const found = await pool.query<{ id: string; username: string; password: string }>(
    'SELECT id, username, password FROM users WHERE username_key = $1',
    [normalise(username)],
  );

  const row = found.rows[0];
  const ok = row ? await verifyPassword(password, row.password) : false;
  if (!row || !ok) throw new AuthError('Нэр эсвэл нууц үг буруу байна.');

  const account: Account = { id: row.id, username: row.username };
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
  const result = await getPool().query<{ id: string; username: string }>(
    `SELECT u.id, u.username FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token = $1 AND s.expires_at > now()`,
    [token],
  );
  const row = result.rows[0];
  return row ? { id: row.id, username: row.username } : null;
}

export async function logout(token: string): Promise<void> {
  await getPool().query('DELETE FROM sessions WHERE token = $1', [token]);
}
