/**
 * Texas Hold'em хөдөлгүүрийн тест — TDA 2024 / Robert's Rules-ийн гол дүрэм бүрд.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Card } from '../../app/src/shared/cards';
import { bestHand, buttonDrawValue, evaluate5 } from '../../app/src/shared/holdem/evaluator';
import {
  type PokerState,
  PokerRuleError,
  act,
  addChips,
  addPokerPlayer,
  chipsInPlay,
  concludeIfNoHumans,
  createPoker,
  legalActions,
  nextHand,
  removePokerPlayer,
  showHand,
  startCash,
  startHand,
  startTournament,
  takeLeavers,
  timeoutAct,
} from '../../app/src/shared/holdem/engine';
import { payouts } from '../../app/src/shared/holdem/structure';

// ── Туслах ──────────────────────────────────────────────────────────────────

const RANKS = ['3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A', '2'];
const SUITS = 'dchs';
/** "As", "Td", "2c" → индекс. */
function c(t: string): Card {
  const rank = RANKS.indexOf(t[0]);
  const suit = SUITS.indexOf(t[1]);
  assert.ok(rank >= 0 && suit >= 0, `буруу хөзөр: ${t}`);
  return rank * 4 + suit;
}
const cs = (s: string) => s.split(' ').map(c);

function seeded(seed: number): () => number {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return ((x >>> 0) % 1_000_000) / 1_000_000;
  };
}

/**
 * Sit & Go ширээ гараар: суудал 0..n-1, `stacks` чиптэй, товч `button`.
 * `handNo` нь бооцооны шатыг тогтооно (20 → 3-р шат, анте 50).
 */
function sng(stacks: number[], button = 0, handNo = 0): PokerState {
  const s = createPoker('sng');
  stacks.forEach((st, i) => {
    const p = addPokerPlayer(s, `p${i}`, `P${i}`, st);
    p.seat = i;
  });
  s.phase = 'handEnd';
  s.entrants = stacks.length;
  s.buttonSeat = button;
  s.handNo = handNo;
  startHand(s, seeded(7));
  return s;
}

/** Гарын хөзрийг тохируулна (startHand-ийн дараа). */
function rig(s: PokerState, holes: string[], board: string): void {
  holes.forEach((h, i) => {
    const p = s.players.find((x) => x.id === `p${i}`)!;
    if (p.dealt) p.hole = cs(h);
  });
  const b = cs(board);
  // pop дараалал: burn, f1, f2, f3, burn, turn, burn, river
  const filler = c('2d');
  s.deck = [b[4], filler, b[3], filler, b[2], b[1], b[0], filler];
}

const P = (s: PokerState, i: number) => s.players.find((p) => p.id === `p${i}`)!;
const turn = (s: PokerState) => s.toAct;
const isPlaying = (s: PokerState): boolean => s.phase === 'playing';

// ── Гарын хүч ───────────────────────────────────────────────────────────────

test('гарын ангилал зөв эрэмбэлэгдэнэ', () => {
  const order = [
    'Ah Kd 9c 7s 4h', // өндөр
    '9h 9d Ac 7s 4h', // хос
    '9h 9d 7c 7s 4h', // хоёр хос
    '9h 9d 9c 7s 4h', // гурвал
    'Ah 2d 3c 4s 5h', // wheel straight
    '6h 2d 3c 4s 5h', // 6 хүртэлх straight
    'Ah Kh 9h 7h 4h', // flush
    '9h 9d 9c 7s 7h', // full house
    '9h 9d 9c 9s 7h', // каре
    'Ah 2h 3h 4h 5h', // доод шулуун өнгө
    'Ah Kh Qh Jh Th', // royal
  ].map((h) => evaluate5(cs(h)).score);
  for (let i = 1; i < order.length; i++) assert.ok(order[i] > order[i - 1], `#${i}`);
  assert.equal(evaluate5(cs('Ah Kh Qh Jh Th')).label, 'Royal Flush');
});

