/**
 * Texas Hold'em гарын хүч тооцогч.
 *
 * Хөзрийн дүрслэл нь Big Two-гийнхтэй ижил (`cards.ts`, 0..51) боловч
 * ЭРЭМБЭ ӨӨР: покерт 2 хамгийн бага, A хамгийн өндөр (A-2-3-4-5 straight-д
 * доод A болно). Дүрс (suit) хоорондоо ТЭНЦҮҮ — тэнцсэн гарт сав хуваагдана.
 *
 *   Big Two rank:  0="3" … 11="A", 12="2"
 *   Покер value:   (rank + 1) % 13  →  0="2", 1="3", … 12="A"
 */

import { Card, suitOf } from '../cards';

export type HandCategory =
  | 'high'
  | 'pair'
  | 'twoPair'
  | 'trips'
  | 'straight'
  | 'flush'
  | 'fullHouse'
  | 'quads'
  | 'straightFlush';

const CATEGORY_ORDER: HandCategory[] = [
  'high',
  'pair',
  'twoPair',
  'trips',
  'straight',
  'flush',
  'fullHouse',
  'quads',
  'straightFlush',
];

/** Англи нэр (хэрэглэгчийн шийдвэр: тоглоомын нэр томьёо англиар). */
export const CATEGORY_NAMES: Record<HandCategory, string> = {
  high: 'High Card',
  pair: 'Pair',
  twoPair: 'Two Pair',
  trips: 'Three of a Kind',
  straight: 'Straight',
  flush: 'Flush',
  fullHouse: 'Full House',
  quads: 'Four of a Kind',
  straightFlush: 'Straight Flush',
};

/** Покерын утга: 0 = "2" … 12 = "A". */
export const pokerValue = (c: Card): number => (Math.floor(c / 4) + 1) % 13;

const VALUE_NAMES = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

export interface HandRank {
  category: HandCategory;
  /**
   * Харьцуулах тоо — их нь хүчтэй. Ангилал × 13^5 + 5 kicker (13-тын систем).
   * Ижил тоо = яг тэнцүү гар (сав хуваана).
   */
  score: number;
  /** Сонгогдсон 5 хөзөр (хүчээр эрэмбэлсэн). */
  cards: Card[];
  /** Хүнд ойлгомжтой нэр, жишээ нь "Full House, Ks full of 7s". */
  label: string;
}

function scoreOf(category: HandCategory, kickers: number[]): number {
  let s = CATEGORY_ORDER.indexOf(category);
  for (let i = 0; i < 5; i++) s = s * 13 + (kickers[i] ?? 0);
  return s;
}

/**
 * Яг 5 хөзрийн гарыг үнэлнэ. `best`-ээс дуудагдана — 7-оос 5-ыг сонгох 21
 * хослол бүгдийг шалгах нь хурдан бөгөөд алдаа гаргах эрсдэлгүй.
 */
