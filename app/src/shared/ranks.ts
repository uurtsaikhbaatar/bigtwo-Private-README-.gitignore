/**
 * Цэргийн цол — хожсон тоглолтын тоогоор.
 *
 * Эхний цолыг ЭХНИЙ ХОЖИЛДОО авна: шинэ тоглогч шууд урамшихын тулд эхний
 * шатууд ойрхон, дээд шатууд хол байхаар сонгосон. Идэвхтэй тоглогч жилд
 * 100–130 удаа хождог гэсэн тооцоотой — Хурандаа ~1 жил, Армийн генерал
 * ~2 жил болно.
 *
 * Зөвхөн БҮРТГЭЛТЭЙ тоглогчид хамаарна: зочны түүх хадгалагддаггүй.
 */

export interface Rank {
  /** Энэ цолд хүрэхэд шаардлагатай хожлын тоо. */
  wins: number;
  name: string;
  /** Богино тэмдэг — нэрний хажууд багтаана. */
  badge: string;
}

export const RANKS: readonly Rank[] = [
  { wins: 0, name: 'Байлдагч', badge: '▎' },
  { wins: 1, name: 'Ахлах байлдагч', badge: '▎▎' },
  { wins: 3, name: 'Дэд түрүүч', badge: '▎▎▎' },
  { wins: 7, name: 'Түрүүч', badge: '❯' },
  { wins: 15, name: 'Ахлах түрүүч', badge: '❯❯' },
  { wins: 25, name: 'Дэслэгч', badge: '★' },
  { wins: 40, name: 'Ахлах дэслэгч', badge: '★★' },
  { wins: 60, name: 'Ахмад', badge: '★★★' },
  { wins: 80, name: 'Хошууч', badge: '✦' },
  { wins: 105, name: 'Дэд хурандаа', badge: '✦✦' },
  { wins: 135, name: 'Хурандаа', badge: '✦✦✦' },
  { wins: 170, name: 'Бригадын генерал', badge: '🎖' },
  { wins: 210, name: 'Хошууч генерал', badge: '🎖🎖' },
  { wins: 260, name: 'Армийн генерал', badge: '🎖🎖🎖' },
] as const;

/** Хожлын тоонд харгалзах цол. Сөрөг тоог 0 гэж үзнэ. */
export function rankFor(wins: number): Rank {
  const count = Number.isFinite(wins) ? Math.max(0, Math.floor(wins)) : 0;
  let current = RANKS[0];
  for (const rank of RANKS) {
    if (count >= rank.wins) current = rank;
    else break;
  }
  return current;
}

/** Дараагийн цол ба түүнд үлдсэн хожил. Хамгийн дээд цолтой бол null. */
export function nextRank(wins: number): { rank: Rank; remaining: number } | null {
  const count = Math.max(0, Math.floor(wins));
  const next = RANKS.find((r) => r.wins > count);
  return next ? { rank: next, remaining: next.wins - count } : null;
}

/** Хожлын тоо нэмэгдэхэд цол ахисан эсэх. */
export function promoted(before: number, after: number): Rank | null {
  const from = rankFor(before);
  const to = rankFor(after);
  return from.name === to.name ? null : to;
}