test('kicker ба дүрс: дүрс тэнцүү, kicker ялгана', () => {
  assert.equal(evaluate5(cs('Ah Kd 9c 7s 4h')).score, evaluate5(cs('As Kc 9d 7h 4d')).score);
  assert.ok(evaluate5(cs('Ah Ad Kc 7s 4h')).score > evaluate5(cs('As Ac Qd Jh Td')).score);
  assert.ok(evaluate5(cs('Kh Kd 4c 4s Ah')).score > evaluate5(cs('Ks Kc 4d 4h Qd')).score);
});

test('7 хөзрөөс хамгийн сайн 5-ыг сонгоно', () => {
  const r = bestHand(cs('Ah Kh 2c 3d Qh Jh Th'));
  assert.equal(r.category, 'straightFlush');
  const r2 = bestHand(cs('9h 9d 9c 4s 4h 4d 2c'));
  assert.equal(r2.category, 'fullHouse');
  assert.match(r2.label, /9s full of 4s/);
});

test('товчны сугалаа: тэнцвэл ♠ > ♥ > ♦ > ♣', () => {
  assert.ok(buttonDrawValue(c('As')) > buttonDrawValue(c('Ah')));
  assert.ok(buttonDrawValue(c('Ah')) > buttonDrawValue(c('Ad')));
  assert.ok(buttonDrawValue(c('Ad')) > buttonDrawValue(c('Ac')));
  assert.ok(buttonDrawValue(c('2s')) < buttonDrawValue(c('3c')));
});

// ── Байрлал ─────────────────────────────────────────────────────────────────

test('3 тоглогч: товчны зүүн бага, түүний дараа их бооцоо; flop-оос өмнө UTG (товч) түрүүлнэ', () => {
  const s = sng([1500, 1500, 1500], 0);
  assert.equal(s.sbSeat, 1);
  assert.equal(s.bbSeat, 2);
  assert.equal(P(s, 1).street, 10);
  assert.equal(P(s, 2).street, 20);
  assert.equal(turn(s), 'p0');
});

test('хоёр хүн: товч = бага бооцоо, flop-оос өмнө түрүүлж, дараа нь сүүлд үйлдэнэ', () => {
  const s = sng([1500, 1500], 0);
  assert.equal(s.buttonSeat, 0);
  assert.equal(P(s, 0).street, 10, 'товч бага бооцоо тавина');
  assert.equal(P(s, 1).street, 20);
  assert.equal(turn(s), 'p0');
  act(s, 'p0', { kind: 'call' });
  act(s, 'p1', { kind: 'check' });
  assert.equal(s.street, 'flop');
  assert.equal(turn(s), 'p1', 'flop-оос хойш их бооцоо түрүүлнэ');
});

test('үхсэн товч: их бооцоо хасагдвал дараагийн гарт бага бооцоо үхсэн, товч урагшилна', () => {
  // 4 тоглогч, товч 0, бага 1, их 2. Их бооцоо (p2) хасагдана.
  const s = sng([1500, 1500, 20, 1500], 0);
  assert.equal(P(s, 2).allIn, true, 'богино их бооцоо all-in');
  rig(s, ['Ah Ad', 'Kh Kd', '7c 2d', 'Qh Qd'], '3c 8d 9s Js 4h');
  act(s, 'p3', { kind: 'call' });
  act(s, 'p0', { kind: 'call' });
  act(s, 'p1', { kind: 'call' });
  // Flop-оос хойш бүгд өнжинө.
  while (s.phase === 'playing') act(s, s.toAct!, { kind: 'check' });
  assert.equal(P(s, 2).eliminated, true);
  nextHand(s, seeded(1));
  assert.equal(s.bbSeat, 3, 'их бооцоо нэг суудал урагшилна');
  assert.equal(s.sbSeat, 2, 'бага бооцоо = өмнөх их бооцооны (хоосон) суудал');
  assert.equal(s.buttonSeat, 1, 'товч = өмнөх бага бооцооны суудал');
  const posted = s.players.reduce((a, p) => a + p.total, 0);
  assert.equal(posted, 20, 'зөвхөн их бооцоо тавигдана');
  assert.equal(turn(s), 'p0', 'их бооцооны дараагийнх түрүүлнэ');
});

