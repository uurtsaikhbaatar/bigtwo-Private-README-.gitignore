/**
 * Big Two (Дай Ди) хослолыг таних ба харьцуулах логик.
 *
 * Зөвшөөрөгдөх хослолууд: 1 хөзөр, хос, гурвал, 5 хөзрийн комбинац.
 * 5 хөзрийн эрэмбэ (сулаас хүчтэй рүү):
 *   шулуун (straight) < өнгө (flush) < дүүрэн байшин (full house)
 *   < дөрвөл (four of a kind) < шулуун өнгө (straight flush)
 *
 * ДҮРМИЙН ТЭМДЭГЛЭЛ: "2" нь ганцаараа хамгийн хүчтэй хөзөр боловч ДАРААЛАЛД
 * зөвхөн доод карт болно. Зөвшөөрөгдөх шулуунууд (сулаас хүчтэй рүү):
 *   A-2-3-4-5 (wheel) < 2-3-4-5-6 < 3-4-5-6-7 < … < 10-J-Q-K-A
 * J-Q-K-A-2-г ХАСсан — 2 дараалалд дээд карт болохгүй (тоглогчийн хүсэлт).
 * Ингэснээр 2 нь дараалал бүрд ижилхэн доод карт болж, зөрчилгүй болов.
 */

import { Card, rankOf, suitOf } from './cards';

export type ComboKind = 'single' | 'pair' | 'triple' | 'five';
export type FiveCategory = 'straight' | 'flush' | 'fullhouse' | 'quads' | 'straightflush';

const FIVE_CATEGORY_ORDER: Record<FiveCategory, number> = {
  straight: 0,
  flush: 1,
  fullhouse: 2,
  quads: 3,
  straightflush: 4,
};

export interface Combo {
  kind: ComboKind;
  /** Хөзрийн тоо: 1, 2, 3 эсвэл 5. */
  size: number;
  /** Зөвхөн 5 хөзрийн хослолд. */
  category?: FiveCategory;
  /** Ижил `size`-тай хослолуудыг харьцуулах ганц тоо. Их нь хүчтэй. */
  power: number;
  /** Эрэмбэлэгдсэн хөзрүүд. */
  cards: Card[];
}

/** Ямар нэг хослол мөн эсэхийг шалгаж, мөн бол тодорхойлолтыг нь буцаана. */
export function detectCombo(input: Card[]): Combo | null {
  if (!Array.isArray(input) || input.length === 0) return null;
  const cards = input.slice().sort((a, b) => a - b);

  // Давхардсан хөзөр байж болохгүй.
  for (let i = 1; i < cards.length; i++) {
    if (cards[i] === cards[i - 1]) return null;
  }
  for (const c of cards) {
    if (!Number.isInteger(c) || c < 0 || c > 51) return null;
  }

  switch (cards.length) {
    case 1:
      return { kind: 'single', size: 1, power: cards[0], cards };
    case 2:
      return rankOf(cards[0]) === rankOf(cards[1])
        ? { kind: 'pair', size: 2, power: cards[1], cards }
        : null;
    case 3:
      return rankOf(cards[0]) === rankOf(cards[1]) && rankOf(cards[1]) === rankOf(cards[2])
        ? { kind: 'triple', size: 3, power: rankOf(cards[0]), cards }
        : null;
    case 5:
      return detectFive(cards);
    default:
      return null;
  }
}

