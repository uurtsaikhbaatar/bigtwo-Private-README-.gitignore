/**
 * Клиент ↔ сервер хоорондын WebSocket протокол.
 *
 * Сервер бүрэн эрхтэй: клиент зөвхөн санал (үйлдэл) илгээж, хариуд нь
 * өөрт хамаарах харагдацыг (view) хүлээж авна. Бусад тоглогчийн хөзөр
 * хэзээ ч клиент рүү илгээгддэггүй — өнжиж буй үзэгчид ч мөн адил зөвхөн
 * ширээн дээрх хөзрийг харна.
 */

import { Card } from './cards';
import { comboLabel } from './combos';
import { GameState, Phase, RoundRecord, Settlement } from './game';

export const PROTOCOL_VERSION = 3;

/** Дуут мессежийн дээд хэмжээ (base64 тэмдэгт). ~40 секунд Opus багтана. */
export const MAX_VOICE_CHARS = 400_000;
/** Дуут мессежийн дээд урт. */
export const MAX_VOICE_MS = 30_000;

// ── Клиент → сервер ────────────────────────────────────────────────────────

export type ClientMessage =
  | { t: 'create'; name: string }
  | { t: 'join'; name: string; code: string }
  /** Тасарсны дараа өмнөх суудалдаа буцаж орох. */
  | { t: 'resume'; code: string; playerId: string; token: string }
  /** Шинэ тоглолт эхлүүлэх (лобби эсвэл тоглолт дууссаны дараа). */
  | { t: 'start'; targetScore: number; turnSeconds: number; stake: number }
  /** Дараагийн тойргийг эхлүүлэх. */
  | { t: 'next' }
  | { t: 'play'; cards: Card[] }
  | { t: 'pass' }
  | { t: 'chat'; text: string }
  /** Дуут мессеж — base64 data URL. */
  | { t: 'voice'; data: string; ms: number }
  | { t: 'leave' }
  | { t: 'ping' };

// ── Сервер → клиент ────────────────────────────────────────────────────────

export type ServerMessage =
  | { t: 'welcome'; version: number }
  | { t: 'joined'; code: string; playerId: string; token: string }
  | { t: 'state'; view: GameView }
  | { t: 'error'; message: string }
  | { t: 'chat'; from: string; text: string; at: number }
  | { t: 'voice'; from: string; data: string; ms: number; at: number }
  | { t: 'pong' };

// ── Харагдац ───────────────────────────────────────────────────────────────

export interface PlayerView {
  id: string;
  name: string;
  handCount: number;
  passed: boolean;
  place: number | null;
  connected: boolean;
  isHost: boolean;
  /** Хуримтлагдсан оноо. */
  score: number;
  eliminated: boolean;
  /** Энэ тойрогт тоглож байгаа эсэх. */
  seated: boolean;
  /** Суудлын сонголтод сугалсан хөзөр (байвал). */
  draw: Card | null;
}

export interface PlayView {
  playerId: string;
  cards: Card[];
  label: string;
}

export interface GameView {
  code: string;
  youId: string;
  players: PlayerView[];
  /** Энэ тойрогт суусан тоглогчид, ээлжийн дарааллаар. */
  seats: string[];
  /** Зөвхөн энэ харагдацыг хүлээн авах тоглогчийн хөзөр. */
  yourHand: Card[];
  /** Та энэ тойрогт тоглож байгаа эсэх (үгүй бол зөвхөн ажиглана). */
  youAreSeated: boolean;
  turnId: string | null;
  current: PlayView | null;
  lastPlay: PlayView | null;
  phase: Phase;
  round: number;
  targetScore: number;
  /** Нэг тоглогчийн бооцоо (төгрөг). 0 бол бооцоогүй. */
  stake: number;
  /** Тоглолт дууссаны дараах мөнгөн тооцоо. */
  settlement: Settlement[] | null;
  /** Нэг ээлжинд бодох хугацаа (секунд). */
  turnSeconds: number;
  /**
   * Одоогийн ээлж дуусахад үлдсэн хугацаа (ms). Клиент энэ мөчөөс тоолно —
   * ингэснээр цагийн зөрүү нөлөөлөхгүй. Тоглоом идэвхгүй бол null.
   */
  turnRemainingMs: number | null;
  /** Ээлж бүрд нэмэгддэг дугаар — клиент тоолуураа дахин эхлүүлэхэд ашиглана. */
  turnSeq: number;
  /** Тойрог бүрийн оноог агуулсан бүтэн түүх. */
  history: RoundRecord[];
  matchWinnerId: string | null;
  log: string[];
}

export interface RoomMeta {
  code: string;
  hostId: string;
  connected: Set<string>;
}

/** Сервер дээрх бүрэн төлвөөс нэг тоглогчид зориулсан харагдац үүсгэнэ. */
export function viewFor(state: GameState, meta: RoomMeta, youId: string): GameView {
  const you = state.players.find((p) => p.id === youId);
  return {
    code: meta.code,
    youId,
    players: state.players.map((p) => ({
      id: p.id,
      name: p.name,
      handCount: p.hand.length,
      passed: p.passed,
      place: p.place,
      connected: meta.connected.has(p.id),
      isHost: p.id === meta.hostId,
      score: p.score,
      eliminated: p.eliminated,
      seated: p.seated,
      draw: p.draw,
    })),
    seats: state.seats.slice(),
    yourHand: you ? you.hand.slice() : [],
    youAreSeated: you?.seated ?? false,
    turnId: state.phase === 'playing' ? (state.seats[state.turn] ?? null) : null,
    current: toPlayView(state.current),
    lastPlay: toPlayView(state.lastPlay),
    phase: state.phase,
    round: state.round,
    targetScore: state.targetScore,
    stake: state.stake,
    settlement: state.settlement,
    turnSeconds: state.turnSeconds,
    turnRemainingMs:
      state.turnEndsAt === null ? null : Math.max(0, state.turnEndsAt - Date.now()),
    turnSeq: state.turnSeq,
    history: state.history,
    matchWinnerId: state.matchWinnerId,
    log: state.log.slice(-12),
  };
}

function toPlayView(play: GameState['current']): PlayView | null {
  if (!play) return null;
  return { playerId: play.playerId, cards: play.combo.cards, label: comboLabel(play.combo) };
}
