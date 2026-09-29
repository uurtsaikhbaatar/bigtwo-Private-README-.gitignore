/**
 * Бүртгэл, нэвтрэлт, тоглолтын түүхийн тест.
 *
 * ⚠️ Эдгээр тест жинхэнэ өгөгдөл (`тест_*` акаунт) үүсгэдэг тул ЗӨВХӨН тусгай
 * `TEST_DATABASE_URL` руу л холбогдоно — продакшн `DATABASE_URL` руу ХЭЗЭЭ Ч
 * бичихгүй. `TEST_DATABASE_URL` тохируулаагүй бол DB тестүүд бүгд алгасагдана
 * (сангүйгээр ч бусад тест ажиллах ёстой). Дараа нь продакшныг тест акаунтаар
 * бузарлахаас сэргийлнэ.
 *
 * Тест сан ажиллуулах:  TEST_DATABASE_URL=postgres://…/test npm test
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
import { closePool, dbEnabled, getPool, initSchema, recordRound } from './db';
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
  transferTokens,
} from './tokens';

// getPool() анх дуудагдахаас ӨМНӨ: холболтыг ЗӨВХӨН тест сан руу заана.
// TEST_DATABASE_URL байвал түүнийг ашиглана; байхгүй бол DATABASE_URL-ыг
// бүрмөсөн салгаж, доорх бүх DB тестийг алгасна — продакшн руу хэзээ ч бичихгүй.
// (getPool нь зөвхөн тестийн дотор дуудагддаг тул энэ мөр түүнээс өмнө ажиллана.)
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
} else {
  delete process.env.DATABASE_URL;
}

const skip = dbEnabled() ? false : 'TEST_DATABASE_URL тохируулаагүй — DB тест алгаслаа';

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
    await getPool().query("DELETE FROM round_log WHERE game_uid LIKE 'TEST-RL-%'");
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

test('тойргийн бүртгэл — олон мөр нэг INSERT-ээр, буцаж уншина', { skip }, async () => {
  const uid = `TEST-RL-${Date.now()}`;
  await recordRound(
    uid,
    'TSTRM',
    2,
    [
      { name: 'Хулан (дунд)', isBot: true, userId: null, won: true, cardsLeft: 0 },
      { name: 'зочин-1', isBot: false, userId: null, won: false, cardsLeft: 6 },
      { name: 'зочин-2', isBot: false, userId: null, won: false, cardsLeft: 9 },
    ],
    true,
  );
  const rows = (
    await getPool().query<{ name: string; is_bot: boolean; won: boolean; cards_left: number }>(
      'SELECT name, is_bot, won, cards_left FROM round_log WHERE game_uid = $1 ORDER BY cards_left',
      [uid],
    )
  ).rows;
  assert.equal(rows.length, 3, 'гурван мөр бичигдэнэ');
  assert.equal(rows[0].name, 'Хулан (дунд)');
  assert.equal(rows[0].is_bot, true, 'бот тэмдэглэгдэнэ');
  assert.equal(rows[0].won, true, 'хожсон нь тэмдэглэгдэнэ');
  assert.equal(rows[0].cards_left, 0);
  assert.equal(rows[1].is_bot, false, 'зочин бот биш');
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

/** Имэйл баталгаажсан хэрэглэгч — чип илгээх эрхтэй. */
async function verifiedUser() {
  const { account } = await register(uniqueName(), 'нууц-үг-123', uniqueEmail());
  await getPool().query('UPDATE users SET email_verified = true WHERE id = $1', [account.id]);
  return account;
}

