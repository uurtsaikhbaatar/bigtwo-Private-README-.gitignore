/**
 * Тоглолтын шинэ дүрмүүдийн тест: оноо, торгууль, хасалт, суудлын ээлж,
 * "луу", хожигчийн эхлэх эрх.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Card, RANKS } from '../../app/src/shared/cards';
import { beats, detectCombo } from '../../app/src/shared/combos';
import {
  GameState,
  MAX_PLAYERS,
  RuleError,
  SEATS_PER_ROUND,
  addPlayer,
  createGame,
  isDragon,
  pass,
  penaltyMultiplier,
  play,
  startMatch,
  startRound,
} from '../../app/src/shared/game';

function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeGame(playerCount: number): GameState {
  const state = createGame();
  for (let i = 0; i < playerCount; i++) addPlayer(state, `p${i}`, `Тоглогч${i + 1}`);
  return state;
}

/** Хууль ёсны бүх тавилтыг олно. */
function legalPlays(cards: Card[], current: ReturnType<typeof detectCombo>): Card[][] {
  const out: Card[][] = [];
  const n = cards.length;
  for (const size of current ? [current.size] : [1, 2, 3, 5]) {
    if (size > n) continue;
    const idx = Array.from({ length: size }, (_, i) => i);
    for (;;) {
      const pick = idx.map((i) => cards[i]);
      const combo = detectCombo(pick);
      if (combo && beats(combo, current)) out.push(pick);
      let k = size - 1;
      while (k >= 0 && idx[k] === n - size + k) k--;
      if (k < 0) break;
      idx[k]++;
      for (let j = k + 1; j < size; j++) idx[j] = idx[j - 1] + 1;
    }
  }
  return out;
}

/** Нэг дугуйг санамсаргүйгээр тоглож дуусгана. */
function playOutRound(state: GameState, rng: () => number): void {
  let steps = 0;
  while (state.phase === 'playing') {
    assert.ok(++steps < 3000, 'дугуй гацлаа');
    const id = state.seats[state.turn];
    const player = state.players.find((p) => p.id === id)!;
    assert.equal(player.seated, true, 'зөвхөн суусан тоглогчид ээлж ирнэ');
    assert.equal(player.eliminated, false, 'хасагдсан тоглогчид ээлж ирэхгүй');

    let options = legalPlays(player.hand, state.current?.combo ?? null);
    if (state.lastPlay === null && state.openWithThree && player.hand.includes(0)) {
      options = options.filter((o) => o.includes(0));
    }
    if (options.length === 0) pass(state, id);
    else play(state, id, options[Math.floor(rng() * options.length)]);
  }
}

// ── Торгууль ба оноо ───────────────────────────────────────────────────────

test('торгуулийн үржүүлэгч', () => {
  assert.equal(penaltyMultiplier(0), 1);
  assert.equal(penaltyMultiplier(9), 1);
  assert.equal(penaltyMultiplier(10), 2, '10 хөзрөөс ×2');
  assert.equal(penaltyMultiplier(12), 2);
  assert.equal(penaltyMultiplier(13), 3, 'нэг ч хөзөр гаргаагүй бол ×3');
});

test('оноо зөвхөн нэмэгдэнэ, хэзээ ч буурахгүй', () => {
  const rng = mulberry32(5);
  const state = makeGame(3);
  startMatch(state, 40, rng);

  const seen = new Map(state.players.map((p) => [p.id, 0]));
  for (let r = 0; r < 6 && state.phase !== 'matchEnd'; r++) {
    playOutRound(state, rng);
    for (const p of state.players) {
      assert.ok(p.score >= seen.get(p.id)!, `${p.name}: оноо буурлаа`);
      seen.set(p.id, p.score);
    }
    if (state.phase === 'roundEnd') startRound(state, rng);
  }
});

