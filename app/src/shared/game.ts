/**
 * Big Two тоглоомын цэвэр (side-effect-гүй) төлөвийн машин.
 *
 * Сервер энэ модулийг бүрэн эрхтэйгээр ажиллуулж, клиент нь зөвхөн
 * харагдац (view) хүлээж авна. Дүрмийн шалгалт бүхэлдээ энд байрлана.
 *
 * ТОГЛООМЫН БҮТЭЦ
 *   Тоглолт (match) = олон тойрог (round). Тойрог бүрийн төгсгөлд үлдсэн
 *   хөзрөөр оноо нэмэгдэнэ; оноо хэзээ ч буурахгүй. Тохирсон босгод
 *   (30 эсвэл 40) хүрсэн тоглогч хасагдаж, бусад нь үргэлжлүүлнэ.
 *   Сүүлийн үлдсэн тоглогч тоглолтыг хожно.
 *
 *   Хөзөр 52 ширхэг тул нэг тойрогт дээд тал нь 4 тоглогч сууна. Өрөөнд
 *   4-өөс олон хүн байвал тойрог бүрд ээлжлэн өнжинө (`chooseSeats`).
 */

import { Card, RANKS, THREE_OF_DIAMONDS, deal, fullDeck, rankOf, shuffle } from './cards';
import { Combo, beats, detectCombo } from './combos';

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 8;
/** Нэг тойрогт суух дээд тоо — 52 хөзрийг 13-аар хуваахад. */
export const SEATS_PER_ROUND = 4;
/** Тойрог бүрд дээд тал нь хэдэн тоглогч солигдох. */
export const MAX_ROTATION = 2;

export const DEFAULT_TARGET_SCORE = 30;
export const TARGET_SCORE_CHOICES = [30, 40] as const;
export const MIN_TARGET_SCORE = 10;
export const MAX_TARGET_SCORE = 200;

/** Нэг ээлжинд бодох хугацаа (секунд). */
export const TURN_SECONDS_CHOICES = [30, 60] as const;
export const DEFAULT_TURN_SECONDS = 30;
/**
 * Нэг тоглогчийн тавих ВИРТУАЛ чип. 0 = чипгүй.
 *
 * Энэ нь зөвхөн тоглоомын оноо — бодит мөнгө биш бөгөөд апп ямар ч төлбөр
 * тооцоо хийдэггүй.
 */
export const STAKE_CHOICES = [0, 1_000, 5_000, 10_000, 50_000] as const;
export const MIN_STAKE = 100;
export const MAX_STAKE = 100_000;
export const DEFAULT_STAKE = 0;

export const MIN_TURN_SECONDS = 10;
export const MAX_TURN_SECONDS = 300;

export interface Player {
  id: string;
  name: string;
  hand: Card[];
  /** Энэ эргэлтэд пас хийсэн эсэх. Шинэ эргэлт эхлэхэд цэвэрлэгдэнэ. */
  passed: boolean;
  /** Хөзрөө дуусгасан бол хэддүгээрт орсон (1-ээс эхэлнэ), эс бөгөөс null. */
  place: number | null;
  /** Хуримтлагдсан оноо. Хэзээ ч буурахгүй. */
  score: number;
  /** Босгод хүрч тоглолтоос хасагдсан эсэх. */
  eliminated: boolean;
  /** Энэ тойрогт суусан эсэх (өнжиж байгаа бол false). */
  seated: boolean;
  /** Сонгон шалгаруулалтад сугалсан хөзөр — яагаад өнжсөнийг харуулна. */
  draw: Card | null;
  /** Профайлын зураг: emoji эсвэл data: URL. Сонгоогүй бол null. */
  avatar: string | null;
}

export interface TablePlay {
  playerId: string;
  combo: Combo;
}

export interface RoundEntry {
  playerId: string;
  /** Өнжсөн тоглогчийн хувьд false. */
  played: boolean;
  cardsLeft: number;
  /** Торгуулийн үржүүлэгч: 1, 2 (10+ хөзөр) эсвэл 3 (13 хөзөр). */
  multiplier: number;
  /** Энэ тойрогт нэмэгдсэн оноо. */
  delta: number;
  /** Тойргийн дараах нийт оноо. */
  total: number;
  place: number | null;
}