function detectFive(cards: Card[]): Combo | null {
  const ranks = cards.map(rankOf);
  const counts = new Map<number, number>();
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1);

  const quadRank = [...counts].find(([, n]) => n === 4)?.[0];
  if (quadRank !== undefined) return five(cards, 'quads', quadRank);

  const tripleRank = [...counts].find(([, n]) => n === 3)?.[0];
  const pairRank = [...counts].find(([, n]) => n === 2)?.[0];
  if (tripleRank !== undefined && pairRank !== undefined) {
    return five(cards, 'fullhouse', tripleRank);
  }
  // 3+1+1 болон 2+2+1 нь хүчинтэй хослол биш.
  if (counts.size !== 5) return null;

  const flush = cards.every((c) => suitOf(c) === suitOf(cards[0]));
  const sorted = ranks.slice().sort((a, b) => a - b);
  // Ердийн дараалал. Гэхдээ 2 (индекс 12) нь дараалалд ЗӨВХӨН доод карт болно
  // (A-2-3-4-5, 2-3-4-5-6). Дээд карт болох J-Q-K-A-2-г хассан — тоглогчийн
  // хүсэлтээр. Тиймээс дараалал 2-оор төгссөн бол ердийн run-д тооцохгүй.
  const run =
    sorted[sorted.length - 1] !== TWO_RANK &&
    sorted.every((r, i) => i === 0 || r === sorted[i - 1] + 1);
  const wheel = sorted.every((r, i) => r === WHEEL_RANKS[i]);
  const sixHigh = sorted.every((r, i) => r === SIX_HIGH_RANKS[i]);
  const straight = run || wheel || sixHigh;

  // Шулууны хүчийг хамгийн өндөр хөзрөөр нь хэмжинэ. Гэхдээ 2 доод карт болдог
  // хоёр тусгай шулуунд өөр хөзрийг ашиглана:
  //   • Wheel (A-2-3-4-5) → 5-аар. Хамгийн сул шулуун.
  //   • 2-3-4-5-6         → 6-аар. Ингэснээр A2345 < 23456 < 34567 болно
  //     (тоглогч мэдэгдсэн: 2-3-4-5-6 straight ажиллахгүй байв).
  let top: Card;
  if (wheel) top = cards.find((c) => rankOf(c) === WHEEL_TOP_RANK)!;
  else if (sixHigh) top = cards.find((c) => rankOf(c) === SIX_HIGH_TOP_RANK)!;
  else top = cards[cards.length - 1];

  if (flush && straight) return five(cards, 'straightflush', top);
  if (flush) return five(cards, 'flush', flushPower(cards, sorted));
  if (straight) return five(cards, 'straight', top);
  return null;
}

/**
 * Хоёр өнгийг (flush) жиших хүч.
 *
 * Эхлээд хамгийн өндөр хөзрөөс нь эхлэн зэрэглэлээр жишнэ, бүрэн тэнцсэн үед
 * л өнгө шийднэ. Тоглогч мэдэгдсэний дагуу зассан: өмнө нь өнгийг зэрэглэлээс
 * түрүүлж жишдэг байсан тул ноёнтой дөрвөлжин өнгө нь 9-тэй өндөр өнгийг дарж
 * чаддаггүй байв.
 */
function flushPower(cards: Card[], ranksAsc: number[]): number {
  const byRank = ranksAsc.reduceRight((acc, r) => acc * 13 + r, 0);
  return byRank * 4 + suitOf(cards[0]);
}

/** A-2-3-4-5 буюу "wheel" — зэрэглэлийн индексээр: 3,4,5,A,2. */
const WHEEL_RANKS = [0, 1, 2, 11, 12];
/** Wheel-ийн хүчийг тодорхойлох хөзөр: 5. */
const WHEEL_TOP_RANK = 2;

/** 2-3-4-5-6 — зэрэглэлийн индексээр эрэмбэлбэл: 3,4,5,6,2 → 0,1,2,3,12. */
const SIX_HIGH_RANKS = [0, 1, 2, 3, 12];
/** 2-3-4-5-6-ийн хүчийг тодорхойлох хөзөр: 6. */
const SIX_HIGH_TOP_RANK = 3;

/** "2"-ийн зэрэглэлийн индекс — дараалалд зөвхөн доод карт болно. */
const TWO_RANK = 12;

/**
 * Ангилал нь ямагт эрэмбийг тодорхойлно — доторх жиших утга хэчнээн том байсан
 * ч давахгүй байх зайтай сонгосон (өнгийн утга 1.5 сая хүрч болно).
 */
const CATEGORY_STEP = 10_000_000;

function five(cards: Card[], category: FiveCategory, tiebreak: number): Combo {
  return {
    kind: 'five',
    size: 5,
    category,
    power: FIVE_CATEGORY_ORDER[category] * CATEGORY_STEP + tiebreak,
    cards,
  };
}

/**
 * `challenger` нь `current`-ийг дарж чадах эсэх.
 * Хөзрийн тоо нь заавал таарах ёстой (5 хөзрийн дотор ангилал өөр байж болно).
 */
export function beats(challenger: Combo, current: Combo | null): boolean {
  if (!current) return true; // шинэ эргэлт — юу ч тавьж болно
  if (challenger.size !== current.size) return false;
  return challenger.power > current.power;
}

/** Хослолын нэрийг монголоор — UI-д харуулах. */
export function comboLabel(combo: Combo): string {
  switch (combo.kind) {
    case 'single':
      return 'Ганц';
    case 'pair':
      return 'Хос';
    case 'triple':
      return 'Гурвал';
    case 'five':
      switch (combo.category) {
        case 'straight':
          return 'Шулуун';
        case 'flush':
          return 'Өнгө';
        case 'fullhouse':
          return 'Дүүрэн байшин';
        case 'quads':
          return 'Дөрвөл';
        case 'straightflush':
          return 'Шулуун өнгө';
      }
  }
  return '';
}
