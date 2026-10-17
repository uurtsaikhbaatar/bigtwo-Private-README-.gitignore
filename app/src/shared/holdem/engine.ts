/**
 * No-Limit Texas Hold'em-ийн цэвэр төлвийн машин.
 *
 * Big Two-гийн `game.ts`-тэй адил: сервер бүрэн эрхтэй ажиллуулж, клиент зөвхөн
 * харагдац авна. Дүрэм нь Poker TDA 2024 ба Robert's Rules of Poker-ийг дагана:
 *
 *   • Үхсэн товч (dead button): big blind хэнийг ч алгасахгүй, урагшаа нэг
 *     суудал шилжинэ; small blind = өмнөх big blind-ийн суудал; товч = өмнөх бага
 *     бооцооны суудал (хоосон байж болно).
 *   • Хоёр хүн үлдэхэд товч нь small blindг тавьж, flop-оос өмнө түрүүлж үйлдэнэ.
 *   • Big blind-ийн анте: big blindнд суусан тоглогч ганцаараа төлнө; чип хүрэхгүй
 *     бол бооцоо түрүүлнэ. Анте нь дуудлагад тооцогдохгүй (dead money).
 *   • Богино big blind (all-in) байсан ч бусад нь БҮТЭН big blindг дагана.
 *   • Хамгийн бага өсгөлт = тухайн шатны өмнөх бүрэн өсгөлтийн хэмжээ.
 *     Бүрэн бус all-in өсгөлт өмнө нь үйлдсэн тоглогчид дахин өсгөх эрх
 *     нээхгүй (хэд хэдэн бүрэн бус өсгөлт нийлж бүрэн болбол нээнэ).
 *   • Дагагдаагүй бооцоо буцна; side pot бүр тусдаа ялагчтай.
 *   • Гар үзүүлэх: river-д сүүлд бооцоо тавьсан/өсгөсөн нь эхэлнэ, эс бөгөөс
 *     товчны зүүнээс. Хожиж чадахгүй гар хаагдана. All-in болж үйлдэл
 *     дууссан бол бүх гар ил гарна.
 *   • Хуваагдахгүй чип товчноос зүүн тийш хамгийн ойр ялагчид.
 *
 * ХУГАЦАА: `turnEndsAt` ба `handEndsAt`-ийг энд тохируулна; сервер цохилтоор
 * шалгаж `timeoutAct` / `nextHand`-ийг дуудна.
 */

import type { BotLevel } from '../bot';
import { Card, fullDeck, shuffle } from '../cards';
import { bestHand, buttonDrawValue, pokerCardName } from './evaluator';
import {
  BlindLevel,
  POKER_DEFAULT_TURN_SECONDS,
  POKER_MAX_SEATS,
  POKER_MIN_PLAYERS,
  PokerFormat,
  SNG_HANDS_PER_LEVEL,
  SNG_STARTING_CHIPS,
  payouts,
  sngLevel,
} from './structure';

export class PokerRuleError extends Error {}

export type Street = 'preflop' | 'flop' | 'turn' | 'river';
/**
 * lobby   — тоглолт эхлээгүй (кэш: хангалттай тоглогч хүлээж байна)
 * playing — гар явагдаж байна
 * handEnd — гар дууссан, үр дүн харуулж байна (дараагийн гар автоматаар)
 * finished — Sit & Go дууссан
 */
export type PokerPhase = 'lobby' | 'playing' | 'handEnd' | 'finished';
export type PokerActionKind = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allin';

export interface PokerAction {
  kind: PokerActionKind;
  /** bet/raise үед: энэ шатанд нийт хэд болгох вэ ("raise to"). */
  amount?: number;
}

export interface PokerPlayer {
  id: string;
  name: string;
  avatar: string | null;
  bot: BotLevel | null;
  /** Покерын цол тодорхойлох хожил (зочинд null). */
  rankedWins: number | null;
  /** Ширээний физик суудал 0..8. */
  seat: number;
  stack: number;
  hole: Card[];
  /** Энэ гарт тараагдсан эсэх. */
  dealt: boolean;
  folded: boolean;
  allIn: boolean;
  /** Энэ шатанд тавьсан чип. */
  street: number;
  /** Энэ гарт нийт тавьсан чип (анте орно). */
  total: number;
  /** Сүүлд үйлдэх үеийн `currentBet` — дахин өсгөх эрхийг тодорхойлно. null = энэ шатанд үйлдээгүй. */
  actedAt: number | null;
  /** Ширээнд харуулах сүүлийн үйлдэл ("Дагав 200" г.м.). */
  lastAction: string | null;
  /**
   * Түр байхгүй. Sit & Go: тараагдсаар, ээлж ирэхэд автоматаар өнжих/хаях
   * (TDA — blind-ийгоор хасагдах). Кэш: тараагдахгүй.
   */
  sittingOut: boolean;
  /** Кэш: дараалсан хэдэн гар байхгүй байсан (3 хүрвэл босгоно). */
  sitOutHands: number;
  /** Кэш: шинээр суусан/буцсан — big blind хүрч ирэхийг хүлээнэ. */
  waitBB: boolean;
  /** Ширээнээс гарсан (Sit & Go: тэмцээнд үлдэнэ; кэш: гар дуусахад босно). */
  left: boolean;
  eliminated: boolean;
  /** Sit & Go-д эзэлсэн байр (хасагдах эсвэл түрүүлэхэд). */
  place: number | null;
  /** Гар эхлэх үеийн чип — нэг гарт хасагдсан хүмүүсийн байрыг тогтооно (TDA). */
  startStack: number;
  /** Гар дуусахад ил гарсан эсэх. */
  showCards: boolean;
  handLabel: string | null;
  /** Энэ гарт хожсон чип. */
  won: number;
}

