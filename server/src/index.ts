/**
 * Big Two real-time сервер.
 *
 * Клиентүүд WebSocket-оор холбогдож, 6 оронтой өрөөний кодоор нэгддэг.
 * Тоглоомын бүх дүрэм сервер дээр шалгагдана — клиент зөвхөн үйлдэл санал
 * болгож, хариуд нь өөрийн харагдацыг авна.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';

import {
  DEFAULT_TARGET_SCORE,
  DEFAULT_STAKE,
  DEFAULT_TURN_SECONDS,
  MAX_PLAYERS,
  RuleError,
  addPlayer,
  pass,
  play,
  removePlayer,
  startMatch,
  startRound,
  timeoutTurn,
} from '../../app/src/shared/game';
import { isValidAvatar } from '../../app/src/shared/avatar';
import { promoted, rewardBetween } from '../../app/src/shared/ranks';
import type { Account } from '../../app/src/shared/protocol';
import {
  MAX_REPORT_CHARS,
  MAX_VOICE_CHARS,
  MAX_VOICE_MS,
  PROTOCOL_VERSION,
  type ClientMessage,
  type ServerMessage,
  viewFor,
} from '../../app/src/shared/protocol';
import {
  AuthError,
  accountForToken,
  login,
  logout,
  register,
  requestPasswordReset,
  resendCode,
  resetPassword,
  saveAvatar,
  verifyEmail,
} from './auth';
import { dbEnabled, getPool } from './db';
import { dropInvite, inviteUsers, invitesFor, purgeExpiredInvites } from './invites';
import { recentMatches, recordMatch, statsForUser } from './history';
import { readReports, saveReport } from './reports';
import { applySettlement, awardTokens, balanceOf, balancesOf, requestTokens } from './tokens';
import { Room, RoomStore, metaOf, newSeat } from './rooms';
import { serveStatic } from './static';

const PORT = Number(process.env.PORT ?? 8787);
const MAX_NAME_LENGTH = 16;
const MAX_CHAT_LENGTH = 200;
/** Шинээр орсон хүнд үзүүлэх сүүлийн чат мессежийн тоо. */
const CHAT_HISTORY = 30;

const rooms = new RoomStore();

/** Сокет бүрийн одоогийн суудал. */
interface Session {
  room: Room;
  playerId: string;
}
const sessions = new WeakMap<WebSocket, Session>();
/** Сокет бүрийн нэвтэрсэн хэрэглэгч (нэвтрээгүй бол байхгүй). */
const accounts = new WeakMap<WebSocket, Account>();
/**
 * Нэвтэрсэн хэрэглэгч → нээлттэй сокетууд.
 *
 * WeakMap нь урвуу хайлт хийх боломжгүй тул тусад нь хөтөлнө. Урилга ирэхэд
 * хүлээн авагч онлайн эсэхийг мэдэж, тэр дороо мэдэгдэхэд хэрэгтэй.
 */
const online = new Map<string, Set<WebSocket>>();

function markOnline(socket: WebSocket, account: Account): void {
  markOffline(socket);
  accounts.set(socket, account);
  const set = online.get(account.id) ?? new Set<WebSocket>();
  set.add(socket);
  online.set(account.id, set);
}

function markOffline(socket: WebSocket): void {
  const previous = accounts.get(socket);
  if (!previous) return;
  const set = online.get(previous.id);
  if (!set) return;
  set.delete(socket);
  if (set.size === 0) online.delete(previous.id);
}

/**
 * Хүчинтэй урилгууд — өрөө нь одоо ч байгаа эсэхийг шалгана.
 *
 * Өрөө нь устсан урилга харагдвал тоглогч дарж, "Ийм кодтой өрөө олдсонгүй"
 * гэсэн алдаа авна. Тиймээс огт үзүүлэхгүй.
 */
async function liveInvites(userId: string) {
  const all = await invitesFor(userId);
  return all.filter((invite) => rooms.get(invite.roomCode) !== undefined);
}

/** Тухайн хэрэглэгчийн бүх нээлттэй цонхонд урилгуудыг дахин илгээнэ. */
async function pushInvites(userId: string): Promise<void> {
  const sockets = online.get(userId);
  if (!sockets || sockets.size === 0) return;
  const list = await liveInvites(userId);
  for (const socket of sockets) {
    if (socket.readyState === socket.OPEN) send(socket, { t: 'invites', list });
  }
}

/**
 * Эрүүл мэндийн мэдээлэл. Өгөгдлийн сан үнэхээр холбогдож байгааг харуулна —
 * байршуулсны дараа `DATABASE_URL` зөв ирсэн эсэхийг браузераар шалгахад тустай.
 *
 * Render эрүүл мэндийг байнга шалгадаг тул сангийн шалгалтыг кэшлэнэ.
 */
