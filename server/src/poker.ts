/**
 * Texas Hold'em-ийн серверийн хэсэг.
 *
 * Big Two-гийн өрөөнөөс ТУСДАА store, session, цохилттой — ингэснээр амьд
 * ажиллаж буй Big Two-гийн кодонд аль болох бага хүрнэ. index.ts нь кодоор нь
 * чиглүүлнэ: Big Two-д байхгүй код → энд.
 *
 * Токен:
 *   • Sit & Go: эхлэхэд хураамж хүрэлцэхийг шалгаж, дуусахад байраар тооцно
 *     (Big Two-гийн stake-тэй ижил зарчим, applySettlement).
 *   • Cash: чип = токен. Суухад барьцаалж (poker_escrow), гар бүрийн дараа
 *     тэнцүүлж, босоход буцаана. Зөвхөн бүртгэлтэй хүн, робот суухгүй.
 */

import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import type { WebSocket } from 'ws';

import { BOT_LEVELS, BOT_THINK_MS, type BotLevel } from '../../app/src/shared/bot';
import { choosePokerAction } from '../../app/src/shared/holdem/bot';
import {
  PokerRuleError,
  type PokerActionKind,
  type PokerState,
  act,
  addChips,
  addPokerPlayer,
  concludeIfNoHumans,
  createPoker,
  nextHand,
  removePokerPlayer,
  sitIn,
  startCash,
  startHand,
  startTournament,
  takeLeavers,
  timeoutAct,
} from '../../app/src/shared/holdem/engine';
import {
  CASH_BLIND_CHOICES,
  CASH_MAX_BUYIN_BB,
  CASH_MIN_BUYIN_BB,
  POKER_MAX_SEATS,
  POKER_TURN_SECONDS_CHOICES,
  type PokerFormat,
  SNG_BUYIN_CHOICES,
} from '../../app/src/shared/holdem/structure';
import { pokerViewFor } from '../../app/src/shared/holdem/view';
import { promoted, rewardBetween } from '../../app/src/shared/ranks';
import type { Account, ClientMessage, ServerMessage } from '../../app/src/shared/protocol';
import { dbEnabled, deleteRoomStates, saveRoomState } from './db';
import { recordPokerHand, recordPokerMatch, statsForUser } from './history';
import { dropInvite, inviteUsers } from './invites';
import { saveReport } from './reports';
import {
  TokenError,
  applySettlement,
  awardTokens,
  balanceOf,
  balancesOf,
  escrowBuyIn,
  escrowCashOut,
  escrowOf,
  refundOrphanEscrow,
  syncEscrow,
} from './tokens';

/** Хэрэглэгчид харуулах алдаа (index.ts-ийн RuleError-тэй адил хандана). */
export class PokerError extends Error {}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_CHAT = 30;
const MAX_SPECTATORS = 10;
/** Sit out тоглогчийн ээлж ирэхэд автоматаар үйлдэх хүртэлх зай. */
const SIT_OUT_ACT_MS = 1_000;
/** Хэн ч онлайнгүй өрөөг устгах хугацаа. */
const ROOM_TTL_MS = 60 * 60 * 1000;
const EMPTY_ROOM_TTL_MS = 3 * 60 * 1000;
const isTest = () => Boolean(process.env.TEST_MODE);

/** Криптограф санамсаргүй тоо — хөзөр холиход (Math.random биш). */
const secureRng = () => randomInt(0, 2 ** 32) / 2 ** 32;

interface PkSeat {
  playerId: string;
  token: string;
  socket: WebSocket | null;
  userId: string | null;
  bot: BotLevel | null;
}

export interface PkRoom {
  code: string;
  state: PokerState;
  hostId: string;
  seats: Map<string, PkSeat>;
  chat: ServerMessage[];
  spectators: Set<WebSocket>;
  lastActivity: number;
  botMove: { seq: number; at: number } | null;
  /** Санд бичсэн сүүлийн гарын дугаар. */
  handsLogged: number;
  matchRecorded: boolean;
  lastPlayers: string[];
  /** Cash: эзэн ширээг эхлүүлсэн (тоглогч хүрэлцэхэд гар автоматаар эхэлнэ). */
  cashRunning: boolean;
  /** Барьцааны DB үйлдлүүдийг дарааллаар нь гүйцэтгэнэ (sync → cash out). */
  dbChain: Promise<unknown>;
  /** Sit & Go дууссан ч токены тооцоо хараахан бичигдээгүй — Buy-in түгжээтэй хэвээр. */
  settling?: boolean;
}

export interface PokerDeps {
  send(socket: WebSocket, msg: ServerMessage): void;
  accountOf(socket: WebSocket): Account | undefined;
  setAccount(socket: WebSocket, account: Account): void;
  cleanName(raw: unknown): string;
  sendError(socket: WebSocket, err: unknown): void;
  pushInvites(userId: string): Promise<void>;
  /** Энэ кодтой Big Two өрөө байгаа эсэх (код давхардахаас сэргийлнэ). */
  bigTwoHas(code: string): boolean;
  /** Сокет Big Two-д суудалтай бол аюулгүй үед чөлөөлнө, тоглолтын дунд бол алдаа. */
  leaveBigTwo(socket: WebSocket): void;
  botName(taken: string[], level: BotLevel): string;
}

export class PokerServer {
  private rooms = new Map<string, PkRoom>();
  private sessions = new WeakMap<WebSocket, { room: PkRoom; playerId: string }>();
  private watchers = new Map<WebSocket, { room: PkRoom; name: string }>();
  private dirty = new Set<string>();

  constructor(private deps: PokerDeps) {
    setInterval(() => this.flush(), 8000).unref();
    setInterval(() => this.tick(), 500).unref();
    setInterval(() => this.sweep(), 5 * 60 * 1000).unref();
  }

