/**
 * Бүртгэл, нэвтрэлт, тоглолтын түүхийн тест.
 *
 * `DATABASE_URL` тохируулаагүй бол бүгд алгасагдана — сангүйгээр ч бусад
 * тестүүд ажиллах ёстой.
 */

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, test } from 'node:test';

import {
  addPlayer,
  createGame,
  startMatch,
  type GameState,
} from '../../app/src/shared/game';
import {
  AuthError,
  accountForToken,
  login,
  logout,
  register,
  resendCode,
  verifyEmail,
} from './auth';
import { closePool, dbEnabled, getPool, initSchema } from './db';
import { recentMatches, recordMatch, statsForUser } from './history';
import {
  STARTING_TOKENS,
  TokenError,
  applySettlement,
  balanceOf,
  balancesOf,
  grantTokens,
  pendingRequests,
  requestTokens,
} from './tokens';

const skip = dbEnabled() ? false : 'DATABASE_URL тохируулаагүй';

/** Тест бүрд давхцахгүй нэр. */
const uniqueName = () => `тест_${randomUUID().slice(0, 8)}`;
/** Тест бүрд давхцахгүй имэйл. */
const uniqueEmail = () => `${randomUUID().slice(0, 8)}@жишээ.тест`;

/** Тестийн тоглолтод ашиглах бооцоо. */
const MATCH_STAKE = 5_000;

/** Дууссан тоглолтын төлөв гараар угсарна. */
function finishedMatch(winner: string, others: string[]): GameState {
  const state = createGame();
  addPlayer(state, 'w', winner);
  others.forEach((n, i) => addPlayer(state, `l${i}`, n));
  startMatch(state, 30, 30, MATCH_STAKE);

  state.phase = 'matchEnd';
  state.matchWinnerId = 'w';
  state.round = 7;
  state.players.forEach((p, i) => {
    p.score = p.id === 'w' ? 12 : 30 + i;
    p.eliminated = p.id !== 'w';
  });
  state.settlement = state.players.map((p) => ({
    playerId: p.id,
    amount: p.id === 'w' ? MATCH_STAKE * others.length : -MATCH_STAKE,
  }));
  return state;
}

/**
 * Тест бүр дуусахад өөрийн хогоо цэвэрлэнэ.
 *
 * Өмнө нь TEST01/TEST02 өрөөний тоглолтууд санд үлдэж, жинхэнэ тоглогчдын
 * түүхийг бөглөрүүлж байв — `npm test` ажиллуулах бүрд хоёр тоглолт
 * нэмэгддэг байсан.
 */
after(async () => {
  if (!dbEnabled()) return;
  try {
    await getPool().query("DELETE FROM matches WHERE room_code IN ('TEST01', 'TEST02')");
  } catch (err) {
    console.error('туршилтын өгөгдөл цэвэрлэж чадсангүй:', err);
  }
  await closePool();
});

test('схем үүсгэх нь давтахад аюулгүй', { skip }, async () => {
  await initSchema();
  await initSchema();
  const tables = await getPool().query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
  );
  const names = tables.rows.map((r) => r.table_name);
  for (const expected of ['users', 'sessions', 'matches', 'match_players']) {
    assert.ok(names.includes(expected), `${expected} хүснэгт үүссэн байх`);
  }
});

test('бүртгүүлэх, нэвтрэх, session сэргээх', { skip }, async () => {
  const name = uniqueName();
  const created = await register(name, 'нууц-үг-123', uniqueEmail());
  assert.equal(created.account.username, name);
  assert.ok(created.token.length > 20);

  const resumed = await accountForToken(created.token);
  assert.equal(resumed?.id, created.account.id, 'token-оор хэрэглэгч олдоно');

  const signedIn = await login(name.toUpperCase(), 'нууц-үг-123');
  assert.equal(signedIn.account.id, created.account.id, 'нэр том/жижиг үсэг ялгахгүй');

  await logout(created.token);
  assert.equal(await accountForToken(created.token), null, 'гарсны дараа token хүчингүй');
  assert.ok(await accountForToken(signedIn.token), 'бусад session хэвээр');
});

test('нууц үг задлан хадгалагддаггүй', { skip }, async () => {
  const name = uniqueName();
  const password = 'маш-нууц-үг';
  const { account } = await register(name, password, uniqueEmail());

  const row = await getPool().query<{ password: string }>(
    'SELECT password FROM users WHERE id = $1',
    [account.id],
  );
  const stored = row.rows[0].password;
  assert.ok(!stored.includes(password), 'нууц үг задлан хадгалагдсан байна!');
  assert.match(stored, /^[0-9a-f]{32}:[0-9a-f]{128}$/, 'давс:hash хэлбэртэй байх');
});