export interface PotResult {
  amount: number;
  winners: string[];
  /** "Үндсэн сав", "Хажуугийн сав 1" г.м. */
  name: string;
  /** Ялсан гарын нэр (тэмцээгүй бол null). */
  hand: string | null;
}

export interface PokerSettlement {
  playerId: string;
  /** Токены цэвэр өөрчлөлт (шагнал − хураамж). */
  amount: number;
  place: number;
}

export interface PokerState {
  format: PokerFormat;
  phase: PokerPhase;
  players: PokerPlayer[];
  handNo: number;
  /** Sit & Go-гийн blind level (0-ээс). */
  level: number;
  sb: number;
  bb: number;
  bbAnte: number;
  /** Sit & Go-гийн хураамж (токен). Кэшэд 0. */
  buyIn: number;
  turnSeconds: number;
  turnEndsAt: number | null;
  turnSeq: number;
  /** Товчны суудал. Эхний гараас өмнө -1. */
  buttonSeat: number;
  /** Small blindны суудал (хоосон байж болно — "үхсэн" small blind). */
  sbSeat: number;
  bbSeat: number;
  street: Street | null;
  board: Card[];
  deck: Card[];
  toAct: string | null;
  currentBet: number;
  minRaise: number;
  /** Энэ шатанд хамгийн сүүлд бооцоо тавьсан/өсгөсөн тоглогч. */
  aggressor: string | null;
  /** Бүх гар ил гарсан (all-in-ий дараа үйлдэл дууссан). */
  allInRunout: boolean;
  pots: PotResult[];
  /** Sit & Go эхлэхэд оролцогчдын тоо — шагналыг тодорхойлно. */
  entrants: number;
  settlement: PokerSettlement[] | null;
  winnerId: string | null;
  handEndsAt: number | null;
  /** Товчны сугалаа (TDA): хөзөр бүр ил. */
  buttonDraw: { playerId: string; card: Card }[] | null;
  log: string[];
}

/** Гар дуусаад дараагийнх эхлэх хүртэлх зай (ms). */
export const HAND_GAP_MS = 4_500;
/** Кэш: дараалан ингэтэл олон гар байхгүй бол ширээнээс босгож токеныг буцаана. */
export const SIT_OUT_STAND_HANDS = 3;

export function createPoker(format: PokerFormat): PokerState {
  return {
    format,
    phase: 'lobby',
    players: [],
    handNo: 0,
    level: 0,
    sb: 0,
    bb: 0,
    bbAnte: 0,
    buyIn: 0,
    turnSeconds: POKER_DEFAULT_TURN_SECONDS,
    turnEndsAt: null,
    turnSeq: 0,
    buttonSeat: -1,
    sbSeat: -1,
    bbSeat: -1,
    street: null,
    board: [],
    deck: [],
    toAct: null,
    currentBet: 0,
    minRaise: 0,
    aggressor: null,
    allInRunout: false,
    pots: [],
    entrants: 0,
    settlement: null,
    winnerId: null,
    handEndsAt: null,
    buttonDraw: null,
    log: [],
  };
}

// ── Суудал ──────────────────────────────────────────────────────────────────

export function addPokerPlayer(
  state: PokerState,
  id: string,
  name: string,
  stack = 0,
): PokerPlayer {
  if (state.players.some((p) => p.id === id)) throw new PokerRuleError('Аль хэдийн суусан байна.');
  if (state.format === 'sng' && state.phase !== 'lobby' && state.phase !== 'finished') {
    throw new PokerRuleError('Тэмцээн явагдаж байна. Дуусахыг хүлээнэ үү.');
  }
  const taken = new Set(state.players.map((p) => p.seat));
  let seat = -1;
  for (let s = 0; s < POKER_MAX_SEATS; s++) {
    if (!taken.has(s)) {
      seat = s;
      break;
    }
  }
  if (seat < 0) throw new PokerRuleError(`Ширээ дүүрсэн (дээд тал нь ${POKER_MAX_SEATS}).`);
  const player: PokerPlayer = {
    id,
    name,
    avatar: null,
    bot: null,
    rankedWins: null,
    seat,
    stack,
    hole: [],
    dealt: false,
    folded: false,
    allIn: false,
    street: 0,
    total: 0,
    actedAt: null,
    lastAction: null,
    sittingOut: false,
    sitOutHands: 0,
    // Кэш тоглолт явж байхад суувал big blind хүрч ирэхийг хүлээнэ.
    waitBB: state.format === 'cash' && state.handNo > 0,
    left: false,
    eliminated: false,
    place: null,
    startStack: stack,
    showCards: false,
    handLabel: null,
    won: 0,
  };
  state.players.push(player);
  return player;
}

/**
 * Тоглогч гарна.
 *   • Лобби эсвэл дууссан тэмцээн: шууд хасна.
 *   • Sit & Go явж байхад: тэмцээнд ҮЛДЭНЭ (TDA) — бооцоо нь тавигдсаар,
 *     ээлж нь автоматаар хаягдана. Бүх чипээ алдахад хасагдана.
 *   • Кэш: гарт байвал хаяна; гар дуусахад сервер босгож токеныг буцаана.
 *
 * Буцаах утга: тоглогчийг төлвөөс бүрэн хассан эсэх.
 */