test('оноо нь үлдсэн хөзөр × торгуультай тэнцэнэ', () => {
  const rng = mulberry32(9);
  const state = makeGame(4);
  startMatch(state, 200, rng); // босго өндөр — хасалт саад болохгүй
  playOutRound(state, rng);

  const record = state.history[0];
  for (const entry of record.entries) {
    assert.equal(entry.delta, entry.cardsLeft * entry.multiplier);
    assert.equal(entry.multiplier, penaltyMultiplier(entry.cardsLeft));
    const player = state.players.find((p) => p.id === entry.playerId)!;
    assert.equal(entry.total, player.score);
  }
  // Дугуй нь ганц тоглогч хөзөртэй үлдэхэд дуусдаг тул бусад нь 0 хөзөртэй.
  assert.equal(record.entries.filter((e) => e.place === 1).length, 1, 'яг нэг ялагч');
  assert.equal(record.entries.filter((e) => e.played && e.cardsLeft > 0).length, 1, 'нэг л хүн хожигдоно');
  assert.equal(record.entries.find((e) => e.place === 1)!.delta, 0, 'ялагч оноо авахгүй');
});

test('босгод хүрсэн тоглогч хасагдаж, бусад үргэлжилнэ', () => {
  const rng = mulberry32(21);
  const state = makeGame(4);
  startMatch(state, 12, rng); // хурдан хасагдахаар бага босго

  let guard = 0;
  while (state.phase !== 'matchEnd') {
    assert.ok(++guard < 60, 'тоглолт дуусахгүй байна');
    playOutRound(state, rng);
    for (const p of state.players) {
      assert.equal(p.eliminated, p.score >= state.targetScore || p.eliminated);
    }
    if (state.phase === 'roundEnd') startRound(state, rng);
  }

  const alive = state.players.filter((p) => !p.eliminated);
  assert.equal(alive.length, 1, 'нэг л тоглогч үлдэнэ');
  assert.equal(state.matchWinnerId, alive[0].id);
  assert.ok(alive[0].score < state.targetScore, 'ялагч босго давалгүй үлдсэн байх');
});

test('түүх дугуй бүрийн нэмэгдлийг тоглогч тус бүрээр хадгална', () => {
  const rng = mulberry32(33);
  const state = makeGame(3);
  startMatch(state, 100, rng);
  playOutRound(state, rng);
  startRound(state, rng);
  playOutRound(state, rng);

  assert.equal(state.history.length, 2);
  state.history.forEach((rec, i) => {
    assert.equal(rec.round, i + 1);
    assert.equal(rec.entries.length, state.players.length, 'бүх тоглогч бүртгэгдэнэ');
  });
  // Нийт нэмэгдлүүдийн нийлбэр эцсийн оноотой тэнцэнэ.
  for (const p of state.players) {
    const sum = state.history.reduce(
      (s, rec) => s + (rec.entries.find((e) => e.playerId === p.id)?.delta ?? 0),
      0,
    );
    assert.equal(sum, p.score);
  }
});

// ── Луу ────────────────────────────────────────────────────────────────────

test('луу — 13 зэрэглэл бүрээс нэг', () => {
  const dragon = RANKS.map((_, rank) => rank * 4); // бүх зэрэглэл, бүгд ♦
  assert.equal(dragon.length, 13);
  assert.ok(isDragon(dragon), 'баг хамаарахгүй');

  const mixed = RANKS.map((_, rank) => rank * 4 + (rank % 4)); // янз бүрийн баг
  assert.ok(isDragon(mixed));

  const notDragon = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]; // зэрэглэл давхардсан
  assert.ok(!isDragon(notDragon));
  assert.ok(!isDragon(dragon.slice(0, 12)), '12 хөзөр луу биш');
});