/** Тоглолт дууссаны дараах чипийн тооцоо. */
export interface Settlement {
  playerId: string;
  /** Эерэг = хожсон, сөрөг = алдсан (виртуал чип). */
  amount: number;
}

export interface RoundRecord {
  round: number;
  entries: RoundEntry[];
  /** "Луу" гарсан бол тухайн тоглогчийн id. */
  dragonPlayerId?: string;
}

export type Phase = 'lobby' | 'playing' | 'roundEnd' | 'matchEnd';

export interface GameState {
  players: Player[];
  /** Энэ тойрогт тоглож буй тоглогчдын id, ээлжийн дарааллаар. */
  seats: string[];
  /** `seats` доторх индекс. */
  turn: number;
  current: TablePlay | null;
  lastPlay: TablePlay | null;
  phase: Phase;
  round: number;
  targetScore: number;
  /** Нэг тоглогчийн виртуал чип. 0 бол чипгүй. */
  stake: number;
  /** Тоглолт дуусахад бодогдоно. */
  settlement: Settlement[] | null;
  /** Нэг ээлжинд бодох хугацаа (секунд). */
  turnSeconds: number;
  /**
   * Одоогийн ээлж дуусах хугацаа (epoch ms). Тоглоом идэвхгүй үед `null`.
   * Хугацаа дуусахад сервер `timeoutTurn`-ийг дуудна.
   */
  turnEndsAt: number | null;
  /**
   * Ээлж эхлэх бүрд нэмэгддэг дугаар. Ээлж бүр ижил хугацаанаас эхэлдэг тул
   * зөвхөн үлдсэн хугацаагаар клиент шинэ ээлж эхэлснийг ялгаж чадахгүй.
   */
  turnSeq: number;
  /**
   * Өмнөх тойрогт өнжих ээлж идэвхтэй байсан эсэх (4-өөс олон тоглогч).
   * Ээлж дуусмагц 3♦ сүүлийн нэг удаа эхлэгчийг тодорхойлдогт хэрэгтэй.
   */
  rotationWasActive: boolean;
  history: RoundRecord[];
  lastRoundWinnerId: string | null;
  matchWinnerId: string | null;
  log: string[];
}

export class RuleError extends Error {}

export function createGame(): GameState {
  return {
    players: [],
    seats: [],
    turn: 0,
    current: null,
    lastPlay: null,
    phase: 'lobby',
    round: 0,
    targetScore: DEFAULT_TARGET_SCORE,
    stake: DEFAULT_STAKE,
    settlement: null,
    turnSeconds: DEFAULT_TURN_SECONDS,
    turnEndsAt: null,
    turnSeq: 0,
    rotationWasActive: false,
    history: [],
    lastRoundWinnerId: null,
    matchWinnerId: null,
    log: [],
  };
}

export function addPlayer(state: GameState, id: string, name: string): void {
  if (state.players.length >= MAX_PLAYERS) {
    throw new RuleError(`Өрөө дүүрсэн байна (дээд тал нь ${MAX_PLAYERS} тоглогч).`);
  }
  if (state.players.some((p) => p.id === id)) return;
  state.players.push({
    id,
    name,
    hand: [],
    passed: false,
    place: null,
    score: 0,
    eliminated: false,
    seated: false,
    draw: null,
    avatar: null,
  });
}

export function removePlayer(state: GameState, id: string): void {
  const idx = state.players.findIndex((p) => p.id === id);
  if (idx === -1) return;
  state.players.splice(idx, 1);
  state.seats = state.seats.filter((s) => s !== id);
  if (state.turn >= state.seats.length) state.turn = 0;
}

// ── Тоглолт эхлүүлэх ───────────────────────────────────────────────────────