test('чип шилжүүлэх: 5% шимтгэл хасагдаж, түүх бичигдэнэ', { skip }, async () => {
  const from = await verifiedUser();
  const to = await verifiedUser();

  const result = await transferTokens(from.id, { username: to.username }, 100_000);
  assert.equal(result.fee, 5_000);
  assert.equal(result.received, 95_000);
  assert.equal(await balanceOf(from.id), STARTING_TOKENS - 100_000);
  assert.equal(await balanceOf(to.id), STARTING_TOKENS + 95_000);

  const log = await getPool().query(
    'SELECT amount, fee FROM token_transfers WHERE from_user = $1',
    [from.id],
  );
  assert.deepEqual(log.rows.map((r) => [Number(r.amount), Number(r.fee)]), [[100_000, 5_000]]);
});

test('чип шилжүүлэх: буруу оролтыг татгалзана', { skip }, async () => {
  const from = await verifiedUser();
  const to = await verifiedUser();
  const unverified = (await register(uniqueName(), 'нууц-үг-123', uniqueEmail())).account;

  await assert.rejects(() => transferTokens(from.id, { userId: from.id }, 1000), /Өөр рүүгээ/);
  await assert.rejects(() => transferTokens(from.id, { userId: to.id }, 50), /Хамгийн багадаа/);
  await assert.rejects(() => transferTokens(from.id, { userId: to.id }, 1500.5), TokenError);
  await assert.rejects(() => transferTokens(from.id, { username: 'байхгүй_xyz' }, 1000), /олдсонгүй/);
  await assert.rejects(() => transferTokens(unverified.id, { userId: to.id }, 1000), /баталгаажуулна/);
  await assert.rejects(
    () => transferTokens(from.id, { userId: to.id }, STARTING_TOKENS + 1),
    /хүрэлцэхгүй/,
  );
  assert.equal(await balanceOf(from.id), STARTING_TOKENS, 'амжилтгүй бол үлдэгдэл хөдлөхгүй');
});

test('чип шилжүүлэх: бооцоонд түгжигдсэнийг илгээхгүй', { skip }, async () => {
  const from = await verifiedUser();
  const to = await verifiedUser();
  const locked = 600_000;
  await assert.rejects(
    () => transferTokens(from.id, { userId: to.id }, 500_000, locked),
    /түгжигдсэн/,
  );
  await transferTokens(from.id, { userId: to.id }, STARTING_TOKENS - locked, locked);
  assert.equal(await balanceOf(from.id), locked);
});

test('чип шилжүүлэх: 24 цагийн хязгаар', { skip }, async () => {
  const from = await verifiedUser();
  const to = await verifiedUser();
  await grantTokens(from.username, 10_000_000);
  await transferTokens(from.id, { userId: to.id }, 4_000_000);
  await assert.rejects(() => transferTokens(from.id, { userId: to.id }, 1_000_001), /Үлдсэн эрх: 1000000/);
  await transferTokens(from.id, { userId: to.id }, 1_000_000);
  await assert.rejects(() => transferTokens(from.id, { userId: to.id }, 100), /дууссан/);
});

test('чип шилжүүлэх: зэрэг ирсэн хүсэлт үлдэгдлийг давж зарцуулахгүй', { skip }, async () => {
  const from = await verifiedUser();
  const to = await verifiedUser();
  const results = await Promise.allSettled([
    transferTokens(from.id, { userId: to.id }, 700_000),
    transferTokens(from.id, { userId: to.id }, 700_000),
    transferTokens(to.id, { userId: from.id }, 700_000),
  ]);
  const ok = results.filter((r) => r.status === 'fulfilled').length;
  assert.ok(ok >= 2, 'A→B-ийн нэг нь ба B→A амжилттай');
  const [a, b] = [await balanceOf(from.id), await balanceOf(to.id)];
  assert.ok(a >= 0 && b >= 0, 'сөрөг үлдэгдэл үүсэхгүй');
  const fees = await getPool().query<{ fee: string }>(
    'SELECT COALESCE(SUM(fee), 0) AS fee FROM token_transfers WHERE from_user = ANY($1::bigint[])',
    [[from.id, to.id]],
  );
  assert.equal(a + b + Number(fees.rows[0].fee), STARTING_TOKENS * 2, 'чип алга болохгүй, хэвлэгдэхгүй');
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
