/**
 * PokerServer-ийн тасалдлын дүрэм (өгөгдлийн сангүй).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

delete process.env.DATABASE_URL; // production санд хэзээ ч хүрэхгүй
const { PokerServer } = await import('./poker');
const { addChips } = await import('../../app/src/shared/holdem/engine');

function fakeSocket() {
  const msgs: any[] = [];
  return { msgs, readyState: 1, OPEN: 1, send: (j: string) => msgs.push(JSON.parse(j)), close() {} } as any;
}

function server() {
  return new PokerServer({
    send: (s, m) => s.send(JSON.stringify(m)),
    accountOf: () => undefined,
    setAccount: () => undefined,
    cleanName: (x) => String(x),
    sendError: () => undefined,
    pushInvites: async () => undefined,
    bigTwoHas: () => false,
    leaveBigTwo: () => undefined,
    botName: () => 'Робот (дунд)',
  });
}

test('Cash: 10 минутаас дээш салсан, гарт оролцоогүй тоглогч ширээнээс босно', () => {
  const srv = server();
  const a = fakeSocket();
  const b = fakeSocket();
  srv.create(a, 'A', 'cash');
  const code = a.msgs.find((m: any) => m.t === 'joined').code;
  srv.join(b, code, 'B');
  const room = srv.get(code)!;
  for (const p of room.state.players) addChips(room.state, p.id, 50_000);
  srv.onClose(b);
  const now = Date.now();
  srv.standUpOffline(now + 9 * 60 * 1000);
  assert.equal(room.state.players.length, 2, '10 минут болоогүй');
  srv.standUpOffline(now + 11 * 60 * 1000);
  assert.deepEqual(room.state.players.map((p) => p.name), ['A'], 'B босов');
});

test('Cash: гарын дунд салсан тоглогч гар дуустал босохгүй', () => {
  const srv = server();
  const a = fakeSocket();
  const b = fakeSocket();
  srv.create(a, 'A', 'cash');
  const code = a.msgs.find((m: any) => m.t === 'joined').code;
  srv.join(b, code, 'B');
  const room = srv.get(code)!;
  for (const p of room.state.players) addChips(room.state, p.id, 50_000);
  srv.handle(a, { t: 'pkStart', turnSeconds: 30 } as any);
  assert.equal(room.state.phase, 'playing');
  srv.onClose(b);
  srv.standUpOffline(Date.now() + 11 * 60 * 1000);
  const bp = room.state.players.find((p) => p.name === 'B');
  assert.ok(bp && !bp.folded, 'гарт хэвээр');
});

test('Буцаж холбогдсон тоглогчийн салсан хугацаа арилна', () => {
  const srv = server();
  const a = fakeSocket();
  const b = fakeSocket();
  srv.create(a, 'A', 'cash');
  const code = a.msgs.find((m: any) => m.t === 'joined').code;
  srv.join(b, code, 'B');
  const sess = b.msgs.find((m: any) => m.t === 'joined');
  srv.onClose(b);
  const b2 = fakeSocket();
  srv.resume(b2, code, sess.playerId, sess.token);
  srv.standUpOffline(Date.now() + 60 * 60 * 1000);
  assert.equal(srv.get(code)!.state.players.length, 2);
});
