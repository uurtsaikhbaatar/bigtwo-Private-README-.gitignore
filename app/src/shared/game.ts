/**
 * Big Two тоглоомын цэвэр (side-effect-гүй) төлөвийн машин.
 *
 * Сервер энэ модулийг бүрэн эрхтэйгээр ажиллуулж, клиент нь зөвхөн
 * харагдац (view) хүлээж авна. Дүрмийн шалгалт бүхэлдээ энд байрлана.
 */

import { Card, THREE_OF_DIAMONDS, deal, rankOf } from './cards';
import { Combo, beats, detectCombo } from './combos';

export interface Player {
  id: string;
  name: string;
  hand: Card[];
  /** Энэ эргэлтэд пас хийсэн эсэх. Шинэ эргэлт эхлэхэд цэвэрлэгдэнэ. */
  passed: boolean;
  /** Хөзрөө дуусгасан бол хэддүгээрт орсон (1-ээс эхэлнэ), эс бөгөөс null. */
  place: number | null;
}

export interface TablePlay {
  playerId: string;
  combo: Combo;
}

export interface RoundResult {
  playerId: string;
  cardsLeft: number;
  /** Торгуулийн үржүүлэгч тооцсон оноо (эерэг = алдагдал). */
  penalty: number;
  /** Бусад бүх тоглогчтой тооцоо хийсний дараах цэвэр оноо. */
  net: number;
}

export interface GameState {
  players: Player[];
  /** Ээлжтэй тоглогчийн индекс. */
  turn: number;
  /** Ширээн дээрх дарах ёстой хослол. null бол шинэ эргэлт. */
  current: TablePlay | null;
  /** Хамгийн сүүлд тавигдсан хослол (шинэ эргэлт эхлэхэд ч харагдана). */
  lastPlay: TablePlay | null;
  phase: 'lobby' | 'playing' | 'finished';
  round: number;
  /** Дугуй дууссаны дараах үр дүн. */
  results: RoundResult[] | null;
  /** Дугуйнуудын нийлбэр оноо, playerId → оноо. */
  totals: Record<string, number>;
  /** Хамгийн сүүлд болсон үйлдлийн товч тайлбар (UI-д харуулах). */
  log: string[];
}

export class RuleError extends Error {}

export function createGame(): GameState {
  return {
    players: [],
    turn: 0,
    current: null,
    lastPlay: null,
    phase: 'lobby',
    round: 0,
    results: null,
    totals: {},
    log: [],
  };
}

export function addPlayer(state: GameState, id: string, name: string): void {
  if (state.players.length >= 4) throw new RuleError('Өрөө дүүрсэн байна (дээд тал нь 4 тоглогч).');
  if (state.players.some((p) => p.id === id)) return;
  state.players.push({ id, name, hand: [], passed: false, place: null });
  state.totals[id] ??= 0;
}

export function removePlayer(state: GameState, id: string): void {
  const idx = state.players.findIndex((p) => p.id === id);
  if (idx === -1) return;
  state.players.splice(idx, 1);
  if (state.turn >= state.players.length) state.turn = 0;
}

/** Шинэ дугуй тарааж эхлүүлнэ. 2-4 тоглогчтой байж болно. */
export function startRound(state: GameState, rng: () => number = Math.random): void {
  if (state.players.length < 2) throw new RuleError('Дор хаяж 2 тоглогч хэрэгтэй.');
  const hands = deal(state.players.length, rng);
  state.players.forEach((p, i) => {
    p.hand = hands[i];
    p.passed = false;
    p.place = null;
  });
  state.current = null;
  state.lastPlay = null;
  state.results = null;
  state.phase = 'playing';
  state.round += 1;
  state.log = [`${state.round}-р дугуй эхэллээ.`];
  // 3♦ бүхий тоглогч эхэлнэ. Хэрэв 2-3 тоглогчтой бол хэн нэгэнд байхгүй байж
  // болох тул тавцан дээр үлдсэн бол хамгийн бага хөзөртэй тоглогч эхэлнэ.
  const starter = state.players.findIndex((p) => p.hand.includes(THREE_OF_DIAMONDS));
  state.turn = starter !== -1 ? starter : lowestCardHolder(state);
}

function lowestCardHolder(state: GameState): number {
  let best = 0;
  let bestCard = Infinity;
  state.players.forEach((p, i) => {
    const low = p.hand[0];
    if (low !== undefined && low < bestCard) {
      bestCard = low;
      best = i;
    }
  });
  return best;
}

/** Хөзөр тавих. Дүрэм зөрчвөл `RuleError` шиднэ. */
export function play(state: GameState, playerId: string, cards: Card[]): void {
  const idx = requireTurn(state, playerId);
  const player = state.players[idx];

  const missing = cards.filter((c) => !player.hand.includes(c));
  if (missing.length > 0) throw new RuleError('Тэр хөзөр таны гарт байхгүй байна.');

  const combo = detectCombo(cards);
  if (!combo) throw new RuleError('Энэ нь хүчинтэй хослол биш байна.');

  const isFirstPlayOfRound = state.lastPlay === null;
  if (isFirstPlayOfRound && player.hand.includes(THREE_OF_DIAMONDS) && !cards.includes(THREE_OF_DIAMONDS)) {
    throw new RuleError('Эхний тавилтад 3♦ орсон байх ёстой.');
  }
  if (!beats(combo, state.current?.combo ?? null)) {
    throw new RuleError(
      state.current ? 'Энэ хослол ширээн дээрхийг дарж чадахгүй байна.' : 'Хүчингүй тавилт.',
    );
  }

  player.hand = player.hand.filter((c) => !cards.includes(c));
  player.passed = false;
  state.current = { playerId, combo };
  state.lastPlay = state.current;
  state.log.push(`${player.name}: ${cards.length} хөзөр тавилаа.`);

  if (player.hand.length === 0) {
    player.place = nextPlace(state);
    state.log.push(`${player.name} хөзрөө дуусгалаа (${player.place}-р байр).`);
    if (activeCount(state) <= 1) return finishRound(state);
  }

  advance(state, idx);
}