export function removePokerPlayer(state: PokerState, id: string): boolean {
  const p = state.players.find((x) => x.id === id);
  if (!p) return false;
  const idle = state.phase === 'lobby' || state.phase === 'finished';
  if (idle || (state.format === 'cash' && !p.dealt) || (state.format === 'cash' && state.phase === 'handEnd')) {
    state.players = state.players.filter((x) => x.id !== id);
    if (state.toAct === id) state.toAct = null;
    return true;
  }
  p.left = true;
  p.sittingOut = true;
  state.log.push(`${p.name} ширээнээс гарлаа.`);
  if (state.phase === 'playing' && state.toAct === id) {
    applyAction(state, p, { kind: canCheck(state, p) ? 'check' : 'fold' }, true);
  } else if (state.phase === 'playing' && p.dealt && !p.folded && !p.allIn && state.format === 'cash') {
    // Кэш: ээлж нь ирээгүй ч гарсан бол гараа хаяна. Ээлж одоогийн тоглогчид
    // хэвээр — afterAction дуудвал түүнийг алгасна. Ганц тэмцэгч үлдвэл л дуусгана.
    p.folded = true;
    p.lastAction = 'Fold';
    if (state.players.filter(contesting).length === 1) finishHand(state);
  }
  return false;
}

/** Кэш: гарсан эсвэл удаан байхгүй тоглогчдыг (гарын хооронд) ширээнээс авна. */
export function takeLeavers(state: PokerState): PokerPlayer[] {
  if (state.phase === 'playing') return [];
  const out = state.players.filter(
    (p) => p.left || (state.format === 'cash' && p.sitOutHands >= SIT_OUT_STAND_HANDS),
  );
  if (out.length === 0) return [];
  if (state.format === 'sng' && state.phase !== 'lobby' && state.phase !== 'finished') return [];
  state.players = state.players.filter((p) => !out.includes(p));
  return out;
}

// ── Эхлүүлэх ────────────────────────────────────────────────────────────────

export interface SngOptions {
  buyIn: number;
  turnSeconds?: number;
}

/** Sit & Go эхлүүлнэ: суудал санамсаргүй, товч сугалаагаар (TDA). */
export function startTournament(
  state: PokerState,
  opts: SngOptions,
  rng: () => number = Math.random,
): void {
  if (state.format !== 'sng') throw new PokerRuleError('Энэ ширээ Sit & Go биш.');
  if (state.phase === 'playing' || state.phase === 'handEnd') {
    throw new PokerRuleError('Тэмцээн явагдаж байна.');
  }
  if (state.players.length < POKER_MIN_PLAYERS) {
    throw new PokerRuleError(`Дор хаяж ${POKER_MIN_PLAYERS} тоглогч хэрэгтэй.`);
  }
  // Санамсаргүй суудал — 9 суудлаас.
  const seats = shuffle(
    Array.from({ length: POKER_MAX_SEATS }, (_, i) => i),
    rng,
  );
  state.players.forEach((p, i) => {
    resetForMatch(p);
    p.seat = seats[i];
    p.stack = SNG_STARTING_CHIPS;
  });
  state.players.sort((a, b) => a.seat - b.seat);
  Object.assign(state, {
    buyIn: Math.max(0, Math.floor(opts.buyIn)),
    turnSeconds: opts.turnSeconds ?? state.turnSeconds,
    handNo: 0,
    level: 0,
    entrants: state.players.length,
    settlement: null,
    winnerId: null,
    pots: [],
    board: [],
    log: [],
  });
  drawForButton(state, rng);
  startHand(state, rng);
}

export interface CashOptions {
  sb: number;
  bb: number;
  turnSeconds?: number;
}

/** Кэш ширээг эхлүүлнэ. Чиптэй (суусан) тоглогчид тоглоно. */
export function startCash(state: PokerState, opts: CashOptions, rng: () => number = Math.random): void {
  if (state.format !== 'cash') throw new PokerRuleError('Энэ ширээ кэш биш.');
  if (state.phase === 'playing' || state.phase === 'handEnd') {
    throw new PokerRuleError('Тоглолт явагдаж байна.');
  }
  state.sb = opts.sb;
  state.bb = opts.bb;
  state.bbAnte = 0;
  state.turnSeconds = opts.turnSeconds ?? state.turnSeconds;
  for (const p of state.players) {
    p.waitBB = false;
    p.eliminated = false;
  }
  if (cashEligible(state).length < POKER_MIN_PLAYERS) {
    throw new PokerRuleError('Чиптэй дор хаяж 2 тоглогч хэрэгтэй.');
  }
  if (state.buttonSeat < 0) drawForButton(state, rng);
  startHand(state, rng);
}

function resetForMatch(p: PokerPlayer): void {
  Object.assign(p, {
    hole: [],
    dealt: false,
    folded: false,
    allIn: false,
    street: 0,
    total: 0,
    actedAt: null,
    lastAction: null,
    sittingOut: p.left ? true : false,
    sitOutHands: 0,
    waitBB: false,
    eliminated: false,
    place: null,
    showCards: false,
    handLabel: null,
    won: 0,
  });
}

/** Хүн бүрт нэг хөзөр — хамгийн өндөр нь товч (тэнцвэл ♠ > ♥ > ♦ > ♣). */
function drawForButton(state: PokerState, rng: () => number): void {
  const deck = shuffle(fullDeck(), rng);
  const live = state.players.filter((p) => !p.eliminated && p.stack > 0);
  state.buttonDraw = live.map((p, i) => ({ playerId: p.id, card: deck[i] }));
  const winner = state.buttonDraw.reduce((a, b) =>
    buttonDrawValue(b.card) > buttonDrawValue(a.card) ? b : a,
  );
  const w = state.players.find((p) => p.id === winner.playerId)!;
  state.log.push(
    `Товчны сугалаа: ${state.buttonDraw
      .map((d) => `${state.players.find((p) => p.id === d.playerId)?.name} ${pokerCardName(d.card)}`)
      .join(', ')} → товч ${w.name}.`,
  );
  // Эхний гарт товч нь яг энэ суудал байх ёстой: startHand нь "өмнөх" бооцоонуудаас
  // тооцдог тул товчноос урагш шилжүүлсэн мэт тохируулна.
  state.buttonSeat = w.seat;
  state.sbSeat = -1;
  state.bbSeat = -1;
}

