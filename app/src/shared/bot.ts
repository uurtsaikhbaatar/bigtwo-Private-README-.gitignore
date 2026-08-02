/**
 * Ботын шийдвэр гаргалт.
 *
 * Гурван түвшин:
 *   анхан  — санамжгүй тавина, заримдаа тавьж чадах атлаа пас хийнэ
 *   дунд   — хамгийн сул хууль ёсны тавилтыг сонгоно, дэмий пас хийхгүй
 *   сайн   — хос, гурвал, дөрвөлийг задлахаас зайлсхийж, хүчтэй хөзрөө
 *            хойшлуулж, дуусах боломж гарвал шууд ашиглана
 *
 * Нэмэлт ухаан (түвшнээр масштаблагдана — анхан бага, дунд дунд, сайн дээш):
 *   (A) картын тоолол — өрсөлдөгчийн үлдсэн хөзрийн ТОО-г хараад аюул ойртвол
 *       идэвхтэй хааж, хяналт авах руу хазайна;
 *   (A2) тоглогдсон хөзрийг санах — "тодорхойгүй хөзөр = 52 − гар − тоглогдсон"-оос
 *       тавилт дийлдэхгүй эсэхийг баттай тооцож, аюулгүй тавилтыг дэмжинэ
 *       (зөвхөн ил мэдээлэл — өрсөлдөгчийн гарыг ХАРАХГҮЙ);
 *   (B1) дасан зохицол — тойрог дуусахад өөрийгөө үнэлж (`reflectOnRound`),
 *       нэг тоглолтын туршид зан төлөвөө тохируулна.
 *
 * Тоглоомын дүрмээс ТУСДАА байна: зөвхөн гар, ширээн дээрх хослол, өрсөлдөгчийн
 * хөзрийн тоо, дасан зохицлын утгыг хараад шийднэ. Ингэснээр тестээр тусад нь
 * хэмжих боломжтой.
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

/**
 * Түвшин бүрийн "ухаан"-ы хүч — картын тоолол ба дасан зохицлыг хэр
 * анхаарахыг масштаблана. Анхан бага, дунд дунд, сайн дундаас арай дээгүүр
 * (санаатайгаар 1.0 биш — түвшин хоорондын зөрүү бодитой байх).
 */
const SMARTS: Record<BotLevel, number> = { easy: 0.3, medium: 0.7, hard: 0.9 };

/** Тойрог тутам дасан зохицлын алхам — анхан бага, дунд дунд, сайн дундаас дээш. */
const BIAS_STEP: Record<BotLevel, number> = { easy: 0.05, medium: 0.12, hard: 0.16 };

/**
 * Өрсөлдөгчийн үлдсэн хөзрөөс "аюул"-ыг тооцно. Хэн нэг нь цөөн хөзөртэй
 * бол удахгүй дуусах гэж байна — идэвхтэй хаах хэрэгтэй (эерэг = түрэмгий).
 */
function threatBias(opponentCards: number[]): number {
  if (opponentCards.length === 0) return 0;
  const min = Math.min(...opponentCards);
  if (min <= 2) return 0.5;
  if (min <= 4) return 0.25;
  return 0;
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/**
 * Тойрог дуусахад бот өөрийгөө үнэлж, дараагийн тойргуудад зан төлөвөө
 * тохируулна (нэг тоглолтын дотор — B1). Хэт болгоомжилж өндөр хөзөр дээрээ
 * гацвал түрэмгий болно; ойрхон байсан бол бага зэрэг тайвширна; хожвол
 * одоогийн зангаа тогтворжуулна. Утга −1 (болгоомжтой)..+1 (түрэмгий).
 *
 * Зөвхөн тойргийн үр дүнг ашигладаг тул цэвэр, тестлэхэд хялбар.
 */
export function reflectOnRound(
  prevBias: number,
  result: { won: boolean; cardsLeft: number },
  level: BotLevel,
): number {
  const step = BIAS_STEP[level];
  let bias = prevBias;
  if (result.won) {
    bias *= 0.85; // ажиллаж байгаа тул төвшинд нь ойртуулж тогтворжуулна
  } else if (result.cardsLeft >= 6) {
    bias += step; // хэт олон хөзөр үлдсэн = хэт болгоомжилсон → түрэмгий бол
  } else {
    bias -= step * 0.4; // ойрхон байсан → бага зэрэг тайвшир
  }
  return clamp(bias, -1, 1);
}

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
  /**
   * B1: тоглолт доторх дасан зохицол (−1 болгоомжтой … +1 түрэмгий).
   * `reflectOnRound`-оос тооцогдож, тойрог хооронд хадгалагдана. Байхгүй
   * бол 0 (саармаг).
   */
  selfBias?: number;
  /**
   * Картын тоолол: энэ тойрогт аль хэдийн тоглогдсон хөзрүүд (ил мэдээлэл).
   * Үүгээр "тодорхойгүй хөзөр = 52 − гар − тоглогдсон"-ыг гарган, тавилт
   * дийлдэхгүй эсэхийг баттай тооцно. Байхгүй бол картын тоолол хийхгүй.
   */
  playedCards?: Card[];
}

/**
 * Тавилтын "аюулгүй" зэрэг (0..1). 1 = хэн ч дийлж чадахгүй нь БАТТАЙ.
 *
 * Зөвхөн ИЛ мэдээлэл ашиглана: тодорхойгүй хөзөр = бүх 52 − өөрийн гар −
 * тоглогдсон. Дийлэх хөзөр эдгээрийн дунд огт байхгүй бол дийлдэхгүй нь
 * баттай (өрсөлдөгчийн гарыг ХАРАХГҮЙ — шударга). Хэмжээ 1–3-д баттай
 * шалгана; 5 хөзрийн хослолд нарийн тул саармаг үнэлнэ.
 */