  // ── Нийтийн API (index.ts) ───────────────────────────────────────────────

  has(code: string): boolean {
    return this.rooms.has(code.trim().toUpperCase());
  }

  get(code: string): PkRoom | undefined {
    return this.rooms.get(code.trim().toUpperCase());
  }

  /** Сокет покерын ширээнд суудалтай эсвэл үзэж байгаа эсэх. */
  owns(socket: WebSocket): boolean {
    return this.sessions.has(socket) || this.watchers.has(socket);
  }

  create(socket: WebSocket, name: string, format: PokerFormat): void {
    const room: PkRoom = {
      code: this.uniqueCode(),
      state: createPoker(format),
      hostId: '',
      seats: new Map(),
      chat: [],
      spectators: new Set(),
      lastActivity: Date.now(),
      botMove: null,
      handsLogged: 0,
      matchRecorded: false,
      lastPlayers: [],
      cashRunning: false,
      dbChain: Promise.resolve(),
    };
    if (format === 'cash') {
      room.state.sb = CASH_BLIND_CHOICES[0].sb;
      room.state.bb = CASH_BLIND_CHOICES[0].bb;
    }
    this.rooms.set(room.code, room);
    this.seat(socket, room, name);
    room.hostId = this.sessions.get(socket)!.playerId;
    this.broadcast(room);
  }

  join(socket: WebSocket, code: string, name: string): void {
    const room = this.get(code);
    if (!room) throw new PokerError('Ийм дугаартай өрөө олдсонгүй.');
    this.seat(socket, room, name);
    this.broadcast(room);
  }

  watch(socket: WebSocket, code: string, name: string): void {
    const room = this.get(code);
    if (!room) throw new PokerError('Ийм дугаартай өрөө олдсонгүй.');
    if (room.state.handNo === 0) {
      throw new PokerError('Тоглолт хараахан эхлээгүй байна. Эхэлсэн үед дахин оролдоно уу.');
    }
    if (this.sessions.get(socket)) throw new PokerError('Та тоглогчоор сууж байна.');
    const already = this.watchers.get(socket);
    if (already?.room !== room && room.spectators.size >= MAX_SPECTATORS) {
      throw new PokerError(`Үзэгчийн тоо дүүрсэн (дээд тал нь ${MAX_SPECTATORS}).`);
    }
    room.spectators.add(socket);
    this.watchers.set(socket, { room, name });
    room.lastActivity = Date.now();
    this.deps.send(socket, { t: 'pkState', view: pokerViewFor(room.state, this.meta(room), '', true) });
    for (const line of room.chat) this.deps.send(socket, line);
  }

  resume(socket: WebSocket, code: string, playerId: string, token: string): void {
    const room = this.get(code);
    if (!room) throw new PokerError('Өрөө олдсонгүй — дуусаад устсан байж магадгүй.');
    const seat = room.seats.get(playerId);
    if (!seat || seat.token !== token) throw new PokerError('Суудлаа сэргээж чадсангүй.');
    const old = seat.socket;
    if (old && old !== socket) {
      this.sessions.delete(old);
      old.close();
    }
    seat.socket = socket;
    this.sessions.set(socket, { room, playerId });
    this.markReturned(room, playerId);
    const acct = this.deps.accountOf(socket);
    if (acct) this.linkAccount(socket, acct);
    this.deps.send(socket, { t: 'joined', code: room.code, playerId, token: seat.token });
    for (const line of room.chat) this.deps.send(socket, line);
    this.broadcast(room);
  }

  /** Нэвтэрсний дараа суудлыг бүртгэлтэй холбоно (зураг, цол). */
  linkAccount(socket: WebSocket, account: Account): void {
    const s = this.sessions.get(socket);
    if (!s) return;
    const seat = s.room.seats.get(s.playerId);
    if (!seat) return;
    // Ижил бүртгэлтэй өөр суудал байвал (auth-race) — лоббид л нэгтгэнэ.
    const twin = [...s.room.seats.values()].find(
      (x) => x.playerId !== seat.playerId && x.userId === account.id,
    );
    if (twin && (s.room.state.phase === 'lobby' || s.room.state.phase === 'finished')) {
      if (twin.socket && twin.socket !== socket) {
        this.sessions.delete(twin.socket);
        twin.socket.close();
      }
      twin.socket = socket;
      s.room.seats.delete(seat.playerId);
      removePokerPlayer(s.room.state, seat.playerId);
      if (s.room.hostId === seat.playerId) s.room.hostId = twin.playerId;
      this.sessions.set(socket, { room: s.room, playerId: twin.playerId });
    } else {
      seat.userId = account.id;
    }
    const cur = this.sessions.get(socket)!;
    const p = cur.room.state.players.find((x) => x.id === cur.playerId);
    if (p && account.avatar) p.avatar = account.avatar;
    if (dbEnabled()) void this.refreshWins(cur.room).catch(() => undefined);
    this.broadcast(cur.room);
  }

  setAvatar(socket: WebSocket, avatar: string | null): void {
    const s = this.sessions.get(socket);
    if (!s) return;
    const p = s.room.state.players.find((x) => x.id === s.playerId);
    if (p) p.avatar = avatar;
    this.broadcast(s.room);
  }

  /** Big Two-д суухаас өмнө: покерын суудлыг аюулгүй бол чөлөөлнө, эс бөгөөс алдаа. */
  detach(socket: WebSocket): void {
    const w = this.watchers.get(socket);
    if (w) {
      w.room.spectators.delete(socket);
      this.watchers.delete(socket);
    }
    const s = this.sessions.get(socket);
    if (!s) return;
    if (!this.safeToLeave(s.room, s.playerId)) {
      throw new PokerError('Та покерын ширээнд тоглож байна. Эхлээд "Гарах" дарж гараарай.');
    }
    this.leave(socket);
  }