/** Шинэ тоглолт: оноо, түүх, хасалт бүгд тэглэгдэнэ. */
export function startMatch(
  state: GameState,
  targetScore: number = DEFAULT_TARGET_SCORE,
  turnSeconds: number = DEFAULT_TURN_SECONDS,
  stake: number = DEFAULT_STAKE,
  rng: () => number = Math.random,
): void {
  if (state.players.length < MIN_PLAYERS) {
    throw new RuleError(`Дор хаяж ${MIN_PLAYERS} тоглогч хэрэгтэй.`);
  }
  const target = Math.round(targetScore);
  if (!Number.isFinite(target) || target < MIN_TARGET_SCORE || target > MAX_TARGET_SCORE) {
    throw new RuleError(`Босго оноо ${MIN_TARGET_SCORE}–${MAX_TARGET_SCORE} хооронд байх ёстой.`);
  }
  const seconds = Math.round(turnSeconds);
  if (!Number.isFinite(seconds) || seconds < MIN_TURN_SECONDS || seconds > MAX_TURN_SECONDS) {
    throw new RuleError(
      `Бодох хугацаа ${MIN_TURN_SECONDS}–${MAX_TURN_SECONDS} секунд хооронд байх ёстой.`,
    );
  }

  const bet = Math.round(stake);
  if (!Number.isFinite(bet) || bet < 0 || (bet > 0 && (bet < MIN_STAKE || bet > MAX_STAKE))) {
    throw new RuleError(
      `Чип 0 (чипгүй) эсвэл ${MIN_STAKE}–${MAX_STAKE} хооронд байх ёстой.`,
    );
  }

  state.targetScore = target;
  state.turnSeconds = seconds;
  state.stake = bet;
  state.settlement = null;
  state.round = 0;
  state.history = [];
  state.seats = [];
  state.lastRoundWinnerId = null;
  state.matchWinnerId = null;
  state.rotationWasActive = false;
  state.players.forEach((p) => {
    p.score = 0;
    p.eliminated = false;
    p.seated = false;
    p.draw = null;
  });
  state.log = [`Тоглолт эхэллээ — ${target} оноонд хүрсэн тоглогч хасагдана.`];
  startRound(state, rng);
}

/** Дараагийн тойргийг эхлүүлнэ. */
export function startRound(state: GameState, rng: () => number = Math.random): void {
  if (state.phase === 'matchEnd') throw new RuleError('Тоглолт дууссан байна.');
  const contenders = state.players.filter((p) => !p.eliminated);
  if (contenders.length < MIN_PLAYERS) throw new RuleError('Үргэлжлүүлэх тоглогч хүрэлцэхгүй.');

  const previousSeats = state.seats;
  state.seats = chooseSeats(state, contenders, rng);
  state.round += 1;

  const hands = deal(state.seats.length, rng);
  state.players.forEach((p) => {
    p.passed = false;
    p.place = null;
    p.hand = [];
    p.seated = state.seats.includes(p.id);
  });
  state.seats.forEach((id, i) => {
    playerById(state, id).hand = hands[i];
  });

  state.current = null;
  state.lastPlay = null;
  state.turn = 0;
  state.phase = 'playing';
  state.log = [`${state.round}-р тойрог эхэллээ.`];

  const benched = contenders.filter((p) => !p.seated);
  if (benched.length > 0) {
    state.log.push(`Өнжиж байна: ${benched.map((p) => p.name).join(', ')}.`);
  }

  // "Луу" — 13 зэрэглэл бүрээс нэг хөзөр. Хөзөр зөвхөн цөөрдөг тул энэ нь
  // зөвхөн тараах мөчид үүсэх боломжтой.
  const dragon = seatedPlayers(state).find((p) => isDragon(p.hand));
  if (dragon) return declareDragon(state, dragon);

  const rotating = contenders.length > SEATS_PER_ROUND;
  chooseStarter(state, previousSeats, rotating, state.rotationWasActive);
  state.rotationWasActive = rotating;
  armTurn(state);
}

