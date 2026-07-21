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
import { GameState, Phase, RoundRecord } from './game';

export const PROTOCOL_VERSION = 2;

// ── Клиент → сервер ────────────────────────────────────────────────────────

export type ClientMessage =
  | { t: 'create'; name: string }
  | { t: 'join'; name: string; code: string }
  /** Тасарсны дараа өмнөх суудалдаа буцаж орох. */
  | { t: 'resume'; code: string; playerId: string; token: string }
  /** Шинэ тоглолт эхлүүлэх (лобби эсвэл тоглолт дууссаны дараа). */
  | { t: 'start'; targetScore: number }
  /** Дараагийн дугуйг эхлүүлэх. */
  | { t: 'next' }
  | { t: 'play'; cards: Card[] }
  | { t: 'pass' }
  | { t: 'chat'; text: string }
  | { t: 'leave' }
  | { t: 'ping' };

// ── Сервер → клиент ────────────────────────────────────────────────────────

export type ServerMessage =
  | { t: 'welcome'; version: number }
  | { t: 'joined'; code: string; playerId: string; token: string }
  | { t: 'state'; view: GameView }
  | { t: 'error'; message: string }
  | { t: 'chat'; from: string; text: string; at: number }
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
  /** Энэ дугуйд тоглож байгаа эсэх. */
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
  /** Энэ дугуйд суусан тоглогчид, ээлжийн дарааллаар. */
  seats: string[];
  /** Зөвхөн энэ харагдацыг хүлээн авах тоглогчийн хөзөр. */
  yourHand: Card[];
  /** Та энэ дугуйд тоглож байгаа эсэх (үгүй бол зөвхөн ажиглана). */
  youAreSeated: boolean;
  turnId: string | null;
  current: PlayView | null;
  lastPlay: PlayView | null;
  phase: Phase;
  round: number;
  targetScore: number;
  /** Дугуй бүрийн оноог агуулсан бүтэн түүх. */
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
    history: state.history,
    matchWinnerId: state.matchWinnerId,
    log: state.log.slice(-12),
  };
}

function toPlayView(play: GameState['current']): PlayView | null {
  if (!play) return null;
  return { playerId: play.playerId, cards: play.combo.cards, label: comboLabel(play.combo) };
}
