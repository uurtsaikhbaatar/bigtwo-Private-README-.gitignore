import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Card, THREE_OF_DIAMONDS, cardName } from '../../app/src/shared/cards';
import { beats, detectCombo } from '../../app/src/shared/combos';
import { RuleError, addPlayer, createGame, pass, play, startRound } from '../../app/src/shared/game';

/** Хөзрийг "3♦" маягийн бичиглэлээс индекс рүү хөрвүүлнэ (зөвхөн тестэд). */
const RANKS = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];
const SUITS = ['♦', '♣', '♥', '♠'];
function c(text: string): Card {
  const suit = SUITS.indexOf(text.slice(-1));
  const rank = RANKS.indexOf(text.slice(0, -1));
  assert.ok(rank >= 0 && suit >= 0, `буруу хөзөр: ${text}`);
  return rank * 4 + suit;
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

test('эхний тавилтад 3♦ орсон байх ёстой', () => {
  // 4 тоглогчтой үед бүх 52 хөзөр тарааагддаг тул 3♦ заавал хэн нэгэнд очно.
  const state = createGame();
  addPlayer(state, 'a', 'Ану');
  addPlayer(state, 'b', 'Бат');
  addPlayer(state, 'c', 'Цэцэг');
  addPlayer(state, 'd', 'Дорж');
  startRound(state, mulberry32(7));

  const starter = state.players[state.turn];
  assert.ok(starter.hand.includes(THREE_OF_DIAMONDS), '3♦-тэй тоглогч эхэлнэ');

  const wrong = starter.hand.find((x) => x !== THREE_OF_DIAMONDS)!;
  assert.throws(() => play(state, starter.id, [wrong]), RuleError);
  play(state, starter.id, [THREE_OF_DIAMONDS]);
  assert.equal(state.current?.combo.cards[0], THREE_OF_DIAMONDS);
});

test('шинэ эргэлтийн эхэнд пас хийж болохгүй', () => {
  const state = createGame();
  addPlayer(state, 'a', 'Ану');
  addPlayer(state, 'b', 'Бат');
  startRound(state, mulberry32(7));
  assert.throws(() => pass(state, state.players[state.turn].id), RuleError);
});

test('бүгд пас хийвэл сүүлд тавьсан хүн шинэ эргэлт эхлүүлнэ', () => {
  const state = createGame();
  addPlayer(state, 'a', 'Ану');
  addPlayer(state, 'b', 'Бат');
  addPlayer(state, 'c', 'Цэцэг');
  startRound(state, mulberry32(11));

  const leader = state.players[state.turn];
  play(state, leader.id, [THREE_OF_DIAMONDS]);
  pass(state, state.players[state.turn].id);
  pass(state, state.players[state.turn].id);

  assert.equal(state.current, null, 'ширээ цэвэрлэгдсэн байх');
  assert.equal(state.players[state.turn].id, leader.id, 'эргэлт ялагчид буцна');
  assert.ok(state.players.every((p) => !p.passed), 'пас тэмдэглэгээ арилсан байх');
});

test('ээлжгүй тоглогч үйлдэл хийж чадахгүй', () => {
  const state = createGame();
  addPlayer(state, 'a', 'Ану');
  addPlayer(state, 'b', 'Бат');
  startRound(state, mulberry32(3));
  const other = state.players[(state.turn + 1) % 2];
  assert.throws(() => play(state, other.id, other.hand.slice(0, 1)), RuleError);
});

// ── Санамсаргүй бүтэн тоглолт ──────────────────────────────────────────────

/** Тухайн гараас хууль ёсны бүх тавилтыг олно (тестийн энгийн хувилбар). */
function legalPlays(cards: Card[], current: ReturnType<typeof detectCombo>): Card[][] {
  const out: Card[][] = [];
  const consider = (pick: Card[]) => {
    const combo = detectCombo(pick);
    if (combo && beats(combo, current)) out.push(pick);
  };
  const n = cards.length;
  const sizes = current ? [current.size] : [1, 2, 3, 5];
  for (const size of sizes) {
    if (size > n) continue;
    const idx = Array.from({ length: size }, (_, i) => i);
    for (;;) {
      consider(idx.map((i) => cards[i]));
      let k = size - 1;
      while (k >= 0 && idx[k] === n - size + k) k--;
      if (k < 0) break;
      idx[k]++;
      for (let j = k + 1; j < size; j++) idx[j] = idx[j - 1] + 1;
    }
  }
  return out;
}

test('санамсаргүй тоглолтууд дүрэм зөрчихгүйгээр дуусна', () => {
  for (let seed = 1; seed <= 25; seed++) {
    const rng = mulberry32(seed);
    const state = createGame();
    const count = 2 + (seed % 3); // 2..4 тоглогч
    for (let i = 0; i < count; i++) addPlayer(state, `p${i}`, `Тоглогч ${i + 1}`);
    startRound(state, rng);

    let steps = 0;
    while (state.phase === 'playing') {
      assert.ok(++steps < 2000, 'тоглоом гацсан байна');
      const player = state.players[state.turn];
      assert.equal(player.place, null, 'дууссан тоглогчид ээлж ирэхгүй');

      let options = legalPlays(player.hand, state.current?.combo ?? null);
      // Дугуйн эхний тавилтад 3♦ заавал орох ёстой.
      if (state.lastPlay === null && player.hand.includes(THREE_OF_DIAMONDS)) {
        options = options.filter((o) => o.includes(THREE_OF_DIAMONDS));
        assert.ok(options.length > 0, '3♦-ийг тавих сонголт үргэлж байх ёстой');
      }
      if (options.length === 0) {
        assert.ok(state.current, 'шинэ эргэлтэд үргэлж тавилт байх ёстой');
        pass(state, player.id);
      } else {
        play(state, player.id, options[Math.floor(rng() * options.length)]);
      }

      const totalCards = state.players.reduce((s, p) => s + p.hand.length, 0);
      assert.ok(totalCards <= count * 13);
    }

    assert.equal(state.phase, 'finished');
    assert.ok(state.results, 'үр дүн тооцоологдсон байх');
    assert.equal(state.players.filter((p) => p.place === 1).length, 1, 'яг нэг ялагч');
    assert.equal(state.players.find((p) => p.place === 1)!.hand.length, 0);
    const netSum = state.results!.reduce((s, r) => s + r.net, 0);
    assert.equal(netSum, 0, 'оноо тэг нийлбэртэй байх ёстой');
  }
});
