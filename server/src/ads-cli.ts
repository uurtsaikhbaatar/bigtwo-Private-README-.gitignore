/**
 * Реклам удирдах админ хэрэгсэл.
 *
 *   npm run ads                          — бүх рекламыг жагсаана
 *   npm run ads -- add <зургийн зам> "Гарчиг" [сонголтууд]
 *   npm run ads -- text "Гарчиг" "Бичих текст" [сонголтууд]
 *   npm run ads -- off <id>              — түр унтраана
 *   npm run ads -- on  <id>              — эргүүлж асаана
 *   npm run ads -- rm  <id>              — бүрмөсөн устгана
 *
 * Зурагтай рекламд текст нэмэх бол `--text="..."` гэж өгнө.
 *
 * Сонголтууд:
 *   --link=https://…      дарахад нээгдэх хаяг
 *   --from=2026-08-01     энэ өдрөөс эхэлж харагдана
 *   --to=2026-08-31       энэ өдрөөр дуусна
 *   --region=Ulaanbaatar  байршлын шүүлтүүр (олон удаа бичиж болно)
 *   --weight=3            эргэлтэд хэдэн дахин их гарах вэ
 *
 * Байршлын шүүлтүүр нь тоглогчийн цагийн бүс (Asia/Ulaanbaatar) ба хэл
 * (mn-MN) хоёрын дотор таарч байвал харуулна. Бичихгүй бол хаана ч гарна.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { AdError, addAd, deleteAd, listAds, setAdActive } from './ads';
import { closePool, dbEnabled } from './db';

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

function formatDate(iso: string | null): string {
  return iso ? iso.slice(0, 10) : '—';
}

async function show(): Promise<void> {
  const ads = await listAds();
  if (ads.length === 0) {
    console.log('Реклам алга.\n');
    console.log('Зурагтай:  npm run ads -- add зураг.gif "Гарчиг" --link=https://жишээ.mn');
    console.log('Текстээр:  npm run ads -- text "Гарчиг" "Бичих текст" --link=https://жишээ.mn');
    return;
  }

  console.log(`${ads.length} реклам:\n`);
  for (const ad of ads) {
    const state = ad.active ? '●' : '○ унтраалттай';
    const when =
      ad.startsAt || ad.endsAt ? `${formatDate(ad.startsAt)} → ${formatDate(ad.endsAt)}` : 'үргэлж';
    const where = ad.regions.length > 0 ? ad.regions.join(', ') : 'хаана ч';
    const rate = ad.impressions > 0 ? ((ad.clicks / ad.impressions) * 100).toFixed(1) : '0.0';

    const kind = ad.hasImage ? (ad.body ? 'зураг+текст' : 'зураг') : 'текст';
    console.log(`  [${ad.id}] ${state}  ${ad.title}   (${kind})`);
    if (ad.body) console.log(`       "${ad.body}"`);
    console.log(`       хугацаа: ${when}   байршил: ${where}   жин: ${ad.weight}`);
    console.log(
      `       ${ad.impressions} үзсэн · ${ad.clicks} дарсан (${rate}%)` +
        (ad.hasImage ? ` · ${(ad.bytes / 1024).toFixed(0)}KB` : ''),
    );
    if (ad.link) console.log(`       ${ad.link}`);
    console.log();
  }
}

/** Тэмдэглэгээ ба тэмдэглэгээгүй аргументуудыг ялгана. */
function parseFlags(args: string[]): { flags: Map<string, string[]>; plain: string[] } {
  const flags = new Map<string, string[]>();
  const plain: string[] = [];
  for (const arg of args) {
    const match = /^--([a-z]+)=(.*)$/.exec(arg);
    if (match) {
      const list = flags.get(match[1]) ?? [];
      list.push(match[2]);
      flags.set(match[1], list);
    } else {
      plain.push(arg);
    }
  }
  return { flags, plain };
}

/** Зөвхөн текстээр реклам нэмнэ — зураг бэлдэх шаардлагагүй. */
async function addText(args: string[]): Promise<void> {
  const { flags, plain } = parseFlags(args);
  const [title, body] = plain;
  if (!title || !body) {
    throw new AdError('Хэрэглээ: npm run ads -- text "Гарчиг" "Текст" [--link=…]');
  }

  const id = await addAd({
    title,
    body,
    link: flags.get('link')?.[0] ?? null,
    startsAt: flags.get('from')?.[0] ?? null,
    endsAt: flags.get('to')?.[0] ?? null,
    regions: flags.get('region') ?? [],
    weight: Number(flags.get('weight')?.[0] ?? 1),
  });

  console.log(`✓ [${id}] "${title}" нэмэгдлээ (текст реклам)`);
}

async function add(args: string[]): Promise<void> {
  const { flags, plain } = parseFlags(args);
  const [file, title] = plain;
  if (!file || !title) {
    throw new AdError('Хэрэглээ: npm run ads -- add <зургийн зам> "Гарчиг" [--link=…]');
  }

  const ext = path.extname(file).toLowerCase();
  const mime = MIME_BY_EXT[ext];
  if (!mime) throw new AdError(`Зөвшөөрөгдөх өргөтгөл: ${Object.keys(MIME_BY_EXT).join(', ')}`);

  const image = await readFile(file).catch(() => {
    throw new AdError(`Файл олдсонгүй: ${file}`);
  });

  const id = await addAd({
    title,
    image,
    mime,
    body: flags.get('text')?.[0] ?? null,
    link: flags.get('link')?.[0] ?? null,
    startsAt: flags.get('from')?.[0] ?? null,
    endsAt: flags.get('to')?.[0] ?? null,
    regions: flags.get('region') ?? [],
    weight: Number(flags.get('weight')?.[0] ?? 1),
  });

  console.log(`✓ [${id}] "${title}" нэмэгдлээ (${(image.byteLength / 1024).toFixed(0)}KB)`);
}

if (!dbEnabled()) {
  console.error('DATABASE_URL тохируулаагүй байна.');
  process.exitCode = 1;
} else {
  const [command, ...rest] = process.argv.slice(2);
  try {
    if (command === 'add') {
      await add(rest);
    } else if (command === 'text') {
      await addText(rest);
    } else if (command === 'on' || command === 'off') {
      const id = rest[0];
      if (!id) throw new AdError(`Хэрэглээ: npm run ads -- ${command} <id>`);
      const ok = await setAdActive(id, command === 'on');
      console.log(ok ? `✓ [${id}] ${command === 'on' ? 'асаалаа' : 'унтраалаа'}` : `✗ [${id}] олдсонгүй`);
    } else if (command === 'rm') {
      const id = rest[0];
      if (!id) throw new AdError('Хэрэглээ: npm run ads -- rm <id>');
      console.log((await deleteAd(id)) ? `✓ [${id}] устлаа` : `✗ [${id}] олдсонгүй`);
    } else if (command) {
      throw new AdError(`Танихгүй команд: ${command}. add | text | on | off | rm`);
    } else {
      await show();
    }
  } catch (err) {
    console.error('✗', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  } finally {
    await closePool();
  }
}