  onClose(socket: WebSocket): void {
    const w = this.watchers.get(socket);
    if (w) {
      w.room.spectators.delete(socket);
      this.watchers.delete(socket);
      w.room.lastActivity = Date.now();
    }
    const s = this.sessions.get(socket);
    if (!s) return;
    const seat = s.room.seats.get(s.playerId);
    if (seat && seat.socket === socket) seat.socket = null;
    this.sessions.delete(socket);
    s.room.lastActivity = Date.now();
    this.broadcast(s.room);
  }

  /** Өрөөний түвшний мессеж. Энэ сокет покерт хамааралгүй бол false. */
  handle(socket: WebSocket, msg: ClientMessage): boolean {
    const watcher = this.watchers.get(socket);
    if (watcher && !this.sessions.get(socket)) {
      if (msg.t === 'chat') {
        const text = String(msg.text ?? '').trim().slice(0, 200);
        if (text) this.pushChat(watcher.room, { t: 'chat', from: `${watcher.name} 👁`, text, at: Date.now() });
        return true;
      }
      if (msg.t === 'leave') {
        watcher.room.spectators.delete(socket);
        this.watchers.delete(socket);
        return true;
      }
      return false;
    }
    const s = this.sessions.get(socket);
    if (!s) return false;
    const { room, playerId } = s;
    room.lastActivity = Date.now();
    const isHost = playerId === room.hostId;
    const st = room.state;

    switch (msg.t) {
      case 'pkStart':
      case 'start': {
        if (!isHost) throw new PokerError('Зөвхөн өрөөний эзэн эхлүүлж чадна.');
        const turnSeconds = (POKER_TURN_SECONDS_CHOICES as readonly number[]).includes(
          Number((msg as { turnSeconds?: number }).turnSeconds),
        )
          ? Number((msg as { turnSeconds?: number }).turnSeconds)
          : st.turnSeconds;
        if (st.format === 'sng') {
          const buyIn = Number((msg as { buyIn?: number }).buyIn ?? 0);
          if (!(SNG_BUYIN_CHOICES as readonly number[]).includes(buyIn)) {
            throw new PokerError('Buy-in буруу байна.');
          }
          const begin = () => {
            startTournament(st, { buyIn, turnSeconds }, secureRng);
            room.matchRecorded = false;
            room.handsLogged = 0;
            this.broadcast(room);
          };
          if (buyIn > 0 && dbEnabled()) {
            void this.ensureTokens(room, buyIn)
              .then(begin)
              .catch((err) => this.deps.sendError(socket, err));
          } else begin();
        } else {
          st.turnSeconds = turnSeconds;
          startCash(st, { sb: st.sb, bb: st.bb, turnSeconds }, secureRng);
          room.cashRunning = true;
          this.broadcast(room);
        }
        return true;
      }

      case 'pkBlinds': {
        if (!isHost) throw new PokerError('Зөвхөн өрөөний эзэн Blind тогтооно.');
        if (st.format !== 'cash') throw new PokerError('Энэ нь Cash ширээ биш.');
        if (st.handNo > 0) throw new PokerError('Тоглолт эхэлсний дараа Blind өөрчлөх боломжгүй.');
        const choice = CASH_BLIND_CHOICES.find((c) => c.sb === Number(msg.sb) && c.bb === Number(msg.bb));
        if (!choice) throw new PokerError('Blind буруу байна.');
        st.sb = choice.sb;
        st.bb = choice.bb;
        this.broadcast(room);
        return true;
      }

      case 'pkAct': {
        const kinds: PokerActionKind[] = ['fold', 'check', 'call', 'bet', 'raise', 'allin'];
        if (!kinds.includes(msg.kind)) throw new PokerError('Танихгүй үйлдэл.');
        act(st, playerId, { kind: msg.kind, amount: Number(msg.amount) });
        room.botMove = null;
        this.broadcast(room);
        return true;
      }

      case 'pkSitIn': {
        sitIn(st, playerId);
        this.broadcast(room);
        return true;
      }

      case 'pkBuyIn': {
        if (st.format !== 'cash') throw new PokerError('Buy-in зөвхөн Cash ширээнд.');
        const seat = room.seats.get(playerId)!;
        if (!seat.userId || !dbEnabled()) {
          throw new PokerError('Токеноор чип авахын тулд бүртгүүлж нэвтэрнэ үү.');
        }
        const me = st.players.find((p) => p.id === playerId)!;
        const amount = Math.floor(Number(msg.amount));
        const min = st.bb * CASH_MIN_BUYIN_BB;
        const max = st.bb * CASH_MAX_BUYIN_BB;
        if (!Number.isFinite(amount) || amount <= 0) throw new PokerError('Хэмжээ буруу байна.');
        if (me.stack === 0 && amount < min) throw new PokerError(`Хамгийн бага Buy-in ${fmt(min)}.`);
        if (me.stack + amount > max) throw new PokerError(`Ширээн дээрх чип ${fmt(max)}-аас хэтрэхгүй.`);
        if (st.phase === 'playing' && me.dealt && !me.folded) {
          throw new PokerError('Гарын дунд чип нэмэх боломжгүй.');
        }
        const userId = seat.userId;
        room.dbChain = room.dbChain
          .then(() => escrowBuyIn(room.code, userId, amount))
          .then(async () => {
            addChips(st, playerId, amount);
            this.broadcast(room);
            await this.refreshAccount(socket, userId);
          })
          .catch((err) => this.deps.sendError(socket, err));
        return true;
      }

      case 'addBot': {
        if (!isHost) throw new PokerError('Зөвхөн өрөөний эзэн робот нэмж чадна.');
        if (st.format === 'cash') throw new PokerError('Cash ширээнд робот суухгүй (токен үүсгэхээс сэргийлнэ).');
        if (st.phase !== 'lobby' && st.phase !== 'finished') throw new PokerError('Тэмцээн явагдаж байна.');
        if (room.seats.size >= POKER_MAX_SEATS) throw new PokerError('Ширээ дүүрсэн.');
        const level = (BOT_LEVELS as readonly string[]).includes(String(msg.level))
          ? (msg.level as BotLevel)
          : 'medium';
        const seat = newSeat();
        seat.bot = level;
        room.seats.set(seat.playerId, seat);
        const name = this.deps.botName(st.players.map((p) => p.name), level);
        addPokerPlayer(st, seat.playerId, name).bot = level;
        this.broadcast(room);
        return true;
      }

      case 'removeBot': {
        if (!isHost) throw new PokerError('Зөвхөн өрөөний эзэн робот хасаж чадна.');
        if (st.phase !== 'lobby' && st.phase !== 'finished') throw new PokerError('Тэмцээн явагдаж байна.');
        const target = room.seats.get(String(msg.playerId ?? ''));
        if (!target?.bot) throw new PokerError('Тэр робот олдсонгүй.');
        room.seats.delete(target.playerId);
        removePokerPlayer(st, target.playerId);
        this.broadcast(room);
        return true;
      }

      case 'chat': {
        const text = String(msg.text ?? '').trim().slice(0, 200);
        if (!text) return true;
        const from = st.players.find((p) => p.id === playerId)?.name ?? '?';
        this.pushChat(room, { t: 'chat', from, text, at: Date.now() });
        return true;
      }

      case 'voice': {
        const data = String(msg.data ?? '');
        if (!data.startsWith('data:audio/') || data.length > 400_000) {
          throw new PokerError('Дуут мессеж танигдсангүй.');
        }
        const from = st.players.find((p) => p.id === playerId)?.name ?? '?';
        this.raw(room, { t: 'voice', from, data, ms: Math.min(30_000, Math.max(0, Number(msg.ms) || 0)), at: Date.now() });
        return true;
      }

      case 'report': {
        const text = String(msg.text ?? '').trim().slice(0, 2000);
        if (!text) throw new PokerError('Мэдэгдэл хоосон байна.');
        void saveReport({
          kind: msg.kind === 'crash' ? 'crash' : 'bug',
          text,
          code: room.code,
          playerName: st.players.find((p) => p.id === playerId)?.name ?? null,
          context: {
            ...(typeof msg.context === 'object' && msg.context ? msg.context : {}),
            game: 'holdem',
            format: st.format,
            phase: st.phase,
            hand: st.handNo,
            serverLog: st.log.slice(-8),
          },
        })
          .then((saved) => this.deps.send(socket, { t: 'reported', id: saved.id }))
          .catch((err) => console.error('мэдэгдэл хадгалж чадсангүй:', err));
        return true;
      }

      case 'inspect': {
        const target = st.players.find((p) => p.id === msg.playerId);
        if (!target) throw new PokerError('Тоглогч олдсонгүй.');
        const seat = room.seats.get(target.id);
        const base = {
          playerId: target.id,
          name: target.name,
          score: target.stack,
          eliminated: target.eliminated,
          avatar: target.avatar,
        };
        if (!seat?.userId || !dbEnabled()) {
          this.deps.send(socket, {
            t: 'playerInfo',
            info: { ...base, registered: false, username: null, tokens: null, stats: null },
          });
          return true;
        }
        const uid = seat.userId;
        void Promise.all([statsForUser(uid, 'holdem'), balanceOf(uid)])
          .then(([stats, tokens]) =>
            this.deps.send(socket, {
              t: 'playerInfo',
              info: { ...base, registered: true, username: target.name, tokens, stats },
            }),
          )
          .catch(() => this.deps.send(socket, { t: 'error', message: 'Тоглогчийн мэдээлэл уншиж чадсангүй.' }));
        return true;
      }

      case 'invite': {
        if (!dbEnabled()) throw new PokerError('Бүртгэлийн үйлчилгээ идэвхгүй байна.');
        const me = st.players.find((p) => p.id === playerId);
        const myUserId = room.seats.get(playerId)?.userId ?? null;
        const targets = [
          ...new Set([
            ...[...room.seats.values()].filter((x) => x.userId).map((x) => x.userId!),
            ...room.lastPlayers,
          ]),
        ].filter((u) => u !== myUserId);
        if (targets.length === 0) {
          throw new PokerError('Урих бүртгэлтэй тоглогч алга. Зочноор тоглосон хүнд урилга илгээх боломжгүй.');
        }
        void inviteUsers(targets, me?.name ?? 'Найз', room.code)
          .then(async (invited) => {
            for (const u of invited) await this.deps.pushInvites(u);
            this.deps.send(socket, { t: 'notice', message: `${invited.length} тоглогчид урилга илгээлээ.` });
          })
          .catch(() => this.deps.send(socket, { t: 'error', message: 'Урилга илгээж чадсангүй.' }));
        return true;
      }

      case 'leave': {
        this.leave(socket);
        return true;
      }

      case 'next':
      case 'play':
      case 'pass':
      case 'pickDraw':
        throw new PokerError('Энэ үйлдэл покерын ширээнд хамаарахгүй.');

      default:
        return false; // бүртгэл, профайл г.м. — index.ts боловсруулна
    }
  }