// ── Гар ─────────────────────────────────────────────────────────────────────

/** Энэ гарт тараагдах эрхтэй (кэш: хүлээж буй big blindг оруулахгүй). */
function cashEligible(state: PokerState): PokerPlayer[] {
  return state.players.filter((p) => !p.left && !p.sittingOut && p.stack > 0);
}

function liveForBlinds(state: PokerState): PokerPlayer[] {
  if (state.format === 'sng') return state.players.filter((p) => !p.eliminated && p.stack > 0);
  return cashEligible(state);
}

/** `from`-оос цагийн зүүний дагуу (суудлын дугаар өсөх) дараагийн тохирох тоглогч. */
function nextBySeat(players: PokerPlayer[], from: number, pred: (p: PokerPlayer) => boolean): PokerPlayer | null {
  for (let step = 1; step <= POKER_MAX_SEATS; step++) {
    const seat = (from + step) % POKER_MAX_SEATS;
    const p = players.find((x) => x.seat === seat);
    if (p && pred(p)) return p;
  }
  return null;
}

export function startHand(state: PokerState, rng: () => number = Math.random): void {
  const live = liveForBlinds(state);
  if (live.length < POKER_MIN_PLAYERS) {
    // Кэш: тоглогч хүлээнэ. Sit & Go-д энд хүрэхгүй (concludeIfOver дуусгадаг).
    state.phase = 'lobby';
    state.toAct = null;
    state.turnEndsAt = null;
    return;
  }

  state.handNo += 1;
  if (state.format === 'sng') {
    state.level = Math.floor((state.handNo - 1) / SNG_HANDS_PER_LEVEL);
    const lv: BlindLevel = sngLevel(state.level);
    if (state.handNo > 1 && (state.handNo - 1) % SNG_HANDS_PER_LEVEL === 0) {
      state.log.push(
        `Blind level өслөө: ${lv.sb}/${lv.bb}` + (lv.bbAnte ? `, BB ante ${lv.bbAnte}` : '') + '.',
      );
    }
    state.sb = lv.sb;
    state.bb = lv.bb;
    state.bbAnte = lv.bbAnte;
  }

  for (const p of state.players) {
    Object.assign(p, {
      hole: [],
      dealt: false,
      folded: false,
      allIn: false,
      street: 0,
      total: 0,
      actedAt: null,
      lastAction: null,
      showCards: false,
      handLabel: null,
      won: 0,
      startStack: p.stack,
    });
  }

  // ── Бооцооны байрлал (үхсэн товч) ──
  const bbCandidates = (p: PokerPlayer) =>
    state.format === 'sng'
      ? !p.eliminated && p.stack > 0
      : !p.left && !p.sittingOut && p.stack > 0; // хүлээж буй (waitBB) тоглогч big blindг авч болно
  let button: number;
  let sbSeat: number;
  let bbPlayer: PokerPlayer;

  if (state.bbSeat < 0) {
    // Эхний гар (эсвэл кэш дахин эхэлсэн): товчноос эхлэн жирийн байрлал.
    button = state.buttonSeat;
    const headsUp = live.length === 2;
    const buttonPlayer = state.players.find((p) => p.seat === button && bbCandidates(p));
    if (headsUp) {
      const sbP = buttonPlayer ?? nextBySeat(state.players, button, bbCandidates)!;
      button = sbP.seat;
      sbSeat = sbP.seat;
      bbPlayer = nextBySeat(state.players, sbP.seat, bbCandidates)!;
    } else {
      const sbP = nextBySeat(state.players, button, bbCandidates)!;
      sbSeat = sbP.seat;
      bbPlayer = nextBySeat(state.players, sbP.seat, bbCandidates)!;
    }
  } else {
    bbPlayer = nextBySeat(state.players, state.bbSeat, bbCandidates)!;
    const dealtCount = state.players.filter(
      (p) => bbCandidates(p) && (!p.waitBB || p === bbPlayer),
    ).length;
    if (dealtCount === 2) {
      // Хоёр хүн: товч = small blind = big blind биш нөгөө тоглогч.
      const other = state.players.find(
        (p) => p !== bbPlayer && bbCandidates(p) && !p.waitBB,
      )!;
      button = other.seat;
      sbSeat = other.seat;
    } else {
      sbSeat = state.bbSeat; // өмнөх big blind-ийн суудал (хоосон бол үхсэн small blind)
      button = state.sbSeat; // өмнөх small blind-ийн суудал (хоосон бол үхсэн товч)
    }
  }
  state.buttonSeat = button;
  state.sbSeat = sbSeat;
  state.bbSeat = bbPlayer.seat;

  // ── Тараах ──
  for (const p of state.players) {
    if (state.format === 'sng') {
      p.dealt = !p.eliminated && p.stack > 0;
    } else {
      if (p === bbPlayer) p.waitBB = false;
      p.dealt = !p.left && !p.sittingOut && p.stack > 0 && !p.waitBB;
      if (p.sittingOut) p.sitOutHands += 1;
    }
  }
  const dealtPlayers = state.players.filter((p) => p.dealt);
  state.deck = shuffle(fullDeck(), rng);
  // Товчны зүүнээс эхлэн нэг нэгээр хоёр тойрог тараана.
  const order = orderFrom(state, state.buttonSeat, dealtPlayers);
  for (let round = 0; round < 2; round++) {
    for (const p of order) p.hole.push(state.deck.pop()!);
  }

  state.phase = 'playing';
  state.street = 'preflop';
  state.board = [];
  state.pots = [];
  state.allInRunout = false;
  state.aggressor = null;
  state.handEndsAt = null;

  // ── Бооцоо, анте ──
  const sbPlayer = state.players.find((p) => p.seat === sbSeat && p.dealt) ?? null;
  if (sbPlayer && sbPlayer !== bbPlayer) post(sbPlayer, state.sb, 'Small Blind');
  post(bbPlayer, state.bb, 'Big Blind');
  if (state.bbAnte > 0 && bbPlayer.stack > 0) {
    // Анте нь дуудлагад тооцогдохгүй: зөвхөн нийт (сав) руу орно.
    const ante = Math.min(state.bbAnte, bbPlayer.stack);
    bbPlayer.stack -= ante;
    bbPlayer.total += ante;
    if (bbPlayer.stack === 0) bbPlayer.allIn = true;
  }
  // Богино all-in big blind байсан ч бусад нь бүтэн big blindг дагана (TDA).
  state.currentBet = state.bb;
  state.minRaise = state.bb;

  state.log.push(
    `— Hand #${state.handNo} (${state.sb}/${state.bb}${state.bbAnte ? `, ante ${state.bbAnte}` : ''}) —`,
  );

  // Flop-оос өмнө big blind-ийн дараагийнх түрүүлнэ (хоёр хүнд энэ нь товч/small blind).
  const first = nextBySeat(state.players, bbPlayer.seat, (p) => canAct(p));
  if (!first || !bettingPossible(state)) {
    state.toAct = null;
    advance(state);
    return;
  }
  setTurn(state, first.id);
}