const DB_CHECK_CACHE_MS = 30_000;
let dbCheck = { at: 0, connected: false };

async function health(): Promise<Record<string, unknown>> {
  const base = {
    ok: true,
    rooms: rooms.size,
    uptime: Math.round(process.uptime()),
    protocol: PROTOCOL_VERSION,
  };
  if (!dbEnabled()) return { ...base, database: 'тохируулаагүй' };

  if (Date.now() - dbCheck.at > DB_CHECK_CACHE_MS) {
    dbCheck = { at: Date.now(), connected: await pingDb() };
  }
  return { ...base, database: dbCheck.connected ? 'холбогдсон' : 'холбогдож чадсангүй' };
}

async function pingDb(): Promise<boolean> {
  try {
    await getPool().query('SELECT 1');
    return true;
  } catch (err) {
    console.error('сангийн шалгалт амжилтгүй:', err instanceof Error ? err.message : err);
    return false;
  }
}

/**
 * Алдааг тоглогчид ойлгомжтой хэлбэрээр буцаана.
 *
 * AuthError ба RuleError хоёулаа хэрэглэгчид зориулсан тодорхой мессежтэй
 * тул шууд дамжуулна. Зөвхөн санаанд ороогүй алдааг л ерөнхий үгээр орлуулж,
 * лог руу бичнэ.
 *
 * ӨМНӨ НЬ зөвхөн AuthError-ыг таньдаг байсан тул "токен хүрэлцэхгүй байна"
 * гэсэн тодорхой мессеж "Бүртгэлд алдаа гарлаа" болж хувирч, тоглогч яагаад
 * эхлэхгүй байгааг мэдэхгүй байв.
 */
function sendAuthError(socket: WebSocket, err: unknown): void {
  if (err instanceof AuthError || err instanceof RuleError) {
    return send(socket, { t: 'error', message: err.message });
  }
  console.error('handler error:', err);
  send(socket, { t: 'error', message: 'Алдаа гарлаа. Дахин оролдоно уу.' });
}

function requireDb(): void {
  if (!dbEnabled()) throw new RuleError('Бүртгэлийн үйлчилгээ идэвхгүй байна.');
}

const httpServer = createServer((req, res) => {
  if (req.url === '/health') {
    void health().then((body) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body, null, 2));
    });
    return;
  }
  if (req.url?.startsWith('/reports')) {
    void serveReports(req, res);
    return;
  }
  if (req.url?.startsWith('/admin/rooms')) return serveLiveRooms(req, res);
  if (req.url?.startsWith('/admin/announce')) return serveAnnounce(req, res);
  // Вэб хувилбар бүтээгдсэн бол түүнийг дамжуулна (`npm run build:web`).
  void serveStatic(req, res).then((served) => {
    if (served) return;
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Big Two сервер ажиллаж байна. WebSocket-оор холбогдоно уу.\n');
  });
});

const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (socket) => {
  send(socket, { t: 'welcome', version: PROTOCOL_VERSION });

  socket.on('message', (raw) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return send(socket, { t: 'error', message: 'Мессежийг уншиж чадсангүй.' });
    }
    try {
      handle(socket, msg);
    } catch (err) {
      const message = err instanceof RuleError ? err.message : 'Дотоод алдаа гарлаа.';
      if (!(err instanceof RuleError)) console.error('handler error:', err);
      send(socket, { t: 'error', message });
    }
  });

  socket.on('close', () => {
    markOffline(socket);
    const session = sessions.get(socket);
    if (!session) return;
    const seat = session.room.seats.get(session.playerId);
    if (seat) seat.socket = null;
    session.room.lastActivity = Date.now();

    // Лобби дээр байхад гарсан бол суудлыг чөлөөлнө; тоглоом эхэлсэн бол
    // дахин холбогдох боломжтой байлгахын тулд суудлыг хадгална.
    if (session.room.state.phase === 'lobby') {
      releaseSeat(session.room, session.playerId);
    }
    sessions.delete(socket);
    broadcast(session.room);
  });
});