  // ── Админ ────────────────────────────────────────────────────────────────

  liveRooms(): unknown[] {
    const now = Date.now();
    return [...this.rooms.values()].map((room) => {
      const seats = [...room.seats.values()];
      return {
        code: room.code,
        game: 'holdem',
        format: room.state.format,
        phase: room.state.phase,
        round: room.state.handNo,
        stake: room.state.format === 'sng' ? room.state.buyIn : room.state.bb,
        online: seats.filter((s) => s.socket !== null).length,
        players: room.state.players.map((p) => ({
          name: p.name,
          connected: room.seats.get(p.id)?.socket != null,
          registered: Boolean(room.seats.get(p.id)?.userId),
          score: p.stack,
          eliminated: p.eliminated,
        })),
        idleSeconds: Math.round((now - room.lastActivity) / 1000),
      };
    });
  }

  /** Бүх покерын өрөөнд зарлал. Хүрсэн хүний тоог буцаана. */
  announce(line: ServerMessage): number {
    let reached = 0;
    for (const room of this.rooms.values()) {
      this.pushChat(room, line);
      reached += [...room.seats.values()].filter((s) => s.socket !== null).length;
    }
    return reached;
  }

  get size(): number {
    return this.rooms.size;
  }

  /**
   * Явж буй Sit & Go-д түгжигдсэн Buy-in (чип шилжүүлгээр тооцооноос зугтахаас
   * сэргийлнэ — Big Two-гийн lockedStake-тэй ижил). Cash-ийн чип аль хэдийн
   * барьцаанд (users.tokens-оос хасагдсан) тул энд орохгүй.
   */
  lockedStake(userId: string): number {
    let locked = 0;
    for (const room of this.rooms.values()) {
      const st = room.state;
      if (st.format !== 'sng' || st.buyIn <= 0) continue;
      const running = st.phase === 'playing' || st.phase === 'handEnd' || (st.phase === 'finished' && room.settling);
      if (!running) continue;
      for (const seat of room.seats.values()) if (seat.userId === userId) locked += st.buyIn;
    }
    return locked;
  }