test('3-аас 2 хүн болоход нэг хүн их бооцоог дараалж хоёр тавихгүй', () => {
  const s = sng([1500, 1500, 20], 0); // p2 их бооцоо, all-in
  rig(s, ['Ah Ad', '7c 2d', '6c 2h'], '3c 8d 9s Js 4h');
  act(s, 'p0', { kind: 'call' });
  act(s, 'p1', { kind: 'call' });
  while (s.phase === 'playing') act(s, s.toAct!, { kind: 'check' });
  assert.equal(P(s, 2).eliminated, true);
  nextHand(s, seeded(1));
  assert.equal(s.bbSeat, 0, 'p0 их бооцоо (өмнө нь товч)');
  assert.equal(s.buttonSeat, 1, 'p1 товч ба бага бооцоо');
  assert.equal(P(s, 1).street, 10);
});

// ── Бооцоо ──────────────────────────────────────────────────────────────────

test('хамгийн бага өсгөлт = өмнөх бүрэн өсгөлт', () => {
  const s = sng([1500, 1500, 1500], 0);
  assert.throws(() => act(s, 'p0', { kind: 'raise', amount: 30 }), PokerRuleError);
  act(s, 'p0', { kind: 'raise', amount: 60 }); // +40
  const la = legalActions(s, 'p1')!;
  assert.equal(la.minTo, 100, '60 + 40');
  assert.throws(() => act(s, 'p1', { kind: 'raise', amount: 90 }), PokerRuleError);
  act(s, 'p1', { kind: 'raise', amount: 100 });
});

test('богино их бооцоо all-in байсан ч бусад нь бүтэн их бооцоог дагана', () => {
  const s = sng([1500, 1500, 5], 0);
  assert.equal(P(s, 2).street, 5);
  assert.equal(legalActions(s, 'p0')!.toCall, 20);
});

test('бүрэн бус all-in өсгөлт өмнө үйлдсэн тоглогчид өсгөх эрх нээхгүй (TDA)', () => {
  const s = sng([1500, 1500, 1500, 130], 0); // p3 богино
  // Preflop: p3 (UTG) түрүүлнэ.
  act(s, 'p3', { kind: 'fold' });
  act(s, 'p0', { kind: 'call' });
  act(s, 'p1', { kind: 'call' });
  act(s, 'p2', { kind: 'check' });
  // Flop: p1 эхэлнэ.
  const s2 = sng([1500, 1500, 1500, 150], 0);
  act(s2, 'p3', { kind: 'call' }); // 20
  act(s2, 'p0', { kind: 'call' });
  act(s2, 'p1', { kind: 'call' });
  act(s2, 'p2', { kind: 'check' });
  assert.equal(s2.street, 'flop');
  act(s2, 'p1', { kind: 'bet', amount: 100 });
  act(s2, 'p2', { kind: 'call' });
  act(s2, 'p3', { kind: 'allin' }); // 130 — +30 нь бүрэн бус (<100)
  act(s2, 'p0', { kind: 'call' }); // p0 үйлдээгүй байсан тул өсгөж болох байсан
  const la = legalActions(s2, 'p1')!;
  assert.equal(la.canRaise, false, 'p1 зөвхөн дагах/хаях');
  assert.equal(la.toCall, 30);
  assert.throws(() => act(s2, 'p1', { kind: 'raise', amount: 300 }), PokerRuleError);
  act(s2, 'p1', { kind: 'call' });
});

test('хэд хэдэн бүрэн бус өсгөлт нийлж бүрэн болбол эрх нээгдэнэ', () => {
  const s = sng([1500, 140, 260, 1500], 0);
  // Preflop: p3 UTG.
  act(s, 'p3', { kind: 'call' });
  act(s, 'p0', { kind: 'call' });
  act(s, 'p1', { kind: 'call' });
  act(s, 'p2', { kind: 'check' });
  // Flop: p1 эхэлнэ (товч 0).
  act(s, 'p1', { kind: 'check' });
  act(s, 'p2', { kind: 'check' });
  act(s, 'p3', { kind: 'bet', amount: 100 });
  act(s, 'p0', { kind: 'call' });
  act(s, 'p1', { kind: 'allin' }); // 120: +20 бүрэн бус
  act(s, 'p2', { kind: 'allin' }); // 240: 120-оос +120 → p3-ын 100-аас +140 ≥ 100
  assert.equal(legalActions(s, 'p3')!.canRaise, true);
});

