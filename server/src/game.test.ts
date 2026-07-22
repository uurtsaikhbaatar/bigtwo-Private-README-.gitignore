import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Card, THREE_OF_DIAMONDS, cardName } from '../../app/src/shared/cards';
import { beats, detectCombo } from '../../app/src/shared/combos';
import {
  type GameState,
  RuleError,
  addPlayer,
  createGame,
  pass,
  play,
  startRound,
} from '../../app/src/shared/game';

/** Хөзрийг "3♦" маягийн бичиглэлээс индекс рүү хөрвүүлнэ (зөвхөн тестэд). */
const RANKS = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];
const SUITS = ['♦', '♣', '♥', '♠'];
function c(text: string): Card {
  const suit = SUITS.indexOf(text.slice(-1));
  const rank = RANKS.indexOf(text.slice(0, -1));
  assert.ok(rank >= 0 && suit >= 0, `буруу хөзөр: ${text}`);
  return rank * 4 + suit;
}

/** Ээлжтэй тоглогч. `turn` нь `seats` доторх индекс болохыг анхаар. */
function turnPlayer(state: GameState) {
  return state.players.find((p) => p.id === state.seats[state.turn])!;
}

/** Ээлжгүй нэг тоглогч. */
function otherPlayer(state: GameState) {
  return state.players.find((p) => p.id !== state.seats[state.turn])!;
}

const hand = (...names: string[]): Card[] => names.map(c).sort((a, b) => a - b);

/** Давтагдах боломжтой санамсаргүй тоо. */
function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('индексжүүлэлт: 3♦ хамгийн сул, 2♠ хамгийн хүчтэй', () => {
  assert.equal(c('3♦'), THREE_OF_DIAMONDS);
  assert.equal(c('3♦'), 0);
  assert.equal(c('2♠'), 51);
  assert.equal(cardName(0), '3♦');
});

test('үндсэн хослолуудыг таних', () => {
  assert.equal(detectCombo(hand('5♥'))?.kind, 'single');
  assert.equal(detectCombo(hand('5♥', '5♠'))?.kind, 'pair');
  assert.equal(detectCombo(hand('5♥', '5♠', '5♦'))?.kind, 'triple');
  assert.equal(detectCombo(hand('5♥', '6♠')), null, 'өөр зэрэглэлийн хос болохгүй');
  assert.equal(detectCombo(hand('5♥', '5♠', '6♦', '6♣')), null, '4 хөзөр хүчингүй');
});

test('5 хөзрийн ангиллууд', () => {
  assert.equal(detectCombo(hand('3♦', '4♣', '5♥', '6♠', '7♦'))?.category, 'straight');
  assert.equal(detectCombo(hand('3♦', '5♦', '7♦', '9♦', 'J♦'))?.category, 'flush');
  assert.equal(detectCombo(hand('5♦', '5♣', '5♥', '9♠', '9♦'))?.category, 'fullhouse');
  assert.equal(detectCombo(hand('5♦', '5♣', '5♥', '5♠', '9♦'))?.category, 'quads');
  assert.equal(detectCombo(hand('3♦', '4♦', '5♦', '6♦', '7♦'))?.category, 'straightflush');
  assert.equal(detectCombo(hand('3♦', '4♣', '5♥', '6♠', '9♦')), null, 'зэргэлдээ биш');
  assert.equal(detectCombo(hand('5♦', '5♣', '5♥', '9♠', 'J♦')), null, '3+1+1 хүчингүй');
});

test('шулуун нь K-A-2 хүртэл үргэлжилнэ', () => {
  assert.equal(detectCombo(hand('10♦', 'J♣', 'Q♥', 'K♠', 'A♦'))?.category, 'straight');
  assert.equal(detectCombo(hand('J♦', 'Q♣', 'K♥', 'A♠', '2♦'))?.category, 'straight');
});