/** Ээлжийн цагийг шинэчилнэ. Тоглоом идэвхгүй бол цагийг цуцална. */
function armTurn(state: GameState): void {
  state.turnEndsAt = state.phase === 'playing' ? Date.now() + state.turnSeconds * 1000 : null;
  state.turnSeq += 1;
}

/**
 * Бодох хугацаа дуусахад автоматаар үйлдэл хийнэ.
 *
 * Ерөнхийдөө пас болно. Харин шинэ эргэлт эхлүүлэх ээлжтэй байсан бол пас
 * хийх боломжгүй (тэгвэл тоглоом гацна) тул хамгийн сул хөзрийг нь тавина.
 */
export function timeoutTurn(state: GameState): void {
  if (state.phase !== 'playing') return;
  const id = state.seats[state.turn];
  const player = playerById(state, id);

  if (state.current) {
    state.log.push(`${player.name}: хугацаа дуусч пас болов.`);
    pass(state, id);
  } else {
    const lowest = player.hand[0];
    state.log.push(`${player.name}: хугацаа дуусч хамгийн сул хөзөр тавигдлаа.`);
    play(state, id, [lowest]);
  }
}

/** Гарт 13 зэрэглэл бүрээс нэг байгаа эсэх (баг хамаарахгүй). */
export function isDragon(hand: Card[]): boolean {
  if (hand.length !== RANKS.length) return false;
  return new Set(hand.map(rankOf)).size === RANKS.length;
}

function declareDragon(state: GameState, winner: Player): void {
  state.players.forEach((p) => {
    if (p.id !== winner.id) p.eliminated = true;
  });
  state.matchWinnerId = winner.id;
  state.lastRoundWinnerId = winner.id;
  state.phase = 'matchEnd';
  state.current = null;
  state.turnEndsAt = null;
  settleMatch(state);
  state.history.push({
    round: state.round,
    dragonPlayerId: winner.id,
    entries: state.players.map((p) => ({
      playerId: p.id,
      played: p.seated,
      cardsLeft: p.hand.length,
      multiplier: 1,
      delta: 0,
      total: p.score,
      place: p.id === winner.id ? 1 : null,
    })),
  });
  state.log.push(`🐉 ${winner.name}-д ЛУУ буулаа — 13 дараалсан хөзөр! Тоглолтыг шууд хожлоо.`);
}

/**
 * Энэ тойрогт хэн суухыг тодорхойлно.
 *
 * 4 ба түүнээс цөөн тоглогчтой бол бүгд сууна. Олон бол:
 *   - Эхний удаа: бүгд нэг хөзөр сугалж, хамгийн бага 4 нь сууна.
 *   - Дараа нь: өмнөх тойргийн 1-р (болон 2-р) байр эзэлсэн нь өнжиж,
 *     өнжсөн хүмүүсээс хамгийн бага хөзөр сугалсан нь ордог.
 */
function chooseSeats(state: GameState, contenders: Player[], rng: () => number): string[] {
  state.players.forEach((p) => (p.draw = null));
  if (contenders.length <= SEATS_PER_ROUND) return contenders.map((p) => p.id);

  const previous = state.seats
    .map((id) => state.players.find((p) => p.id === id))
    .filter((p): p is Player => !!p && !p.eliminated);

  // Эхний тойрог (эсвэл өмнөх суудал алдагдсан): бүгд сугална.
  if (previous.length === 0) {
    const drawn = drawFor(contenders, rng);
    state.log.push(`Хөзөр сугалж ${SEATS_PER_ROUND} тоглогч тодорлоо.`);
    return drawn.slice(0, SEATS_PER_ROUND).map((p) => p.id);
  }

  const bench = contenders.filter((p) => !previous.some((q) => q.id === p.id));
  const rotation = Math.min(MAX_ROTATION, bench.length);

  // Гарах ээлж: 1-р байр эхэлж, дараа нь 2-р байр.
  const leaving = previous
    .filter((p) => p.place !== null)
    .sort((a, b) => (a.place ?? 99) - (b.place ?? 99))
    .slice(0, rotation)
    .map((p) => p.id);

  const stayers = previous.filter((p) => !leaving.includes(p.id));
  const incoming = drawFor(bench, rng).slice(0, SEATS_PER_ROUND - stayers.length);
  const seats = [...stayers.map((p) => p.id), ...incoming.map((p) => p.id)];

  // Хэн нэгэн хасагдсанаас болж дутвал үлдсэн хүмүүсээс нөхнө.
  for (const p of contenders) {
    if (seats.length >= Math.min(SEATS_PER_ROUND, contenders.length)) break;
    if (!seats.includes(p.id)) seats.push(p.id);
  }
  return seats;
}