test('дагагдаагүй бооцоо буцна', () => {
  const s = sng([1500, 1500, 1500], 0);
  act(s, 'p0', { kind: 'raise', amount: 500 });
  act(s, 'p1', { kind: 'fold' });
  act(s, 'p2', { kind: 'fold' });
  assert.equal(s.phase, 'handEnd');
  assert.equal(P(s, 0).stack, 1500 + 10 + 20, 'зөвхөн бооцоонуудыг авна');
  assert.equal(P(s, 0).showCards, false, 'тэмцээгүй тул хөзөр харуулахгүй');
});

// ── Сав ─────────────────────────────────────────────────────────────────────

test('side pot: богино all-in ялсан ч зөвхөн үндсэн савыг авна', () => {
  const s = sng([300, 1500, 1500], 0);
  rig(s, ['Ah Ad', 'Kh Kd', 'Qh Qd'], '3c 8d 9s Js 4h');
  act(s, 'p0', { kind: 'allin' }); // 300
  act(s, 'p1', { kind: 'raise', amount: 1000 });
  act(s, 'p2', { kind: 'call' });
  while (s.phase === 'playing') act(s, s.toAct!, { kind: 'check' });
  assert.equal(s.pots.length, 2);
  assert.deepEqual(s.pots[0], { amount: 900, winners: ['p0'], name: 'Main Pot', hand: s.pots[0].hand });
  assert.equal(s.pots[1].amount, 1400);
  assert.deepEqual(s.pots[1].winners, ['p1']);
  assert.equal(P(s, 0).stack, 900);
  assert.equal(P(s, 1).stack, 500 + 1400);
  assert.equal(chipsInPlay(s), 3300);
});

test('тэнцсэн гар: сав хуваагдаж, хуваагдахгүй чип товчны зүүн талын ялагчид', () => {
  const s = sng([1500, 1500, 1500], 2); // товч p2, бага p0, их p1
  rig(s, ['Ah 2d', 'Ad 2c', '7c 3d'], 'Kc Kd Qs Qh Js');
  act(s, 'p2', { kind: 'call' }); // 20
  act(s, 'p0', { kind: 'call' });
  act(s, 'p1', { kind: 'check' });
  // flop: p0 эхэлнэ
  act(s, 'p0', { kind: 'bet', amount: 25 });
  act(s, 'p1', { kind: 'call' });
  act(s, 'p2', { kind: 'fold' });
  while (s.phase === 'playing') act(s, s.toAct!, { kind: 'check' });
  // Сав = 60 + 50 = 110 → 55/55. Хуваагдахгүй чип байхгүй.
  assert.deepEqual(s.pots[0].winners.sort(), ['p0', 'p1']);
  assert.equal(P(s, 0).stack, 1500 - 45 + 55);
  // Сондгой сав: 3 тоглогч дагаад 1 хаявал.
  const t = sng([1500, 1500, 1500], 2);
  rig(t, ['Ah 2d', 'Ad 2c', '7c 3d'], 'Kc Kd Qs Qh Js');
  act(t, 'p2', { kind: 'raise', amount: 41 });
  act(t, 'p0', { kind: 'call' });
  act(t, 'p1', { kind: 'call' });
  // flop
  act(t, 'p0', { kind: 'check' });
  act(t, 'p1', { kind: 'check' });
  act(t, 'p2', { kind: 'bet', amount: 20 });
  act(t, 'p0', { kind: 'call' });
  act(t, 'p1', { kind: 'call' });
  while (t.phase === 'playing') act(t, t.toAct!, { kind: 'check' });
  // Сав 41*3 + 60 = 183, p0 ба p1 тэнцэнэ → 91 + 92; p0 товчны (p2) зүүнд ойр.
  assert.equal(P(t, 0).won, 92);
  assert.equal(P(t, 1).won, 91);
});

