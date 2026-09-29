/**
 * Виртуал токены үлдэгдэл.
 *
 * Токен нь ЗӨВХӨН тоглоомын оноо — бодит мөнгө биш, ямар ч ханшаар
 * солигддоггүй, худалдаж авах боломжгүй. Бүртгүүлэхэд бэлэглэгдэж, бооцоотой
 * тоглолтын үр дүнгээр хэлбэлзэнэ. Дуусвал админ гараар нэмж өгнө.
 */

import {
  DAILY_TRANSFER_LIMIT,
  MIN_TRANSFER,
  transferFee,
} from '../../app/src/shared/transfer';
import { getPool } from './db';
import { sendEmail } from './email';

/** Шинэ бүртгэлд бэлэглэх токен. */
export const STARTING_TOKENS = 1_000_000;
/** Админ хүсэлтэд олгох анхдагч хэмжээ. */
export const DEFAULT_GRANT = 1_000_000;
/** Хүсэлт дараалан илгээхээс сэргийлэх хугацаа (минут). */
const REQUEST_COOLDOWN_MINUTES = 30;

export class TokenError extends Error {}

export interface PendingRequest {
  id: string;
  username: string;
  email: string | null;
  tokens: number;
  requestedAt: string;
}

export async function balanceOf(userId: string): Promise<number> {
  const result = await getPool().query<{ tokens: string }>(
    'SELECT tokens FROM users WHERE id = $1',
    [userId],
  );
  return Number(result.rows[0]?.tokens ?? 0);
}

/** Хэд хэдэн хэрэглэгчийн үлдэгдлийг нэг дуудлагаар авна. */
export async function balancesOf(userIds: string[]): Promise<Map<string, number>> {
  if (userIds.length === 0) return new Map();
  const result = await getPool().query<{ id: string; tokens: string }>(
    'SELECT id, tokens FROM users WHERE id = ANY($1::bigint[])',
    [userIds],
  );
  return new Map(result.rows.map((r) => [r.id, Number(r.tokens)]));
}

/**
 * Тоглолтын үр дүнг үлдэгдэлд тусгана.
 *
 * `changes` нь хэрэглэгчийн id → өөрчлөлт (эерэг = хожсон). Нэг гүйлгээнд
 * хийгдэх тул зарим нь амжилтгүй болвол бүгд буцна. Үлдэгдэл 0-ээс доош
 * унахгүй — тоглолт эхлэхэд хүрэлцээтэй эсэхийг шалгасан ч давхар хамгаалалт.
 */