function handle(socket: WebSocket, msg: ClientMessage): void {
  switch (msg.t) {
    case 'ping':
      return send(socket, { t: 'pong' });

    case 'create': {
      const room = rooms.create();
      seat(socket, room, cleanName(msg.name));
      room.hostId = sessions.get(socket)!.playerId;
      return broadcast(room);
    }

    case 'join': {
      const room = rooms.get(msg.code ?? '');
      if (!room) throw new RuleError('Ийм кодтой өрөө олдсонгүй.');
      // Тоглолт ДУУССАН өрөөнд орохыг зөвшөөрнө: урилгаар ирсэн найз
      // "Тоглоом эхэлсэн байна" гэж хөөгдөх ёсгүй. Явж байгаа тоглолтыг л
      // хамгаална.
      if (room.state.phase !== 'lobby' && room.state.phase !== 'matchEnd') {
        throw new RuleError('Тоглолт явагдаж байна. Дуусахыг хүлээнэ үү.');
      }
      seat(socket, room, cleanName(msg.name));
      return broadcast(room);
    }

    case 'register':
    case 'login': {
      requireDb();
      const started =
        msg.t === 'register'
          ? register(
              String(msg.username ?? ''),
              String(msg.password ?? ''),
              String(msg.email ?? ''),
            )
          : login(String(msg.username ?? ''), String(msg.password ?? ''));
      void started
        .then(({ account, token }) => {
          markOnline(socket, account);
          send(socket, { t: 'auth', account, token });
        })
        .catch((err) => sendAuthError(socket, err));
      return;
    }

    /**
     * Нууц үг мартсан. Хаяг бүртгэлтэй эсэхээс үл хамааран ИЖИЛ хариу
     * буцаана — эс бөгөөс хэн нэгэн хаягуудыг туршиж, аль нь бүртгэлтэйг
     * олж мэдэх боломжтой болно.
     */
    case 'forgotPassword': {
      requireDb();
      void requestPasswordReset(String(msg.email ?? ''))
        .catch((err) => console.error('нууц үг сэргээх:', err))
        .finally(() =>
          send(socket, {
            t: 'notice',
            message: 'Хэрэв тэр хаяг бүртгэлтэй бол сэргээх код илгээгдлээ.',
          }),
        );
      return;
    }

    case 'resetPassword': {
      requireDb();
      void resetPassword(
        String(msg.email ?? ''),
        String(msg.code ?? ''),
        String(msg.password ?? ''),
      )
        .then(({ account, token }) => {
          markOnline(socket, account);
          send(socket, { t: 'auth', account, token });
          send(socket, { t: 'notice', message: 'Нууц үг солигдлоо. Нэвтэрлээ.' });
        })
        .catch((err) => sendAuthError(socket, err));
      return;
    }

    case 'verifyEmail': {
      requireDb();
      const account = accounts.get(socket);
      if (!account) throw new RuleError('Эхлээд нэвтэрнэ үү.');
      void verifyEmail(account.id, String(msg.code ?? ''))
        .then((updated) => {
          markOnline(socket, updated);
          send(socket, { t: 'auth', account: updated });
        })
        .catch((err) => sendAuthError(socket, err));
      return;
    }

    case 'resendCode': {
      requireDb();
      const account = accounts.get(socket);
      if (!account) throw new RuleError('Эхлээд нэвтэрнэ үү.');
      void resendCode(account.id)
        .then(() => send(socket, { t: 'auth', account }))
        .catch((err) => sendAuthError(socket, err));
      return;
    }

    case 'authResume': {
      if (!dbEnabled()) return send(socket, { t: 'auth', account: null });
      void accountForToken(String(msg.token ?? ''))
        .then((account) => {
          if (account) markOnline(socket, account);
          send(socket, { t: 'auth', account });
        })
        .catch(() => send(socket, { t: 'auth', account: null }));
      return;
    }

    case 'logout': {
      const token = String(msg.token ?? '');
      markOffline(socket);
      accounts.delete(socket);
      if (dbEnabled() && token) void logout(token).catch(() => {});
      return send(socket, { t: 'auth', account: null });
    }

    case 'profile': {
      requireDb();
      const account = accounts.get(socket);
      if (!account) throw new RuleError('Эхлээд нэвтэрнэ үү.');
      void Promise.all([statsForUser(account.id), recentMatches(account.id, 10)])
        .then(([stats, matches]) => send(socket, { t: 'profile', stats, matches }))
        .catch((err) => {
          console.error('profile error:', err);
          send(socket, { t: 'error', message: 'Профайл уншиж чадсангүй.' });
        });
      return;
    }

    case 'resume': {
      const room = rooms.get(msg.code ?? '');
      if (!room) throw new RuleError('Өрөө олдсонгүй — дуусаад устсан байж магадгүй.');
      const existing = room.seats.get(msg.playerId);
      if (!existing || existing.token !== msg.token) {
        throw new RuleError('Суудлаа сэргээж чадсангүй.');
      }
      existing.socket?.close();
      existing.socket = socket;
      sessions.set(socket, { room, playerId: existing.playerId });
      send(socket, { t: 'joined', code: room.code, playerId: existing.playerId, token: existing.token });
      sendChatHistory(socket, room);
      return broadcast(room);
    }
  }

  /**
   * Профайлын зураг тохируулах.
   *
   * Өрөөнөөс ГАДУУР ч ажиллана — профайлыг нүүр хуудаснаас нээдэг. Өрөөнд
   * байвал бусдад тэр дороо харагдана; нэвтэрсэн бол санд хадгалагдана.
   */
  if (msg.t === 'setAvatar') {
    const value = msg.avatar ?? null;
    if (value !== null && !isValidAvatar(value)) {
      throw new RuleError('Зураг хэтэрхий том эсвэл буруу хэлбэртэй байна.');
    }

    const active = sessions.get(socket);
    if (active) {
      const me = active.room.state.players.find((p) => p.id === active.playerId);
      if (me) me.avatar = value;
      broadcast(active.room);
    }

    const account = accounts.get(socket);
    if (!account) return;
    if (!dbEnabled()) {
      markOnline(socket, { ...account, avatar: value });
      return send(socket, { t: 'auth', account: { ...account, avatar: value } });
    }
    void saveAvatar(account.id, value)
      .then(() => {
        const updated = { ...account, avatar: value };
        markOnline(socket, updated);
        send(socket, { t: 'auth', account: updated });
      })
      .catch((err) => {
        console.error('avatar хадгалж чадсангүй:', err);
        send(socket, { t: 'error', message: 'Зургийг хадгалж чадсангүй.' });
      });
    return;
  }

  /** Ирсэн урилгуудаа асуух. Нэвтрээгүй бол хоосон. */
  if (msg.t === 'invites') {
    const account = accounts.get(socket);
    if (!account || !dbEnabled()) return send(socket, { t: 'invites', list: [] });
    void liveInvites(account.id)
      .then((list) => send(socket, { t: 'invites', list }))
      .catch((err) => {
        console.error('урилга уншиж чадсангүй:', err);
        send(socket, { t: 'invites', list: [] });
      });
    return;
  }

  if (msg.t === 'declineInvite') {
    const account = accounts.get(socket);
    if (!account || !dbEnabled()) return;
    void dropInvite(account.id, String(msg.roomCode ?? ''))
      .then(() => pushInvites(account.id))
      .catch((err) => console.error('урилга устгаж чадсангүй:', err));
    return;
  }

  // Доорх үйлдлүүдэд өрөөнд сууж байх шаардлагатай.
  const session = sessions.get(socket);
  if (!session) throw new RuleError('Эхлээд өрөөнд нэгдэнэ үү.');
  const { room, playerId } = session;
  room.lastActivity = Date.now();

  switch (msg.t) {
    case 'start': {
      if (playerId !== room.hostId) throw new RuleError('Зөвхөн өрөөний эзэн эхлүүлж чадна.');
      const stake = Number(msg.stake ?? DEFAULT_STAKE);
      const begin = () => {
        startMatch(
          room.state,
          Number(msg.targetScore ?? DEFAULT_TARGET_SCORE),
          Number(msg.turnSeconds ?? DEFAULT_TURN_SECONDS),
          stake,
        );
        room.matchRecorded = false;
        broadcast(room);
      };

      // Бооцоотой тоглолтод бүртгэлтэй тоглогчид хүрэлцэхүйц токентой байх ёстой.
      if (stake > 0 && dbEnabled()) {
        void ensureTokens(room, stake)
          .then(begin)
          .catch((err) => sendAuthError(socket, err));
        return;
      }
      return begin();
    }

    case 'requestTokens': {
      requireDb();
      const account = accounts.get(socket);
      if (!account) throw new RuleError('Эхлээд нэвтэрнэ үү.');
      void requestTokens(account.id)
        .then(() =>
          send(socket, {
            t: 'notice',
            message: 'Хүсэлт илгээгдлээ. Админ токен нэмэхэд танд мэдэгдэнэ.',
          }),
        )
        .catch((err) => sendAuthError(socket, err));
      return;
    }
    case 'next': {
      if (playerId !== room.hostId) throw new RuleError('Зөвхөн өрөөний эзэн үргэлжлүүлж чадна.');
      if (room.state.phase !== 'roundEnd') throw new RuleError('Тойрог хараахан дуусаагүй байна.');
      startRound(room.state);
      return broadcast(room);
    }
    /**
     * Өрөөн доторх тоглогчийн ил мэдээлэл — нэр дээр нь дарахад.
     * Бүртгэлгүй зочны хувьд статистик байхгүй.
     */
    case 'inspect': {
      const target = room.state.players.find((p) => p.id === msg.playerId);
      if (!target) throw new RuleError('Тоглогч олдсонгүй.');

      const seat = room.seats.get(target.id);
      const account = seat?.socket ? accounts.get(seat.socket) : undefined;
      const base = {
        playerId: target.id,
        name: target.name,
        score: target.score,
        eliminated: target.eliminated,
        avatar: target.avatar,
      };

      if (!seat?.userId || !dbEnabled()) {
        return send(socket, {
          t: 'playerInfo',
          info: { ...base, registered: false, username: null, tokens: null, stats: null },
        });
      }

      const userId = seat.userId;
      void Promise.all([statsForUser(userId), balanceOf(userId)])
        .then(([stats, tokens]) =>
          send(socket, {
            t: 'playerInfo',
            info: {
              ...base,
              registered: true,
              username: account?.username ?? target.name,
              tokens,
              stats,
            },
          }),
        )
        .catch((err) => {
          console.error('inspect error:', err);
          send(socket, { t: 'error', message: 'Тоглогчийн мэдээлэл уншиж чадсангүй.' });
        });
      return;
    }

    /**
     * Одоогийн өрөөнд байгаа бүртгэлтэй тоглогчдыг урина.
     *
     * Урих хүн өөрөө орхигдоно. Зочдод хүрэх суваг байхгүй тул зөвхөн
     * бүртгэлтэй хүмүүст очно — хэдэнд очсоныг буцааж хэлнэ.
     */
    case 'invite': {
      requireDb();
      const me = room.state.players.find((p) => p.id === playerId);
      const myUserId = room.seats.get(playerId)?.userId ?? null;

      // Одоо өрөөнд байгаа хүмүүс БОЛОН сүүлийн тоглолтод оролцсон хүмүүс.
      // Хоёр дахь нь чухал: найз "Гарах" дараад гарсан ч дахин урьж болно.
      const targets = [
        ...new Set([
          ...[...room.seats.values()].filter((seat) => seat.userId).map((seat) => seat.userId!),
          ...room.lastPlayers,
        ]),
      ].filter((userId) => userId !== myUserId);

      if (targets.length === 0) {
        throw new RuleError(
          'Урих бүртгэлтэй тоглогч алга. Зочноор тоглосон хүнд урилга илгээх боломжгүй.',
        );
      }

      void inviteUsers(targets, me?.name ?? 'Найз', room.code)
        .then(async (invited) => {
          for (const userId of invited) await pushInvites(userId);
          send(socket, {
            t: 'notice',
            message: `${invited.length} тоглогчид урилга илгээлээ.`,
          });
        })
        .catch((err) => {
          console.error('урилга илгээж чадсангүй:', err);
          send(socket, { t: 'error', message: 'Урилга илгээж чадсангүй.' });
        });
      return;
    }

    case 'play': {
      play(room.state, playerId, Array.isArray(msg.cards) ? msg.cards : []);
      return broadcast(room);
    }
    case 'pass': {
      pass(room.state, playerId);
      return broadcast(room);
    }
    case 'chat': {
      const text = String(msg.text ?? '').trim().slice(0, MAX_CHAT_LENGTH);
      if (!text) return;
      const from = room.state.players.find((p) => p.id === playerId)?.name ?? '?';
      const line: ServerMessage = { t: 'chat', from, text, at: Date.now() };
      room.chat.push(line);
      if (room.chat.length > CHAT_HISTORY) room.chat.shift();
      return broadcastRaw(room, line);
    }
    case 'voice': {
      const data = String(msg.data ?? '');
      if (!data.startsWith('data:audio/')) throw new RuleError('Дуут мессеж танигдсангүй.');
      if (data.length > MAX_VOICE_CHARS) throw new RuleError('Дуут мессеж хэт урт байна.');
      const ms = Math.min(Math.max(0, Number(msg.ms) || 0), MAX_VOICE_MS);
      const from = room.state.players.find((p) => p.id === playerId)?.name ?? '?';
      // Дуут мессеж хэмжээгээр том тул түүхэд хадгалахгүй — зөвхөн шууд дамжуулна.
      return broadcastRaw(room, { t: 'voice', from, data, ms, at: Date.now() });
    }
    case 'report': {
      const text = String(msg.text ?? '').trim().slice(0, MAX_REPORT_CHARS);
      if (!text) throw new RuleError('Мэдэгдэл хоосон байна.');
      const player = room.state.players.find((p) => p.id === playerId);
      void saveReport({
        kind: msg.kind === 'crash' ? 'crash' : 'bug',
        text,
        code: room.code,
        playerName: player?.name ?? null,
        context: {
          ...(typeof msg.context === 'object' && msg.context ? msg.context : {}),
          phase: room.state.phase,
          round: room.state.round,
          players: room.state.players.length,
          serverLog: room.state.log.slice(-6),
        },
      })
        .then((saved) => send(socket, { t: 'reported', id: saved.id }))
        .catch((err) => console.error('мэдэгдэл хадгалж чадсангүй:', err));
      return;
    }
    case 'leave': {
      releaseSeat(room, playerId);
      sessions.delete(socket);
      return broadcast(room);
    }
  }
}