test('буруу нууц үг, давхардсан нэрийг татгалзана', { skip }, async () => {
  const name = uniqueName();
  await register(name, 'зөв-нууц-үг', uniqueEmail());

  await assert.rejects(() => login(name, 'буруу-нууц'), AuthError);
  await assert.rejects(() => login(uniqueName(), 'ямар ч'), AuthError);
  await assert.rejects(() => register(name, 'өөр-нууц-үг', uniqueEmail()), AuthError, 'нэр давхардаж болохгүй');
  await assert.rejects(() => register(uniqueName(), '123', uniqueEmail()), AuthError, 'нууц үг хэт богино');
  await assert.rejects(() => register('a', 'нууц-үг-123', uniqueEmail()), AuthError, 'нэр хэт богино');
});

// ── Имэйл баталгаажуулалт ──────────────────────────────────────────────────

/** Илгээсэн кодыг лог руу бичдэг тул тестэд сангаас нь шууд шалгах боломжгүй —
 *  оронд нь бүх боломжит кодыг туршихгүйгээр, код үүссэн эсэхийг шалгана. */
async function codeRowFor(userId: string) {
  const r = await getPool().query<{ attempts: number; expired: boolean }>(
    `SELECT attempts, expires_at < now() AS expired FROM email_codes WHERE user_id = $1`,
    [userId],
  );
  return r.rows[0] ?? null;
}

test('бүртгэхэд имэйл шаардана, буруу бол татгалзана', { skip }, async () => {
  await assert.rejects(
    () => register(uniqueName(), 'нууц-үг-123', 'имэйлбиш'),
    AuthError,
    '@ байхгүй',
  );
  await assert.rejects(
    () => register(uniqueName(), 'нууц-үг-123', 'a@b'),
    AuthError,
    'домэйнгүй',
  );
  await assert.rejects(() => register(uniqueName(), 'нууц-үг-123', ''), AuthError, 'хоосон');
});

test('нэг имэйлээр хоёр бүртгэл үүсэхгүй', { skip }, async () => {
  const email = uniqueEmail();
  await register(uniqueName(), 'нууц-үг-123', email);
  await assert.rejects(
    () => register(uniqueName(), 'нууц-үг-123', email.toUpperCase()),
    AuthError,
    'том/жижиг үсгээр ялгагдахгүй',
  );
});

test('бүртгүүлэхэд код үүсэж, имэйл баталгаажаагүй байна', { skip }, async () => {
  const { account } = await register(uniqueName(), 'нууц-үг-123', uniqueEmail());
  assert.equal(account.emailVerified, false, 'шинэ бүртгэл баталгаажаагүй');
  assert.ok(account.email, 'имэйл хадгалагдсан');

  const row = await codeRowFor(account.id);
  assert.ok(row, 'код үүссэн байх');
  assert.equal(row!.attempts, 0);
  assert.equal(row!.expired, false, 'код хүчинтэй');
});

test('код нь задлан хадгалагддаггүй', { skip }, async () => {
  const { account } = await register(uniqueName(), 'нууц-үг-123', uniqueEmail());
  const stored = await getPool().query<{ code_hash: string }>(
    'SELECT code_hash FROM email_codes WHERE user_id = $1',
    [account.id],
  );
  assert.match(
    stored.rows[0].code_hash,
    /^[0-9a-f]{32}:[0-9a-f]{128}$/,
    'давс:hash хэлбэртэй байх — 6 оронтой код задгай хадгалагдахгүй',
  );
});

test('буруу код оролдлогыг тоолж, хязгаарт хүрвэл түгжинэ', { skip }, async () => {
  const { account } = await register(uniqueName(), 'нууц-үг-123', uniqueEmail());

  // 6 оронтой кодыг таамаглах магадлал 1/1,000,000 — практикт буруу байна.
  for (let i = 1; i <= 5; i++) {
    await assert.rejects(() => verifyEmail(account.id, '000000'), AuthError);
    const row = await codeRowFor(account.id);
    assert.equal(row!.attempts, i, `${i} дэх оролдлого тоологдсон байх`);
  }
  await assert.rejects(
    () => verifyEmail(account.id, '000000'),
    /Хэт олон удаа/,
    'хязгаарт хүрвэл түгжинэ',
  );
});

test('код дахин илгээхийг хязгаарлана', { skip }, async () => {
  const { account } = await register(uniqueName(), 'нууц-үг-123', uniqueEmail());
  await assert.rejects(() => resendCode(account.id), /секундын дараа/, 'дараалан илгээхгүй');
});

// ── Виртуал токен ──────────────────────────────────────────────────────────

test('шинэ бүртгэлд 1 сая токен өгнө', { skip }, async () => {
  const { account } = await register(uniqueName(), 'нууц-үг-123', uniqueEmail());
  assert.equal(account.tokens, STARTING_TOKENS);
  assert.equal(await balanceOf(account.id), STARTING_TOKENS, 'санд ч мөн адил');
});

