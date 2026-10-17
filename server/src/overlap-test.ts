/**
 * Туршилт: deploy-ийн үеийн "хоёр сервер давхцах" нөхцөл (npm run test:overlap).
 * Production сан дотор ТУСДАА схем (test_…) + шууд холболт (pooler биш) —
 * production-ий хүснэгтэд хүрэхгүй. Төгсгөлд схемийг бүхэлд нь устгана.
 */
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import WebSocket from 'ws';

const prodUrl = process.env.DATABASE_URL!;
const direct = prodUrl.replace('-pooler.', '.');
assert.notEqual(direct, prodUrl, 'шууд холболтын хаяг гарсангүй');
const SCHEMA = 'test_overlap_' + Date.now().toString(36);
process.env.DATABASE_URL = direct;
process.env.DB_SCHEMA = SCHEMA;
const { getPool } = await import('./db');
const pool = getPool();
await pool.query(`CREATE SCHEMA ${SCHEMA}`);
console.log('схем:', SCHEMA);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(what: string, fn: () => boolean | Promise<boolean>, ms = 20_000) {
  const end = Date.now() + ms;
  while (!(await fn())) {
    if (Date.now() > end) throw new Error('Хүлээлт дууссан: ' + what);
    await sleep(100);
  }
}

function startServer(port: number): ChildProcess {
  const env = {
    ...process.env,
    PORT: String(port),
    DATABASE_URL: direct,
    DB_SCHEMA: SCHEMA,
    TEST_MODE: '1',
    EMAIL_API_KEY: '',
    EMAIL_PROVIDER: '',
    REPORT_KEY: '',
  };
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], {
    env,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  child.stdout!.on('data', (d) => process.env.VERBOSE && process.stdout.write(`[${port}] ${d}`));
  child.stderr!.on('data', (d) => process.stdout.write(`[${port} ERR] ${d}`));
  return child;
}
async function waitHealthy(port: number) {
  await until(`сервер ${port}`, async () => {
    try {
      const r = await fetch(`http://localhost:${port}/health`);
      const j = (await r.json()) as { database: string };
      return j.database === 'холбогдсон';
    } catch {
      return false;
    }
  }, 60_000);
}

class C {
  ws!: WebSocket;
  view: any = null;
  big: any = null;
  session: any = null;
  auth: string | null = null;
  account: any = null;
  errors: string[] = [];
  constructor(readonly name: string) {}
  async open(port: number) {
    this.ws = new WebSocket(`ws://localhost:${port}`);
    this.ws.on('message', (raw) => {
      const m = JSON.parse(raw.toString());
      if (m.t === 'pkState') { this.view = m.view; this.big = null; }
      if (m.t === 'state') { this.big = m.view; this.view = null; }
      if (m.t === 'joined') this.session = { code: m.code, playerId: m.playerId, token: m.token };
      if (m.t === 'auth') { this.account = m.account; if (m.token) this.auth = m.token; }
      if (m.t === 'error') this.errors.push(m.message);
    });
    await new Promise((r) => this.ws.once('open', r));
    return this;
  }
  send(m: any) { this.ws.send(JSON.stringify(m)); }
  /** Шинэ сервер рүү дахин холбогдож суудлаа сэргээнэ (апп-ын net.ts шиг). */
  async reconnect(port: number) {
    try { this.ws.close(); } catch { /* */ }
    this.view = null; this.big = null;
    await this.open(port);
    if (this.auth) this.send({ t: 'authResume', token: this.auth });
    this.send({ t: 'resume', ...this.session });
  }
}

