/**
 * Алдаа мэдэгдсэн тоглогчид талархал — токен нэмж, талархлын имэйл илгээнэ.
 *
 *   npm run thanks -- <нэр> <түвшин> ["зассан зүйлс; цэг таслалаар"]
 *
 * Түвшин ба токен:
 *   энгийн   → 50,000
 *   чухал    → 150,000
 *   машчухал → 500,000
 *
 * Бүртгэлтэй имэйлтэй бол автоматаар талархлын имэйл илгээнэ. Имэйлгүй бол
 * зөвхөн токен нэмнэ. Хаяг/түлхүүр .env-ээс (DATABASE_URL, EMAIL_*).
 */

export {}; // top-level await-д зориулж модуль болгоно

import { getPool, dbEnabled } from './db';
import { sendEmail } from './email';
import { grantTokens } from './tokens';

const TIERS: Record<string, { tokens: number; label: string }> = {
  энгийн: { tokens: 50_000, label: 'энгийн' },
  simple: { tokens: 50_000, label: 'энгийн' },
  чухал: { tokens: 150_000, label: 'чухал' },
  important: { tokens: 150_000, label: 'чухал' },
  машчухал: { tokens: 500_000, label: 'маш чухал' },
  'маш-чухал': { tokens: 500_000, label: 'маш чухал' },
  critical: { tokens: 500_000, label: 'маш чухал' },
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function groupDigits(n: number): string {
  return n.toLocaleString('en-US').replace(/,/g, ' ');
}

/** Талархлын имэйл — зассан зүйлсийг жагсаана (өгсөн бол). */
function thanksEmail(username: string, tokens: number, fixed: string[]): {
  subject: string;
  text: string;
  html: string;
} {
  const amount = groupDigits(tokens);
  const bulletsText = fixed.length ? '\n' + fixed.map((f) => `  • ${f}`).join('\n') + '\n' : '';
  const text = [
    `Сайн байна уу, ${username}!`,
    '',
    'Дай Ди тоглоомд үнэ цэнэтэй санал, алдаа мэдэгдсэнд гүнээс талархаж байна.',
    fixed.length ? 'Таны хэлсэн зүйлсийг бид засаж, шинэчиллээ:' : 'Таны мэдэгдсэн алдааг бид зассан.',
    bulletsText,
    `Талархлын тэмдэг болгон таны бүртгэлд ${amount} токен нэмлээ 🎁`,
    '',
    'Цаашид ч санал, алдаа байвал тоглоом доторх 🐞 товчоор мэдэгдээрэй.',
    '',
    'Баярлалаа,',
    'Дай Ди баг',
  ].join('\n');

  const bulletsHtml = fixed.length
    ? `<ul style="margin:10px 0;padding-left:18px;color:#333">${fixed
        .map((f) => `<li style="margin:4px 0">${escapeHtml(f)}</li>`)
        .join('')}</ul>`
    : '';
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:460px">
      <h2 style="margin:0 0 8px">Дай Ди</h2>
      <p>Сайн байна уу, <strong>${escapeHtml(username)}</strong>!</p>
      <p>Тоглоомд үнэ цэнэтэй санал, алдаа мэдэгдсэнд гүнээс талархаж байна.</p>
      <p>${fixed.length ? 'Таны хэлсэн зүйлсийг бид засаж, шинэчиллээ:' : 'Таны мэдэгдсэн алдааг бид зассан.'}</p>
      ${bulletsHtml}
      <p style="font-size:16px">Талархлын тэмдэг болгон таны бүртгэлд
        <strong style="color:#1d7a52">${amount} токен</strong> нэмлээ 🎁</p>
      <p style="color:#666;font-size:13px">Цаашид ч санал, алдаа байвал тоглоом доторх 🐞 товчоор мэдэгдээрэй.</p>
      <p style="color:#666;font-size:13px">Баярлалаа,<br><strong>Дай Ди баг</strong></p>
    </div>`;
  return { subject: 'Дай Ди — таны мэдэгдсэн алдаа зассан, баярлалаа! 🎉', text, html };
}

if (!dbEnabled()) {
  console.error('DATABASE_URL тохируулаагүй байна.');
  process.exitCode = 1;
} else {
  const [username, tierArg, ...rest] = process.argv.slice(2);
  const tier = TIERS[(tierArg ?? '').toLowerCase()];
  const fixed = rest.join(' ').split(';').map((s) => s.trim()).filter(Boolean);

  try {
    if (!username || !tier) {
      throw new Error(
        'Хэрэглээ: npm run thanks -- <нэр> <энгийн|чухал|машчухал> ["зассан зүйлс; ..."]',
      );
    }

    const balance = await grantTokens(username, tier.tokens);
    console.log(`✓ ${username}: +${groupDigits(tier.tokens)} (${tier.label}) → нийт ${groupDigits(balance)} токен`);

    const row = await getPool().query<{ email: string | null }>(
      'SELECT email FROM users WHERE username_key = $1',
      [username.trim().toLowerCase()],
    );
    const email = row.rows[0]?.email ?? null;
    if (!email) {
      console.log('  (имэйлгүй бүртгэл — зөвхөн токен нэмэгдлээ)');
    } else {
      await sendEmail({ to: email, ...thanksEmail(username, tier.tokens, fixed) });
      console.log(`  📧 Талархлын имэйл → ${email}`);
    }
  } catch (err) {
    console.error('✗', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  } finally {
    await getPool().end().catch(() => undefined);
  }
}