function post(p: PokerPlayer, amount: number, label: string): void {
  const paid = Math.min(amount, p.stack);
  p.stack -= paid;
  p.street += paid;
  p.total += paid;
  if (p.stack === 0) p.allIn = true;
  p.lastAction = `${label} ${paid}`;
}

/** Товчноос зүүн тийш дарааллаар (товч өөрөө хамгийн сүүлд). */
function orderFrom(state: PokerState, seat: number, list: PokerPlayer[]): PokerPlayer[] {
  return list
    .slice()
    .sort(
      (a, b) =>
        ((a.seat - seat - 1 + POKER_MAX_SEATS) % POKER_MAX_SEATS) -
        ((b.seat - seat - 1 + POKER_MAX_SEATS) % POKER_MAX_SEATS),
    );
}

const canAct = (p: PokerPlayer) => p.dealt && !p.folded && !p.allIn;
const contesting = (p: PokerPlayer) => p.dealt && !p.folded;

function setTurn(state: PokerState, id: string): void {
  state.toAct = id;
  state.turnSeq += 1;
  state.turnEndsAt = Date.now() + state.turnSeconds * 1000;
}

/** Хоёроос олон тоглогч бооцоо тавьж чадах эсэх (бусад нь all-in/хаясан). */
function bettingPossible(state: PokerState): boolean {
  const able = state.players.filter(canAct);
  if (able.length >= 2) return true;
  if (able.length === 0) return false;
  // Ганц тоглогч үлдсэн: дагах ёстой бооцоо байвал л үйлдэнэ.
  return able[0].street < state.currentBet;
}

// ── Үйлдэл ──────────────────────────────────────────────────────────────────

export function canCheck(state: PokerState, p: PokerPlayer): boolean {
  return p.street >= state.currentBet;
}

/** Дахин өсгөх эрх нээлттэй эсэх (бүрэн бус all-in өсгөлт эрх нээхгүй). */
export function canRaise(state: PokerState, p: PokerPlayer): boolean {
  if (!canAct(p)) return false;
  if (p.stack <= state.currentBet - p.street) return false; // дагахад л хүрнэ
  const others = state.players.filter((x) => x !== p && canAct(x));
  if (others.length === 0) return false; // хэн ч дагаж чадахгүй
  return p.actedAt === null || state.currentBet - p.actedAt >= state.minRaise;
}

export interface LegalActions {
  canFold: boolean;
  canCheck: boolean;
  /** Дагахад хэрэгтэй чип (0 бол өнжинө). */
  toCall: number;
  canRaise: boolean;
  /** "Raise to" доод хэмжээ (all-in-ээс бага бол). */
  minTo: number;
  /** "Raise to" дээд хэмжээ (= all-in). */
  maxTo: number;
}

export function legalActions(state: PokerState, id: string): LegalActions | null {
  const p = state.players.find((x) => x.id === id);
  if (!p || state.phase !== 'playing' || state.toAct !== id) return null;
  const toCall = Math.min(Math.max(0, state.currentBet - p.street), p.stack);
  const maxTo = p.street + p.stack;
  const raise = canRaise(state, p);
  return {
    canFold: true,
    canCheck: canCheck(state, p),
    toCall,
    canRaise: raise,
    minTo: raise ? Math.min(state.currentBet + state.minRaise, maxTo) : 0,
    maxTo: raise ? maxTo : 0,
  };
}

/** Тоглогчийн үйлдэл. Буруу бол PokerRuleError. */
export function act(state: PokerState, id: string, action: PokerAction): void {
  if (state.phase !== 'playing') throw new PokerRuleError('Гар явагдаагүй байна.');
  if (state.toAct !== id) throw new PokerRuleError('Таны ээлж биш байна.');
  const p = state.players.find((x) => x.id === id)!;
  p.sittingOut = p.left; // идэвхтэй үйлдэл = буцаж ирсэн
  p.sitOutHands = 0;
  applyAction(state, p, action, false);
}