  /**
   * Покерын ширээн дээрх тоглогчийн бүртгэл (чип шилжүүлэхэд).
   * undefined = энэ сокет/тоглогч покерт хамаарахгүй; null = зочин/робот.
   */
  seatUserId(socket: WebSocket, playerId: string): string | null | undefined {
    const s = this.sessions.get(socket);
    if (!s) return undefined;
    const seat = s.room.seats.get(playerId);
    return seat ? seat.userId : undefined;
  }

  // ── Хадгалалт ────────────────────────────────────────────────────────────

  serialize(room: PkRoom): unknown {
    return {
      kind: 'poker',
      code: room.code,
      state: room.state,
      hostId: room.hostId,
      seats: [...room.seats.values()].map((s) => ({
        playerId: s.playerId,
        token: s.token,
        userId: s.userId,
        bot: s.bot,
      })),
      chat: room.chat,
      lastActivity: room.lastActivity,
      handsLogged: room.handsLogged,
      matchRecorded: room.matchRecorded,
      lastPlayers: room.lastPlayers,
      cashRunning: room.cashRunning,
    };
  }

  restore(data: any): void {
    const seats = new Map<string, PkSeat>();
    for (const s of data.seats ?? []) {
      seats.set(s.playerId, { playerId: s.playerId, token: s.token, socket: null, userId: s.userId ?? null, bot: s.bot ?? null });
    }
    const state = data.state as PokerState;
    // Хугацаа серверийн унтарсан хугацаанд өнгөрсөн — шинэ ээлж олгоно.
    if (state.turnEndsAt !== null) state.turnEndsAt = Date.now() + state.turnSeconds * 1000;
    if (state.handEndsAt !== null) state.handEndsAt = Date.now() + 3000;
    this.rooms.set(data.code, {
      code: data.code,
      state,
      hostId: data.hostId ?? '',
      seats,
      chat: data.chat ?? [],
      spectators: new Set(),
      lastActivity: data.lastActivity ?? Date.now(),
      botMove: null,
      handsLogged: data.handsLogged ?? state.handNo,
      matchRecorded: data.matchRecorded ?? false,
      lastPlayers: data.lastPlayers ?? [],
      cashRunning: data.cashRunning ?? false,
      dbChain: Promise.resolve(),
    });
  }

  /**
   * Сэргээсний дараа: Cash ширээний чипийг барьцаанаас (эх үнэн) авч, гарын дунд
   * байсан гарыг хүчингүй болгоно (misdeal). Өрөөгүй болсон барьцааг буцаана.
   */
  async afterRestore(): Promise<void> {
    if (!dbEnabled()) return;
    for (const room of this.rooms.values()) {
      if (room.state.format !== 'cash') continue;
      const escrow = await escrowOf(room.code);
      const st = room.state;
      for (const p of st.players) {
        const uid = room.seats.get(p.id)?.userId;
        p.stack = uid ? (escrow.get(uid) ?? 0) : 0;
        Object.assign(p, { total: 0, street: 0, folded: false, allIn: false, dealt: false, hole: [], actedAt: null });
        if (p.stack === 0) p.sittingOut = true;
      }
      if (st.phase === 'playing' || st.phase === 'handEnd') {
        st.log.push('Сервер дахин асав — дууссангүй гар хүчингүй болж, чип буцлаа.');
        st.phase = 'lobby';
        st.toAct = null;
        st.turnEndsAt = null;
        st.handEndsAt = null;
        st.board = [];
        st.pots = [];
      }
    }
    const live = [...this.rooms.values()].filter((r) => r.state.format === 'cash').map((r) => r.code);
    const n = await refundOrphanEscrow(live);
    if (n) console.log(`✓ ${n} барьцааг эзэнд нь буцаав.`);
  }

  private flush(): void {
    if (!dbEnabled() || this.dirty.size === 0) return;
    const codes = [...this.dirty];
    this.dirty.clear();
    for (const code of codes) {
      const room = this.rooms.get(code);
      if (room) void saveRoomState(code, this.serialize(room)).catch((e) => console.error('покер хадгалах:', e));
    }
  }