function seat(socket: WebSocket, room: Room, name: string): void {
  if (room.seats.size >= MAX_PLAYERS) {
    throw new RuleError(`Өрөө дүүрсэн байна (дээд тал нь ${MAX_PLAYERS} тоглогч).`);
  }
  const s = newSeat();
  s.socket = socket;
  const account = accounts.get(socket);
  s.userId = account?.id ?? null;
  room.seats.set(s.playerId, s);
  addPlayer(room.state, s.playerId, name);
  // Урилгаар орсон бол тэр урилга хэрэггүй боллоо.
  if (account && dbEnabled()) {
    void dropInvite(account.id, room.code)
      .then(() => pushInvites(account.id))
      .catch(() => undefined);
  }

  // Нэвтэрсэн хүн хадгалсан зураг, цолоо авчирна.
  if (account) {
    const player = room.state.players.find((p) => p.id === s.playerId);
    if (player && account.avatar) player.avatar = account.avatar;
    if (dbEnabled()) {
      void refreshWins(room).catch((err) => console.error('цол уншиж чадсангүй:', err));
    }
  }
  sessions.set(socket, { room, playerId: s.playerId });
  room.lastActivity = Date.now();
  send(socket, { t: 'joined', code: room.code, playerId: s.playerId, token: s.token });
  sendChatHistory(socket, room);
}

