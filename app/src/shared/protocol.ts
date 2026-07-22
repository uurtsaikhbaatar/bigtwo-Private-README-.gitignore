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

export const PROTOCOL_VERSION = 6;

/** Алдааны мэдэгдлийн төрөл: хэрэглэгч бичсэн эсвэл апп өөрөө барьсан. */
export type ReportKind = 'bug' | 'crash';
/** Мэдэгдлийн бичвэрийн дээд урт. */
export const MAX_REPORT_CHARS = 2000;

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
  /** Алдааны мэдэгдэл — гараар бичсэн эсвэл автоматаар баригдсан. */
  | { t: 'report'; kind: ReportKind; text: string; context?: Record<string, unknown> }
  /** Шинэ бүртгэл үүсгэх. */
  | { t: 'register'; username: string; password: string; email: string }
  /** Имэйл рүү ирсэн 6 оронтой кодыг шалгуулах. */
  | { t: 'verifyEmail'; code: string }
  | { t: 'resendCode' }
  /** Токен дуусахад админаас нэмж хүсэх. */
  | { t: 'requestTokens' }
  | { t: 'login'; username: string; password: string }
  /** Нууц үг мартсан — имэйл рүү сэргээх код илгээнэ. */
  | { t: 'forgotPassword'; email: string }
  /** Кодоор баталгаажуулж шинэ нууц үг тавина. */
  | { t: 'resetPassword'; email: string; code: string; password: string }
  /** Хадгалсан token-оор нэвтрэлтээ сэргээх. */
  | { t: 'authResume'; token: string }
  | { t: 'logout'; token: string }
  /** Профайл: статистик ба сүүлийн тоглолтууд. */
  | { t: 'profile' }
  /** Өрөөн доторх өөр тоглогчийн ил мэдээллийг асуух. */
  | { t: 'inspect'; playerId: string }
  /**
   * Одоогийн өрөөнд байгаа бүртгэлтэй тоглогчдыг дараагийн тоглолтод урих.
   * Линк дахин явуулах шаардлагагүй — урилга апп дотор нь харагдана.
   */
  | { t: 'invite' }
  /** Ирсэн урилгуудаа асуух. */
  | { t: 'invites' }
  /** Урилгаас татгалзах. */
  | { t: 'declineInvite'; roomCode: string }
  /** Профайлын зураг тохируулах. null бол авч хаяна. */
  | { t: 'setAvatar'; avatar: string | null }
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
  | { t: 'reported'; id: string }
  /** Нэвтрэлтийн төлөв. account null бол нэвтрээгүй. */
  | { t: 'auth'; account: Account | null; token?: string }
  | { t: 'profile'; stats: PlayerStats; matches: MatchSummary[] }
  /** Өөр тоглогчийн ил мэдээлэл. Бүртгэлгүй бол stats нь null. */
  | { t: 'playerInfo'; info: PlayerInfo }
  /**
   * Цол ахисан — ёслол хийнэ. Чатын мөрөөс ТУСДАА мессеж: текстийг задлан
   * шинжиж эффект асаах нь эмзэг, үг өөрчлөгдөхөд эвдэрнэ.
   */
  | { t: 'celebrate'; promotion: Promotion }
  /** Ирсэн урилгууд. Шинэ урилга ирэхэд ч бүтэн жагсаалт дахин илгээгдэнэ. */
  | { t: 'invites'; list: Invite[] }
  /** Мэдээллийн мессеж (жишээ нь токен хүсэлт хүлээн авсан). */
  | { t: 'notice'; message: string }
  | { t: 'pong' };

// ── Бүртгэл ба түүх ────────────────────────────────────────────────────────

export interface Account {
  id: string;
  username: string;
  email?: string;
  /** Имэйл баталгаажсан эсэх. */
  emailVerified: boolean;
  /** Виртуал токены үлдэгдэл. Бодит мөнгө биш. */
  tokens: number;
  /** Профайлын зураг: emoji эсвэл data: URL. */
  avatar: string | null;
}

/**
 * Өрөөн доторх тоглогчийн ил мэдээлэл — нэр дээр нь дарахад харагдана.
 * Бүртгэлгүй (зочин) тоглогчийн хувьд `tokens` ба `stats` нь null.
 */
export interface PlayerInfo {
  playerId: string;
  name: string;
  /** Бүртгэлтэй хэрэглэгч эсэх. */
  registered: boolean;
  username: string | null;
  tokens: number | null;
  stats: PlayerStats | null;
  /** Энэ тоглолт дахь оноо. */
  score: number;
  eliminated: boolean;
  avatar: string | null;
}

/** Найзаас ирсэн урилга. */
export interface Invite {
  id: string;
  /** Урьсан хүний тоглоом доторх нэр. */
  from: string;
  roomCode: string;
  at: string;
}

/** Цол ахисан тухай мэдээлэл — ёслолын дэлгэцэд хэрэглэнэ. */
export interface Promotion {
  playerId: string;
  name: string;
  /** Шинэ цолны нэр. */
  rank: string;
  badge: string;
  /** Олгогдсон токен. 0 байж болно. */
  reward: number;
}

export interface PlayerStats {
  matches: number;
  wins: number;
  /** Чиптэй тоглолтын хожил — ЗӨВХӨН энэ цолыг тодорхойлно. */
  rankedWins: number;
  /** Хожсон/алдсан чипийн нийлбэр. */
  chips: number;
  dragons: number;
}

export interface MatchSummary {
  id: string;
  roomCode: string;
  rounds: number;
  stake: number;
  dragon: boolean;
  finishedAt: string;
  won: boolean;
  score: number;
  chips: number;
  /** Оролцогчид, ялагчаас эхлэн. */
  players: Array<{ name: string; score: number; won: boolean }>;
}

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
  /** Профайлын зураг: emoji эсвэл data: URL. */
  avatar: string | null;
  /** Чиптэй тоглолтын хожил — цол тодорхойлно. Зочны хувьд null. */
  rankedWins: number | null;
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
  /** Нэг тоглогчийн виртуал чип. 0 бол чипгүй. */
  stake: number;
  /** Тоглолт дууссаны дараах чипийн тооцоо. */
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
      avatar: p.avatar,
      rankedWins: p.rankedWins,
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
