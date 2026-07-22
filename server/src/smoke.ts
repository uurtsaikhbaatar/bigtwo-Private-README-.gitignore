/**
 * Төгсгөлөөс төгсгөл хүртэлх шалгалт: 5 клиент бодит WebSocket-оор холбогдож,
 * бүтэн тоглолтыг (олон тойрог, хасалт хүртэл) тоглож дуусгана.
 *
 * 5 тоглогч сонгосон учир нь: тойрог бүрд нэг нь өнжих тул суудлын ээлж,
 * үзэгчийн горим хоёулаа шалгагдана.
 *
 * Ажиллуулах:  npm start   (өөр цонхонд)
 *              npm run smoke
 */

import WebSocket from 'ws';

import { Card } from '../../app/src/shared/cards';
import { Combo, beats, detectCombo } from '../../app/src/shared/combos';
import type { ClientMessage, GameView, ServerMessage } from '../../app/src/shared/protocol';

const URL = process.env.SMOKE_URL ?? 'ws://localhost:8787';
const TARGET_SCORE = 30;
// Тестийн ботууд шууд хариулдаг тул хугацаа урт байхад асуудалгүй.
const TURN_SECONDS = 300;
const STAKE = 100_000;
const PLAYER_NAMES = ['Ану', 'Бат', 'Цэцэг', 'Дорж', 'Энхээ'];

class Client {
  readonly ws: WebSocket;
  view: GameView | null = null;
  code = '';
  playerId = '';
  chat: string[] = [];
  private waiters: Array<(m: ServerMessage) => boolean> = [];

  constructor(readonly label: string) {
    this.ws = new WebSocket(URL);
    this.ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString()) as ServerMessage;
      if (msg.t === 'state') this.view = msg.view;
      if (msg.t === 'chat') this.chat.push(`${msg.from}: ${msg.text}`);
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

  await(predicate: (m: ServerMessage) => boolean, timeoutMs = 5000): Promise<ServerMessage> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`${this.label}: хүлээлт хугацаа хэтэрлээ`)),
        timeoutMs,
      );
      this.waiters.push((m) => {
        if (!predicate(m)) return false;
        clearTimeout(timer);
        resolve(m);
        return true;
      });
    });
  }
}

/** Хамгийн сул хууль ёсны тавилтыг сонгоно. */
function pickPlay(hand: Card[], current: Combo | null): Card[] | null {
  for (const size of current ? [current.size] : [1, 2, 3, 5]) {
    if (size > hand.length) continue;
    const idx = Array.from({ length: size }, (_, i) => i);
    for (;;) {
      const pick = idx.map((i) => hand[i]);
      const combo = detectCombo(pick);
      if (combo && beats(combo, current)) return pick;
      let k = size - 1;
      while (k >= 0 && idx[k] === hand.length - size + k) k--;
      if (k < 0) break;
      idx[k]++;
      for (let j = k + 1; j < size; j++) idx[j] = idx[j - 1] + 1;
    }
  }
  return null;
}

const check = (condition: boolean, message: string): void => {
  if (!condition) throw new Error(message);
};

