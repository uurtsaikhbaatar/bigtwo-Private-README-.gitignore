/**
 * Виртуал токены үлдэгдэл.
 *
 * Токен нь ЗӨВХӨН тоглоомын оноо — бодит мөнгө биш, ямар ч ханшаар
 * солигддоггүй, худалдаж авах боломжгүй. Бүртгүүлэхэд бэлэглэгдэж, бооцоотой
 * тоглолтын үр дүнгээр хэлбэлзэнэ. Дуусвал админ гараар нэмж өгнө.
 */

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