/** Өгөгдсөн тоглогчдод нэг нэг хөзөр сугалж, багаас нь эрэмбэлж буцаана. */
function drawFor(players: Player[], rng: () => number): Player[] {
  const deck = shuffle(fullDeck(), rng);
  players.forEach((p, i) => (p.draw = deck[i]));
  return players.slice().sort((a, b) => (a.draw ?? 0) - (b.draw ?? 0));
}

/**
 * Хэн эхлэхийг тодорхойлно.
 *
 * 3♦ дараах гурван тохиолдолд эхлэгчийг заана:
 *   - өнжих ээлж идэвхтэй (4-өөс олон тоглогч) — тойрог бүрд;
 *   - тоглолтын хамгийн эхний тойрог;
 *   - өнжих ээлж дуусаж, тоглогч 4 болсон эхний тойрог — 3♦ сүүлийн удаа заана.
 *
 * Түүнээс хойш өмнөх тойргийн хожигч түрүүлж гарна.
 *
 * 3♦ нь зөвхөн ХЭН эхлэхийг заана — эхлэгч дуртай хослолоо тавьж болно.
 * 3♦-ээ заавал оруулах шаардлага энэ тоглоомд байхгүй.
 */
function chooseStarter(
  state: GameState,
  previousSeats: string[],
  rotating: boolean,
  rotationWasActive: boolean,
): void {
  const firstRound = previousSeats.length === 0;
  const threeDecides = rotating || firstRound || rotationWasActive;
  const winner = state.lastRoundWinnerId;

  if (!threeDecides && winner && state.seats.includes(winner)) {
    state.turn = state.seats.indexOf(winner);
    state.log.push(`${playerById(state, winner).name} өмнөх тойргийг хожсон тул эхэлнэ.`);
    return;
  }

  const holder = state.seats.findIndex((id) =>
    playerById(state, id).hand.includes(THREE_OF_DIAMONDS),
  );
  state.turn = holder !== -1 ? holder : lowestCardSeat(state);

  const starter = playerById(state, state.seats[state.turn]);
  if (holder === -1) {
    state.log.push(`3♦ тарааагдаагүй тул хамгийн бага хөзөртэй ${starter.name} эхэлнэ.`);
  } else if (rotationWasActive && !rotating) {
    state.log.push(`${starter.name} 3♦-тэй тул эхэлнэ (3♦ сүүлийн удаа заалаа).`);
  } else {
    state.log.push(`${starter.name} 3♦-тэй тул эхэлнэ.`);
  }
}

function lowestCardSeat(state: GameState): number {
  let best = 0;
  let bestCard = Infinity;
  state.seats.forEach((id, i) => {
    const low = playerById(state, id).hand[0];
    if (low !== undefined && low < bestCard) {
      bestCard = low;
      best = i;
    }
  });
  return best;
}

// ── Үйлдлүүд ───────────────────────────────────────────────────────────────

/** Хөзөр тавих. Дүрэм зөрчвөл `RuleError` шиднэ. */
export function play(state: GameState, playerId: string, cards: Card[]): void {
  const seat = requireTurn(state, playerId);
  const player = playerById(state, playerId);

  if (cards.some((c) => !player.hand.includes(c))) {
    throw new RuleError('Тэр хөзөр таны гарт байхгүй байна.');
  }

  const combo = detectCombo(cards);
  if (!combo) throw new RuleError('Энэ нь хүчинтэй хослол биш байна.');

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

  // Эхний хүн хөзрөө дуусгамагц тойрог ТЭР ДОРОО дуусна. Бусад нь 2, 3-р
  // байрын төлөө үргэлжлүүлэхгүй — гартаа үлдсэн хөзрөөрөө торгууль авна.
  if (player.hand.length === 0) {
    player.place = nextPlace(state);
    state.log.push(`${player.name} хөзрөө дуусгалаа — тойрог дууслаа.`);
    return finishRound(state);
  }

  advance(state, seat);
  armTurn(state);
}