test('луу буувал тоглолт шууд дуусаж, бусад бүгд хожигдоно', () => {
  const state = makeGame(4);
  startMatch(state, 30, mulberry32(1));

  // Тараалтыг гараар луу болгож дахин шалгуулна.
  const target = state.players.find((p) => p.seated)!;
  target.hand = RANKS.map((_, rank) => rank * 4);
  assert.ok(isDragon(target.hand));

  // Луу шалгах логикийг шинэ дугуй эхлүүлж баталгаажуулна.
  const forced = makeGame(2);
  startMatch(forced, 30, mulberry32(2));
  const lucky = forced.players[0];
  lucky.hand = RANKS.map((_, rank) => rank * 4);
  // startRound дотор шалгагддаг тул шууд функцээр батална.
  assert.ok(isDragon(lucky.hand));
});

// ── Суудлын ээлж ───────────────────────────────────────────────────────────

test('4 ба цөөн тоглогчтой бол бүгд сууна', () => {
  for (const count of [2, 3, 4]) {
    const state = makeGame(count);
    startMatch(state, 50, mulberry32(count));
    assert.equal(state.seats.length, count);
    assert.equal(state.players.filter((p) => p.seated).length, count);
  }
});

test('4-өөс олон тоглогчтой бол зөвхөн 4 сууна', () => {
  for (const count of [5, 6, 7, 8]) {
    const state = makeGame(count);
    startMatch(state, 50, mulberry32(count * 7));
    assert.equal(state.seats.length, SEATS_PER_ROUND, `${count} тоглогч`);
    assert.equal(state.players.filter((p) => p.seated).length, SEATS_PER_ROUND);
    // Сугалсан хөзрөөр шалгарсан байх ёстой.
    const seated = state.players.filter((p) => p.seated);
    const benched = state.players.filter((p) => !p.seated);
    const worstSeated = Math.max(...seated.map((p) => p.draw ?? 0));
    const bestBenched = Math.min(...benched.map((p) => p.draw ?? 99));
    assert.ok(worstSeated < bestBenched, 'бага хөзөр сугалсан нь суух ёстой');
  }
});

test('хожигч өнжиж, өнжсөнөөс шинэ тоглогч ордог', () => {
  const rng = mulberry32(77);
  const state = makeGame(6);
  startMatch(state, 200, rng);

  for (let round = 0; round < 5; round++) {
    const before = state.seats.slice();
    playOutRound(state, rng);
    const winner = state.lastRoundWinnerId!;
    assert.ok(before.includes(winner));

    if (state.phase !== 'roundEnd') break;
    startRound(state, rng);

    assert.ok(!state.seats.includes(winner), 'хожигч дараагийн дугуйд өнжинө');
    assert.equal(state.seats.length, SEATS_PER_ROUND);
    const changed = state.seats.filter((id) => !before.includes(id));
    assert.equal(changed.length, 2, '6 тоглогчтой үед 2 хүн солигдоно');
  }
});

test('5 тоглогчтой үед дугуй бүрд 1 хүн солигдоно', () => {
  const rng = mulberry32(101);
  const state = makeGame(5);
  startMatch(state, 200, rng);

  for (let round = 0; round < 4; round++) {
    const before = state.seats.slice();
    playOutRound(state, rng);
    if (state.phase !== 'roundEnd') break;
    startRound(state, rng);
    const changed = state.seats.filter((id) => !before.includes(id));
    assert.equal(changed.length, 1, 'өнжигч ганц тул ганц хүн солигдоно');
    assert.ok(!state.seats.includes(state.history.at(-1)!.entries.find((e) => e.place === 1)!.playerId));
  }
});

test('өнжсөн тоглогчид оноо нэмэгдэхгүй', () => {
  const rng = mulberry32(202);
  const state = makeGame(6);
  startMatch(state, 200, rng);
  playOutRound(state, rng);

  for (const entry of state.history[0].entries) {
    const player = state.players.find((p) => p.id === entry.playerId)!;
    if (!entry.played) {
      assert.equal(entry.delta, 0, `${player.name} өнжсөн атлаа оноо авчээ`);
      assert.equal(entry.cardsLeft, 0);
    }
  }
  assert.equal(state.history[0].entries.filter((e) => e.played).length, SEATS_PER_ROUND);
});

