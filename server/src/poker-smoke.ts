/**
 * Texas Hold'em-ийн төгсгөлөөс төгсгөл хүртэлх шалгалт — бодит WebSocket.
 *
 * Ажиллуулах:  npm run dev            (өөр цонхонд, ӨГӨГДЛИЙН САНГҮЙ)
 *              node --import tsx src/poker-smoke.ts
 *
 * Шалгана: Sit & Go-г роботтой бүтэн дуусгах, хууль бус үйлдэл татгалзах,
 * үзэгчид бусдын хөзөр очихгүй байх, тасраад сэргээх, Big Two хөндөгдөхгүй
 * байх, Cash-ийн хамгаалалт, админ жагсаалт.
 */

import assert from 'node:assert/strict';
import WebSocket from 'ws';

import type { PokerView } from '../../app/src/shared/holdem/view';
import type { ClientMessage, GameView, ServerMessage } from '../../app/src/shared/protocol';

const URL = process.env.SMOKE_URL ?? 'ws://localhost:8787';
const HTTP = URL.replace(/^ws/, 'http');

class Client {
  ws!: WebSocket;
  view: PokerView | null = null;
  bigView: GameView | null = null;
  errors: string[] = [];
  notices: string[] = [];
  session: { code: string; playerId: string; token: string } | null = null;
  constructor(readonly name: string) {}

