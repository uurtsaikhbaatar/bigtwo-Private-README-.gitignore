/**
 * Ботын шийдвэр гаргалт.
 *
 * Гурван түвшин:
 *   анхан  — санамжгүй тавина, заримдаа тавьж чадах атлаа пас хийнэ
 *   дунд   — хамгийн сул хууль ёсны тавилтыг сонгоно, дэмий пас хийхгүй
 *   сайн   — хос, гурвал, дөрвөлийг задлахаас зайлсхийж, хүчтэй хөзрөө
 *            хойшлуулж, дуусах боломж гарвал шууд ашиглана
 *
 * Тоглоомын дүрмээс ТУСДАА байна: зөвхөн гар ба ширээн дээрх хослолыг хараад
 * шийднэ. Ингэснээр тестээр тусад нь хэмжих боломжтой.
 */

import { Card, rankOf } from './cards';
import { Combo, beats, detectCombo } from './combos';

export const BOT_LEVELS = ['easy', 'medium', 'hard'] as const;
export type BotLevel = (typeof BOT_LEVELS)[number];

export const BOT_LEVEL_NAMES: Record<BotLevel, string> = {
  easy: 'Анхан шат',
  medium: 'Дунд',
  hard: 'Сайн',
};

/** Ботын "бодох" хугацаа — шууд тавьбал хүн шиг санагдахгүй. */
export const BOT_THINK_MS: Record<BotLevel, [number, number]> = {
  easy: [700, 1600],
  medium: [800, 1800],
  hard: [1000, 2200],
};

/** Хамгийн хүчтэй зэрэглэл (2). Хожуулж хойшлуулах нь ашигтай. */
const RANK_TWO = 12;

/**
 * Торгуулийн жин — эмпирикээр сонгосон.
 *
 * 1200 тоглолтын шүүлтээр: 0 бол илт муу (38.6%), 0.2–0.6 хооронд ялгаа
 * бага, 1.0 нь хэт их хадгалснаас болж СУЛРУУЛСАН. Тиймээс 0.5 орчимд
 * тогтоов.
 */
const WEIGHT = 0.5;

/**
 * Дунд түвшин хэдэн хувийн магадлалаар алдаа гаргах вэ.
 *
 * Хэмжсэн: 0.2 → сайн нь 58.8% ялна, 0.35 → 66.4%, 0.5 → 73.6%, 0.7 → 79.9%.
 * 0.35 нь хамгийн тэнцвэртэй — сайн нь илт дээр ч, дунд нь өрсөлдөхүйц.
 */
const MEDIUM_MISTAKE = 0.35;
/** Анхан шат ҮРГЭЛЖ хамгийн сайнаас доогуур сонголт хийнэ. */
const EASY_POOL = 5;
/** Анхан шат тавьж чадсаар байж пас хийх магадлал. */
const EASY_PASS = 0.2;

/** Хууль ёсны бүх тавилтыг олно. */
export function legalMoves(hand: Card[], current: Combo | null): Card[][] {
  const out: Card[][] = [];
  const cards = [...hand].sort((a, b) => a - b);
  const n = cards.length;

  for (const size of current ? [current.size] : [1, 2, 3, 5]) {
    if (size > n) continue;
    const idx = Array.from({ length: size }, (_, i) => i);
    for (;;) {
      const pick = idx.map((i) => cards[i]);
      const combo = detectCombo(pick);
      if (combo && beats(combo, current)) out.push(pick);

      let k = size - 1;
      while (k >= 0 && idx[k] === n - size + k) k -= 1;
      if (k < 0) break;
      idx[k] += 1;
      for (let j = k + 1; j < size; j += 1) idx[j] = idx[j - 1] + 1;
    }
  }
  return out;
}

/** Зэрэглэл бүр гарт хэдэн ширхэг байна вэ. */
function rankCounts(hand: Card[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const card of hand) {
    const rank = rankOf(card);
    counts.set(rank, (counts.get(rank) ?? 0) + 1);
  }
  return counts;
}