/**
 * Алдааны мэдэгдлүүдийг JSON-оор өгнө.
 *
 * `REPORT_KEY` орчны хувьсагч тохируулсан бол `?key=…` таарах ёстой.
 * Тохируулаагүй бол зөвхөн локал хандалт зөвшөөрөгдөнө — интернэтэд гарсан
 * сервер дээр мэдэгдэл санамсаргүй нээлттэй болохоос сэргийлнэ.
 */
/**
 * Админы хандалтыг шалгана.
 *
 * `REPORT_KEY` тохируулсан бол `?key=…` таарах ёстой. Тохируулаагүй бол
 * зөвхөн локал хандалт зөвшөөрөгдөнө — интернэтэд гарсан сервер дээр
 * санамсаргүй нээлттэй болохоос сэргийлнэ.
 */
function adminAllowed(req: IncomingMessage, url: URL): boolean {
  const expected = process.env.REPORT_KEY;
  // Render зэрэг үйлчилгээ хүсэлтийг контейнер дотор 127.0.0.1-ээс дамжуулдаг
  // тул зөвхөн remoteAddress-д итгэвэл интернэтээс ирсэн хүсэлт ч "локал"
  // мэт харагдана. Прокси дамжсан шинжийг илрүүлж хасна.
  const proxied = Boolean(req.headers['x-forwarded-for'] ?? req.headers['x-forwarded-proto']);
  const local =
    !proxied && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '');
  return expected ? url.searchParams.get('key') === expected : local;
}