  async open(): Promise<this> {
    this.ws = new WebSocket(URL);
    this.ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString()) as ServerMessage;
      if (msg.t === 'pkState') this.view = msg.view;
      if (msg.t === 'state') this.bigView = msg.view;
      if (msg.t === 'error') this.errors.push(msg.message);
      if (msg.t === 'notice') this.notices.push(msg.message);
      if (msg.t === 'joined') this.session = { code: msg.code, playerId: msg.playerId, token: msg.token };
    });
    await new Promise((r) => this.ws.once('open', r));
    return this;
  }
  send(msg: ClientMessage) {
    this.ws.send(JSON.stringify(msg));
  }
  close() {
    this.ws.close();
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(what: string, fn: () => boolean, ms = 20_000): Promise<void> {
  const end = Date.now() + ms;
  while (!fn()) {
    if (Date.now() > end) throw new Error(`Хүлээлт дууссан: ${what}`);
    await sleep(50);
  }
}

async function main() {
  const t0 = Date.now();
  const a = await new Client('Анар').open();
  const b = await new Client('Болд').open();

  // 1. Өрөө үүсгэх, нэгдэх, робот нэмэх.
  a.send({ t: 'create', name: a.name, game: 'holdem', format: 'sng' });
  await until('A өрөө', () => a.view?.code !== undefined);
  const code = a.view!.code;
  assert.equal(a.view!.format, 'sng');
  b.send({ t: 'join', name: b.name, code });
  await until('B нэгдэх', () => b.view?.players.length === 2);
  a.send({ t: 'addBot', level: 'easy' });
  await until('робот', () => a.view?.players.length === 3);
  b.send({ t: 'addBot', level: 'hard' });
  await until('эзэн биш робот нэмэх → алдаа', () => b.errors.length > 0);
  console.log('✓ өрөө, нэгдэх, робот, эрх');

  // 2. Тэмцээн эхлүүлэх (buy-in 0 — сангүй).
  a.send({ t: 'pkStart', buyIn: 0, turnSeconds: 20 });
  await until('эхэлсэн', () => a.view?.phase === 'playing');
  assert.ok(a.view!.players.every((p) => p.stack + p.bet <= 1500 && p.dealt));
  assert.ok(a.view!.buttonDraw && a.view!.buttonDraw.length === 3, 'товчны сугалаа');
  const meA = a.view!.players.find((p) => p.id === a.view!.youId)!;
  assert.equal(meA.hole?.length, 2, 'өөрийн хөзөр харагдана');
  const otherInA = a.view!.players.find((p) => p.id !== a.view!.youId)!;
  assert.equal(otherInA.hole, null, 'бусдын хөзөр харагдахгүй');
  console.log('✓ эхэлсэн, товчны сугалаа, хөзөр нууц');

  // 3. Үзэгч.
  const c = await new Client('Үзэгч').open();
  c.send({ t: 'watch', name: 'Үзэгч', code });
  await until('үзэгч', () => c.view !== null);
  assert.equal(c.view!.spectating, true);
  assert.ok(c.view!.players.every((p) => p.hole === null), 'үзэгчид хөзөр очихгүй');
  assert.equal(c.view!.legal, null);
  console.log('✓ үзэгч');

  // 4. Ээлжгүй үйлдэл, хууль бус өсгөлт.
  const notMe = [a, b].find((x) => x.view!.toAct !== x.view!.youId)!;
  const before = notMe.errors.length;
  notMe.send({ t: 'pkAct', kind: 'check' });
  await until('ээлжгүй → алдаа', () => notMe.errors.length > before);
  console.log(`✓ ээлжгүй үйлдэл татгалзав: "${notMe.errors.at(-1)}"`);

  // 5. Хүмүүс тоглоно: эхний хэдэн гарт хууль бус өсгөлт оролдоод, дараа нь All-in.
  let illegalTried = false;
  let resumed = false;
  let hands = 0;
  const players = [a, b];
  while (a.view!.phase !== 'finished') {
    await sleep(60);
    if (Date.now() - t0 > 8 * 60_000) throw new Error('Тэмцээн хэт удаан');
    hands = a.view!.handNo;
    // 6. Тасраад сэргээх (нэг удаа).
    if (!resumed && hands >= 2 && b.session) {
      resumed = true;
      const sess = b.session;
      b.close();
      await sleep(300);
      const b2 = await new Client('Болд').open();
      b2.send({ t: 'resume', ...sess });
      await until('B сэргээв', () => b2.view !== null);
      assert.equal(b2.view!.youId, sess.playerId);
      players[1] = b2;
      console.log('✓ тасраад суудлаа сэргээв');
    }
    for (const p of players) {
      const v = p.view;
      if (!v || v.phase !== 'playing' || v.toAct !== v.youId || !v.legal) continue;
      if (!illegalTried && v.legal.canRaise && v.legal.minTo > v.currentBet + 1) {
        illegalTried = true;
        const n = p.errors.length;
        p.send({ t: 'pkAct', kind: 'raise', amount: v.currentBet + 1 });
        await until('Min Raise алдаа', () => p.errors.length > n);
        console.log(`✓ хууль бус Raise татгалзав: "${p.errors.at(-1)}"`);
        continue;
      }
      const seq = v.turnSeq;
      p.send(v.legal.canRaise ? { t: 'pkAct', kind: 'allin' } : { t: 'pkAct', kind: v.legal.canCheck ? 'check' : 'call' });
      await until('үйлдэл хүлээн авав', () => p.view!.turnSeq !== seq || p.view!.phase !== 'playing', 5000);
    }
  }
  const fin = a.view!;
  const places = fin.players.map((p) => p.place).sort();
  assert.deepEqual(places, [1, 2, 3]);
  assert.ok(fin.winnerId);
  const totalChips = fin.players.reduce((s, p) => s + p.stack, 0);
  assert.equal(totalChips, 4500, 'чип хадгалагдсан');
  console.log(`✓ Sit & Go дууслаа: ${fin.handNo} гар, ялагч ${fin.players.find((p) => p.id === fin.winnerId)!.name}`);

  // 7. Big Two хөндөгдөөгүй.
  const d = await new Client('Дорж').open();
  d.send({ t: 'create', name: 'Дорж' });
  await until('Big Two өрөө', () => d.bigView !== null);
  assert.equal(d.bigView!.phase, 'lobby');
  assert.equal(d.view, null);
  // Big Two-гийн лоббиос покерын өрөөнд орох → Big Two-гоос гарна.
  d.send({ t: 'join', name: 'Дорж', code });
  await until('покерт шилжив', () => d.view !== null);
  console.log('✓ Big Two хэвийн, лоббиос покер руу шилжив');

  // 8. Cash: сангүй үед Buy-in татгалзана, Blind солих.
  const e = await new Client('Энх').open();
  e.send({ t: 'create', name: 'Энх', game: 'holdem', format: 'cash' });
  await until('cash өрөө', () => e.view?.format === 'cash');
  assert.equal(e.view!.bb, 1000);
  e.send({ t: 'pkBlinds', sb: 5000, bb: 10000 });
  await until('blind солив', () => e.view!.bb === 10000);
  e.send({ t: 'pkBuyIn', amount: 400_000 });
  await until('buy-in → алдаа', () => e.errors.length > 0);
  e.send({ t: 'addBot', level: 'easy' });
  await until('cash робот → алдаа', () => e.errors.length > 1);
  console.log(`✓ Cash хамгаалалт: "${e.errors[0]}" / "${e.errors[1]}"`);

  // 9. Show/Muck: B Fold хийвэл A тэмцэлгүй хожиж, 2 сек-д хөзрөө харуулж болно.
  const s1 = await new Client('Сүх').open();
  const s2 = await new Client('Тэмүүлэн').open();
  s1.send({ t: 'create', name: 'Сүх', game: 'holdem', format: 'sng' });
  await until('show өрөө', () => s1.view?.code !== undefined);
  s2.send({ t: 'join', name: 'Тэмүүлэн', code: s1.view!.code });
  await until('show нэгдэх', () => s2.view?.players.length === 2);
  s1.send({ t: 'pkStart', buyIn: 0, turnSeconds: 20 });
  await until('show эхэлсэн', () => s1.view?.phase === 'playing' && s2.view?.phase === 'playing');
  const actor = [s1, s2].find((x) => x.view!.toAct === x.view!.youId)!;
  const other = actor === s1 ? s2 : s1;
  actor.send({ t: 'pkAct', kind: 'fold' });
  await until('Show санал', () => (other.view?.showOfferMs ?? 0) > 0);
  assert.ok(other.view!.showOfferMs! <= 2000);
  assert.equal(actor.view!.showOfferMs, null, 'хаясан хүнд санал гарахгүй');
  const winnerId = other.view!.youId;
  assert.equal(actor.view!.players.find((p) => p.id === winnerId)!.hole, null, 'Show хийхээс өмнө нууц');
  other.send({ t: 'pkShow', show: true });
  await until('хөзөр ил', () => actor.view!.players.find((p) => p.id === winnerId)!.hole?.length === 2);
  console.log('✓ Show: тэмцэлгүй хожсон хүн хөзрөө харуулахад бусдад ил гарав');
  // Дахин Show → татгалзана (нэг л удаа).
  const n0 = other.errors.length;
  other.send({ t: 'pkShow', show: true });
  await until('давхар Show алдаа', () => other.errors.length > n0);
  s1.close();
  s2.close();

  // 10. Админ жагсаалт.
  const res = await fetch(`${HTTP}/admin/rooms`);
  const body = (await res.json()) as { list: Array<{ code: string; game?: string }> };
  assert.ok(body.list.some((r) => r.code === code && r.game === 'holdem'), 'админ жагсаалтад покер');
  console.log('✓ /admin/rooms покерын өрөөг тоолно');

  for (const x of [a, ...players, c, d, e]) x.close();
  console.log(`\nБҮГД АМЖИЛТТАЙ (${Math.round((Date.now() - t0) / 1000)} сек)`);
}

main().catch((err) => {
  console.error('✗', err);
  process.exit(1);
});
