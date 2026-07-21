import { randomBytes, randomUUID } from 'node:crypto';
import type { WebSocket } from 'ws';

import { GameState, createGame } from '../../app/src/shared/game';
import { RoomMeta, ServerMessage } from '../../app/src/shared/protocol';

/** Андуурч уншихад хялбар байлгах үүднээс O, 0, I, 1-ийг хассан. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

/** Хоосон өрөөг ийм хугацааны дараа устгана. */
export const ROOM_TTL_MS = 60 * 60 * 1000;

export interface Seat {
  playerId: string;
  /** Тасарсны дараа суудлаа эргүүлэн авахад ашиглах нууц түлхүүр. */
  token: string;
  socket: WebSocket | null;
}

export interface Room {
  code: string;
  state: GameState;
  hostId: string;
  seats: Map<string, Seat>;
  /** Сүүлийн чат мессежүүд — шинээр орсон хүнд дамжуулна. */
  chat: ServerMessage[];
  lastActivity: number;
}

export class RoomStore {
  private rooms = new Map<string, Room>();

  create(): Room {
    const room: Room = {
      code: this.uniqueCode(),
      state: createGame(),
      hostId: '',
      seats: new Map(),
      chat: [],
      lastActivity: Date.now(),
    };
    this.rooms.set(room.code, room);
    return room;
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code.trim().toUpperCase());
  }

  delete(code: string): void {
    this.rooms.delete(code);
  }

  /** Удаан хугацаанд хэн ч холбогдоогүй өрөөнүүдийг цэвэрлэнэ. */
  sweep(now = Date.now()): number {
    let removed = 0;
    for (const [code, room] of this.rooms) {
      const anyoneOnline = [...room.seats.values()].some((s) => s.socket !== null);
      if (!anyoneOnline && now - room.lastActivity > ROOM_TTL_MS) {
        this.rooms.delete(code);
        removed++;
      }
    }
    return removed;
  }

  get size(): number {
    return this.rooms.size;
  }

  private uniqueCode(): string {
    for (let attempt = 0; attempt < 50; attempt++) {
      const code = randomCode();
      if (!this.rooms.has(code)) return code;
    }
    throw new Error('Өрөөний код үүсгэж чадсангүй.');
  }
}

function randomCode(): string {
  const bytes = randomBytes(CODE_LENGTH);
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return out;
}

export function newSeat(): Seat {
  return { playerId: randomUUID(), token: randomBytes(16).toString('hex'), socket: null };
}

export function metaOf(room: Room): RoomMeta {
  const connected = new Set<string>();
  for (const seat of room.seats.values()) {
    if (seat.socket) connected.add(seat.playerId);
  }
  return { code: room.code, hostId: room.hostId, connected };
}