function denyAdmin(res: ServerResponse): void {
  res.writeHead(403, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: 'REPORT_KEY шаардлагатай.' }));
}

/**
 * Одоо тоглож байгаа өрөө, тоглогчид.
 *
 * Байршуулахаас өмнө "хэн ч тоглож байгаа юу?" гэдгийг шалгахад хэрэглэнэ —
 * сервер дахин ачаалахад тоглож байсан хүмүүс унадаг.
 */
function serveLiveRooms(req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (!adminAllowed(req, url)) return denyAdmin(res);

  const now = Date.now();
  const list: unknown[] = [];
  rooms.forEach((room) => {
    const seats = [...room.seats.values()];
    list.push({
      code: room.code,
      phase: room.state.phase,
      round: room.state.round,
      stake: room.state.stake,
      // Холбогдсон хүн байхгүй өрөө нь орхигдсон гэсэн үг.
      online: seats.filter((s) => s.socket !== null).length,
      players: room.state.players.map((p) => ({
        name: p.name,
        connected: room.seats.get(p.id)?.socket !== null,
        registered: Boolean(room.seats.get(p.id)?.userId),
        score: p.score,
        eliminated: p.eliminated,
      })),
      idleSeconds: Math.round((now - room.lastActivity) / 1000),
    });
  });

  res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
  res.end(
    JSON.stringify(
      { rooms: list.length, playing: list.filter((r) => (r as { online: number }).online > 0).length, list },
      null,
      2,
    ),
  );
}

/**
 * Бүх өрөөнд мэдэгдэл илгээнэ — жишээ нь "5 минутын дараа шинэчилнэ".
 *
 * Чатын мөр болж очно: тоглогчид тусад нь цонх нээх шаардлагагүй, өмнөх
 * мессежүүдтэй хамт үлдэнэ.
 */
