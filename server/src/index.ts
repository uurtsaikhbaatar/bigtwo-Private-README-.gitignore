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
import {
  MAX_REPORT_CHARS,
  MAX_VOICE_CHARS,
  MAX_VOICE_MS,
  PROTOCOL_VERSION,
  type ClientMessage,
  type ServerMessage,
  viewFor,
} from '../../app/src/shared/protocol';
import { readReports, saveReport } from './reports';
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

const httpServer = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size, uptime: process.uptime() }));
    return;
  }
  if (req.url?.startsWith('/reports')) {
    void serveReports(req, res);
    return;
  }
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
      if (room.state.phase !== 'lobby') {
        throw new RuleError('Тоглоом аль хэдийн эхэлсэн байна.');
      }
      seat(socket, room, cleanName(msg.name));
      return broadcast(room);
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

  // Доорх үйлдлүүдэд өрөөнд сууж байх шаардлагатай.
  const session = sessions.get(socket);
  if (!session) throw new RuleError('Эхлээд өрөөнд нэгдэнэ үү.');
  const { room, playerId } = session;
  room.lastActivity = Date.now();

  switch (msg.t) {
    case 'start': {
      if (playerId !== room.hostId) throw new RuleError('Зөвхөн өрөөний эзэн эхлүүлж чадна.');
      startMatch(
        room.state,
        Number(msg.targetScore ?? DEFAULT_TARGET_SCORE),
        Number(msg.turnSeconds ?? DEFAULT_TURN_SECONDS),
        Number(msg.stake ?? DEFAULT_STAKE),
      );
      return broadcast(room);
    }
    case 'next': {
      if (playerId !== room.hostId) throw new RuleError('Зөвхөн өрөөний эзэн үргэлжлүүлж чадна.');
      if (room.state.phase !== 'roundEnd') throw new RuleError('Тойрог хараахан дуусаагүй байна.');
      startRound(room.state);
      return broadcast(room);
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
  room.seats.set(s.playerId, s);
  addPlayer(room.state, s.playerId, name);
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
async function serveReports(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const expected = process.env.REPORT_KEY;
  const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '');
  const allowed = expected ? url.searchParams.get('key') === expected : local;

  if (!allowed) {
    res.writeHead(403, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'REPORT_KEY шаардлагатай.' }));
    return;
  }

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
  const meta = metaOf(room);
  for (const s of room.seats.values()) {
    if (s.socket && s.socket.readyState === s.socket.OPEN) {
      send(s.socket, { t: 'state', view: viewFor(room.state, meta, s.playerId) });
    }
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

httpServer.listen(PORT, () => {
  console.log(`Big Two сервер http://localhost:${PORT} дээр ажиллаж байна`);
});