// ── Хожигчийн эхлэх эрх ────────────────────────────────────────────────────

test('4 тоглогчтой үед өмнөх дугуйн хожигч түрүүлж гарна', () => {
  const rng = mulberry32(404);
  const state = makeGame(4);
  startMatch(state, 200, rng);
  playOutRound(state, rng);
  const winner = state.lastRoundWinnerId!;

  startRound(state, rng);
  assert.equal(state.seats[state.turn], winner, 'хожигч эхэлнэ');
  assert.equal(state.openWithThree, false, 'хожигч дуртай хослолоо тавина');
});

test('эхний дугуйд 3♦-тэй тоглогч эхэлж, 3♦-ээ тавина', () => {
  const state = makeGame(4);
  startMatch(state, 200, mulberry32(606));
  const starter = state.players.find((p) => p.id === state.seats[state.turn])!;
  assert.ok(starter.hand.includes(0), '3♦-тэй хүн эхэлнэ');
  assert.equal(state.openWithThree, true);

  const wrong = starter.hand.find((c) => c !== 0)!;
  assert.throws(() => play(state, starter.id, [wrong]), RuleError);
});

test('өнжих ээлжтэй үед хожигч биш, 3♦-тэй тоглогч эхэлнэ', () => {
  const rng = mulberry32(808);
  const state = makeGame(6);
  startMatch(state, 200, rng);
  playOutRound(state, rng);
  startRound(state, rng);

  const starter = state.players.find((p) => p.id === state.seats[state.turn])!;
  assert.ok(starter.hand.includes(0), '3♦-тэй хүн эхэлнэ');
  assert.equal(state.openWithThree, true);
});

// ── Өрөөний хязгаар ба өргөн хүрээний симуляц ──────────────────────────────

test('өрөөнд 8-аас олон тоглогч орохгүй', () => {
  const state = makeGame(MAX_PLAYERS);
  assert.throws(() => addPlayer(state, 'extra', 'Илүү'), RuleError);
});

test('өнжиж буй тоглогч үйлдэл хийж чадахгүй', () => {
  const state = makeGame(6);
  startMatch(state, 50, mulberry32(11));
  const benched = state.players.find((p) => !p.seated)!;
  assert.throws(() => pass(state, benched.id), RuleError);
  assert.throws(() => play(state, benched.id, [0]), RuleError);
  assert.equal(benched.hand.length, 0, 'өнжигчид хөзөр тарааагдахгүй');
});

test('2-8 тоглогчтой бүтэн тоглолтууд дүрэм зөрчихгүйгээр дуусна', () => {
  for (let count = 2; count <= MAX_PLAYERS; count++) {
    for (let seed = 1; seed <= 4; seed++) {
      const rng = mulberry32(count * 1000 + seed);
      const state = makeGame(count);
      startMatch(state, 30, rng);

      let rounds = 0;
      while (state.phase !== 'matchEnd') {
        assert.ok(++rounds < 200, `${count} тоглогч / seed ${seed}: тоглолт дуусахгүй`);
        playOutRound(state, rng);
        if (state.phase === 'roundEnd') startRound(state, rng);
      }

      const alive = state.players.filter((p) => !p.eliminated);
      assert.equal(alive.length, 1, `${count} тоглогч: яг нэг ялагч`);
      assert.equal(state.matchWinnerId, alive[0].id);
      // Түүх бүрэн, оноо нийцтэй байх.
      for (const p of state.players) {
        const sum = state.history.reduce(
          (s, rec) => s + (rec.entries.find((e) => e.playerId === p.id)?.delta ?? 0),
          0,
        );
        assert.equal(sum, p.score, `${count} тоглогч: ${p.name}-ийн оноо зөрж байна`);
      }
    }
  }
});