export async function applySettlement(changes: Map<string, number>): Promise<void> {
  if (changes.size === 0) return;
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    for (const [userId, delta] of changes) {
      await client.query('UPDATE users SET tokens = GREATEST(0, tokens + $2) WHERE id = $1', [
        userId,
        delta,
      ]);
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Токен хүсэх. Админд имэйл илгээнэ (тохируулсан бол). */
export async function requestTokens(userId: string): Promise<void> {
  const pool = getPool();
  const user = await pool.query<{ username: string; email: string | null; tokens: string }>(
    'SELECT username, email, tokens FROM users WHERE id = $1',
    [userId],
  );
  const row = user.rows[0];
  if (!row) throw new TokenError('Хэрэглэгч олдсонгүй.');

  const recent = await pool.query<{ wait: number }>(
    `SELECT CEIL(GREATEST(0, $2 * 60 - EXTRACT(EPOCH FROM (now() - requested_at))) / 60)::int AS wait
       FROM token_requests
      WHERE user_id = $1 AND granted_at IS NULL
      ORDER BY requested_at DESC LIMIT 1`,
    [userId, REQUEST_COOLDOWN_MINUTES],
  );
  const wait = recent.rows[0]?.wait ?? 0;
  if (wait > 0) {
    throw new TokenError(`Хүсэлт илгээгдсэн байна. ${wait} минутын дараа дахин оролдоно уу.`);
  }

  await pool.query('INSERT INTO token_requests (user_id) VALUES ($1)', [userId]);
  await notifyAdmin(row.username, row.email, Number(row.tokens));
}

async function notifyAdmin(username: string, email: string | null, tokens: number): Promise<void> {
  const admin = process.env.ADMIN_EMAIL;
  if (!admin) {
    console.log(`ТОКЕН ХҮСЭЛТ: ${username} (${email ?? 'имэйлгүй'}) — үлдэгдэл ${tokens}`);
    return;
  }
  const text = [
    'Токен хүссэн хэрэглэгч:',
    '',
    `  Нэр:       ${username}`,
    `  Имэйл:     ${email ?? '—'}`,
    `  Үлдэгдэл:  ${tokens}`,
    '',
    'Олгох:',
    `  npm run tokens -- grant ${username} ${DEFAULT_GRANT}`,
  ].join('\n');

  try {
    await sendEmail({ to: admin, subject: `Дай Ди — ${username} токен хүслээ`, text });
  } catch (err) {
    console.error('Админд мэдэгдэж чадсангүй:', err instanceof Error ? err.message : err);
  }
}

/** Хүлээгдэж буй хүсэлтүүд. */
export async function pendingRequests(): Promise<PendingRequest[]> {
  const result = await getPool().query<{
    id: string;
    username: string;
    email: string | null;
    tokens: string;
    requested_at: Date;
  }>(
    `SELECT r.id, u.username, u.email, u.tokens, r.requested_at
       FROM token_requests r JOIN users u ON u.id = r.user_id
      WHERE r.granted_at IS NULL
      ORDER BY r.requested_at`,
  );
  return result.rows.map((r) => ({
    id: r.id,
    username: r.username,
    email: r.email,
    tokens: Number(r.tokens),
    requestedAt: r.requested_at.toISOString(),
  }));
}

/** Админ токен олгоно. Хүлээгдэж буй хүсэлтүүдийг хаана. */
export async function grantTokens(username: string, amount: number): Promise<number> {
  if (!Number.isFinite(amount) || amount <= 0) throw new TokenError('Хэмжээ эерэг байх ёстой.');
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const updated = await client.query<{ id: string; tokens: string }>(
      'UPDATE users SET tokens = tokens + $2 WHERE username_key = $1 RETURNING id, tokens',
      [username.trim().toLowerCase(), Math.round(amount)],
    );
    const row = updated.rows[0];
    if (!row) throw new TokenError(`"${username}" нэртэй хэрэглэгч олдсонгүй.`);

    await client.query(
      `UPDATE token_requests SET granted_at = now(), granted = $2
        WHERE user_id = $1 AND granted_at IS NULL`,
      [row.id, Math.round(amount)],
    );
    await client.query('COMMIT');
    return Number(row.tokens);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export interface TransferResult {
  toId: string;
  toUsername: string;
  /** Илгээгчээс хасагдсан. */
  amount: number;
  fee: number;
  /** Хүлээн авагчид очсон (amount − fee). */
  received: number;
  fromBalance: number;
  toBalance: number;
}

/**
 * Нэг тоглогчоос нөгөөд чип шилжүүлнэ.
 *
 * `to` нь userId эсвэл хэрэглэгчийн нэрээр. `locked` нь явж буй бооцоотой
 * тоглолтод түгжигдсэн хэмжээ — түүнийг шилжүүлж болохгүй, эс бөгөөс
 * хожигдохоосоо өмнө чипээ найздаа өгч бооцооноос зугтана.
 *
 * Хоёр мөрийг id-н дарааллаар FOR UPDATE түгжинэ: зэрэг ирсэн шилжүүлгүүд
 * дараалалд орж, үлдэгдэл/өдрийн хязгаар давхар зарцуулагдахгүй, мөн A→B,
 * B→A зэрэг явахад deadlock үүсэхгүй.
 */
export async function transferTokens(
  fromId: string,
  to: { userId: string } | { username: string },
  amount: number,
  locked = 0,
): Promise<TransferResult> {
  if (!Number.isInteger(amount) || amount < MIN_TRANSFER) {
    throw new TokenError(`Хамгийн багадаа ${MIN_TRANSFER} чип илгээнэ.`);
  }

  const client = await getPool().connect();
  try {
    await client.query('BEGIN');

    const target =
      'userId' in to
        ? await client.query<{ id: string }>('SELECT id FROM users WHERE id = $1', [to.userId])
        : await client.query<{ id: string }>('SELECT id FROM users WHERE username_key = $1', [
            to.username.trim().toLowerCase(),
          ]);
    const toId = target.rows[0]?.id;
    if (!toId) throw new TokenError('Хүлээн авах хэрэглэгч олдсонгүй.');
    if (toId === fromId) throw new TokenError('Өөр рүүгээ чип илгээх боломжгүй.');

    const rows = await client.query<{
      id: string;
      username: string;
      tokens: string;
      email_verified: boolean;
    }>(
      `SELECT id, username, tokens, email_verified FROM users
        WHERE id = ANY($1::bigint[]) ORDER BY id FOR UPDATE`,
      [[fromId, toId]],
    );
    const sender = rows.rows.find((r) => r.id === fromId);
    const recipient = rows.rows.find((r) => r.id === toId);
    if (!sender || !recipient) throw new TokenError('Хэрэглэгч олдсонгүй.');
    if (!sender.email_verified) {
      throw new TokenError('Чип илгээхийн өмнө имэйлээ баталгаажуулна уу.');
    }

    const sent = await client.query<{ total: string }>(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM token_transfers
        WHERE from_user = $1 AND created_at > now() - interval '24 hours'`,
      [fromId],
    );
    const left = DAILY_TRANSFER_LIMIT - Number(sent.rows[0].total);
    if (amount > left) {
      throw new TokenError(
        left > 0
          ? `24 цагт ${DAILY_TRANSFER_LIMIT} хүртэл илгээнэ. Үлдсэн эрх: ${left}.`
          : `24 цагийн хязгаар (${DAILY_TRANSFER_LIMIT}) дууссан байна.`,
      );
    }

    const free = Number(sender.tokens) - locked;
    if (amount > free) {
      throw new TokenError(
        locked > 0
          ? `Чип хүрэлцэхгүй. ${locked} нь явж буй тоглолтын бооцоонд түгжигдсэн тул ${Math.max(0, free)} хүртэл илгээнэ.`
          : `Чип хүрэлцэхгүй. Үлдэгдэл: ${sender.tokens}.`,
      );
    }

    const fee = transferFee(amount);
    const received = amount - fee;
    const from = await client.query<{ tokens: string }>(
      'UPDATE users SET tokens = tokens - $2 WHERE id = $1 RETURNING tokens',
      [fromId, amount],
    );
    const toRow = await client.query<{ tokens: string }>(
      'UPDATE users SET tokens = tokens + $2 WHERE id = $1 RETURNING tokens',
      [toId, received],
    );
    await client.query(
      'INSERT INTO token_transfers (from_user, to_user, amount, fee) VALUES ($1, $2, $3, $4)',
      [fromId, toId, amount, fee],
    );
    await client.query('COMMIT');

    return {
      toId,
      toUsername: recipient.username,
      amount,
      fee,
      received,
      fromBalance: Number(from.rows[0].tokens),
      toBalance: Number(toRow.rows[0].tokens),
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Цол ахисны шагнал олгоно. Шинэ үлдэгдлийг буцаана.
 *
 * `grantTokens`-оос ялгаатай нь: админы хүсэлтийг хаахгүй, зөвхөн үлдэгдэл
 * нэмнэ. Хожил нь түүхээс тоологддог тул давхар олгогдох эрсдэлгүй —
 * тухайн тоглолт нэг л удаа бичигдэнэ.
 */
export async function awardTokens(userId: string, amount: number): Promise<number> {
  if (!Number.isFinite(amount) || amount <= 0) return balanceOf(userId);
  const result = await getPool().query<{ tokens: string }>(
    'UPDATE users SET tokens = tokens + $2 WHERE id = $1 RETURNING tokens',
    [userId, Math.round(amount)],
  );
  return Number(result.rows[0]?.tokens ?? 0);
}