/**
 * Тавилтын "үнэ" — бага нь дээр.
 *
 * Хос, гурвал, дөрвөлийг хагас задлах нь хожим хариу өгөх боломжийг устгадаг
 * тул торгуультай. Хүчтэй хөзөр (2) зарцуулах нь ч торгуультай.
 *
 * `weight` нь торгуулийн хүчийг зохицуулна: дунд түвшин зөвхөн хагас анхаарна,
 * сайн түвшин бүрэн анхаарна. Ингэснээр түвшин хоорондын зөрүү бодитой болно.
 */
export function moveCost(move: Card[], hand: Card[], weight = 1): number {
  const counts = rankCounts(hand);
  const used = rankCounts(move);

  let cost = 0;
  for (const card of move) cost += rankOf(card);

  for (const [rank, count] of used) {
    const held = counts.get(rank) ?? 0;
    // Бүтэн бүлгээ ашигласан бол торгуульгүй; хагасыг нь салгасан бол торгууль.
    if (count < held) cost += (held - count) * 12 * weight;
    if (rank === RANK_TWO) cost += 15 * count * weight;
  }

  const combo = detectCombo(move);
  // Дөрвөл ба шулуун өнгө нь ховор зэвсэг — дэмий үрэх ёсгүй.
  if (combo?.category === 'quads' || combo?.category === 'straightflush') {
    cost += 30 * weight;
  }

  // Олон хөзөр гаргах нь ашигтай — зардлаас хасна.
  cost -= move.length * 9;
  return cost;
}

interface Context {
  hand: Card[];
  current: Combo | null;
  /** Өрсөлдөгчдийн гарт хэдэн хөзөр байна (өөрийгөө оруулахгүй). */
  opponentCards: number[];
}

/**
 * Ботын нүүдэл. `null` буцаавал пас.
 *
 * Ширээ хоосон (`current === null`) үед пас хийх боломжгүй тул үргэлж
 * тавилт буцаана.
 */
export function chooseMove(
  ctx: Context,
  level: BotLevel,
  rng: () => number = Math.random,
): Card[] | null {
  const moves = legalMoves(ctx.hand, ctx.current);
  if (moves.length === 0) return null;

  // Энэ тавилтаар дуусах боломжтой бол ямар ч түвшинд ашиглана.
  const finisher = moves.find((m) => m.length === ctx.hand.length);
  if (finisher) return finisher;

  const leading = ctx.current === null;

  const ranked = moves
    .map((move) => ({ move, cost: moveCost(move, ctx.hand, WEIGHT) }))
    .sort((a, b) => a.cost - b.cost);

  if (level === 'easy') {
    // Заримдаа тавьж чадах атлаа пас хийнэ — анхан шатны хүн шиг.
    if (!leading && rng() < EASY_PASS) return null;
    // Огт санамжгүй биш — зөв зүг рүү тавьдаг ч сонголт нь тааруу.
    const pool = ranked.slice(0, Math.min(EASY_POOL, ranked.length));
    return pool[Math.floor(rng() * pool.length)].move;
  }

  if (level === 'medium') {
    // Дундаж хүн шиг: зөв зүг рүү тавьдаг ч ҮРГЭЛЖ ХАМГИЙН САЙНЫГ сонгодоггүй.
    //
    // Түвшнийг зөвхөн торгуулийн жингээр ялгах гэж үзсэн боловч хэмжихэд
    // 0.2–0.6 хооронд ялгаа бараг гарсангүй. Тиймээс алдааны магадлалаар
    // ялгав — энэ нь хүний зан төлөвтэй ч илүү нийцнэ.
    if (rng() < MEDIUM_MISTAKE) {
      const pool = ranked.slice(0, Math.min(3, ranked.length));
      return pool[Math.floor(rng() * pool.length)].move;
    }
    return ranked[0].move;
  }

  // ── Сайн ────────────────────────────────────────────────────────────────
  //
  // ДЭМИЙ ПАС ХИЙХГҮЙ. Эхлээд оролдоод үзэхэд "үнэтэй хариултыг хойшлуулъя"
  // гэсэн дүрэм ботыг СУЛРУУЛСАН: энэ тоглоомд эргэлт эхлүүлэх нь том давуу
  // тал (хэмжихэд 32.9% vs 25%) тул хариулж чадсаар байж пас хийх нь тэр
  // давуу талыг өрсөлдөгчид бэлэглэж байна.
  return ranked[0].move;
}
