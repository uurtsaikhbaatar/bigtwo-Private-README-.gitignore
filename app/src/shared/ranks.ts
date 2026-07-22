/**
 * Цэргийн цол — хожсон тоглолтын тоогоор.
 *
 * Цолны нэр, дараалал нь Монгол улсын цэргийн цолны бүрэн жагсаалтыг дагасан:
 * байлдагч (5) → ахлагч (5) → офицер (6) → генерал (4) = 20 цол.
 *
 * Эхний цолыг ЭХНИЙ ХОЖИЛДОО авна: шинэ тоглогч шууд урамшихын тулд эхний
 * шатууд ойрхон, дээшлэх тусам зай нь холдоно. Идэвхтэй тоглогч жилд 100–130
 * удаа хождог гэсэн тооцоотой — Ахмад ~6 сар, Хурандаа ~1 жил, Генерал ~2 жил.
 *
 * Зөвхөн ЧИПТЭЙ тоглолтын хожил тоологдоно — чипгүй тоглолтоор цол
 * цуглуулах боломжийг хаасан. Мөн зөвхөн БҮРТГЭЛТЭЙ тоглогчид хамаарна:
 * зочны түүх хадгалагддаггүй.
 *
 * Цол ахих бүрд токен шагнана. Шагнал нь тоглоомоос олсон орлогыг ОРЛОХГҮЙ,
 * харин баярлах мөч болно — 5 мянган чиптэй хожил ~15 000 өгдөгтэй ойролцоо
 * хэмжээнээс эхэлж, дээшлэх тусам мэдэгдэхүйц болно. Шагнал зөвхөн ХОЖДОГ
 * хүнд очих тул байнга хожигддог хүн админаас токен хүсэх систем үхэхгүй.
 */

export interface Rank {
  /** Энэ цолд хүрэхэд шаардлагатай хожлын тоо. */
  wins: number;
  name: string;
  /** Богино тэмдэг — нэрний хажууд багтаана. */
  badge: string;
  /** Энэ цолд хүрэхэд шагнах токен. Хамгийн доод цолд шагнал байхгүй. */
  reward: number;
  /** Бүлэг — тусламжийн хүснэгтэд бүлэглэж харуулна. */
  group: 'Байлдагч' | 'Ахлагч' | 'Офицер' | 'Генерал';
}

export const RANKS: readonly Rank[] = [
  { wins: 0, name: 'Байлдагч', badge: '▎', reward: 0, group: 'Байлдагч' },
  { wins: 1, name: 'Ахлах байлдагч', badge: '▎▎', reward: 50_000, group: 'Байлдагч' },
  { wins: 3, name: 'Дэд түрүүч', badge: '▎▎▎', reward: 50_000, group: 'Байлдагч' },
  { wins: 5, name: 'Түрүүч', badge: '❯', reward: 75_000, group: 'Байлдагч' },
  { wins: 8, name: 'Ахлах түрүүч', badge: '❯❯', reward: 75_000, group: 'Байлдагч' },

  { wins: 12, name: 'Дэд ахлагч', badge: '❯❯❯', reward: 100_000, group: 'Ахлагч' },
  { wins: 16, name: 'Ахлагч', badge: '◆', reward: 100_000, group: 'Ахлагч' },
  { wins: 21, name: 'Ахлах ахлагч', badge: '◆◆', reward: 150_000, group: 'Ахлагч' },
  { wins: 27, name: 'Сургагч ахлагч', badge: '◆◆◆', reward: 150_000, group: 'Ахлагч' },
  { wins: 34, name: 'Тэргүүн ахлагч', badge: '◈', reward: 200_000, group: 'Ахлагч' },

  { wins: 42, name: 'Дэслэгч', badge: '★', reward: 250_000, group: 'Офицер' },
  { wins: 50, name: 'Ахлах дэслэгч', badge: '★★', reward: 300_000, group: 'Офицер' },
  { wins: 60, name: 'Ахмад', badge: '★★★', reward: 400_000, group: 'Офицер' },
  { wins: 75, name: 'Хошууч', badge: '✦', reward: 500_000, group: 'Офицер' },
  { wins: 95, name: 'Дэд хурандаа', badge: '✦✦', reward: 600_000, group: 'Офицер' },
  { wins: 115, name: 'Хурандаа', badge: '✦✦✦', reward: 800_000, group: 'Офицер' },

  { wins: 140, name: 'Бригадын генерал', badge: '🎖', reward: 1_000_000, group: 'Генерал' },
  { wins: 170, name: 'Хошууч генерал', badge: '🎖🎖', reward: 1_250_000, group: 'Генерал' },
  { wins: 205, name: 'Дэслэгч генерал', badge: '🎖🎖🎖', reward: 1_500_000, group: 'Генерал' },
  { wins: 245, name: 'Генерал', badge: '👑', reward: 2_000_000, group: 'Генерал' },
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

/**
 * `before` → `after` хожил болоход олгох нийт токен.
 *
 * Нэг дор хэд хэдэн цол алгасвал бүгдийн шагналыг нэмж өгнө — тоглогч
 * алгассан цолныхоо шагналыг алдах ёсгүй.
 */
export function rewardBetween(before: number, after: number): number {
  const from = Math.max(0, Math.floor(before));
  const to = Math.max(0, Math.floor(after));
  if (to <= from) return 0;
  return RANKS.filter((r) => r.wins > from && r.wins <= to).reduce((sum, r) => sum + r.reward, 0);
}