  // ── Дотоод ──────────────────────────────────────────────────────────────

  private seat(socket: WebSocket, room: PkRoom, rawName: string): void {
    const name = this.deps.cleanName(rawName);
    // Нэг сокет = нэг суудал (Big Two ба покер нийлээд).
    const prior = this.sessions.get(socket);
    if (prior) {
      if (prior.room === room) {
        const seat = room.seats.get(prior.playerId)!;
        this.deps.send(socket, { t: 'joined', code: room.code, playerId: seat.playerId, token: seat.token });
        return;
      }
      if (!this.safeToLeave(prior.room, prior.playerId)) {
        throw new PokerError('Та тоглолтын дунд байна. Өөр өрөөнд орохын тулд эхлээд "Гарах" дарж гараарай.');
      }
      this.leave(socket);
    }
    this.deps.leaveBigTwo(socket);
    const w = this.watchers.get(socket);
    if (w) {
      w.room.spectators.delete(socket);
      this.watchers.delete(socket);
    }

    const account = this.deps.accountOf(socket);
    const reattach = (seat: PkSeat) => {
      const old = seat.socket;
      if (old && old !== socket) {
        this.sessions.delete(old);
        old.close();
      }
      seat.socket = socket;
      this.sessions.set(socket, { room, playerId: seat.playerId });
      this.markReturned(room, seat.playerId);
      room.lastActivity = Date.now();
      if (account && dbEnabled()) void dropInvite(account.id, room.code).then(() => this.deps.pushInvites(account.id)).catch(() => undefined);
      this.deps.send(socket, { t: 'joined', code: room.code, playerId: seat.playerId, token: seat.token });
      for (const line of room.chat) this.deps.send(socket, line);
    };

    if (account) {
      const existing = [...room.seats.values()].find((s) => s.userId === account.id);
      if (existing) return reattach(existing);
    } else {
      const orphan = [...room.seats.values()].find((s) => {
        if (s.userId || s.bot || s.socket !== null) return false;
        return room.state.players.find((p) => p.id === s.playerId)?.name === name;
      });
      if (orphan) return reattach(orphan);
    }

    const st = room.state;
    if (st.format === 'sng' && st.phase !== 'lobby' && st.phase !== 'finished') {
      throw new PokerError('Тэмцээн явагдаж байна. Дуусахыг хүлээнэ үү (үзэгчээр харж болно).');
    }
    if (room.seats.size >= POKER_MAX_SEATS) throw new PokerError(`Ширээ дүүрсэн (дээд тал нь ${POKER_MAX_SEATS}).`);
    const seat = newSeat();
    seat.socket = socket;
    seat.userId = account?.id ?? null;
    room.seats.set(seat.playerId, seat);
    const p = addPokerPlayer(st, seat.playerId, name, 0);
    if (st.format === 'cash') p.sittingOut = true; // Buy-in хийтэл
    if (account?.avatar) p.avatar = account.avatar;
    if (account && dbEnabled()) {
      void dropInvite(account.id, room.code).then(() => this.deps.pushInvites(account.id)).catch(() => undefined);
      void this.refreshWins(room).catch(() => undefined);
    }
    this.sessions.set(socket, { room, playerId: seat.playerId });
    room.lastActivity = Date.now();
    this.deps.send(socket, { t: 'joined', code: room.code, playerId: seat.playerId, token: seat.token });
    for (const line of room.chat) this.deps.send(socket, line);
  }

  /** Гарахад аюулгүй эсэх: Sit & Go-гийн дунд эсвэл Cash-ийн гарт оролцож байвал үгүй. */
  private safeToLeave(room: PkRoom, playerId: string): boolean {
    const st = room.state;
    if (st.phase === 'lobby' || st.phase === 'finished') return true;
    const p = st.players.find((x) => x.id === playerId);
    if (!p) return true;
    if (st.format === 'sng') return p.eliminated;
    return !(st.phase === 'playing' && p.dealt && !p.folded);
  }

  private leave(socket: WebSocket): void {
    const s = this.sessions.get(socket);
    if (!s) return;
    const { room, playerId } = s;
    this.sessions.delete(socket);
    const seat = room.seats.get(playerId);
    const st = room.state;
    const removed = removePokerPlayer(st, playerId);
    if (removed) {
      room.seats.delete(playerId);
      if (st.format === 'cash' && seat?.userId) this.cashOut(room, seat.userId, socket);
    } else if (seat) {
      seat.socket = null;
      if (st.format === 'sng' && concludeIfNoHumans(st)) {
        // Бүх хүн гарсан — тэмцээн дуусав (broadcast бүртгэнэ).
      }
    }
    if (room.hostId === playerId) {
      const next = st.players.find((p) => !p.bot && !p.left && room.seats.get(p.id)?.socket);
      room.hostId = next?.id ?? st.players.find((p) => !p.bot)?.id ?? '';
    }
    room.lastActivity = Date.now();
    this.broadcast(room);
  }

  private markReturned(room: PkRoom, playerId: string): void {
    const p = room.state.players.find((x) => x.id === playerId);
    if (!p) return;
    if (p.left || p.sittingOut) {
      const wasLeft = p.left;
      p.left = false;
      if (room.state.format === 'sng') {
        p.sittingOut = false;
      } else if (p.stack > 0) {
        p.sittingOut = false;
        p.sitOutHands = 0;
        if (room.state.handNo > 0 && (wasLeft || !p.dealt)) p.waitBB = true;
      }
      if (wasLeft) room.state.log.push(`${p.name} буцаж ирлээ.`);
    }
  }

