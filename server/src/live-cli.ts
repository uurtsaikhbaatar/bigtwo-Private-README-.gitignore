/**
 * Амьд серверийг харах, тоглогчдод мэдэгдэх админ хэрэгсэл.
 *
 *   npm run live                        — хэн тоглож байгааг харуулна
 *   npm run live -- "5 мин дараа шинэчилнэ"  — бүх өрөөнд мэдэгдэнэ
 *
 * Хаяг ба түлхүүрийг `.env`-ээс уншина:
 *   LIVE_URL=https://bigtwo-pe4v.onrender.com
 *   REPORT_KEY=…
 */

export {}; // top-level await ашиглахын тулд модуль болгоно

const BASE = (process.env.LIVE_URL ?? 'http://localhost:8787').replace(/\/+$/, '');
const KEY = process.env.REPORT_KEY ?? '';

interface RoomRow {
  code: string;
  phase: string;
  round: number;
  stake: number;
  online: number;
  idleSeconds: number;
  players: Array<{
    name: string;
    connected: boolean;
    registered: boolean;
    score: number;
    eliminated: boolean;
  }>;
}

const PHASE_NAMES: Record<string, string> = {
  lobby: 'хүлээж байна',
  playing: 'ТОГЛОЖ БАЙНА',
  roundEnd: 'тойрог дууслаа',
  matchEnd: 'тоглолт дууслаа',
};

async function call(path: string): Promise<unknown> {
  const url = new URL(BASE + path);
  if (KEY) url.searchParams.set('key', KEY);
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  const body = await res.text();

  if (res.status === 403) {
    throw new Error('REPORT_KEY таарахгүй байна. server/.env доторхыг Render дээрхтэй тулгана уу.');
  }
  // Сервер вэб аппаа буцаасан бол энэ зам түүн дээр байхгүй гэсэн үг —
  // өөрөөр хэлбэл шинэ кодыг хараахан байршуулаагүй.
  if (body.trimStart().startsWith('<')) {
    throw new Error(
      'Сервер дээр энэ боломж хараахан байхгүй байна.\n' +
        '  Шинэ кодыг байршуулсны дараа ажиллана: git push origin main',
    );
  }
  if (!res.ok) throw new Error(`${res.status}: ${body.slice(0, 200)}`);
  return JSON.parse(body);
}

function showRooms(data: { rooms: number; playing: number; list: RoomRow[] }): void {
  console.log(`Сервер: ${BASE}\n`);
  if (data.rooms === 0) {
    console.log('✓ Нэг ч өрөө нээлттэй байхгүй — байршуулахад аюулгүй.');
    return;
  }

  for (const room of data.list) {
    const phase = PHASE_NAMES[room.phase] ?? room.phase;
    const chips = room.stake > 0 ? `${room.stake} чип` : 'чипгүй';
    console.log(`  ${room.code}  ${phase}  ·  ${room.round}-р тойрог  ·  ${chips}`);
    for (const p of room.players) {
      const marks = [
        p.connected ? '●' : '○',
        p.registered ? '' : '(зочин)',
        p.eliminated ? '· хасагдсан' : '',
      ]
        .filter(Boolean)
        .join(' ');
      console.log(`     ${marks} ${p.name.padEnd(16)} ${p.score} оноо`);
    }
    if (room.online === 0) {
      console.log(`     (хэн ч холбогдоогүй, ${room.idleSeconds} сек идэвхгүй)`);
    }
    console.log();
  }

  if (data.playing > 0) {
    console.log(`⚠ ${data.playing} өрөөнд хүн байна — байршуулбал тэд унана.`);
    console.log('  Эхлээд мэдэгдээрэй:');
    console.log('    npm run live -- "5 минутын дараа шинэчилнэ, тоглолтоо дуусгаарай"');
  } else {
    console.log('✓ Идэвхтэй тоглогч алга — байршуулахад аюулгүй.');
  }
}

const message = process.argv.slice(2).join(' ').trim();

try {
  if (message) {
    const sent = (await call(`/admin/announce?text=${encodeURIComponent(message)}`)) as {
      players: number;
      rooms: number;
    };
    console.log(`✓ "${message}"`);
    console.log(`  ${sent.rooms} өрөө, ${sent.players} тоглогчид хүрлээ.`);
  } else {
    showRooms((await call('/admin/rooms')) as { rooms: number; playing: number; list: RoomRow[] });
  }
} catch (err) {
  console.error('✗', err instanceof Error ? err.message : err);
  if (!KEY) console.error('  REPORT_KEY тохируулаагүй байна (server/.env).');
  process.exitCode = 1;
}