test('A-2-3-4-5 (wheel) нь хүчинтэй бөгөөд хамгийн сул шулуун', () => {
  const wheel = detectCombo(hand('A♦', '2♣', '3♥', '4♠', '5♦'))!;
  assert.equal(wheel.category, 'straight');

  const lowest = detectCombo(hand('3♦', '4♣', '5♥', '6♠', '7♦'))!;
  assert.ok(beats(lowest, wheel), 'хамгийн сул ердийн шулуун wheel-ийг дарна');
  assert.ok(!beats(wheel, lowest));

  const highest = detectCombo(hand('J♦', 'Q♣', 'K♥', 'A♠', '2♦'))!;
  assert.ok(!beats(wheel, highest));

  // Хоёр wheel-ийг 5-ынх нь багаар харьцуулна.
  const wheelSpade = detectCombo(hand('A♦', '2♣', '3♥', '4♠', '5♠'))!;
  assert.ok(beats(wheelSpade, wheel), '5♠-тэй wheel нь 5♦-тэйгээ дарна');
});

test('өнгийг эхлээд зэрэглэлээр, дараа нь өнгөөр жишнэ', () => {
  // Тоглогч uuree мэдэгдсэн тохиолдол: ноёнтой дөрвөлжин өнгө нь 9-тэй
  // гилэн өнгийг дарж чаддаггүй байв (өнгө нь зэрэглэлээс түрүүлж жишигдэж).
  const kingDiamonds = detectCombo(hand('3♦', '5♦', '7♦', '9♦', 'K♦'))!;
  const nineHearts = detectCombo(hand('3♥', '4♥', '6♥', '8♥', '9♥'))!;
  assert.equal(kingDiamonds.category, 'flush');
  assert.equal(nineHearts.category, 'flush');
  assert.ok(beats(kingDiamonds, nineHearts), 'ноёнтой өнгө 9-тэй өнгийг дарна');
  assert.ok(!beats(nineHearts, kingDiamonds));

  // Зэрэглэл бүрэн тэнцсэн үед л өнгө шийднэ.
  const lowSuit = detectCombo(hand('3♦', '5♦', '7♦', '9♦', 'K♦'))!;
  const highSuit = detectCombo(hand('3♠', '5♠', '7♠', '9♠', 'K♠'))!;
  assert.ok(beats(highSuit, lowSuit), 'тэнцвэл өндөр өнгө дарна');
  assert.ok(!beats(lowSuit, highSuit));

  // Дараагийн хөзрөөр шийдэгдэх тохиолдол.
  const kingThenTen = detectCombo(hand('3♠', '5♠', '7♠', '10♠', 'K♠'))!;
  const kingThenNine = detectCombo(hand('3♦', '5♦', '7♦', '9♦', 'K♦'))!;
  assert.ok(beats(kingThenTen, kingThenNine), 'ноён тэнцвэл дараагийн хөзөр шийднэ');

  // Ангилал нь ямагт дээгүүр: хамгийн сул дүүрэн байшин ч хамгийн хүчтэй
  // өнгийг дарна.
  const bestFlush = detectCombo(hand('9♠', '10♠', 'Q♠', 'K♠', '2♠'))!;
  const worstFullHouse = detectCombo(hand('3♦', '3♣', '3♥', '4♠', '4♦'))!;
  assert.equal(worstFullHouse.category, 'fullhouse');
  assert.ok(beats(worstFullHouse, bestFlush), 'дүүрэн байшин өнгийг дарна');
});

test('wheel нь шулуун өнгө ч байж болно', () => {
  const wheelFlush = detectCombo(hand('A♥', '2♥', '3♥', '4♥', '5♥'))!;
  assert.equal(wheelFlush.category, 'straightflush');

  const quads = detectCombo(hand('2♦', '2♣', '2♥', '2♠', '6♦'))!;
  assert.ok(beats(wheelFlush, quads), 'шулуун өнгө дөрвөлийг дарна');

  const lowestSF = detectCombo(hand('3♣', '4♣', '5♣', '6♣', '7♣'))!;
  assert.ok(beats(lowestSF, wheelFlush), 'wheel нь хамгийн сул шулуун өнгө');
});

