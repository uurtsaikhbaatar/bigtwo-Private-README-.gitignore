/**
 * Клиент ↔ сервер хоорондын WebSocket протокол.
 *
 * Сервер бүрэн эрхтэй: клиент зөвхөн санал (үйлдэл) илгээж, хариуд нь
 * өөрт хамаарах харагдацыг (view) хүлээж авна. Бусад тоглогчийн хөзөр
 * хэзээ ч клиент рүү илгээгддэггүй.
 */

import { Card } from './cards';
import { comboLabel } from './combos';
import { GameState, RoundResult } from './game';

export const PROTOCOL_VERSION = 1;

// ── Клиент → сервер ────────────────────────────────────────────────────────

export type ClientMessage =
  | { t: 'create'; name: string }
  | { t: 'join'; name: string; code: string }
  /** Тасарсны дараа өмнөх суудалдаа буцаж орох. */
  | { t: 'resume'; code: string; playerId: string; token: string }
  | { t: 'start' }
  | { t: 'play'; cards: Card[] }
  | { t: 'pass' }
  | { t: 'rematch' }
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
  total: number;
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
  /** Зөвхөн энэ харагдацыг хүлээн авах тоглогчийн хөзөр. */
  yourHand: Card[];
  turnId: string | null;
  current: PlayView | null;
  lastPlay: PlayView | null;
  phase: GameState['phase'];
  round: number;
  results: RoundResult[] | null;
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
      total: state.totals[p.id] ?? 0,
    })),
    yourHand: you ? you.hand.slice() : [],
    turnId: state.phase === 'playing' ? (state.players[state.turn]?.id ?? null) : null,
    current: toPlayView(state.current),
    lastPlay: toPlayView(state.lastPlay),
    phase: state.phase,
    round: state.round,
    results: state.results,
    log: state.log.slice(-12),
  };
}

function toPlayView(play: GameState['current']): PlayView | null {
  if (!play) return null;
  return { playerId: play.playerId, cards: play.combo.cards, label: comboLabel(play.combo) };
}