test('гар үзүүлэх: хожиж чадахгүй гар хаагдана; all-in бол бүгд ил', () => {
  const s = sng([1500, 1500, 1500], 0);
  rig(s, ['Ah Ad', '7c 2d', 'Kh Kd'], '3c 8d 9s Js 4h');
  act(s, 'p0', { kind: 'call' });
  act(s, 'p1', { kind: 'call' });
  act(s, 'p2', { kind: 'check' });
  // flop..river: p1 river-д бооцоо тавина, бусад нь дагана.
  while (s.street !== 'river') act(s, s.toAct!, { kind: 'check' });
  act(s, 'p1', { kind: 'bet', amount: 40 });
  act(s, 'p2', { kind: 'call' });
  act(s, 'p0', { kind: 'call' });
  // p1 (бооцоо тавьсан) эхэлж үзүүлнэ, дараа нь p2 (KK > 7-high) үзүүлнэ, p0 (AA) хамгийн сайн.
  assert.equal(P(s, 1).showCards, true, 'сүүлд бооцоо тавьсан нь эхэлж үзүүлнэ');
  assert.equal(P(s, 2).showCards, true);
  assert.equal(P(s, 0).showCards, true);
  const u = sng([1500, 1500, 1500], 0);
  rig(u, ['7c 2d', 'Ah Ad', 'Kh Kd'], '3c 8d 9s Js 4h');
  act(u, 'p0', { kind: 'call' });
  act(u, 'p1', { kind: 'call' });
  act(u, 'p2', { kind: 'check' });
  while (u.street !== 'river') act(u, u.toAct!, { kind: 'check' });
  act(u, 'p1', { kind: 'bet', amount: 40 }); // AA эхэлж үзүүлнэ
  act(u, 'p2', { kind: 'call' });
  act(u, 'p0', { kind: 'call' });
  assert.equal(P(u, 1).showCards, true);
  assert.equal(P(u, 2).showCards, false, 'KK нь AA-аас сул тул хаагдана');
  assert.equal(P(u, 0).showCards, false);
  const v = sng([300, 1500, 1500], 0);
  rig(v, ['7c 2d', 'Ah Ad', 'Kh Kd'], '3c 8d 9s Js 4h');
  act(v, 'p0', { kind: 'allin' });
  act(v, 'p1', { kind: 'call' });
  act(v, 'p2', { kind: 'call' });
  while (v.phase === 'playing') act(v, v.toAct!, { kind: 'check' });
  assert.ok(v.players.every((p) => p.showCards === false) === false);
});

test('бүгд all-in болбол ширээний хөзөр бүрэн тавигдаж бүх гар ил', () => {
  const s = sng([500, 1500, 1500], 0);
  rig(s, ['7c 2d', 'Ah Ad', 'Kh Kd'], '3c 8d 9s Js 4h');
  act(s, 'p0', { kind: 'allin' });
  act(s, 'p1', { kind: 'allin' });
  act(s, 'p2', { kind: 'call' });
  assert.notEqual(s.phase, 'playing');
  assert.equal(s.board.length, 5);
  assert.equal(s.allInRunout, true);
  assert.ok(s.players.every((p) => p.showCards));
});

// ── Анте, шат ───────────────────────────────────────────────────────────────

test('их бооцооны анте: их бооцоо ганцаараа төлнө, дуудлагад тооцогдохгүй', () => {
  const s = sng([1500, 1500, 1500], 0, 20); // 3-р шат: 25/50, анте 50
  assert.equal(s.bb, 50);
  assert.equal(s.bbAnte, 50);
  assert.equal(P(s, 2).total, 100, 'их бооцоо + анте');
  assert.equal(P(s, 2).street, 50, 'анте шатны бооцоонд орохгүй');
  assert.equal(legalActions(s, 'p0')!.toCall, 50);
});

test('их бооцооны чип хүрэхгүй бол бооцоо антегаас түрүүлнэ', () => {
  const s = sng([1500, 1500, 70], 0, 20);
  assert.equal(P(s, 2).street, 50);
  assert.equal(P(s, 2).total, 70);
  assert.equal(P(s, 2).allIn, true);
});

test('10 гар тутам бооцооны шат өснө', () => {
  const s = sng([1500, 1500], 0, 9);
  assert.equal(s.bb, 20);
  act(s, s.toAct!, { kind: 'fold' });
  nextHand(s, seeded(2));
  assert.equal(s.handNo, 11);
  assert.equal(s.bb, 30);
});

// ── Тэмцээн ─────────────────────────────────────────────────────────────────