  private cashOut(room: PkRoom, userId: string, socket: WebSocket | null): void {
    if (!dbEnabled()) return;
    room.dbChain = room.dbChain
      .then(() => escrowCashOut(room.code, userId))
      .then(async (amount) => {
        if (socket) await this.refreshAccount(socket, userId);
        if (amount > 0) console.log(`покер ${room.code}: ${amount} токен буцаав`);
      })
      .catch((err) => console.error('барьцаа буцаах:', err));
  }

  private async refreshAccount(socket: WebSocket, userId: string): Promise<void> {
    const account = this.deps.accountOf(socket);
    if (!account || account.id !== userId) return;
    const updated = { ...account, tokens: await balanceOf(userId) };
    this.deps.setAccount(socket, updated);
    this.deps.send(socket, { t: 'auth', account: updated });
  }

  private async ensureTokens(room: PkRoom, buyIn: number): Promise<void> {
    const seats = [...room.seats.values()].filter((s) => s.userId);
    const balances = await balancesOf(seats.map((s) => s.userId!));
    const short = seats
      .filter((s) => (balances.get(s.userId!) ?? 0) < buyIn)
      .map((s) => room.state.players.find((p) => p.id === s.playerId)?.name ?? '?');
    if (short.length) {
      throw new PokerError(`${short.join(', ')}-д ${fmt(buyIn)} токен хүрэлцэхгүй байна. Бага Buy-in сонгоно уу.`);
    }
  }

  private meta(room: PkRoom) {
    const connected = new Set<string>();
    for (const s of room.seats.values()) if (s.socket || s.bot) connected.add(s.playerId);
    return { code: room.code, hostId: room.hostId, connected };
  }

  private broadcast(room: PkRoom): void {
    this.afterChange(room);
    if (dbEnabled()) this.dirty.add(room.code);
    const meta = this.meta(room);
    for (const s of room.seats.values()) {
      if (s.socket && s.socket.readyState === s.socket.OPEN) {
        this.deps.send(s.socket, { t: 'pkState', view: pokerViewFor(room.state, meta, s.playerId) });
      }
    }
    if (room.spectators.size) {
      const view = pokerViewFor(room.state, meta, '', true);
      for (const ws of room.spectators) if (ws.readyState === ws.OPEN) this.deps.send(ws, { t: 'pkState', view });
    }
  }

  private raw(room: PkRoom, msg: ServerMessage): void {
    for (const s of room.seats.values()) {
      if (s.socket && s.socket.readyState === s.socket.OPEN) this.deps.send(s.socket, msg);
    }
    for (const ws of room.spectators) if (ws.readyState === ws.OPEN) this.deps.send(ws, msg);
  }

  private pushChat(room: PkRoom, line: ServerMessage): void {
    room.chat.push(line);
    if (room.chat.length > MAX_CHAT) room.chat.shift();
    room.lastActivity = Date.now();
    this.raw(room, line);
  }

  private accountsOf(room: PkRoom): Map<string, string> {
    const m = new Map<string, string>();
    for (const s of room.seats.values()) if (s.userId) m.set(s.playerId, s.userId);
    return m;
  }

  /** Гар/тэмцээн дуусахад: гарын бүртгэл, барьцааны тэнцүүлэлт, тооцоо, цол. */
  private afterChange(room: PkRoom): void {
    const st = room.state;
    if (st.handNo > room.handsLogged && (st.phase === 'handEnd' || st.phase === 'finished')) {
      room.handsLogged = st.handNo;
      if (dbEnabled()) {
        const accounts = this.accountsOf(room);
        void recordPokerHand(st, room.code, accounts, isTest()).catch((e) => console.error('гар бүртгэх:', e));
        if (st.format === 'cash') {
          const stacks = new Map<string, number>();
          for (const p of st.players) {
            const uid = accounts.get(p.id);
            if (uid) stacks.set(uid, p.stack);
          }
          room.dbChain = room.dbChain
            .then(() => syncEscrow(room.code, stacks))
            .catch((e) => console.error('барьцаа тэнцүүлэх:', e));
        }
      }
    }

    if (st.format === 'sng' && st.phase === 'finished' && !room.matchRecorded) {
      room.matchRecorded = true;
      if (!dbEnabled()) return;
      const accounts = this.accountsOf(room);
      room.lastPlayers = [...new Set(accounts.values())];
      void recordPokerMatch(st, room.code, accounts, isTest())
        .then(() => this.refreshWins(room, true))
        .catch((err) => console.error('покерын тоглолт хадгалах:', err));
      const changes = new Map<string, number>();
      for (const e of st.settlement ?? []) {
        const uid = accounts.get(e.playerId);
        if (uid) changes.set(uid, e.amount);
      }
      if (changes.size) {
        room.settling = true;
        void applySettlement(changes)
          .finally(() => {
            room.settling = false;
          })
          .then(async () => {
            for (const s of room.seats.values()) {
              if (s.socket && s.userId) await this.refreshAccount(s.socket, s.userId);
            }
          })
          .catch((err) => console.error('покерын токены тооцоо:', err));
      }
    }
  }

  /** Покерын цолны хожлыг уншиж, ахисан бол зарлаж шагнал олгоно. */
  private async refreshWins(room: PkRoom, announce = false): Promise<void> {
    let changed = false;
    for (const seat of room.seats.values()) {
      if (!seat.userId) continue;
      const p = room.state.players.find((x) => x.id === seat.playerId);
      if (!p) continue;
      const stats = await statsForUser(seat.userId, 'holdem');
      const before = p.rankedWins;
      if (before === stats.rankedWins) continue;
      p.rankedWins = stats.rankedWins;
      changed = true;
      if (!announce || before === null) continue;
      const rank = promoted(before, stats.rankedWins);
      if (!rank) continue;
      const reward = rewardBetween(before, stats.rankedWins);
      this.raw(room, {
        t: 'celebrate',
        promotion: { playerId: p.id, name: p.name, rank: rank.name, badge: rank.badge, reward },
      });
      this.pushChat(room, {
        t: 'chat',
        from: 'Дай Ди',
        text:
          `${rank.badge} ${p.name} — Poker ${rank.name.toUpperCase()} боллоо!` +
          (reward > 0 ? ` Шагнал: ${fmt(reward)} чип.` : ''),
        at: Date.now(),
      });
      if (reward > 0) {
        await awardTokens(seat.userId, reward);
        if (seat.socket) await this.refreshAccount(seat.socket, seat.userId);
      }
    }
    if (changed) this.broadcast(room);
  }