function serveAnnounce(req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (!adminAllowed(req, url)) return denyAdmin(res);

  const text = (url.searchParams.get('text') ?? '').trim().slice(0, MAX_CHAT_LENGTH);
  if (!text) {
    res.writeHead(400, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'text параметр хоосон байна.' }));
    return;
  }

  const line: ServerMessage = { t: 'chat', from: 'Зарлал', text, at: Date.now() };
  let reached = 0;
  rooms.forEach((room) => {
    room.chat.push(line);
    if (room.chat.length > CHAT_HISTORY) room.chat.shift();
    broadcastRaw(room, line);
    reached += [...room.seats.values()].filter((s) => s.socket !== null).length;
  });

  res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ sent: text, rooms: rooms.size, players: reached }, null, 2));
}

async function serveReports(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (!adminAllowed(req, url)) return denyAdmin(res);

  const limit = Math.min(Number(url.searchParams.get('limit')) || 100, 500);
  const reports = await readReports(limit);
  res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ count: reports.length, reports }, null, 2));
}

/** Шинээр холбогдсон хүнд сүүлийн яриаг үзүүлнэ. */
function sendChatHistory(socket: WebSocket, room: Room): void {
  for (const line of room.chat) send(socket, line);
}

function releaseSeat(room: Room, playerId: string): void {
  room.seats.delete(playerId);
  removePlayer(room.state, playerId);
  if (room.hostId === playerId) {
    room.hostId = room.state.players[0]?.id ?? '';
  }
  if (room.seats.size === 0) rooms.delete(room.code);
}

function broadcast(room: Room): void {
  saveFinishedMatch(room);
  const meta = metaOf(room);
  for (const s of room.seats.values()) {
    if (s.socket && s.socket.readyState === s.socket.OPEN) {
      send(s.socket, { t: 'state', view: viewFor(room.state, meta, s.playerId) });
    }
  }
}

/**
 * Тоглолт дуусмагц түүхэд нэг л удаа хадгална.
 * Өгөгдлийн сан унтраалттай бол чимээгүй өнгөрнө.
 */
function saveFinishedMatch(room: Room): void {
  if (room.state.phase !== 'matchEnd' || room.matchRecorded || !dbEnabled()) return;
  room.matchRecorded = true;

  const players = new Map<string, string>();
  for (const seat of room.seats.values()) {
    if (seat.userId) players.set(seat.playerId, seat.userId);
  }
  // Урилга илгээхэд хэрэгтэй — гарсан хүнийг ч дахин дуудаж болно.
  room.lastPlayers = [...new Set(players.values())];
  // Цол нь түүхээс тоологддог тул хожлыг бичиж ДУУССАНЫ ДАРАА л уншина.
  // Зэрэг явуулбал энэ тоглолт нь тоологдоогүй байхад уншиж, цол ахисан
  // мөчийг алдана.
  // TEST_MODE-той ажиллаж байвал туршилтын тоглолт гэж тэмдэглэнэ —
  // өгөгдөл нь үлдэнэ, зүгээр л хүний жагсаалтад гарахгүй.
  void recordMatch(room.state, room.code, players, Boolean(process.env.TEST_MODE))
    .then(() => refreshWins(room, true))
    .catch((err) => console.error('тоглолтыг түүхэд хадгалж чадсангүй:', err));

  // Бооцооны үр дүнг токены үлдэгдэлд тусгана. Зочид (бүртгэлгүй) хамаарахгүй.
  const changes = new Map<string, number>();
  for (const entry of room.state.settlement ?? []) {
    const userId = players.get(entry.playerId);
    if (userId) changes.set(userId, entry.amount);
  }
  if (changes.size > 0) {
    void applySettlement(changes)
      .then(() => refreshAccounts(room))
      .catch((err) => console.error('токены тооцоо хийж чадсангүй:', err));
  }
}

/**
 * Бүртгэлтэй тоглогчдын нийт хожлыг санаас уншиж, харагдацад тусгана.
 *
 * `announce` үнэн бол цол ахисан хүн бүрийг чатад зарлана — тэр мөч нь
 * цолны системийн хамгийн сонирхолтой хэсэг.
 */