const A = startServer(8811);
let B: ChildProcess | null = null;
let ok = false;
try {
  await waitHealthy(8811);
  console.log('✓ A асав');

  // ── A дээр өрөөнүүд ──
  const c1 = await new C('Анар').open(8811);
  c1.send({ t: 'create', name: 'Анар' });
  await until('Big Two өрөө', () => !!c1.big);
  c1.send({ t: 'addBot', level: 'easy' });
  await until('робот 1', () => c1.big?.players.length === 2);

  const p1 = await new C('Болд').open(8811);
  p1.send({ t: 'create', name: 'Болд', game: 'holdem', format: 'sng' });
  await until('SNG', () => !!p1.view);
  p1.send({ t: 'addBot', level: 'medium' });
  await until('SNG робот', () => p1.view?.players.length === 2);
  p1.send({ t: 'pkStart', buyIn: 0, turnSeconds: 45 });
  await until('SNG эхэлсэн', () => p1.view?.phase === 'playing');

  const u1 = await new C('cash1').open(8811);
  const u2 = await new C('cash2').open(8811);
  const tag = Date.now().toString(36).slice(-5);
  u1.send({ t: 'register', username: `test_a${tag}`, password: 'secret-pass-1', email: `a${tag}@example.com` });
  u2.send({ t: 'register', username: `test_b${tag}`, password: 'secret-pass-2', email: `b${tag}@example.com` });
  await until('бүртгэл', () => !!u1.account && !!u2.account);
  u1.send({ t: 'create', name: u1.account.username, game: 'holdem', format: 'cash' });
  await until('cash өрөө', () => !!u1.view);
  u2.send({ t: 'join', name: u2.account.username, code: u1.view.code });
  await until('cash нэгдэх', () => u1.view?.players.length === 2);
  u1.send({ t: 'pkBuyIn', amount: 100_000 });
  u2.send({ t: 'pkBuyIn', amount: 60_000 });
  await until('buy-in', () => u1.view?.players.every((p: any) => p.stack > 0));
  u1.send({ t: 'pkStart', turnSeconds: 45 });
  await until('cash эхэлсэн', () => u1.view?.phase === 'playing');
  console.log('✓ A дээр Big Two, SNG, Cash өрөөнүүд');

  await sleep(9000); // A snapshot бичнэ

  // ── B асна (deploy-ийн шинэ сервер) — энэ мөчийн snapshot-ыг сэргээнэ ──
  B = startServer(8812);
  await waitHealthy(8812);
  console.log('✓ B асав (давхцал эхэлсэн)');

  // ── Давхцлын үед A дээр үргэлжилсэн үйлдлүүд ──
  c1.send({ t: 'addBot', level: 'hard' });
  await until('робот 2', () => c1.big?.players.length === 3);
  const c3 = await new C('Цэцэг').open(8811);
  c3.send({ t: 'create', name: 'Цэцэг' }); // B асаад ДАРАА үүссэн өрөө (5CDWG3 шиг)
  await until('шинэ өрөө', () => !!c3.big);
  // Cash: нэг бүтэн гар дуусгана (A дээр барьцаа тэнцүүлэгдэнэ)
  const handBefore = u1.view.handNo;
  await until('cash гар дуусах', async () => {
    for (const u of [u1, u2]) {
      const v = u.view;
      if (v?.phase === 'playing' && v.toAct === v.youId && v.legal) {
        u.send({ t: 'pkAct', kind: v.legal.canCheck ? 'check' : 'call' });
        await sleep(150);
      }
    }
    return u1.view?.handNo > handBefore || u1.view?.phase === 'handEnd';
  }, 40_000);
  // Шинэ гар эхлэх хүртэл хүлээгээд нэг үйлдэл хийнэ (гарын дунд унтрах)
  await until('шинэ cash гар', () => u1.view?.phase === 'playing' && u1.view.handNo > handBefore, 15_000);
  const stacksA = Object.fromEntries(u1.view.players.map((p: any) => [p.name, p.stack + p.bet]));
  const sngA = { hand: p1.view.handNo, chips: p1.view.players.reduce((a: number, p: any) => a + p.stack + p.bet, 0) };
  console.log('✓ давхцлын үед A дээр: робот нэмсэн, шинэ өрөө, cash гар дууссан');

  // ── A унтарна (SIGTERM-тэй адил) ──
  A.send('shutdown');
  await until('A хаалт', () => c1.ws.readyState === WebSocket.CLOSED, 15_000);
  console.log('✓ A өрөөнүүдийг хадгалж холболтыг хаав');

  // ── Клиентүүд B руу ──
  for (const c of [c1, p1, u1, u2, c3]) await c.reconnect(8812);
  await until('Big Two сэргэв', () => c1.big?.players.length === 3, 15_000);
  console.log('✓ Big Two: давхцлын үед нэмсэн робот B дээр байна');
  await until('шинэ өрөө B дээр', () => !!c3.big, 15_000);
  assert.ok(!c3.errors.some((e) => e.includes('олдсонгүй')), c3.errors.join('; '));
  console.log('✓ B асаад дараа үүссэн өрөө "олдсонгүй" гарахгүй сэргэв');
  await until('SNG сэргэв', () => !!p1.view, 15_000);
  assert.ok(p1.view.handNo >= sngA.hand, `SNG гар ${p1.view.handNo} < ${sngA.hand}`);
  const sngChips = p1.view.players.reduce((a: number, p: any) => a + p.stack + p.bet, 0);
  assert.equal(sngChips, 3000, 'SNG чип');
  console.log(`✓ SNG: хамгийн сүүлийн төлөв (гар #${p1.view.handNo}), чип хадгалагдсан`);
  await until('Cash сэргэв', () => !!u1.view && !!u2.view, 15_000);
  // Барьцаа = эх үнэн; токен + барьцаа = 2 сая
  const q = await pool.query(
    `SELECT (SELECT coalesce(sum(tokens),0) FROM users WHERE username IN ($1,$2)) t,
            (SELECT coalesce(sum(amount),0) FROM poker_escrow) e`,
    [u1.account.username, u2.account.username],
  );
  const total = Number(q.rows[0].t) + Number(q.rows[0].e);
  assert.equal(total, 2_000_000, `токен + барьцаа = ${total}`);
  const stacksB = Object.fromEntries(u1.view.players.map((p: any) => [p.name, p.stack + p.bet]));
  console.log('  A дээр:', JSON.stringify(stacksA), ' B дээр:', JSON.stringify(stacksB), ' барьцаа:', q.rows[0].e);
  const escrowNow = Number(q.rows[0].e);
  const chipsOnB = Object.values(stacksB).reduce((a: number, b: any) => a + b, 0);
  assert.equal(chipsOnB, escrowNow, 'B дээрх чип = барьцаа (гар хүчингүй болж буцсан)');
  console.log('✓ Cash: токен + барьцаа = 2 000 000, B дээрх чип = барьцаа');

  // Cash үргэлжилнэ: B дээр шинэ гар эхэлж тоглогдоно
  await until('B дээр cash гар', () => u1.view?.phase === 'playing', 20_000);
  console.log('✓ Cash тоглолт B дээр үргэлжиллээ');
  ok = true;
} catch (e) {
  console.error('✗', e);
} finally {
  for (const child of [A, B]) {
    child?.on('error', () => undefined);
    if (child?.connected) child.send('shutdown');
  }
  await sleep(2500);
  A.kill();
  B?.kill();
  await pool.query(`DROP SCHEMA ${SCHEMA} CASCADE`);
  const left = await pool.query(`SELECT count(*)::int n FROM information_schema.schemata WHERE schema_name = $1`, [SCHEMA]);
  console.log(left.rows[0].n === 0 ? '✓ туршилтын схем устгагдав' : '⚠ схем үлдсэн!');
  await pool.end();
  process.exit(ok ? 0 : 1);
}