export function safetyOf(move: Card[], hand: Card[], played: Card[], opponentCards: number[]): number {
  const size = move.length;
  if (size > 3) return 0.3; // 5-хөзрийн хослол — тодорхойгүй, саармаг
  const seen = new Uint8Array(52);
  for (const c of hand) seen[c] = 1;
  for (const c of played) seen[c] = 1;
  let unknownCount = 0;
  let maxUnknown = -1;
  const unkRank = new Array(13).fill(0);
  for (let c = 0; c < 52; c++) {
    if (!seen[c]) {
      unknownCount += 1;
      unkRank[rankOf(c)] += 1;
      if (c > maxUnknown) maxUnknown = c;
    }
  }
  const top = move[move.length - 1]; // эрэмбэлэгдсэн — хамгийн өндөр
  const myRank = rankOf(top);
  let unbeatable: boolean;
  if (size === 1) {
    // Илүү өндөр индекстэй тодорхойгүй хөзөр байхгүй бол дийлдэхгүй.
    unbeatable = maxUnknown < top;
  } else {
    // Хос/гурвал: миний зэрэглэлээс дээш (эсвэл тэнцүү — өндөр өнгөтэй байж
    // болзошгүй) зэрэглэлд хангалттай тооны тодорхойгүй хөзөр байвал дийлж болно.
    unbeatable = true;
    for (let r = myRank; r < 13; r += 1) {
      if (unkRank[r] >= size) {
        unbeatable = false;
        break;
      }
    }
  }
  if (unbeatable) return 1;
  // Дийлж магадгүй — өрсөлдөгчид тодорхойгүй хөзрийн хэдэн хувийг барьж байгаагаар.
  const totalOpp = opponentCards.reduce((a, b) => a + b, 0);
  const held = unknownCount > 0 ? Math.min(1, totalOpp / unknownCount) : 1;
  return Math.max(0, 1 - held);
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

  // Картын тоолол (A) + дасан зохицол (B1)-ыг нэг "түрэмгийлэл"-д нэгтгэнэ.
  // Түвшнээр масштаблана: анхан бага, дунд дунд, сайн дундаас арай дээгүүр.
  // Түрэмгий байх тусам хадгалах торгуулийг сулруулж, хүчтэй хөзрөө хэрэглэн
  // хяналт авах/барих, өрсөлдөгчийг дуусахаас нь хаах руу хазайна.
  // Магнитуд эмпирикээр сонгосон: эхэндээ хүчтэй (0.6, threat 0.8/0.4) байсан нь
  // near-optimal тохиргоотой "сайн" ботыг СУЛРУУЛСАН (250 тоглолтоор 45.8%).
  // Зөөлрүүлснээр (0.35, threat 0.5/0.25) бүх түвшин хуучнаасаа дээгүүр болов:
  // анхан 55.6%, дунд 52.8%, сайн 52.8%.
  const smarts = SMARTS[level];
  const agg = clamp((threatBias(ctx.opponentCards) + (ctx.selfBias ?? 0)) * smarts, -1, 1);
  const weight = clamp(WEIGHT * (1 - 0.35 * agg), 0.1, 1.2);

  // Картын тоолол — дийлдэхгүй тавилтыг ЗӨВХӨН зөв нөхцөлд дэмжинэ:
  //   (1) эцсийн тоглолт (гар цөөрсөн) — хяналтаа барьж хөзрөө дуусгах;
  //   (2) өрсөлдөгч дуусах дөхсөн (цөөн хөзөртэй) — тэргүүлэхдээ дийлдэхгүйгээр
  //       хааж, түүнд хяналт өгөхгүй.
  // Дунд тоглолтод хэрэглэхгүй — тэнд өндөр хөзрөө ХАДГАЛах нь чухал (эс бөгөөс
  // "аюулгүй" хөзрөө эрт цацаж, хяналтаа алдана).
  //
  // Эмпирик замнал (300 тоглолт бүрд, хуучин ботын эсрэг): бүх тавилтад
  // хэрэглэхэд ИЛТ МУУ (сайн 37%). Эцсийн тоглолт+хаахаар хязгаарлаад жинг
  // 22→16 болгоход бүх түвшин дээшилэв: анхан 50.7%, дунд 53.7%, сайн 54.3%.
  const played = ctx.playedCards;
  const minOpp = ctx.opponentCards.length ? Math.min(...ctx.opponentCards) : 99;
  const useSafety = Boolean(played) && leading && (ctx.hand.length <= 5 || minOpp <= 2);
  const SAFETY_W = 16;
  const ranked = moves
    .map((move) => {
      let cost = moveCost(move, ctx.hand, weight);
      if (useSafety) {
        const safety = safetyOf(move, ctx.hand, played!, ctx.opponentCards);
        cost -= safety * SAFETY_W * smarts;
      }
      return { move, cost };
    })
    .sort((a, b) => a.cost - b.cost);

  if (level === 'easy') {
    // Заримдаа тавьж чадах атлаа пас хийнэ — анхан шатны хүн шиг. Гэхдээ
    // аюул ойртсон эсвэл түрэмгий тохируулгатай бол пас хийх магадлал буурна.
    const passProb = Math.max(0, EASY_PASS * (1 - agg));
    if (!leading && rng() < passProb) return null;
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