async function refreshWins(room: Room, announce = false): Promise<void> {
  let changed = false;
  for (const seat of room.seats.values()) {
    if (!seat.userId) continue;
    const player = room.state.players.find((p) => p.id === seat.playerId);
    if (!player) continue;

    const stats = await statsForUser(seat.userId);
    const before = player.rankedWins;
    if (before === stats.rankedWins) continue;

    player.rankedWins = stats.rankedWins;
    changed = true;

    // Анх өрөөнд орох үед (before === null) зарлахгүй — тэр нь ахисан
    // биш, зүгээр л одоогийн байдлыг уншиж байгаа хэрэг.
    if (!announce || before === null) continue;

    const rank = promoted(before, stats.rankedWins);
    if (!rank) continue;

    const reward = rewardBetween(before, stats.rankedWins);

    // Ёслолын дэлгэц — чатын мөрөөс тусдаа.
    broadcastRaw(room, {
      t: 'celebrate',
      promotion: {
        playerId: player.id,
        name: player.name,
        rank: rank.name,
        badge: rank.badge,
        reward,
      },
    });

    broadcastRaw(room, {
      t: 'chat',
      from: 'Дай Ди',
      text:
        `${rank.badge} ${player.name} — ${rank.name.toUpperCase()} боллоо!` +
        (reward > 0 ? ` Шагнал: ${reward.toLocaleString('en-US').replace(/,/g, ' ')} токен.` : ''),
      at: Date.now(),
    });

    if (reward > 0) {
      await awardTokens(seat.userId, reward);
      if (seat.socket) {
        const account = accounts.get(seat.socket);
        if (account) {
          const updated = { ...account, tokens: await balanceOf(seat.userId) };
          accounts.set(seat.socket, updated);
          send(seat.socket, { t: 'auth', account: updated });
        }
      }
    }
  }
  if (changed) broadcast(room);
}

/**
 * Тоглолт эхлэхийн өмнө бүртгэлтэй тоглогчдын токен хүрэлцэхийг шалгана.
 * Хүрэлцэхгүй бол хэн болохыг нэрлэж хэлнэ.
 */
async function ensureTokens(room: Room, stake: number): Promise<void> {
  const seats = [...room.seats.values()].filter((s) => s.userId);
  const balances = await balancesOf(seats.map((s) => s.userId!));

  const short = seats
    .filter((s) => (balances.get(s.userId!) ?? 0) < stake)
    .map((s) => room.state.players.find((p) => p.id === s.playerId)?.name ?? '?');

  if (short.length > 0) {
    throw new RuleError(
      `${short.join(', ')}-д ${stake} токен хүрэлцэхгүй байна. ` +
        'Бага бооцоо сонгох эсвэл токен хүсэх шаардлагатай.',
    );
  }
}

/** Тоглолтын дараа шинэ үлдэгдлийг холбогдсон клиентүүдэд мэдэгдэнэ. */
async function refreshAccounts(room: Room): Promise<void> {
  for (const seat of room.seats.values()) {
    if (!seat.userId || !seat.socket) continue;
    const account = accounts.get(seat.socket);
    if (!account) continue;
    const tokens = await balanceOf(seat.userId);
    const updated = { ...account, tokens };
    accounts.set(seat.socket, updated);
    send(seat.socket, { t: 'auth', account: updated });
  }
}

function broadcastRaw(room: Room, msg: ServerMessage): void {
  for (const s of room.seats.values()) {
    if (s.socket && s.socket.readyState === s.socket.OPEN) send(s.socket, msg);
  }
}

function send(socket: WebSocket, msg: ServerMessage): void {
  socket.send(JSON.stringify(msg));
}

function cleanName(raw: unknown): string {
  const name = String(raw ?? '').trim().replace(/\s+/g, ' ').slice(0, MAX_NAME_LENGTH);
  return name || 'Тоглогч';
}

/**
 * Ээлжийн хугацаа шалгах цохилт. Хугацаа дуусмагц автоматаар пас (эсвэл шинэ
 * эргэлт бол хамгийн сул хөзөр) тавигдана.
 *
 * Өрөө бүрд тусад нь таймер барихын оронд нэг л цохилтоор бүх өрөөг шалгана —
 * таймер алдагдах, давхардах эрсдэлгүй.
 */
const TICK_MS = 500;
setInterval(() => {
  const now = Date.now();
  rooms.forEach((room) => {
    const { state } = room;
    if (state.phase !== 'playing') return;
    if (state.turnEndsAt === null || state.turnEndsAt > now) return;
    // Хэн ч холбогдоогүй өрөөг ажиллуулах шаардлагагүй.
    const anyoneOnline = [...room.seats.values()].some((s) => s.socket !== null);
    if (!anyoneOnline) return;

    try {
      timeoutTurn(state);
      broadcast(room);
    } catch (err) {
      console.error('ээлжийн хугацаа боловсруулахад алдаа:', err);
      state.turnEndsAt = null; // давтагдахаас сэргийлнэ
    }
  });
}, TICK_MS).unref();

setInterval(() => rooms.sweep(), 5 * 60 * 1000).unref();
// Хугацаа нь дууссан урилгыг цэвэрлэнэ.
setInterval(() => {
  if (dbEnabled()) void purgeExpiredInvites().catch(() => undefined);
}, 30 * 60 * 1000).unref();

httpServer.listen(PORT, () => {
  console.log(`Big Two сервер http://localhost:${PORT} дээр ажиллаж байна`);
});
