/**
 * Hold'em-ийн бүтэц: Sit & Go-гийн blind level, шагналын хуваарилалт, кэш
 * тоглолтын бооцоо ба суух хэмжээ.
 *
 * ЧИП vs ТОКЕН
 *   • Sit & Go: ширээний чип нь тэмцээний оноо (үнэгүй, 1 500-аар эхэлнэ).
 *     Токен зөвхөн хураамж (buy-in) ба шагналаар хөдөлнө.
 *   • Кэш: ширээний чип = токен (1:1). Суухад барьцаалж, босоход буцаана.
 */

export type PokerFormat = 'sng' | 'cash';

export const POKER_MIN_PLAYERS = 2;
export const POKER_MAX_SEATS = 9;

/** Sit & Go-д тоглогч бүрийн эхлэх тэмцээний чип. */
export const SNG_STARTING_CHIPS = 1_500;
/** Blind level ахих хүртэлх гарын тоо. */
export const SNG_HANDS_PER_LEVEL = 10;

export interface BlindLevel {
  sb: number;
  bb: number;
  /** Big blind-ийн анте (TDA 2024): big blindнд суусан тоглогч ганцаараа төлнө. 0 = антегүй. */
  bbAnte: number;
}

/**
 * Sit & Go-гийн blind level. 3-р шатнаас big blind ante (= big blind) эхэлнэ —
 * TDA-гийн санал болгосон хэлбэр. Сүүлийн шатнаас цааш хоёр дахин өснө.
 */
export const SNG_LEVELS: readonly BlindLevel[] = [
  { sb: 10, bb: 20, bbAnte: 0 },
  { sb: 15, bb: 30, bbAnte: 0 },
  { sb: 25, bb: 50, bbAnte: 50 },
  { sb: 50, bb: 100, bbAnte: 100 },
  { sb: 75, bb: 150, bbAnte: 150 },
  { sb: 100, bb: 200, bbAnte: 200 },
  { sb: 150, bb: 300, bbAnte: 300 },
  { sb: 200, bb: 400, bbAnte: 400 },
  { sb: 300, bb: 600, bbAnte: 600 },
  { sb: 400, bb: 800, bbAnte: 800 },
  { sb: 600, bb: 1_200, bbAnte: 1_200 },
  { sb: 800, bb: 1_600, bbAnte: 1_600 },
  { sb: 1_000, bb: 2_000, bbAnte: 2_000 },
];

export function sngLevel(index: number): BlindLevel {
  if (index < SNG_LEVELS.length) return SNG_LEVELS[index];
  const last = SNG_LEVELS[SNG_LEVELS.length - 1];
  const k = 2 ** (index - SNG_LEVELS.length + 1);
  return { sb: last.sb * k, bb: last.bb * k, bbAnte: last.bbAnte * k };
}

/**
 * Шагналын хувь (байр бүрд). Нийлбэр нь 100.
 *   2–4 тоглогч: ялагч бүгдийг авна.
 *   5–6: 65 / 35.
 *   7–9: 50 / 30 / 20.
 */
export function payoutPercents(entrants: number): number[] {
  if (entrants <= 4) return [100];
  if (entrants <= 6) return [65, 35];
  return [50, 30, 20];
}

/**
 * Шагналын санг байраар хуваана. Үлдэгдэл (хуваагдахгүй токен) 1-р байранд —
 * нийлбэр яг сантай тэнцүү байхын тулд.
 */
export function payouts(entrants: number, buyIn: number): number[] {
  const pool = entrants * buyIn;
  const amounts = payoutPercents(entrants).map((p) => Math.floor((pool * p) / 100));
  amounts[0] += pool - amounts.reduce((a, b) => a + b, 0);
  return amounts;
}

/** Sit & Go-гийн хураамжийн сонголт (токен). 0 = чипгүй (дадлага). */
export const SNG_BUYIN_CHOICES = [0, 10_000, 50_000, 100_000, 500_000, 1_000_000, 5_000_000] as const;

/** Кэш тоглолтын бооцооны сонголт (токен). Big blind = 2 × small blind. */
export const CASH_BLIND_CHOICES = [
  { sb: 500, bb: 1_000 },
  { sb: 2_500, bb: 5_000 },
  { sb: 5_000, bb: 10_000 },
  { sb: 25_000, bb: 50_000 },
  { sb: 50_000, bb: 100_000 },
] as const;

/** Кэш ширээнд суух хэмжээ: big blind-ийн 40–100 дахин. */
export const CASH_MIN_BUYIN_BB = 40;
export const CASH_MAX_BUYIN_BB = 100;

/** Үйлдэх хугацааны сонголт (секунд). */
export const POKER_TURN_SECONDS_CHOICES = [20, 30, 45] as const;
export const POKER_DEFAULT_TURN_SECONDS = 30;
