/**
 * Хөзрийн үндсэн дүрслэл.
 *
 * Нэг хөзрийг 0..51 хүртэлх бүхэл тоогоор илэрхийлнэ. Индекс нь шууд
 * тоглоомын хүч болдогоор сонгосон: index бага бол сул, өндөр бол хүчтэй.
 *
 *   rank = Math.floor(index / 4)   // 0 = "3", 1 = "4", ... 11 = "A", 12 = "2"
 *   suit = index % 4               // 0 = ♦, 1 = ♣, 2 = ♥, 3 = ♠
 *
 * Ингэснээр 3♦ = 0 (тоглоом эхлүүлэгч хөзөр), 2♠ = 51 (хамгийн хүчтэй).
 */

export type Card = number;

export const RANKS = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'] as const;
export const SUITS = ['♦', '♣', '♥', '♠'] as const;

export const DECK_SIZE = 52;
/** Тоглоомыг эхлүүлэх үүрэгтэй хөзөр. */
export const THREE_OF_DIAMONDS: Card = 0;

export const rankOf = (c: Card): number => Math.floor(c / 4);
export const suitOf = (c: Card): number => c % 4;

export const rankName = (c: Card): string => RANKS[rankOf(c)];
export const suitName = (c: Card): string => SUITS[suitOf(c)];
export const cardName = (c: Card): string => `${rankName(c)}${suitName(c)}`;

/** Улаан баг (♦ ♥) эсэхийг шалгана — UI дээр өнгө ялгахад. */
export const isRed = (c: Card): boolean => suitOf(c) === 0 || suitOf(c) === 2;

export function fullDeck(): Card[] {
  return Array.from({ length: DECK_SIZE }, (_, i) => i);
}

/**
 * Fisher-Yates холилт. `rng` өгвөл давтагдах боломжтой (тест, replay).
 */
export function shuffle<T>(arr: T[], rng: () => number = Math.random): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Тоглогч бүрд 13 хөзөр тарааж, гар тус бүрийг эрэмбэлж буцаана.
 * 2-4 тоглогчтой байж болно; илүүдэл хөзөр тавцан дээр үлдэнэ.
 */
export function deal(playerCount: number, rng: () => number = Math.random): Card[][] {
  const deck = shuffle(fullDeck(), rng);
  const hands: Card[][] = [];
  for (let i = 0; i < playerCount; i++) {
    hands.push(deck.slice(i * 13, i * 13 + 13).sort((a, b) => a - b));
  }
  return hands;
}