  // ── Цохилт ───────────────────────────────────────────────────────────────

  private tick(): void {
    const now = Date.now();
    for (const room of this.rooms.values()) {
      const st = room.state;
      const online = [...room.seats.values()].some((s) => s.socket !== null);
      if (!online) continue;
      try {
        if (st.phase === 'playing' && st.toAct) {
          this.tickTurn(room, now);
        } else if (st.phase === 'handEnd' && st.handEndsAt !== null && now >= st.handEndsAt) {
          this.betweenHands(room);
          nextHand(st, secureRng);
          this.broadcast(room);
        } else if (st.phase === 'lobby' && st.format === 'cash' && room.cashRunning) {
          this.betweenHands(room);
          const ready = st.players.filter((p) => !p.left && !p.sittingOut && p.stack > 0);
          if (ready.length >= 2) {
            startHand(st, secureRng);
            this.broadcast(room);
          }
        }
      } catch (err) {
        console.error('покерын цохилт:', err);
        st.turnEndsAt = null;
      }
    }
  }

  /** Cash: гарсан/удаан байхгүй тоглогчдыг босгож токеныг нь буцаана. */
  private betweenHands(room: PkRoom): void {
    const gone = takeLeavers(room.state);
    for (const p of gone) {
      const seat = room.seats.get(p.id);
      room.seats.delete(p.id);
      if (room.state.format === 'cash' && seat?.userId) this.cashOut(room, seat.userId, seat.socket);
      if (seat?.socket) {
        this.sessions.delete(seat.socket);
        this.deps.send(seat.socket, {
          t: 'notice',
          message: p.left ? 'Ширээнээс гарлаа. Чип тань токенд буцлаа.' : 'Удаан байхгүй байсан тул ширээнээс босголоо. Чип тань токенд буцлаа.',
        });
      }
    }
    if (gone.length && room.hostId && !room.seats.has(room.hostId)) {
      room.hostId = room.state.players.find((p) => !p.bot)?.id ?? '';
    }
  }

  private tickTurn(room: PkRoom, now: number): void {
    const st = room.state;
    const id = st.toAct!;
    const seat = room.seats.get(id);
    const p = st.players.find((x) => x.id === id);
    if (!p) return;

    if (seat?.bot) {
      if (!room.botMove || room.botMove.seq !== st.turnSeq) {
        const [min, max] = BOT_THINK_MS[seat.bot];
        room.botMove = { seq: st.turnSeq, at: now + min + Math.random() * (max - min) };
        return;
      }
      if (now < room.botMove.at) return;
      room.botMove = null;
      try {
        act(st, id, choosePokerAction(st, id, seat.bot, secureRng));
      } catch (err) {
        if (!(err instanceof PokerRuleError)) console.error('покерын робот:', err);
        timeoutAct(st);
      }
      this.broadcast(room);
      return;
    }

    // Sit out (гарсан эсвэл хугацаа хэтрүүлсэн) — TDA: гар нь автоматаар Check/Fold.
    if (p.sittingOut || p.left) {
      if (!room.botMove || room.botMove.seq !== st.turnSeq) {
        room.botMove = { seq: st.turnSeq, at: now + SIT_OUT_ACT_MS };
        return;
      }
      if (now < room.botMove.at) return;
      room.botMove = null;
      timeoutAct(st);
      this.broadcast(room);
      return;
    }

    if (st.turnEndsAt !== null && st.turnEndsAt <= now) {
      timeoutAct(st);
      this.broadcast(room);
    }
  }

  private sweep(): void {
    const now = Date.now();
    const removed: string[] = [];
    for (const [code, room] of this.rooms) {
      const idle = now - room.lastActivity;
      const anyone = [...room.seats.values()].some((s) => s.socket !== null);
      const humans = [...room.seats.values()].some((s) => !s.bot);
      const expired = !humans ? idle > EMPTY_ROOM_TTL_MS : !anyone && idle > ROOM_TTL_MS;
      if (!expired) continue;
      // Cash: устгахаас өмнө бүх барьцааг буцаана.
      if (room.state.format === 'cash') {
        for (const s of room.seats.values()) if (s.userId) this.cashOut(room, s.userId, null);
      }
      this.rooms.delete(code);
      this.dirty.delete(code);
      removed.push(code);
    }
    if (removed.length && dbEnabled()) void deleteRoomStates(removed).catch(() => undefined);
  }

  private uniqueCode(): string {
    for (let attempt = 0; attempt < 50; attempt++) {
      const bytes = randomBytes(6);
      let code = '';
      for (let i = 0; i < 6; i++) code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
      if (!this.rooms.has(code) && !this.deps.bigTwoHas(code)) return code;
    }
    throw new Error('Өрөөний код үүсгэж чадсангүй.');
  }
}

function newSeat(): PkSeat {
  return {
    playerId: randomUUID(),
    token: randomBytes(16).toString('hex'),
    socket: null,
    userId: null,
    bot: null,
  };
}

function fmt(n: number): string {
  return n.toLocaleString('en-US').replace(/,/g, ' ');
}

export { TokenError };