/** Хугацаа дуусахад: өнжих боломжтой бол өнжинө, эс бөгөөс хаяна. Цаашид түр байхгүй. */
export function timeoutAct(state: PokerState): void {
  if (state.phase !== 'playing' || !state.toAct) return;
  const p = state.players.find((x) => x.id === state.toAct)!;
  p.sittingOut = true;
  applyAction(state, p, { kind: canCheck(state, p) ? 'check' : 'fold' }, true);
}

function applyAction(state: PokerState, p: PokerPlayer, action: PokerAction, auto: boolean): void {
  const toCall = Math.max(0, state.currentBet - p.street);
  const fmt = (n: number) => n.toLocaleString('en-US').replace(/,/g, ' ');

  switch (action.kind) {
    case 'fold':
      p.folded = true;
      p.lastAction = auto ? 'Fold (хугацаа)' : 'Fold';
      break;
    case 'check':
      if (toCall > 0) throw new PokerRuleError(`Check хийх боломжгүй — ${fmt(toCall)} Call хийх шаардлагатай.`);
      p.lastAction = auto ? 'Check (хугацаа)' : 'Check';
      break;
    case 'call': {
      if (toCall === 0) throw new PokerRuleError('Call хийх Bet алга — Check хийнэ үү.');
      const paid = Math.min(toCall, p.stack);
      p.stack -= paid;
      p.street += paid;
      p.total += paid;
      if (p.stack === 0) p.allIn = true;
      p.lastAction = p.allIn ? `All-in ${fmt(p.street)}` : `Call ${fmt(paid)}`;
      break;
    }
    case 'bet':
    case 'raise':
    case 'allin': {
      const maxTo = p.street + p.stack;
      let to = action.kind === 'allin' ? maxTo : Math.floor(Number(action.amount));
      if (!Number.isFinite(to)) throw new PokerRuleError('Хэмжээ буруу байна.');
      to = Math.min(to, maxTo);
      if (to <= state.currentBet) {
        // All-in нь дуудлагаас бага/тэнцүү — энэ бол all-in дуудлага.
        if (action.kind !== 'allin') throw new PokerRuleError('Raise нь одоогийн Bet-ээс их байх ёстой.');
        if (toCall === 0) {
          p.lastAction = 'Check';
          break;
        }
        const paid = p.stack;
        p.stack = 0;
        p.street += paid;
        p.total += paid;
        p.allIn = true;
        p.lastAction = `All-in ${fmt(p.street)}`;
        break;
      }
      if (!canRaise(state, p)) {
        throw new PokerRuleError('Raise хийх эрх нээгдээгүй — бүрэн бус All-in Raise эрх нээхгүй (TDA).');
      }
      const isAllIn = to === maxTo;
      const raiseSize = to - state.currentBet;
      if (!isAllIn && raiseSize < state.minRaise) {
        throw new PokerRuleError(`Min Raise: ${fmt(state.currentBet + state.minRaise)} хүртэл.`);
      }
      const wasBet = state.currentBet === 0;
      const paid = to - p.street;
      p.stack -= paid;
      p.street = to;
      p.total += paid;
      if (p.stack === 0) p.allIn = true;
      if (raiseSize >= state.minRaise) state.minRaise = raiseSize; // бүрэн өсгөлт л доод хэмжээг өөрчилнө
      state.currentBet = to;
      state.aggressor = p.id;
      p.lastAction = p.allIn ? `All-in ${fmt(to)}` : wasBet ? `Bet ${fmt(to)}` : `Raise to ${fmt(to)}`;
      break;
    }
    default:
      throw new PokerRuleError('Танихгүй үйлдэл.');
  }
  p.actedAt = state.currentBet;
  state.log.push(`${p.name}: ${p.lastAction}`);
  afterAction(state);
}

function afterAction(state: PokerState): void {
  const live = state.players.filter(contesting);
  if (live.length === 1) {
    finishHand(state);
    return;
  }
  const next = nextToAct(state);
  if (next) {
    setTurn(state, next.id);
    return;
  }
  advance(state);
}

/** Одоогийн шатанд үйлдэх ёстой дараагийн тоглогч (байхгүй бол null). */
function nextToAct(state: PokerState): PokerPlayer | null {
  const current = state.players.find((p) => p.id === state.toAct);
  const from = current ? current.seat : state.buttonSeat;
  const needs = (p: PokerPlayer) =>
    canAct(p) && (p.actedAt === null || p.street < state.currentBet);
  // Бусад нь бүгд all-in/хаясан бол ганц үлдсэн хүн дагах л шаардлагатай үед үйлдэнэ.
  if (state.players.filter(canAct).length <= 1) {
    const only = state.players.find(canAct);
    return only && only.street < state.currentBet ? only : null;
  }
  return nextBySeat(state.players, from, needs);
}

/** Шат дууссан — дараагийн шат руу эсвэл гар үзүүлэх рүү. */
function advance(state: PokerState): void {
  for (const p of state.players) {
    p.street = 0;
    p.actedAt = null;
  }
  state.currentBet = 0;
  state.minRaise = state.bb;
  state.toAct = null;
  state.turnEndsAt = null;

  const possible = state.players.filter(canAct).length >= 2;
  if (!possible) state.allInRunout = state.players.filter(contesting).length >= 2;

  while (true) {
    if (state.street === 'river') {
      finishHand(state);
      return;
    }
    dealStreet(state);
    if (possible) break;
  }
  state.aggressor = null;
  const first = nextBySeat(state.players, state.buttonSeat, canAct);
  if (!first) {
    finishHand(state);
    return;
  }
  setTurn(state, first.id);
}