/** Пас хийх. Шинэ эргэлтийн эхэнд пас хийж болохгүй. */
export function pass(state: GameState, playerId: string): void {
  const seat = requireTurn(state, playerId);
  if (!state.current) throw new RuleError('Шинэ эргэлтийг эхлүүлэх ёстой — пас хийж болохгүй.');
  const player = playerById(state, playerId);
  player.passed = true;
  state.log.push(`${player.name}: пас.`);
  advance(state, seat);
  armTurn(state);
}

function requireTurn(state: GameState, playerId: string): number {
  if (state.phase !== 'playing') throw new RuleError('Тоглоом идэвхгүй байна.');
  const seat = state.seats.indexOf(playerId);
  if (seat === -1) throw new RuleError('Та энэ тойрогт өнжиж байна.');
  if (seat !== state.turn) throw new RuleError('Одоо таны ээлж биш байна.');
  return seat;
}

const playerById = (state: GameState, id: string): Player => {
  const p = state.players.find((x) => x.id === id);
  if (!p) throw new RuleError('Тоглогч олдсонгүй.');
  return p;
};

const seatedPlayers = (state: GameState): Player[] => state.seats.map((id) => playerById(state, id));

/** Дараагийн эзлэх байр. Эхний дуусгасан хүн 1-р байр эзэлнэ. */
const nextPlace = (state: GameState): number =>
  seatedPlayers(state).filter((p) => p.place !== null).length + 1;

/**
 * Ээлжийг дараагийн хариулах эрхтэй тоглогч руу шилжүүлнэ.
 * Хэрэв хэн ч хариулах боломжгүй бол шинэ эргэлт эхэлнэ.
 */
function advance(state: GameState, actorSeat: number): void {
  const ownerSeat = state.current ? state.seats.indexOf(state.current.playerId) : actorSeat;
  const next = nextEligible(state, actorSeat);
  if (next === null || next === ownerSeat) startNewTrick(state, ownerSeat);
  else state.turn = next;
}

/** actorSeat-ээс хойших, дуусаагүй ба пас хийгээгүй эхний суудал. */
function nextEligible(state: GameState, from: number): number | null {
  const n = state.seats.length;
  for (let i = 1; i <= n; i++) {
    const seat = (from + i) % n;
    const p = playerById(state, state.seats[seat]);
    if (p.place === null && !p.passed) return seat;
  }
  return null;
}

function startNewTrick(state: GameState, ownerSeat: number): void {
  state.current = null;
  seatedPlayers(state).forEach((p) => (p.passed = false));
  const owner = playerById(state, state.seats[ownerSeat]);
  state.turn = owner.place === null ? ownerSeat : (nextActiveSeat(state, ownerSeat) ?? ownerSeat);
  state.log.push(`Шинэ эргэлт — ${playerById(state, state.seats[state.turn]).name} эхэлнэ.`);
}

function nextActiveSeat(state: GameState, from: number): number | null {
  const n = state.seats.length;
  for (let i = 1; i <= n; i++) {
    const seat = (from + i) % n;
    if (playerById(state, state.seats[seat]).place === null) return seat;
  }
  return null;
}

// ── Тойрог дуусах ба оноо ───────────────────────────────────────────────────

/**
 * Үлдсэн хөзрийн торгуулийн үржүүлэгч.
 * 10-аас дээш хөзөр үлдвэл ×2, нэг ч хөзөр гаргаагүй (13) бол ×3.
 */
export function penaltyMultiplier(cardsLeft: number): number {
  if (cardsLeft >= 13) return 3;
  if (cardsLeft >= 10) return 2;
  return 1;
}