test('нэг гарт хасагдвал гар эхлэхэд их чиптэй байсан нь дээгүүр байр', () => {
  const s = sng([200, 100, 1500], 2); // товч p2, бага p0, их p1
  rig(s, ['7c 2d', '8c 3d', 'Ah Ad'], 'Kc Qd 9s 5s 4h');
  act(s, 'p2', { kind: 'raise', amount: 200 });
  act(s, 'p0', { kind: 'allin' });
  act(s, 'p1', { kind: 'allin' });
  while (s.phase === 'playing') act(s, s.toAct!, { kind: 'check' });
  assert.equal(s.phase, 'finished');
  assert.equal(P(s, 2).place, 1);
  assert.equal(P(s, 0).place, 2, '200-тай эхэлсэн');
  assert.equal(P(s, 1).place, 3);
});

test('шагнал: нийлбэр сантай тэнцүү, 2–4 / 5–6 / 7–9 хуваарилалт', () => {
  assert.deepEqual(payouts(3, 100), [300]);
  assert.deepEqual(payouts(6, 100), [390, 210]);
  assert.deepEqual(payouts(9, 100), [450, 270, 180]);
  assert.equal(payouts(7, 33).reduce((a, b) => a + b), 7 * 33);
});

test('санамсаргүй 400 тэмцээн: чип хадгалагдаж, нэг ялагчтай, токены тооцоо тэг нийлбэртэй', () => {
  for (let seed = 1; seed <= 400; seed++) {
    const rng = seeded(seed);
    const n = 2 + (seed % 8);
    const s = createPoker('sng');
    for (let i = 0; i < n; i++) addPokerPlayer(s, `p${i}`, `P${i}`);
    startTournament(s, { buyIn: 1000 }, rng);
    const total = n * 1500;
    let guard = 0;
    while (s.phase !== 'finished') {
      assert.ok(++guard < 20_000, `seed ${seed}: дуусахгүй байна`);
      if (s.phase === 'handEnd') {
        nextHand(s, rng);
        continue;
      }
      const id = s.toAct!;
      const la = legalActions(s, id)!;
      const r = rng();
      if (r < 0.03) timeoutAct(s);
      else if (r < 0.15 && !la.canCheck) act(s, id, { kind: 'fold' });
      else if (r < 0.35 && la.canRaise) {
        const to = la.minTo + Math.floor(rng() * (la.maxTo - la.minTo + 1));
        act(s, id, { kind: 'raise', amount: to });
      } else if (r < 0.4 && la.canRaise) act(s, id, { kind: 'allin' });
      else act(s, id, la.canCheck ? { kind: 'check' } : { kind: 'call' });
      assert.equal(chipsInPlay(s), total, `seed ${seed}: чип алдагдлаа`);
    }
    assert.equal(chipsInPlay(s), total);
    const places = s.players.map((p) => p.place).sort((a, b) => a! - b!);
    assert.deepEqual(places, Array.from({ length: n }, (_, i) => i + 1), `seed ${seed}: байр`);
    assert.equal(s.settlement!.reduce((a, x) => a + x.amount, 0), 0, `seed ${seed}: токен`);
  }
});

test('хугацаа дуусвал өнжих эсвэл хаяж, түр байхгүй болно', () => {
  const s = sng([1500, 1500, 1500], 0);
  timeoutAct(s); // p0 дагах ёстой → хаяна
  assert.equal(P(s, 0).folded, true);
  assert.equal(P(s, 0).sittingOut, true);
  act(s, 'p1', { kind: 'call' });
  timeoutAct(s); // p2 их бооцоо, өнжиж болно
  assert.equal(P(s, 2).folded, false);
});

test('Sit & Go-д гарсан тоглогч тэмцээнд үлдэж, бооцоо нь тавигдсаар байна', () => {
  const s = sng([1500, 1500, 1500], 0);
  removePokerPlayer(s, 'p0'); // ээлжтэй байсан → хаяна
  assert.equal(P(s, 0).folded, true);
  assert.equal(P(s, 0).left, true);
  assert.equal(s.players.length, 3, 'хасагдаагүй');
  assert.equal(takeLeavers(s).length, 0);
});