function dealStreet(state: PokerState): void {
  state.deck.pop(); // шатаах хөзөр (burn)
  if (state.street === 'preflop') {
    state.board.push(state.deck.pop()!, state.deck.pop()!, state.deck.pop()!);
    state.street = 'flop';
  } else if (state.street === 'flop') {
    state.board.push(state.deck.pop()!);
    state.street = 'turn';
  } else {
    state.board.push(state.deck.pop()!);
    state.street = 'river';
  }
  state.log.push(`${streetName(state.street)}: ${state.board.map(pokerCardName).join(' ')}`);
}

export function streetName(s: Street): string {
  return s === 'preflop' ? 'Preflop' : s === 'flop' ? 'Flop' : s === 'turn' ? 'Turn' : 'River';
}

// ── Гарын төгсгөл ───────────────────────────────────────────────────────────

/**
 * Сав хуваах. Тэмцээгүй (бусад нь хаясан) бол бүх сав ганц тоглогчид,
 * хөзрөө харуулах шаардлагагүй.
 */
function finishHand(state: PokerState): void {
  state.toAct = null;
  state.turnEndsAt = null;
  for (const p of state.players) p.street = 0;

  // Дагагдаагүй бооцоо буцна: хамгийн их тавьсан хүний илүүдлийг буцаана.
  const byTotal = state.players.filter((p) => p.total > 0).sort((a, b) => b.total - a.total);
  if (byTotal.length >= 1) {
    const top = byTotal[0];
    const second = byTotal[1]?.total ?? 0;
    if (top.total > second) {
      const back = top.total - second;
      top.total -= back;
      top.stack += back;
      if (top.stack > 0) top.allIn = false;
    }
  }

  const live = state.players.filter(contesting);
  const fmt = (n: number) => n.toLocaleString('en-US').replace(/,/g, ' ');

  if (live.length === 1) {
    const w = live[0];
    const pot = state.players.reduce((s, p) => s + p.total, 0);
    w.stack += pot;
    w.won = pot;
    state.pots = [{ amount: pot, winners: [w.id], name: 'Pot', hand: null }];
    state.log.push(`${w.name} Pot ${fmt(pot)} авлаа (бусад нь Fold).`);
  } else {
    // Ширээний 5 хөзөр бүрэн байх ёстой (all-in-ий дараа ил тавигдана).
    while (state.board.length < 5) {
      state.deck.pop();
      state.board.push(state.deck.pop()!);
    }
    state.street = 'river';
    const ranks = new Map(live.map((p) => [p.id, bestHand([...p.hole, ...state.board])]));
    for (const p of live) p.handLabel = ranks.get(p.id)!.label;

    // Сав үүсгэх: тэмцэгчдийн нийт тавьсан хэмжээгээр түвшин.
    const levels = [...new Set(live.map((p) => p.total))].sort((a, b) => a - b);
    const pots: { amount: number; eligible: PokerPlayer[] }[] = [];
    let prev = 0;
    for (const lv of levels) {
      const amount = state.players.reduce(
        (s, p) => s + Math.min(p.total, lv) - Math.min(p.total, prev),
        0,
      );
      const eligible = live.filter((p) => p.total >= lv);
      if (amount > 0) pots.push({ amount, eligible });
      prev = lv;
    }
    // Хаясан тоглогчийн дээд түвшнээс илүү тавьсан чип сүүлийн саванд.
    const leftover = state.players.reduce((s, p) => s + Math.max(0, p.total - prev), 0);
    if (leftover > 0 && pots.length) pots[pots.length - 1].amount += leftover;

    const leftOfButton = orderFrom(state, state.buttonSeat, state.players);
    state.pots = pots.map((pot, i) => {
      const best = Math.max(...pot.eligible.map((p) => ranks.get(p.id)!.score));
      const winners = leftOfButton.filter(
        (p) => pot.eligible.includes(p) && ranks.get(p.id)!.score === best,
      );
      const share = Math.floor(pot.amount / winners.length);
      let odd = pot.amount - share * winners.length;
      for (const w of winners) {
        // Хуваагдахгүй чип товчноос зүүн тийш хамгийн ойр ялагчид (TDA).
        const extra = odd > 0 ? 1 : 0;
        odd -= extra;
        w.stack += share + extra;
        w.won += share + extra;
      }
      const name = pots.length === 1 ? 'Pot' : i === 0 ? 'Main Pot' : `Side Pot ${i}`;
      const hand = ranks.get(winners[0].id)!.label;
      state.log.push(
        `${name} ${fmt(pot.amount)}: ${winners.map((w) => w.name).join(', ')} — ${hand}`,
      );
      return { amount: pot.amount, winners: winners.map((w) => w.id), name, hand };
    });

    revealShowdown(state, live, ranks);
  }

  for (const p of state.players) {
    if (p.stack > 0) p.allIn = false;
    p.total = 0; // сав хуваагдсан — тавьсан чип ялагчийн стек рүү шилжсэн
  }
  state.phase = 'handEnd';
  state.handEndsAt = Date.now() + HAND_GAP_MS;
  concludeIfOver(state);
}

/**
 * Гар үзүүлэх дараалал: river-д бооцоо тавьсан/өсгөсөн тоглогч эхэлнэ, эс
 * бөгөөс товчны зүүнээс. Хожих боломжгүй (өмнө үзүүлснээс сул) гар хаагдана.
 * All-in-ий дараа бүх гар ил (TDA).
 */
function revealShowdown(
  state: PokerState,
  live: PokerPlayer[],
  ranks: Map<string, { score: number }>,
): void {
  if (state.allInRunout) {
    for (const p of live) p.showCards = true;
    return;
  }
  const winners = new Set(state.pots.flatMap((pot) => pot.winners));
  const aggressor = live.find((p) => p.id === state.aggressor);
  const order = aggressor
    ? [aggressor, ...orderFrom(state, aggressor.seat, live).filter((p) => p !== aggressor)]
    : orderFrom(state, state.buttonSeat, live);
  let bestShown = -1;
  for (const p of order) {
    const score = ranks.get(p.id)!.score;
    if (bestShown < 0 || score >= bestShown || winners.has(p.id)) {
      p.showCards = true;
      bestShown = Math.max(bestShown, score);
    } else {
      p.handLabel = null; // хаасан гар — нэрийг ч харуулахгүй
    }
  }
}

