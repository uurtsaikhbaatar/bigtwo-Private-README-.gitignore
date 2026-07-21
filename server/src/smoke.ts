/**
 * Төгсгөлөөс төгсгөл хүртэлх шалгалт: 3 клиент бодит WebSocket-оор холбогдож,
 * өрөө үүсгэж, нэгдэж, бүтэн дугуй тоглож дуусгана.
 *
 * Ажиллуулах:  npm start   (өөр цонхонд)
 *              node --import tsx src/smoke.ts
 */

import WebSocket from 'ws';

import { Card, THREE_OF_DIAMONDS } from '../../app/src/shared/cards';
import { Combo, beats, detectCombo } from '../../app/src/shared/combos';
import type { ClientMessage, GameView, ServerMessage } from '../../app/src/shared/protocol';

const URL = process.env.SMOKE_URL ?? 'ws://localhost:8787';

class Client {
  readonly ws: WebSocket;
  view: GameView | null = null;
  code = '';
  playerId = '';
  private waiters: Array<(m: ServerMessage) => boolean> = [];

  constructor(readonly label: string) {
    this.ws = new WebSocket(URL);
    this.ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString()) as ServerMessage;
      if (msg.t === 'state') this.view = msg.view;
      if (msg.t === 'joined') {
        this.code = msg.code;
        this.playerId = msg.playerId;
      }
      if (msg.t === 'error') console.error(`  ⚠ ${this.label}: ${msg.message}`);
      this.waiters = this.waiters.filter((w) => !w(msg));
    });
  }

  send(msg: ClientMessage): void {
    this.ws.send(JSON.stringify(msg));
  }

  open(): Promise<void> {
    return new Promise((resolve) => this.ws.once('open', () => resolve()));
  }

  /** Тухайн нөхцөл биелэх мессежийг хүлээнэ. */
  await(predicate: (m: ServerMessage) => boolean, timeoutMs = 5000): Promise<ServerMessage> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${this.label}: хүлээлт хугацаа хэтэрлээ`)), timeoutMs);
      this.waiters.push((m) => {
        if (!predicate(m)) return false;
        clearTimeout(timer);
        resolve(m);
        return true;
      });
    });
  }
}

/** Хамгийн энгийн стратеги: хамгийн сул хууль ёсны тавилтыг сонгоно. */
function pickPlay(hand: Card[], current: Combo | null, mustIncludeThree: boolean): Card[] | null {
  const sizes = current ? [current.size] : [1, 2, 3, 5];
  for (const size of sizes) {
    if (size > hand.length) continue;
    const idx = Array.from({ length: size }, (_, i) => i);
    for (;;) {
      const pick = idx.map((i) => hand[i]);
      const combo = detectCombo(pick);
      const okThree = !mustIncludeThree || pick.includes(THREE_OF_DIAMONDS);
      if (combo && okThree && beats(combo, current)) return pick;
      let k = size - 1;
      while (k >= 0 && idx[k] === hand.length - size + k) k--;
      if (k < 0) break;
      idx[k]++;
      for (let j = k + 1; j < size; j++) idx[j] = idx[j - 1] + 1;
    }
  }
  return null;
}

async function main() {
  const clients = [new Client('Ану'), new Client('Бат'), new Client('Цэцэг')];
  await Promise.all(clients.map((c) => c.open()));
  console.log('✓ 3 клиент холбогдлоо');

  clients[0].send({ t: 'create', name: 'Ану' });
  await clients[0].await((m) => m.t === 'joined');
  const code = clients[0].code;
  console.log(`✓ өрөө үүслээ: ${code}`);

  for (const c of clients.slice(1)) {
    c.send({ t: 'join', name: c.label, code });
    await c.await((m) => m.t === 'joined');
  }
  await clients[0].await((m) => m.t === 'state' && m.view.players.length === 3);
  console.log('✓ бүгд өрөөнд нэгдлээ');

  clients[0].send({ t: 'start' });
  await clients[0].await((m) => m.t === 'state' && m.view.phase === 'playing');
  console.log('✓ тоглоом эхэллээ');

  let moves = 0;
  while (clients[0].view?.phase === 'playing') {
    if (++moves > 500) throw new Error('тоглоом гацлаа');
    const actor = clients.find((c) => c.view && c.view.turnId === c.playerId);
    if (!actor?.view) {
      await new Promise((r) => setTimeout(r, 20));
      continue;
    }
    const view = actor.view;
    const current = view.current ? detectCombo(view.current.cards) : null;
    const mustThree = view.lastPlay === null && view.yourHand.includes(THREE_OF_DIAMONDS);
    const pick = pickPlay(view.yourHand, current, mustThree);

    if (pick) actor.send({ t: 'play', cards: pick });
    else actor.send({ t: 'pass' });

    // Үйлдэл бүр шинэ төлөв цацна; алдаа гарвал тэр дороо мэдэрнэ.
    const reply = await actor.await((m) => m.t === 'state' || m.t === 'error', 5000);
    if (reply.t === 'error') throw new Error(`${actor.label}: ${reply.message}`);
  }

  const final = clients[0].view!;
  console.log(`✓ дугаар ${final.round} дууслаа, ${moves} үйлдэл`);
  for (const p of [...final.players].sort((a, b) => (a.place ?? 9) - (b.place ?? 9))) {
    const r = final.results?.find((x) => x.playerId === p.id);
    console.log(`   ${p.place}. ${p.name.padEnd(8)} үлдсэн ${r?.cardsLeft ?? '?'} · оноо ${r?.net ?? '?'}`);
  }

  const netSum = final.results!.reduce((s, r) => s + r.net, 0);
  if (netSum !== 0) throw new Error(`оноо тэнцэхгүй байна: ${netSum}`);
  console.log('✓ оноо тэг нийлбэртэй');

  clients.forEach((c) => c.ws.close());
  console.log('\n✅ Бүх шалгалт амжилттай');
}

main().catch((err) => {
  console.error('❌', err.message);
  process.exit(1);
});
