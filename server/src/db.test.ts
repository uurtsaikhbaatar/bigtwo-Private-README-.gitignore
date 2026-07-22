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
import { AuthError, accountForToken, login, logout, register } from './auth';
import { closePool, dbEnabled, getPool, initSchema } from './db';
import { recentMatches, recordMatch, statsForUser } from './history';

const skip = dbEnabled() ? false : 'DATABASE_URL тохируулаагүй';

/** Тест бүрд давхцахгүй нэр. */
const uniqueName = () => `тест_${randomUUID().slice(0, 8)}`;

/** Дууссан тоглолтын төлөв гараар угсарна. */
function finishedMatch(winner: string, others: string[]): GameState {
  const state = createGame();
  addPlayer(state, 'w', winner);
  others.forEach((n, i) => addPlayer(state, `l${i}`, n));
  startMatch(state, 30, 30, 25);

  state.phase = 'matchEnd';
  state.matchWinnerId = 'w';
  state.round = 7;
  state.players.forEach((p, i) => {
    p.score = p.id === 'w' ? 12 : 30 + i;
    p.eliminated = p.id !== 'w';
  });
  state.settlement = state.players.map((p) => ({
    playerId: p.id,
    amount: p.id === 'w' ? 25 * others.length : -25,
  }));
  return state;
}

after(async () => {
  if (dbEnabled()) await closePool();
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
  const created = await register(name, 'нууц-үг-123');
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
  const { account } = await register(name, password);

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
  await register(name, 'зөв-нууц-үг');

  await assert.rejects(() => login(name, 'буруу-нууц'), AuthError);
  await assert.rejects(() => login(uniqueName(), 'ямар ч'), AuthError);
  await assert.rejects(() => register(name, 'өөр-нууц-үг'), AuthError, 'нэр давхардаж болохгүй');
  await assert.rejects(() => register(uniqueName(), '123'), AuthError, 'нууц үг хэт богино');
  await assert.rejects(() => register('a', 'нууц-үг-123'), AuthError, 'нэр хэт богино');
});

test('тоглолтын түүх ба статистик бүртгэгдэнэ', { skip }, async () => {
  const name = uniqueName();
  const { account } = await register(name, 'нууц-үг-123');

  const before = await statsForUser(account.id);
  const state = finishedMatch(name, ['Бат', 'Цэцэг']);
  await recordMatch(state, 'TEST01', new Map([['w', account.id]]));

  const after = await statsForUser(account.id);
  assert.equal(after.matches, before.matches + 1, 'тоглолт нэмэгдсэн');
  assert.equal(after.wins, before.wins + 1, 'ялалт нэмэгдсэн');
  assert.equal(after.chips, before.chips + 50, '25 чип × 2 хожигдогч');

  const matches = await recentMatches(account.id, 5);
  assert.ok(matches.length >= 1);
  const latest = matches[0];
  assert.equal(latest.roomCode, 'TEST01');
  assert.equal(latest.won, true);
  assert.equal(latest.chips, 50);
  assert.equal(latest.players.length, 3, 'бүх оролцогч хадгалагдана');
  assert.equal(latest.players[0].won, true, 'ялагч эхэнд');
});

test('зочин тоглогч user_id-гүй бүртгэгдэнэ', { skip }, async () => {
  const state = finishedMatch(uniqueName(), ['Зочин1', 'Зочин2']);
  await recordMatch(state, 'TEST02', new Map());

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
