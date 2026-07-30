/**
 * Тоглоомын статистик — хэдэн хэрэглэгч, хэдэн тоглолт, хэн идэвхтэйг харна.
 *
 *   npm run stats
 *
 * Энэ нь ТОГЛООМЫН тоо (сангаас). Вэб хандалт (хэдэн хүн сайт нээсэн) нь
 * Cloudflare → Web Analytics-аас харагдана — тэр нь өөр хэмжүүр.
 */

export {}; // top-level await-д зориулж модуль болгоно

import { getPool, dbEnabled } from './db';

function groupDigits(n: number): string {
  return n.toLocaleString('en-US').replace(/,/g, ' ');
}

if (!dbEnabled()) {
  console.error('DATABASE_URL тохируулаагүй байна.');
  process.exitCode = 1;
} else {
  const pool = getPool();
  const q = <T>(sql: string, params: unknown[] = []) =>
    pool.query(sql, params).then((r) => r.rows as T[]);
  try {
    const users = (
      await q<{ n: number; v: number; new7: number; new1: number }>(
        `SELECT count(*)::int n,
                count(*) FILTER (WHERE email_verified)::int v,
                count(*) FILTER (WHERE created_at > now() - interval '7 days')::int new7,
                count(*) FILTER (WHERE created_at > now() - interval '1 day')::int new1
           FROM users`,
      )
    )[0];
    const matches = (
      await q<{ n: number; r: number; chip: number; today: number }>(
        `SELECT count(*)::int n,
                coalesce(sum(rounds), 0)::int r,
                count(*) FILTER (WHERE stake > 0)::int chip,
                count(*) FILTER (WHERE finished_at > now() - interval '1 day')::int today
           FROM matches WHERE NOT test`,
      )
    )[0];
    const active = (
      await q<{ a7: number; a1: number }>(
        `SELECT count(DISTINCT mp.user_id) FILTER (WHERE m.finished_at > now() - interval '7 days')::int a7,
                count(DISTINCT mp.user_id) FILTER (WHERE m.finished_at > now() - interval '1 day')::int a1
           FROM match_players mp JOIN matches m ON m.id = mp.match_id
          WHERE mp.user_id IS NOT NULL AND NOT m.test`,
      )
    )[0];

    console.log('\n════════ ДАЙ ДИ — СТАТИСТИК ════════\n');
    console.log('👥 БҮРТГЭЛ');
    console.log(`   Нийт бүртгэл      : ${groupDigits(users.n)}`);
    console.log(`   Имэйл баталгаажсан: ${groupDigits(users.v)}`);
    console.log(`   Шинэ (7 хоног)    : ${groupDigits(users.new7)}   ·   өнөөдөр: ${users.new1}`);
    console.log('\n🎮 ТОГЛОЛТ');
    console.log(`   Нийт тоглолт      : ${groupDigits(matches.n)}   (${groupDigits(matches.r)} тойрог)`);
    console.log(`   Чиптэй тоглолт    : ${groupDigits(matches.chip)}`);
    console.log(`   Өнөөдөр           : ${matches.today} тоглолт`);
    console.log('\n🔥 ИДЭВХ');
    console.log(`   7 хоногт тоглосон : ${groupDigits(active.a7)} хүн`);
    console.log(`   Өнөөдөр тоглосон  : ${groupDigits(active.a1)} хүн`);

    const top = await q<{ username: string; games: number; wins: number; chips: number }>(
      `SELECT u.username,
              count(*)::int games,
              count(*) FILTER (WHERE mp.won)::int wins,
              coalesce(sum(mp.chips), 0)::int chips
         FROM match_players mp JOIN users u ON u.id = mp.user_id JOIN matches m ON m.id = mp.match_id
        WHERE NOT m.test
        GROUP BY u.username ORDER BY games DESC LIMIT 10`,
    );
    console.log('\n🏆 ХАМГИЙН ИДЭВХТЭЙ ТОГЛОГЧИД');
    for (const p of top) {
      const rate = p.games > 0 ? Math.round((p.wins / p.games) * 100) : 0;
      console.log(
        `   ${p.username.padEnd(16)} ${String(p.games).padStart(3)} тоглолт · ${String(p.wins).padStart(3)} хожил (${rate}%)`,
      );
    }
    console.log('\n💡 Вэб хандалт (хэдэн хүн сайт нээсэн) → Cloudflare → Web Analytics');
    console.log();
  } catch (err) {
    console.error('✗', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  } finally {
    await pool.end().catch(() => undefined);
  }
}