test('тоглолтын тооцоо үлдэгдэлд тусна, нийлбэр нь тэг', { skip }, async () => {
  const winner = await register(uniqueName(), 'нууц-үг-123', uniqueEmail());
  const loser = await register(uniqueName(), 'нууц-үг-123', uniqueEmail());

  await applySettlement(
    new Map([
      [winner.account.id, 50_000],
      [loser.account.id, -50_000],
    ]),
  );

  assert.equal(await balanceOf(winner.account.id), STARTING_TOKENS + 50_000);
  assert.equal(await balanceOf(loser.account.id), STARTING_TOKENS - 50_000);
});

test('үлдэгдэл 0-ээс доош унахгүй', { skip }, async () => {
  const { account } = await register(uniqueName(), 'нууц-үг-123', uniqueEmail());
  await applySettlement(new Map([[account.id, -STARTING_TOKENS * 2]]));
  assert.equal(await balanceOf(account.id), 0, 'сөрөг үлдэгдэл үүсэхгүй');
});

test('олон үлдэгдлийг нэг дуудлагаар авна', { skip }, async () => {
  const a = await register(uniqueName(), 'нууц-үг-123', uniqueEmail());
  const b = await register(uniqueName(), 'нууц-үг-123', uniqueEmail());
  const balances = await balancesOf([a.account.id, b.account.id]);
  assert.equal(balances.get(a.account.id), STARTING_TOKENS);
  assert.equal(balances.get(b.account.id), STARTING_TOKENS);
});

test('токен хүсэх, админ олгох урсгал', { skip }, async () => {
  const name = uniqueName();
  const { account } = await register(name, 'нууц-үг-123', uniqueEmail());
  await applySettlement(new Map([[account.id, -STARTING_TOKENS]]));

  await requestTokens(account.id);
  const pending = await pendingRequests();
  assert.ok(
    pending.some((r) => r.username === name),
    'хүсэлт жагсаалтад орсон байх',
  );

  // Дараалан хүсэхийг хязгаарлана.
  await assert.rejects(() => requestTokens(account.id), /минутын дараа/);

  const balance = await grantTokens(name, 500_000);
  assert.equal(balance, 500_000, 'олгосон хэмжээ нэмэгдсэн');

  const after = await pendingRequests();
  assert.ok(
    !after.some((r) => r.username === name),
    'олгосны дараа хүсэлт хаагдана',
  );
});

test('байхгүй хэрэглэгчид токен олгохгүй', { skip }, async () => {
  await assert.rejects(() => grantTokens('байхгүй_хэрэглэгч_xyz', 1000), TokenError);
  await assert.rejects(() => grantTokens(uniqueName(), -5), TokenError, 'сөрөг хэмжээ');
});

test('тоглолтын түүх ба статистик бүртгэгдэнэ', { skip }, async () => {
  const name = uniqueName();
  const { account } = await register(name, 'нууц-үг-123', uniqueEmail());

  const before = await statsForUser(account.id);
  const state = finishedMatch(name, ['Бат', 'Цэцэг']);
  await recordMatch(state, 'TEST01', new Map([['w', account.id]]), true);

  const after = await statsForUser(account.id);
  assert.equal(after.matches, before.matches + 1, 'тоглолт нэмэгдсэн');
  assert.equal(after.wins, before.wins + 1, 'ялалт нэмэгдсэн');
  assert.equal(after.chips, before.chips + MATCH_STAKE * 2, 'бооцоо × 2 хожигдогч');

  const matches = await recentMatches(account.id, 5);
  assert.ok(matches.length >= 1);
  const latest = matches[0];
  assert.equal(latest.roomCode, 'TEST01');
  assert.equal(latest.won, true);
  assert.equal(latest.chips, MATCH_STAKE * 2);
  assert.equal(latest.players.length, 3, 'бүх оролцогч хадгалагдана');
  assert.equal(latest.players[0].won, true, 'ялагч эхэнд');
});

test('зочин тоглогч user_id-гүй бүртгэгдэнэ', { skip }, async () => {
  const state = finishedMatch(uniqueName(), ['Зочин1', 'Зочин2']);
  await recordMatch(state, 'TEST02', new Map(), true);

  const rows = await getPool().query<{ user_id: string | null }>(
    `SELECT mp.user_id FROM match_players mp
       JOIN matches m ON m.id = mp.match_id
      WHERE m.room_code = 'TEST02'`,
  );
  assert.ok(rows.rowCount && rows.rowCount >= 3);
  assert.ok(
    rows.rows.every((r) => r.user_id === null),
    'зочид хэрэглэгчид холбогдохгүй',
  );
});