test('2-3-4-5-6 нь шулуун биш (зөвхөн A-2-3-4-5 зөвшөөрөгдсөн)', () => {
  assert.equal(detectCombo(hand('2♦', '3♣', '4♥', '5♠', '6♦')), null);
});

test('5 хөзрийн ангиллын эрэмбэ', () => {
  const straight = detectCombo(hand('3♦', '4♣', '5♥', '6♠', '7♦'))!;
  const flush = detectCombo(hand('3♣', '5♣', '7♣', '9♣', 'J♣'))!;
  const fullhouse = detectCombo(hand('4♦', '4♣', '4♥', '6♠', '6♦'))!;
  const quads = detectCombo(hand('4♦', '4♣', '4♥', '4♠', '6♦'))!;
  const straightflush = detectCombo(hand('3♥', '4♥', '5♥', '6♥', '7♥'))!;

  assert.ok(beats(flush, straight));
  assert.ok(beats(fullhouse, flush));
  assert.ok(beats(quads, fullhouse));
  assert.ok(beats(straightflush, quads));
  assert.ok(!beats(straight, flush), 'сул ангилал дарж чадахгүй');
});

test('хөзрийн тоо таарахгүй бол дарж чадахгүй', () => {
  const single = detectCombo(hand('2♠'))!;
  const pair = detectCombo(hand('3♦', '3♣'))!;
  assert.ok(!beats(single, pair));
  assert.ok(!beats(pair, single));
});

test('3♦ нь хэн эхлэхийг заана, юу тавихыг заахгүй', () => {
  // 4 тоглогчтой үед бүх 52 хөзөр тарааагддаг тул 3♦ заавал хэн нэгэнд очно.
  const state = createGame();
  addPlayer(state, 'a', 'Ану');
  addPlayer(state, 'b', 'Бат');
  addPlayer(state, 'c', 'Цэцэг');
  addPlayer(state, 'd', 'Дорж');
  startRound(state, mulberry32(7));

  const starter = turnPlayer(state);
  assert.ok(starter.hand.includes(THREE_OF_DIAMONDS), '3♦-тэй тоглогч эхэлнэ');

  // 3♦-ээ заавал оруулах шаардлагагүй — дуртай хослолоо тавьж болно.
  const other = starter.hand.find((x) => x !== THREE_OF_DIAMONDS)!;
  play(state, starter.id, [other]);
  assert.equal(state.current?.combo.cards[0], other);
});

test('шинэ эргэлтийн эхэнд пас хийж болохгүй', () => {
  const state = createGame();
  addPlayer(state, 'a', 'Ану');
  addPlayer(state, 'b', 'Бат');
  startRound(state, mulberry32(7));
  assert.throws(() => pass(state, turnPlayer(state).id), RuleError);
});

test('бүгд пас хийвэл сүүлд тавьсан хүн шинэ эргэлт эхлүүлнэ', () => {
  const state = createGame();
  addPlayer(state, 'a', 'Ану');
  addPlayer(state, 'b', 'Бат');
  addPlayer(state, 'c', 'Цэцэг');
  startRound(state, mulberry32(11));

  const leader = turnPlayer(state);
  play(state, leader.id, [THREE_OF_DIAMONDS]);
  pass(state, turnPlayer(state).id);
  pass(state, turnPlayer(state).id);

  assert.equal(state.current, null, 'ширээ цэвэрлэгдсэн байх');
  assert.equal(turnPlayer(state).id, leader.id, 'эргэлт ялагчид буцна');
  assert.ok(state.players.every((p) => !p.passed), 'пас тэмдэглэгээ арилсан байх');
});

test('ээлжгүй тоглогч үйлдэл хийж чадахгүй', () => {
  const state = createGame();
  addPlayer(state, 'a', 'Ану');
  addPlayer(state, 'b', 'Бат');
  startRound(state, mulberry32(3));
  const other = otherPlayer(state);
  assert.throws(() => play(state, other.id, other.hand.slice(0, 1)), RuleError);
});
