/**
 * Аюулгүй байршуулалт — тоглогчдод сануулж, дараа нь код түлхэнэ.
 *
 *   npm run deploy            — тоглогч байвал 3 мин сануулаад push хийнэ
 *   npm run deploy -- now     — сануулгагүй, шууд push (яаралтай засварт)
 *
 * Урсгал (тоглогч идэвхтэй бол):
 *   1. "3 минутын дараа шинэчлэгдэнэ" гэж бүх өрөөнд зарлана
 *   2. 1 мин, 30 сек үлдэхэд дахин сануулна
 *   3. 3 минутын дараа `git push origin main` (Render автоматаар шинэчилнэ)
 *
 * Идэвхтэй тоглогч байхгүй бол шууд push хийнэ.
 *
 * Хаяг ба түлхүүрийг `.env`-ээс уншина: LIVE_URL, REPORT_KEY.
 */

export {}; // top-level await-д зориулж модуль болгоно

import { execSync } from 'node:child_process';

const BASE = (process.env.LIVE_URL ?? 'http://localhost:8787').replace(/\/+$/, '');
const KEY = process.env.REPORT_KEY ?? '';
const IMMEDIATE = process.argv.slice(2).join(' ').trim().toLowerCase() === 'now';

const sleep = (seconds: number) => new Promise((r) => setTimeout(r, seconds * 1000));

async function admin(path: string, params: Record<string, string> = {}): Promise<unknown> {
  const url = new URL(BASE + path);
  if (KEY) url.searchParams.set('key', KEY);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  const body = await res.text();
  if (res.status === 403) throw new Error('REPORT_KEY таарахгүй байна (server/.env ба Render-ийг тулга).');
  if (body.trimStart().startsWith('<')) {
    throw new Error('Сервер дээр админ endpoint байхгүй — эхлээд нэг удаа гараар байршуулна уу.');
  }
  if (!res.ok) throw new Error(`${res.status}: ${body.slice(0, 200)}`);
  return JSON.parse(body);
}

async function announce(text: string): Promise<void> {
  const r = (await admin('/admin/announce', { text })) as { players: number; rooms: number };
  console.log(`  📢 "${text}"  →  ${r.rooms} өрөө, ${r.players} тоглогч`);
}

function push(): void {
  console.log('\n🚀 git push origin main …');
  // Скрипт server хавтаснаас ажилладаг тул репог эцэг хавтаснаас түлхэнэ.
  execSync('git push origin main', { stdio: 'inherit', cwd: process.cwd() + '/..' });
  console.log('\n✓ Түлхэгдлээ. Render 3-6 минутын дотор шинэ хувилбарыг асаана.');
}

try {
  if (IMMEDIATE) {
    console.log('Сануулгагүй яаралтай байршуулалт.');
    push();
  } else {
    const rooms = (await admin('/admin/rooms')) as { rooms: number; playing: number };
    if (rooms.playing === 0) {
      console.log('✓ Идэвхтэй тоглогч алга — шууд байршуулна.');
      push();
    } else {
      console.log(`⚠ ${rooms.playing} өрөөнд хүн тоглож байна. 3 минутын сануулга явуулж байна…\n`);
      await announce('⚠️ Сервер 3 минутын дараа шинэчлэгдэнэ — тоглолтоо дуусгаарай!');
      await sleep(120); // 3:00 → 1:00 үлдэв
      await announce('⚠️ 1 минут үлдлээ — шинэчлэлт удахгүй эхэлнэ.');
      await sleep(30); // 1:00 → 0:30 үлдэв
      await announce('⚠️ 30 секунд үлдлээ.');
      await sleep(30); // 0:30 → 0:00
      push();
    }
  }
} catch (err) {
  console.error('✗', err instanceof Error ? err.message : err);
  if (!KEY) console.error('  REPORT_KEY тохируулаагүй байна (server/.env).');
  process.exitCode = 1;
}
