/**
 * Hold'em-ийн харагдац — нэг тоглогчид (эсвэл үзэгчид) зориулсан.
 *
 * Бусдын хөзөр хэзээ ч илгээгдэхгүй: зөвхөн showdown-д ил гарсан (showCards)
 * хөзөр л харагдана. Үзэгч ч мөн адил.
 */

import type { BotLevel } from '../bot';
import type { Card } from '../cards';
import {
  LegalActions,
  PokerPhase,
  PokerSettlement,
  PokerState,
  PotResult,
  Street,
  legalActions,
  potTotal,
} from './engine';
import { bestHand } from './evaluator';
import {
  CASH_MAX_BUYIN_BB,
  CASH_MIN_BUYIN_BB,
  PokerFormat,
  SNG_HANDS_PER_LEVEL,
  payouts,
  sngLevel,
} from './structure';

export interface PokerPlayerView {
  id: string;
  name: string;
  avatar: string | null;
  bot: BotLevel | null;
  /** Покерын цолны хожил (зочинд null). */
  rankedWins: number | null;
  seat: number;
  stack: number;
  /** Энэ шатанд тавьсан чип (ширээн дээр харагдана). */
  bet: number;
  dealt: boolean;
  folded: boolean;
  allIn: boolean;
  sittingOut: boolean;
  waitBB: boolean;
  left: boolean;
  eliminated: boolean;
  place: number | null;
  connected: boolean;
  isHost: boolean;
  isButton: boolean;
  isSB: boolean;
  isBB: boolean;
  lastAction: string | null;
  /** Ил хөзөр: өөрийнх эсвэл showdown-д үзүүлсэн. Бусад үед null. */
  hole: Card[] | null;
  /** Гарт хөзөртэй эсэх (нүүрээ доош харуулахад). */
  hasCards: boolean;
  handLabel: string | null;
  won: number;
}

export interface PokerView {
  kind: 'holdem';
  code: string;
  youId: string;
  spectating: boolean;
  format: PokerFormat;
  phase: PokerPhase;
  players: PokerPlayerView[];
  board: Card[];
  street: Street | null;
  /** Нийт pot (энэ шатны bet-үүдийг оруулаад). */
  pot: number;
  pots: PotResult[];
  toAct: string | null;
  /** Танд хийж болох үйлдлүүд (таны ээлж биш бол null). */
  legal: LegalActions | null;
  currentBet: number;
  sb: number;
  bb: number;
  bbAnte: number;
  handNo: number;
  level: number;
  /** Дараагийн blind level хүртэл үлдсэн гар (Sit & Go). */
  handsToNextLevel: number | null;
  nextLevel: { sb: number; bb: number; bbAnte: number } | null;
  buyIn: number;
  entrants: number;
  /** Байр бүрийн шагнал (токен). */
  prizes: number[];
  turnSeconds: number;
  turnRemainingMs: number | null;
  turnSeq: number;
  handRemainingMs: number | null;
  settlement: PokerSettlement[] | null;
  winnerId: string | null;
  buttonDraw: { playerId: string; card: Card }[] | null;
  /** Таны одоогийн хамгийн сайн гар (flop-оос хойш). */
  yourHand: string | null;
  /** Тэмцэлгүй хожсон бол хөзрөө харуулах (Show/Muck) сонголт — үлдсэн ms. */
  showOfferMs: number | null;
  /** Cash: суух хэмжээний хязгаар (токен). */
  minBuyIn: number;
  maxBuyIn: number;
  log: string[];
}

export interface PokerMeta {
  code: string;
  hostId: string;
  connected: Set<string>;
}

export function pokerViewFor(
  state: PokerState,
  meta: PokerMeta,
  youId: string,
  spectator = false,
): PokerView {
  const you = spectator ? undefined : state.players.find((p) => p.id === youId);
  const now = Date.now();
  const showHole = (id: string, show: boolean, hole: Card[]) =>
    hole.length > 0 && ((!spectator && id === youId) || show) ? hole.slice() : null;

  let yourHand: string | null = null;
  if (you && you.hole.length === 2 && state.board.length >= 3 && !you.folded) {
    yourHand = bestHand([...you.hole, ...state.board]).label;
  }

  const sng = state.format === 'sng';
  const handsToNextLevel =
    sng && state.handNo > 0 ? SNG_HANDS_PER_LEVEL - ((state.handNo - 1) % SNG_HANDS_PER_LEVEL) : null;

  return {
    kind: 'holdem',
    code: meta.code,
    youId: spectator ? '' : youId,
    spectating: spectator,
    format: state.format,
    phase: state.phase,
    players: state.players.map((p) => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      bot: p.bot,
      rankedWins: p.rankedWins,
      seat: p.seat,
      stack: p.stack,
      bet: p.street,
      dealt: p.dealt,
      folded: p.folded,
      allIn: p.allIn,
      sittingOut: p.sittingOut,
      waitBB: p.waitBB,
      left: p.left,
      eliminated: p.eliminated,
      place: p.place,
      connected: meta.connected.has(p.id),
      isHost: p.id === meta.hostId,
      isButton: state.handNo > 0 && p.seat === state.buttonSeat,
      isSB: state.handNo > 0 && p.seat === state.sbSeat && p.dealt,
      isBB: state.handNo > 0 && p.seat === state.bbSeat && p.dealt,
      lastAction: p.lastAction,
      hole: showHole(p.id, p.showCards, p.hole),
      hasCards: p.dealt && !p.folded && p.hole.length > 0,
      handLabel: p.showCards || p.id === youId ? p.handLabel : null,
      won: p.won,
    })),
    board: state.board.slice(),
    street: state.street,
    pot: state.phase === 'playing' ? potTotal(state) : state.pots.reduce((a, x) => a + x.amount, 0),
    pots: state.pots,
    toAct: state.phase === 'playing' ? state.toAct : null,
    legal: you ? legalActions(state, you.id) : null,
    currentBet: state.currentBet,
    sb: state.sb,
    bb: state.bb,
    bbAnte: state.bbAnte,
    handNo: state.handNo,
    level: state.level,
    handsToNextLevel,
    nextLevel: sng ? sngLevel(state.level + 1) : null,
    buyIn: state.buyIn,
    entrants: state.entrants || state.players.length,
    prizes: sng && state.buyIn > 0 ? payouts(state.entrants || state.players.length, state.buyIn) : [],
    turnSeconds: state.turnSeconds,
    turnRemainingMs: state.turnEndsAt === null ? null : Math.max(0, state.turnEndsAt - now),
    turnSeq: state.turnSeq,
    handRemainingMs: state.handEndsAt === null ? null : Math.max(0, state.handEndsAt - now),
    settlement: state.settlement,
    winnerId: state.winnerId,
    buttonDraw: state.buttonDraw,
    yourHand,
    showOfferMs:
      !spectator && state.showOffer && state.showOffer.playerId === youId && state.showOffer.endsAt > now
        ? state.showOffer.endsAt - now
        : null,
    minBuyIn: state.bb * CASH_MIN_BUYIN_BB,
    maxBuyIn: state.bb * CASH_MAX_BUYIN_BB,
    log: state.log.slice(-14),
  };
}