export function evaluate5(cards: Card[]): HandRank {
  if (cards.length !== 5) throw new Error('evaluate5: яг 5 хөзөр хэрэгтэй.');
  const values = cards.map(pokerValue).sort((a, b) => b - a);
  const flush = cards.every((c) => suitOf(c) === suitOf(cards[0]));

  // Straight: 5 өөр утга, дараалсан. A-2-3-4-5 ("wheel") — дээд хөзөр нь 5.
  const unique = [...new Set(values)];
  let straightHigh = -1;
  if (unique.length === 5) {
    if (unique[0] - unique[4] === 4) straightHigh = unique[0];
    else if (unique[0] === 12 && unique[1] === 3 && unique[4] === 0) straightHigh = 3;
  }

  // Утгуудыг (тоо, утга)-аар бүлэглэнэ: олон давтагдсан нь эхэнд, тэнцвэл өндөр нь.
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const ordered = groups.flatMap(([v, n]) => Array<number>(n).fill(v));
  const shape = groups.map(([, n]) => n).join('');

  let category: HandCategory;
  let kickers: number[];
  if (straightHigh >= 0 && flush) {
    category = 'straightFlush';
    kickers = [straightHigh];
  } else if (shape === '41') {
    category = 'quads';
    kickers = [groups[0][0], groups[1][0]];
  } else if (shape === '32') {
    category = 'fullHouse';
    kickers = [groups[0][0], groups[1][0]];
  } else if (flush) {
    category = 'flush';
    kickers = values;
  } else if (straightHigh >= 0) {
    category = 'straight';
    kickers = [straightHigh];
  } else if (shape === '311') {
    category = 'trips';
    kickers = ordered.filter((_, i) => i === 0 || i >= 3);
  } else if (shape === '221') {
    category = 'twoPair';
    kickers = [groups[0][0], groups[1][0], groups[2][0]];
  } else if (shape === '2111') {
    category = 'pair';
    kickers = [groups[0][0], groups[1][0], groups[2][0], groups[3][0]];
  } else {
    category = 'high';
    kickers = values;
  }

  // Хөзрийг харуулах дараалал: бүлгийн дарааллаар (wheel-д A хамгийн сүүлд).
  const sorted = cards.slice().sort((a, b) => {
    const va = pokerValue(a);
    const vb = pokerValue(b);
    const ca = counts.get(va)!;
    const cb = counts.get(vb)!;
    if (ca !== cb) return cb - ca;
    if (straightHigh === 3) return (vb === 12 ? -1 : vb) - (va === 12 ? -1 : va);
    return vb - va;
  });

  return { category, score: scoreOf(category, kickers), cards: sorted, label: labelOf(category, kickers) };
}

function labelOf(category: HandCategory, k: number[]): string {
  const n = (v: number) => VALUE_NAMES[v];
  switch (category) {
    case 'straightFlush':
      return k[0] === 12 ? 'Royal Flush' : `Straight Flush, ${n(k[0])} high`;
    case 'quads':
      return `Four of a Kind, ${n(k[0])}s`;
    case 'fullHouse':
      return `Full House, ${n(k[0])}s full of ${n(k[1])}s`;
    case 'flush':
      return `Flush, ${n(k[0])} high`;
    case 'straight':
      return `Straight, ${n(k[0])} high`;
    case 'trips':
      return `Three of a Kind, ${n(k[0])}s`;
    case 'twoPair':
      return `Two Pair, ${n(k[0])}s and ${n(k[1])}s`;
    case 'pair':
      return `Pair of ${n(k[0])}s`;
    default:
      return `High Card, ${n(k[0])}`;
  }
}

/** 5–7 хөзрөөс хамгийн хүчтэй 5-ын хослолыг сонгоно. */
export function bestHand(cards: Card[]): HandRank {
  if (cards.length < 5 || cards.length > 7) throw new Error('bestHand: 5–7 хөзөр хэрэгтэй.');
  if (cards.length === 5) return evaluate5(cards);
  let best: HandRank | null = null;
  const n = cards.length;
  for (let a = 0; a < n; a++)
    for (let b = a + 1; b < n; b++)
      for (let c = b + 1; c < n; c++)
        for (let d = c + 1; d < n; d++)
          for (let e = d + 1; e < n; e++) {
            const r = evaluate5([cards[a], cards[b], cards[c], cards[d], cards[e]]);
            if (!best || r.score > best.score) best = r;
          }
  return best!;
}

/** Хөзрийн нэр покерын хэлбэрээр (жишээ нь "A♠"). */
export function pokerCardName(c: Card): string {
  return `${VALUE_NAMES[pokerValue(c)]}${['♦', '♣', '♥', '♠'][suitOf(c)]}`;
}

/**
 * Товчны сугалааны эрэмбэ (TDA): өндөр хөзөр түрүүлнэ, тэнцвэл дүрсээр
 * ♠ > ♥ > ♦ > ♣. Big Two-гийн дүрсийн дараалал (♦♣♥♠) өөр тул тусад нь.
 */
export function buttonDrawValue(c: Card): number {
  const suitRank = [1, 0, 2, 3][suitOf(c)]; // ♦=1, ♣=0, ♥=2, ♠=3
  return pokerValue(c) * 4 + suitRank;
}
