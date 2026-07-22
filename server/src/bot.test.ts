import assert from 'node:assert/strict';
import { test } from 'node:test';

import { BOT_LEVELS, BotLevel, chooseMove, legalMoves } from '../../app/src/shared/bot';
import { Card, deal } from '../../app/src/shared/cards';
import { beats, detectCombo } from '../../app/src/shared/combos';
import {
  addPlayer,
  createGame,
  pass,
  play,
  startMatch,
  startRound,
} from '../../app/src/shared/game';

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('бот үргэлж хууль ёсны тавилт л хийнэ', () => {
  const rng = mulberry32(11);
  for (let i = 0; i < 300; i += 1) {
    const [hand, other] = deal(2, rng);
    // Ширээн дээр заримдаа хослол байна, заримдаа хоосон.
    const table = i % 3 === 0 ? null : detectCombo([other[0]]);

    for (const level of BOT_LEVELS) {
      const move = chooseMove({ hand, current: table, opponentCards: [13] }, level, rng);
      if (move === null) {
        // Ширээ хоосон үед пас хийж болохгүй.
        assert.notEqual(table, null, `${level}: шинэ эргэлтэд пас хийлээ`);
        continue;
      }
      assert.ok(
        move.every((c) => hand.includes(c)),
        `${level}: гартаа байхгүй хөзөр тавилаа`,
      );
      const combo = detectCombo(move);
      assert.ok(combo, `${level}: хүчингүй хослол тавилаа`);
      assert.ok(beats(combo, table), `${level}: ширээн дээрхийг дарж чадахгүй тавилт`);
    }
  }
});

test('дуусах боломж гарвал бүх түвшин ашиглана', () => {
  const rng = mulberry32(5);
  // Гарт нь ганц хөзөр — тавьж чадвал заавал тавих ёстой.
  const hand: Card[] = [51]; // 2♠ — юуг ч дарна
  for (const level of BOT_LEVELS) {
    const move = chooseMove(
      { hand, current: detectCombo([0]), opponentCards: [3] },
      level,
      rng,
    );
    assert.deepEqual(move, hand, `${level}: дуусах боломжийг алдлаа`);
  }
});

test('түвшний эрэмбэ зөв: сайн > дунд > анхан', () => {
  // Тестийн хугацааг богиносгохын тулд цөөн тоглолт — ялгаа нь том тул хангалттай.
  const MATCHES = 120;

  function duel(a: BotLevel, b: BotLevel): number {
    let winsA = 0;
    let played = 0;
    for (let i = 0; i < MATCHES; i += 1) {
      const levels: BotLevel[] = i % 2 === 0 ? [a, b, a, b] : [b, a, b, a];
      const state = createGame();
      levels.forEach((_, seat) => addPlayer(state, `p${seat}`, `Бот${seat}`));
      startMatch(state, 30, 30, 0);

      let guard = 0;
      let stuck = false;
      while (state.phase !== 'matchEnd') {
        if (++guard > 5000) {
          stuck = true;
          break;
        }
        if (state.phase === 'roundEnd') {
          startRound(state);
          continue;
        }
        const id = state.seats[state.turn];
        const player = state.players.find((p) => p.id === id)!;
        const move = chooseMove(
          {
            hand: player.hand,
            current: state.current?.combo ?? null,
            opponentCards: state.players
              .filter((p) => p.id !== id && p.seated && p.place === null)
              .map((p) => p.hand.length),
          },
          levels[Number(id.slice(1))],
        );
        if (move) play(state, id, move);
        else pass(state, id);
      }
      if (stuck) continue;
      played += 1;
      const winner = state.players.find((p) => p.id === state.matchWinnerId);
      if (winner && levels[Number(winner.id.slice(1))] === a) winsA += 1;
    }
    return winsA / played;
  }

  const hardVsMedium = duel('hard', 'medium');
  const mediumVsEasy = duel('medium', 'easy');

  assert.ok(hardVsMedium > 0.55, `сайн нь дундаас дээгүүр байх ёстой: ${hardVsMedium.toFixed(2)}`);
  assert.ok(mediumVsEasy > 0.7, `дунд нь анханаас дээгүүр байх ёстой: ${mediumVsEasy.toFixed(2)}`);
});

test('хууль ёсны тавилт байхгүй бол пас', () => {
  // Гарт зөвхөн 3♦, ширээн дээр 2♠ — дарах боломжгүй.
  const hand: Card[] = [0];
  const table = detectCombo([51]);
  assert.equal(legalMoves(hand, table).length, 0);
  for (const level of BOT_LEVELS) {
    assert.equal(chooseMove({ hand, current: table, opponentCards: [5] }, level), null);
  }
});