/** Пас хийх. Шинэ эргэлтийн эхэнд пас хийж болохгүй. */
export function pass(state: GameState, playerId: string): void {
  const idx = requireTurn(state, playerId);
  if (!state.current) throw new RuleError('Шинэ эргэлтийг эхлүүлэх ёстой — пас хийж болохгүй.');
  state.players[idx].passed = true;
  state.log.push(`${state.players[idx].name}: пас.`);
  advance(state, idx);
}

function requireTurn(state: GameState, playerId: string): number {
  if (state.phase !== 'playing') throw new RuleError('Тоглоом идэвхгүй байна.');
  const idx = state.players.findIndex((p) => p.id === playerId);
  if (idx === -1) throw new RuleError('Тоглогч олдсонгүй.');
  if (idx !== state.turn) throw new RuleError('Одоо таны ээлж биш байна.');
  return idx;
}

const activeCount = (state: GameState): number => state.players.filter((p) => p.place === null).length;

/** Дараагийн эзлэх байр. Эхний дуусгасан хүн 1-р байр эзэлнэ. */
const nextPlace = (state: GameState): number =>
  state.players.filter((p) => p.place !== null).length + 1;

/**
 * Ээлжийг дараагийн хариулах эрхтэй тоглогч руу шилжүүлнэ.
 * Хэрэв хэн ч хариулах боломжгүй бол шинэ эргэлт эхэлнэ.
 */
function advance(state: GameState, actorIdx: number): void {
  const ownerIdx = state.current
    ? state.players.findIndex((p) => p.id === state.current!.playerId)
    : actorIdx;

  const next = nextEligible(state, actorIdx);
  if (next === null || next === ownerIdx) {
    startNewTrick(state, ownerIdx);
  } else {
    state.turn = next;
  }
}

/** actorIdx-ээс хойших, дуусаагүй ба пас хийгээгүй эхний тоглогч. */
function nextEligible(state: GameState, from: number): number | null {
  const n = state.players.length;
  for (let i = 1; i <= n; i++) {
    const idx = (from + i) % n;
    const p = state.players[idx];
    if (p.place === null && !p.passed) return idx;
  }
  return null;
}

function startNewTrick(state: GameState, ownerIdx: number): void {
  state.current = null;
  state.players.forEach((p) => (p.passed = false));
  const owner = state.players[ownerIdx];
  state.turn = owner && owner.place === null ? ownerIdx : (nextActive(state, ownerIdx) ?? ownerIdx);
  const leader = state.players[state.turn];
  if (leader) state.log.push(`Шинэ эргэлт — ${leader.name} эхэлнэ.`);
}

function nextActive(state: GameState, from: number): number | null {
  const n = state.players.length;
  for (let i = 1; i <= n; i++) {
    const idx = (from + i) % n;
    if (state.players[idx].place === null) return idx;
  }
  return null;
}

function finishRound(state: GameState): void {
  state.players.forEach((p) => {
    if (p.place === null) p.place = nextPlace(state);
  });

  const penalties = new Map<string, number>();
  for (const p of state.players) {
    const n = p.hand.length;
    const multiplier = n >= 13 ? 3 : n >= 10 ? 2 : 1;
    penalties.set(p.id, n * multiplier);
  }

  // Тоглогч бүр бусад бүхэнтэй хос хосоороо тооцоо хийнэ.
  state.results = state.players.map((p) => {
    const mine = penalties.get(p.id)!;
    const net = state.players
      .filter((o) => o.id !== p.id)
      .reduce((sum, o) => sum + (penalties.get(o.id)! - mine), 0);
    state.totals[p.id] = (state.totals[p.id] ?? 0) + net;
    return { playerId: p.id, cardsLeft: p.hand.length, penalty: mine, net };
  });

  state.phase = 'finished';
  state.current = null;
  const winner = state.players.find((p) => p.place === 1);
  if (winner) state.log.push(`${winner.name} дугуйг хожлоо! 🎉`);
}

/**
 * Тухайн тоглогчийн хувьд хууль ёсны тавилт байгаа эсэх — "пас" товчийг
 * идэвхжүүлэх, эсвэл автоматаар пас хийхэд ашиглана.
 */
export function hasLegalPlay(state: GameState, playerId: string): boolean {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return false;
  const current = state.current?.combo ?? null;
  if (!current) return player.hand.length > 0;
  if (current.size === 1) {
    return player.hand.some((c) => c > current.power);
  }
  // Хос/гурвал/5 хөзрийн хувьд бүрэн хайлт хийхээс зайлсхийж, ойролцоо
  // үнэлгээ өгнө: тухайн хэмжээтэй хослол угсрах боломж байгаа эсэх.
  if (current.size === 2 || current.size === 3) {
    const byRank = new Map<number, Card[]>();
    for (const c of player.hand) {
      const list = byRank.get(rankOf(c)) ?? [];
      list.push(c);
      byRank.set(rankOf(c), list);
    }
    for (const [, cards] of byRank) {
      if (cards.length < current.size) continue;
      const pick = cards.slice(cards.length - current.size);
      const combo = detectCombo(pick);
      if (combo && beats(combo, current)) return true;
    }
    return false;
  }
  return player.hand.length >= 5; // 5 хөзрийн хувьд серверт бүрэн шалгана
}