function finishRound(state: GameState): void {
  // Дуусгаагүй тоглогчдыг гартаа үлдсэн хөзрийн тоогоор эрэмбэлнэ —
  // цөөн хөзөртэй нь дээгүүр байр эзэлнэ. Тэнцвэл суудлын дараалал шийднэ.
  seatedPlayers(state)
    .filter((p) => p.place === null)
    .sort((a, b) => a.hand.length - b.hand.length)
    .forEach((p) => {
      p.place = nextPlace(state);
    });

  const entries: RoundEntry[] = state.players.map((p) => {
    const played = p.seated;
    const cardsLeft = played ? p.hand.length : 0;
    const multiplier = played ? penaltyMultiplier(cardsLeft) : 1;
    const delta = played ? cardsLeft * multiplier : 0;
    p.score += delta;
    return {
      playerId: p.id,
      played,
      cardsLeft,
      multiplier,
      delta,
      total: p.score,
      place: played ? p.place : null,
    };
  });
  state.history.push({ round: state.round, entries });

  const winner = seatedPlayers(state).find((p) => p.place === 1);
  state.lastRoundWinnerId = winner?.id ?? null;
  if (winner) state.log.push(`${winner.name} тойргийг хожлоо! 🎉`);

  applyEliminations(state);

  const remaining = state.players.filter((p) => !p.eliminated);
  if (remaining.length <= 1) {
    state.matchWinnerId = remaining[0]?.id ?? null;
    state.phase = 'matchEnd';
    if (remaining[0]) state.log.push(`🏆 ${remaining[0].name} тоглолтыг хожлоо!`);
    settleMatch(state);
  } else {
    state.phase = 'roundEnd';
  }
  state.current = null;
  state.turnEndsAt = null;
}

/**
 * Чипийн тооцоо: тоглогч бүр чипээ тавьж, ялагч бүгдийг нь авна.
 * Чипгүй (0) бол тооцоо гарахгүй.
 *
 * Чип нь ВИРТУАЛ — бодит мөнгө биш, шилжүүлэг хийгддэггүй.
 */
function settleMatch(state: GameState): void {
  const winnerId = state.matchWinnerId;
  if (state.stake <= 0 || !winnerId) {
    state.settlement = null;
    return;
  }
  const loserCount = state.players.length - 1;
  state.settlement = state.players.map((p) => ({
    playerId: p.id,
    amount: p.id === winnerId ? state.stake * loserCount : -state.stake,
  }));
  const winner = state.players.find((p) => p.id === winnerId);
  if (winner) {
    state.log.push(`${winner.name} ${state.stake * loserCount} чип хожлоо.`);
  }
}

function applyEliminations(state: GameState): void {
  const newlyOut = state.players.filter((p) => !p.eliminated && p.score >= state.targetScore);
  newlyOut.forEach((p) => {
    p.eliminated = true;
    state.log.push(`${p.name} ${p.score} оноонд хүрч хасагдлаа.`);
  });

  // Бүгд нэг зэрэг босго давбал хамгийн бага оноотой нь үлдэнэ.
  if (newlyOut.length > 0 && state.players.every((p) => p.eliminated)) {
    const best = Math.min(...newlyOut.map((p) => p.score));
    newlyOut.filter((p) => p.score === best).forEach((p) => (p.eliminated = false));
  }
}

// ── Туслах ─────────────────────────────────────────────────────────────────

/**
 * Тухайн тоглогчийн хувьд хууль ёсны тавилт байгаа эсэх — "пас" товчийг
 * идэвхжүүлэх, эсвэл автоматаар пас хийхэд ашиглана.
 */
export function hasLegalPlay(state: GameState, playerId: string): boolean {
  const player = state.players.find((p) => p.id === playerId);
  if (!player || !player.seated) return false;
  const current = state.current?.combo ?? null;
  if (!current) return player.hand.length > 0;
  if (current.size === 1) return player.hand.some((c) => c > current.power);

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