async function main() {
  const clients = PLAYER_NAMES.map((n) => new Client(n));
  await Promise.all(clients.map((c) => c.open()));
  console.log(`✓ ${clients.length} клиент холбогдлоо`);

  clients[0].send({ t: 'create', name: clients[0].label });
  await clients[0].await((m) => m.t === 'joined');
  const code = clients[0].code;

  for (const c of clients.slice(1)) {
    c.send({ t: 'join', name: c.label, code });
    await c.await((m) => m.t === 'joined');
  }
  await clients[0].await((m) => m.t === 'state' && m.view.players.length === clients.length);
  console.log(`✓ өрөө ${code} — ${clients.length} тоглогч нэгдлээ`);

  // Чат: нэг нь бичихэд бүгд хүлээж авах ёстой. Хүлээгчийг илгээхээс өмнө
  // бүртгэхгүй бол зарим клиент амжаагүй байхад шалгах эрсдэлтэй.
  const heard = clients.map((c) => c.await((m) => m.t === 'chat'));
  clients[1].send({ t: 'chat', text: 'Тоглоцгооё!' });
  await Promise.all(heard);
  check(
    clients.every((c) => c.chat.some((l) => l.includes('Тоглоцгооё!'))),
    'чат бүх тоглогчид хүрсэнгүй',
  );
  console.log('✓ чат бүх тоглогчид хүрлээ');

  clients[0].send({ t: 'start', targetScore: TARGET_SCORE, turnSeconds: TURN_SECONDS, stake: STAKE });
  await clients[0].await((m) => m.t === 'state' && m.view.phase === 'playing');
  console.log(`✓ тоглолт эхэллээ (босго ${TARGET_SCORE} оноо)`);

  const scores = new Map(clients.map((c) => [c.playerId, 0]));
  let moves = 0;
  let rounds = 0;

  while (clients[0].view?.phase !== 'matchEnd') {
    if (++moves >= 60000) {
      const v = clients[0].view!;
      console.error('ГАЦСАН ТӨЛӨВ:', {
        phase: v.phase,
        round: v.round,
        turnId: v.turnId,
        seats: v.seats,
        turnName: v.players.find((p) => p.id === v.turnId)?.name,
        scores: v.players.map((p) => `${p.name}:${p.score}${p.eliminated ? '✗' : ''}`),
        views: clients.map((c) => `${c.label}=${c.view?.phase}/${c.view?.turnId === c.playerId ? 'ЭЭЛЖ' : '-'}`),
        log: v.log.slice(-4),
      });
      throw new Error('тоглолт гацлаа');
    }
    const view = clients[0].view!;

    if (view.phase === 'roundEnd') {
      verifyRound(clients, scores);
      rounds++;
      clients[0].send({ t: 'next' });
      await clients[0].await((m) => m.t === 'state' && m.view.phase !== 'roundEnd');
      continue;
    }

    // Өнжиж буй тоглогч ширээг харах ёстой ч хөзөргүй байх ёстой.
    for (const c of clients) {
      if (c.view && !c.view.youAreSeated && c.view.phase === 'playing') {
        check(c.view.yourHand.length === 0, `${c.label}: өнжиж байхад хөзөр ирлээ`);
      }
    }

    const actor = clients.find((c) => c.view && c.view.turnId === c.playerId);
    if (!actor?.view) {
      await new Promise((r) => setTimeout(r, 15));
      continue;
    }
    const av = actor.view;
    check(av.youAreSeated, `${actor.label}: өнжиж байхад ээлж ирлээ`);

    const current = av.current ? detectCombo(av.current.cards) : null;
    const pick = pickPlay(av.yourHand, current);

    actor.send(pick ? { t: 'play', cards: pick } : { t: 'pass' });
    const reply = await actor.await((m) => m.t === 'state' || m.t === 'error');
    if (reply.t === 'error') throw new Error(`${actor.label}: ${reply.message}`);
  }

  const final = clients[0].view!;
  verifyRound(clients, scores);
  console.log(`✓ ${final.round} тойрог тоглолоо, ${moves} үйлдэл`);

  const table = [...final.players].sort((a, b) => a.score - b.score);
  for (const p of table) {
    const status = p.eliminated ? 'хасагдсан' : p.id === final.matchWinnerId ? '🏆 ЯЛАГЧ' : '';
    console.log(`   ${p.name.padEnd(8)} ${String(p.score).padStart(3)} оноо  ${status}`);
  }

  const alive = final.players.filter((p) => !p.eliminated);
  check(alive.length === 1, `яг нэг ялагч байх ёстой, гэтэл ${alive.length}`);
  check(final.matchWinnerId === alive[0].id, 'ялагч буруу тэмдэглэгдлээ');
  check(final.history.length === final.round, 'түүхийн бичлэг дутуу');

  check(final.settlement !== null, 'мөнгөн тооцоо гарсангүй');
  const settle = final.settlement!;
  const total = settle.reduce((s, e) => s + e.amount, 0);
  check(total === 0, `тооцоо тэнцэхгүй байна: ${total}`);
  const win = settle.find((e) => e.playerId === final.matchWinnerId)!;
  check(win.amount === STAKE * (clients.length - 1), 'ялагчийн дүн буруу');
  check(
    settle.filter((e) => e.playerId !== final.matchWinnerId).every((e) => e.amount === -STAKE),
    'алдагчдын дүн буруу',
  );
  console.log(`✓ мөнгөн тооцоо зөв — ялагч +${win.amount.toLocaleString('en-US')}₮`);
  console.log('✓ нэг ялагч, түүх бүрэн');

  clients.forEach((c) => c.ws.close());
  console.log('\n✅ Бүх шалгалт амжилттай');
}

/** Оноо буурч болохгүй; түүхийн нийлбэр нийт онооны тэнцүү байх ёстой. */
function verifyRound(clients: Client[], scores: Map<string, number>): void {
  const view = clients[0].view!;
  for (const p of view.players) {
    const previous = scores.get(p.id) ?? 0;
    check(p.score >= previous, `${p.name}: оноо ${previous} → ${p.score} болж буурлаа`);
    scores.set(p.id, p.score);

    const sum = view.history.reduce(
      (s, rec) => s + (rec.entries.find((e) => e.playerId === p.id)?.delta ?? 0),
      0,
    );
    check(sum === p.score, `${p.name}: түүхийн нийлбэр ${sum} ≠ оноо ${p.score}`);
  }
  // Өнжсөн тоглогчид оноо нэмэгдэхгүй.
  const last = view.history.at(-1);
  if (last && !last.dragonPlayerId) {
    for (const e of last.entries) {
      if (!e.played) check(e.delta === 0, 'өнжсөн тоглогчид оноо нэмэгджээ');
    }
  }
}

main().catch((err) => {
  console.error('❌', err.message);
  process.exit(1);
});