/** Sit & Go: чипгүй болсон тоглогчдыг хасаж байр тогтооно; нэг үлдвэл дуусгана. */
function concludeIfOver(state: PokerState): void {
  if (state.format === 'cash') {
    for (const p of state.players) {
      if (p.dealt && p.stack === 0) {
        p.sittingOut = true; // дахин суух (rebuy) эсвэл гарахыг хүлээнэ
        state.log.push(`${p.name} чипгүй боллоо.`);
      }
    }
    return;
  }

  const busted = state.players
    .filter((p) => !p.eliminated && p.stack === 0)
    // Нэг гарт хасагдвал гар эхлэхэд их чиптэй байсан нь дээгүүр байр (TDA).
    .sort((a, b) => b.startStack - a.startStack || a.seat - b.seat);
  const alive = state.players.filter((p) => !p.eliminated && p.stack > 0);
  busted.forEach((p, i) => {
    p.eliminated = true;
    p.place = alive.length + 1 + i;
    state.log.push(`${p.name} ${p.place}-р байрт хасагдлаа.`);
  });

  if (alive.length === 1) {
    const w = alive[0];
    w.place = 1;
    state.winnerId = w.id;
    state.phase = 'finished';
    state.handEndsAt = null;
    state.log.push(`🏆 ${w.name} тэмцээнд түрүүллээ!`);
    state.settlement = settle(state);
  }
}

/** Токены тооцоо: байраар шагнал − хураамж. Хураамжгүй бол null. */
function settle(state: PokerState): PokerSettlement[] | null {
  if (state.buyIn <= 0) return null;
  const prizes = payouts(state.entrants, state.buyIn);
  return state.players
    .filter((p) => p.place !== null)
    .map((p) => ({
      playerId: p.id,
      place: p.place!,
      amount: (prizes[p.place! - 1] ?? 0) - state.buyIn,
    }));
}

/**
 * Дараагийн гар. Sit & Go дууссан эсвэл кэшэд тоглогч хүрэлцэхгүй бол
 * юу ч хийхгүй (кэш: 'lobby' руу шилжинэ).
 */
export function nextHand(state: PokerState, rng: () => number = Math.random): void {
  if (state.phase !== 'handEnd') return;
  startHand(state, rng);
}

/**
 * Sit & Go-д бүх ХҮН гарсан (зөвхөн робот үлдсэн) бол тэмцээнийг дуусгана.
 * Гарсан хүмүүс гарсан дарааллаараа доод байруудыг эзэлнэ; роботууд чипээрээ
 * эрэмбэлэгдэнэ. Ялагч нь робот тул түүх/цолд бичигдэхгүй (сервер шийднэ).
 */
export function concludeIfNoHumans(state: PokerState): boolean {
  if (state.format !== 'sng' || (state.phase !== 'playing' && state.phase !== 'handEnd')) return false;
  const humansIn = state.players.some((p) => !p.bot && !p.eliminated && !p.left);
  if (humansIn) return false;
  const alive = state.players
    .filter((p) => !p.eliminated)
    .sort((a, b) => Number(a.left) - Number(b.left) || b.stack + b.total - (a.stack + a.total));
  alive.forEach((p, i) => {
    p.eliminated = i > 0;
    p.place = i + 1;
  });
  state.winnerId = alive[0]?.id ?? null;
  state.phase = 'finished';
  state.toAct = null;
  state.turnEndsAt = null;
  state.handEndsAt = null;
  state.log.push('Бүх хүн гарсан тул тэмцээн зогслоо.');
  state.settlement = settle(state);
  return true;
}

/** Кэш: чипгүй/байхгүй тоглогч буцаж ирэх (big blind хүлээнэ). */
export function sitIn(state: PokerState, id: string): void {
  const p = state.players.find((x) => x.id === id);
  if (!p) return;
  if (state.format === 'cash' && p.stack <= 0) throw new PokerRuleError('Эхлээд чип нэмж суугаарай.');
  if (p.sittingOut && !p.left) {
    p.sittingOut = false;
    p.sitOutHands = 0;
    if (state.format === 'cash') p.waitBB = true;
    state.log.push(`${p.name} буцаж ирлээ.`);
  }
}

/** Кэш: чип нэмэх (зөвхөн гарт оролцоогүй үед). */
export function addChips(state: PokerState, id: string, amount: number): void {
  const p = state.players.find((x) => x.id === id);
  if (!p) throw new PokerRuleError('Тоглогч олдсонгүй.');
  if (state.phase === 'playing' && p.dealt && !p.folded) {
    throw new PokerRuleError('Гарын дунд чип нэмэх боломжгүй.');
  }
  p.stack += Math.floor(amount);
  p.eliminated = false;
  if (p.sittingOut && !p.left) {
    p.sittingOut = false;
    p.sitOutHands = 0;
    p.waitBB = state.handNo > 0;
  }
}

/** Гарт нийт хэдэн чип байгаа (дэлгэцэд). */
export function potTotal(state: PokerState): number {
  return state.players.reduce((s, p) => s + p.total, 0);
}

/** Шалгалт: ширээн дээрх чипийн нийлбэр (тестэд — чип үүсэхгүй/алга болохгүй). */
export function chipsInPlay(state: PokerState): number {
  return state.players.reduce((s, p) => s + p.stack + p.total, 0);
}