test('бүх хүн гарвал тэмцээн дуусна', () => {
  const s = sng([1500, 1500, 1500], 0);
  P(s, 1).bot = 'medium';
  P(s, 2).bot = 'medium';
  removePokerPlayer(s, 'p0');
  assert.equal(concludeIfNoHumans(s), true);
  assert.equal(s.phase, 'finished');
  assert.equal(P(s, 0).place, 3, 'гарсан хүн хамгийн доод байр');
});

// ── Кэш ─────────────────────────────────────────────────────────────────────

test('кэш: шинээр суусан тоглогч их бооцоо хүрэхийг хүлээнэ', () => {
  const s = createPoker('cash');
  for (let i = 0; i < 3; i++) addPokerPlayer(s, `p${i}`, `P${i}`, 100_000).seat = i;
  startCash(s, { sb: 500, bb: 1000 }, seeded(3));
  while (s.phase === 'playing') act(s, s.toAct!, legalActions(s, s.toAct!)!.canCheck ? { kind: 'check' } : { kind: 'fold' });
  const late = addPokerPlayer(s, 'p3', 'P3', 100_000);
  assert.equal(late.waitBB, true);
  let dealtAt = -1;
  for (let h = 0; h < 6 && dealtAt < 0; h++) {
    nextHand(s, seeded(10 + h));
    if (late.dealt) dealtAt = h;
    else {
      while (isPlaying(s)) act(s, s.toAct!, legalActions(s, s.toAct!)!.canCheck ? { kind: 'check' } : { kind: 'fold' });
    }
  }
  assert.ok(dealtAt >= 0, 'эцэст нь тараагдана');
  assert.equal(s.bbSeat, late.seat, 'их бооцоогоор орно');
  assert.equal(late.street, 1000);
});

test('кэш: гарсан тоглогч гар дуусахад ширээнээс босно, чип нь хадгалагдана', () => {
  const s = createPoker('cash');
  for (let i = 0; i < 3; i++) addPokerPlayer(s, `p${i}`, `P${i}`, 50_000).seat = i;
  startCash(s, { sb: 500, bb: 1000 }, seeded(4));
  const actor = s.toAct!;
  const other = s.players.find((p) => p.id !== actor && p.dealt)!;
  removePokerPlayer(s, other.id);
  assert.equal(s.toAct, actor, 'ээлж алгасагдахгүй');
  while (s.phase === 'playing') act(s, s.toAct!, legalActions(s, s.toAct!)!.canCheck ? { kind: 'check' } : { kind: 'call' });
  const gone = takeLeavers(s);
  assert.deepEqual(gone.map((p) => p.id), [other.id]);
  assert.equal(chipsInPlay(s) + gone[0].stack, 150_000);
});

test('кэш: чип нэмбэл буцаж тоглоно', () => {
  const s = createPoker('cash');
  for (let i = 0; i < 2; i++) addPokerPlayer(s, `p${i}`, `P${i}`, 2_000).seat = i;
  startCash(s, { sb: 500, bb: 1000 }, seeded(5));
  act(s, s.toAct!, { kind: 'allin' });
  act(s, s.toAct!, { kind: 'call' });
  const broke = s.players.find((p) => p.stack === 0);
  if (broke) {
    assert.equal(broke.sittingOut, true);
    addChips(s, broke.id, 40_000);
    assert.equal(broke.sittingOut, false);
    assert.equal(broke.stack, 40_000);
  }
  assert.throws(() => act(s, 'p0', { kind: 'check' }), PokerRuleError);
});

// ── Робот ───────────────────────────────────────────────────────────────────

import { choosePokerAction, equity } from '../../app/src/shared/holdem/bot';

test('equity: AA нэг өрсөлдөгчийн эсрэг ~85%, 72o ~35%', () => {
  const aa = equity(cs('Ah Ad'), [], 1, 3000, seeded(11));
  const sevenTwo = equity(cs('7c 2d'), [], 1, 3000, seeded(12));
  assert.ok(aa > 0.8 && aa < 0.9, `AA ${aa}`);
  assert.ok(sevenTwo > 0.28 && sevenTwo < 0.4, `72o ${sevenTwo}`);
});

