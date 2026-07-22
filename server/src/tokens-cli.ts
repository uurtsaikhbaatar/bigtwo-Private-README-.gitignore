/**
 * Токен удирдах админ хэрэгсэл.
 *
 *   npm run tokens                          — хүлээгдэж буй хүсэлтүүд
 *   npm run tokens -- grant <нэр> [хэмжээ]  — токен олгох
 *
 * Токен нь виртуал тоглоомын оноо — бодит мөнгө биш, ханшгүй.
 */

import { closePool, dbEnabled } from './db';
import { DEFAULT_GRANT, TokenError, grantTokens, pendingRequests } from './tokens';

if (!dbEnabled()) {
  console.error('DATABASE_URL тохируулаагүй байна.');
  process.exitCode = 1;
} else {
  const [command, username, amount] = process.argv.slice(2);

  try {
    if (command === 'grant') {
      if (!username) throw new TokenError('Хэрэглээ: npm run tokens -- grant <нэр> [хэмжээ]');
      const value = amount ? Number(amount) : DEFAULT_GRANT;
      const balance = await grantTokens(username, value);
      console.log(`✓ ${username}: +${value} → нийт ${balance} токен`);
    } else {
      const requests = await pendingRequests();
      if (requests.length === 0) {
        console.log('Хүлээгдэж буй хүсэлт алга.');
      } else {
        console.log(`${requests.length} хүсэлт:\n`);
        for (const r of requests) {
          const when = r.requestedAt.replace('T', ' ').slice(0, 16);
          console.log(`  ${r.username.padEnd(16)} үлдэгдэл ${String(r.tokens).padStart(9)}  ${when}`);
          console.log(`    ${r.email ?? '—'}`);
        }
        console.log(`\nОлгох:  npm run tokens -- grant <нэр> ${DEFAULT_GRANT}`);
      }
    }
  } catch (err) {
    console.error('✗', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  } finally {
    await closePool();
  }
}