test('робот тэмцээн: 3 түвшний робот зөвхөн хууль ёсны үйлдэл хийж тэмцээнийг дуусгана', () => {
  for (let seed = 1; seed <= 12; seed++) {
    const rng = seeded(seed * 97);
    const s = createPoker('sng');
    const levels = ['easy', 'medium', 'hard', 'medium', 'hard', 'easy'] as const;
    const n = 2 + (seed % 5);
    for (let i = 0; i < n; i++) addPokerPlayer(s, `p${i}`, `P${i}`).bot = levels[i];
    startTournament(s, { buyIn: 0 }, rng);
    let guard = 0;
    while (s.phase !== 'finished') {
      assert.ok(++guard < 5000, `seed ${seed}: дуусахгүй байна`);
      if (s.phase === 'handEnd') {
        nextHand(s, rng);
        continue;
      }
      const p = s.players.find((x) => x.id === s.toAct)!;
      const a = choosePokerAction(s, p.id, p.bot!, rng);
      act(s, p.id, a); // хууль бус бол PokerRuleError → тест унана
    }
    assert.equal(chipsInPlay(s), n * 1500);
  }
});

test('сайн робот сул роботыг олон тэмцээнд давна', () => {
  let hardWins = 0;
  const games = 30;
  for (let seed = 1; seed <= games; seed++) {
    const rng = seeded(seed * 31);
    const s = createPoker('sng');
    addPokerPlayer(s, 'h', 'Hard').bot = 'hard';
    addPokerPlayer(s, 'e', 'Easy').bot = 'easy';
    startTournament(s, { buyIn: 0 }, rng);
    while (s.phase !== 'finished') {
      if (s.phase === 'handEnd') {
        nextHand(s, rng);
        continue;
      }
      const p = s.players.find((x) => x.id === s.toAct)!;
      act(s, p.id, choosePokerAction(s, p.id, p.bot!, rng));
    }
    if (s.winnerId === 'h') hardWins += 1;
  }
  assert.ok(hardWins >= games * 0.6, `сайн робот ${hardWins}/${games}`);
});

// ── Show / Muck ─────────────────────────────────────────────────────────────

test('тэмцэлгүй хожсон хүн 2 секундэд хөзрөө харуулж (Show) эсвэл нууж (Muck) болно', () => {
  const s = sng([1500, 1500, 1500], 0);
  rig(s, ['Ah Kd', '7c 2d', '8c 3h'], '3c 8d 9s Js 4h');
  act(s, 'p0', { kind: 'raise', amount: 60 });
  act(s, 'p1', { kind: 'fold' });
  act(s, 'p2', { kind: 'fold' });
  assert.equal(s.showOffer?.playerId, 'p0', 'зөвхөн хожсон хүнд');
  assert.equal(P(s, 0).showCards, false, 'анхдагчаар нууц');
  assert.throws(() => showHand(s, 'p1', true), PokerRuleError, 'бусад хүн сонгохгүй');
  showHand(s, 'p0', true);
  assert.equal(P(s, 0).showCards, true);
  assert.throws(() => showHand(s, 'p0', true), PokerRuleError, 'нэг л удаа');

  const m = sng([1500, 1500], 0);
  act(m, 'p0', { kind: 'fold' });
  assert.equal(m.showOffer?.playerId, 'p1');
  showHand(m, 'p1', false); // Muck
  assert.equal(P(m, 1).showCards, false);
  assert.equal(m.showOffer, null);
});

test('Show хугацаа өнгөрвөл татгалзана; Showdown-д сонголт гарахгүй; робот харуулахгүй', () => {
  const s = sng([1500, 1500], 0);
  act(s, 'p0', { kind: 'fold' });
  s.showOffer!.endsAt = Date.now() - 1;
  assert.throws(() => showHand(s, 'p1', true), PokerRuleError);
  assert.equal(P(s, 1).showCards, false);

  const sd = sng([1500, 1500], 0);
  act(sd, 'p0', { kind: 'call' });
  while (sd.phase === 'playing') act(sd, sd.toAct!, { kind: 'check' });
  assert.equal(sd.showOffer, null, 'Showdown-д хожих гар заавал ил');

  const b = sng([1500, 1500], 0);
  P(b, 1).bot = 'hard';
  act(b, 'p0', { kind: 'fold' });
  assert.equal(b.showOffer, null);
});
