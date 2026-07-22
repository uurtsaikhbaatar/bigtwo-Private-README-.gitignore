/**
 * Тоглолтын түүхийг харах админ хэрэгсэл.
 *
 *   npm run games                — сүүлийн 15 тоглолт
 *   npm run games -- 40          — сүүлийн 40 тоглолт
 *   npm run games -- uuree       — тухайн тоглогчийн тоглолтууд
 *   npm run games -- uuree 30    — хоёуланг нь
 *   npm run games -- all         — туршилтын тоглолтыг ч харуулна
 *
 * Туршилтын тоглолт анхдагчаар харагдахгүй. Тэдгээр нь санд үлддэг —
 * алдаа засахад хэрэгтэй — гэхдээ хүний жагсаалтыг бөглөрүүлэх ёсгүй.
 *
 * Сангаас шууд уншина — сервер ажиллаж байх шаардлагагүй.
 */

import { closePool, dbEnabled, getPool } from './db';

const DEFAULT_LIMIT = 15;

interface MatchRow {
  id: string;
  room_code: string;
  rounds: number;
  target_score: number;
  stake: number;
  dragon: boolean;
  finished_at: Date;
}

interface PlayerRow {
  name: string;
  score: number;
  won: boolean;
  chips: number;
  user_id: string | null;
}

/** 2026-07-22 15:17 хэлбэрээр. */
const when = (d: Date): string => d.toISOString().replace('T', ' ').slice(0, 16);

async function show(name: string | null, limit: number, withTests: boolean): Promise<void> {
  const pool = getPool();

  const matches = await pool.query<MatchRow>(
    `SELECT DISTINCT m.id, m.room_code, m.rounds, m.target_score, m.stake,
            m.dragon, m.finished_at
       FROM matches m
       JOIN match_players mp ON mp.match_id = m.id
      WHERE ($1::text IS NULL OR lower(mp.name) = lower($1))
        AND ($3::boolean OR NOT m.test)
      ORDER BY m.finished_at DESC
      LIMIT $2`,
    [name, limit, withTests],
  );

  if (matches.rows.length === 0) {
    console.log(name ? `"${name}" нэртэй тоглогчийн тоглолт олдсонгүй.` : 'Тоглолт алга.');
    return;
  }

  console.log(
    name
      ? `${matches.rows.length} тоглолт — ${name}\n`
      : `Сүүлийн ${matches.rows.length} тоглолт\n`,
  );

  for (const m of matches.rows) {
    const players = await pool.query<PlayerRow>(
      `SELECT name, score, won, chips, user_id
         FROM match_players WHERE match_id = $1
        ORDER BY won DESC, score ASC`,
      [m.id],
    );

    const chips = m.stake > 0 ? `${m.stake.toLocaleString('en-US')} чип` : 'чипгүй';
    console.log(
      `  ${m.room_code}  ${when(m.finished_at)}  ·  ${m.rounds} тойрог  ·  ` +
        `босго ${m.target_score}  ·  ${chips}${m.dragon ? '  · 🐉 ЛУУ' : ''}`,
    );

    for (const p of players.rows) {
      const mark = p.won ? '🏆' : '  ';
      const money =
        m.stake > 0 ? `  ${p.chips > 0 ? '+' : ''}${p.chips.toLocaleString('en-US')}` : '';
      // Зочноор тоглосон бол токен, цол нь тооцогдоогүй гэсэн үг.
      const guest = p.user_id ? '' : '  (зочин — тооцогдоогүй)';
      console.log(
        `      ${mark} ${p.name.padEnd(14)}${String(p.score).padStart(3)} оноо${money}${guest}`,
      );
    }
    console.log();
  }

  // ── Хураангуй ────────────────────────────────────────────────────────
  const tally = await pool.query<{
    name: string;
    played: string;
    wins: string;
    registered: string;
    chips: string;
  }>(
    `SELECT mp.name,
            count(*)                                        AS played,
            count(*) FILTER (WHERE mp.won)                  AS wins,
            count(*) FILTER (WHERE mp.user_id IS NOT NULL)  AS registered,
            coalesce(sum(mp.chips) FILTER (WHERE mp.user_id IS NOT NULL), 0) AS chips
       FROM match_players mp
       JOIN matches m ON m.id = mp.match_id
      WHERE $1::boolean OR NOT m.test
      GROUP BY mp.name
      HAVING count(*) > 0
      ORDER BY count(*) FILTER (WHERE mp.won) DESC, count(*) DESC
      LIMIT 20`,
    [withTests],
  );

  console.log(`  Нийт${withTests ? ' (туршилт оруулаад)' : ''}:\n`);
  console.log('    нэр            тоглолт  ялалт   хувь   бүртгэлтэй   тооцогдсон чип');
  for (const t of tally.rows) {
    const played = Number(t.played);
    const wins = Number(t.wins);
    const registered = Number(t.registered);
    const rate = played > 0 ? ((wins / played) * 100).toFixed(0) : '0';
    // Бүртгэлгүй тоглосон нь тооцогдоогүйг тодруулна.
    const warn = registered < played ? `  ⚠ ${played - registered} зочноор` : '';
    console.log(
      `    ${t.name.padEnd(14)}${String(played).padStart(7)}${String(wins).padStart(7)}` +
        `${(rate + '%').padStart(7)}${String(registered).padStart(12)}` +
        `${Number(t.chips).toLocaleString('en-US').padStart(16)}${warn}`,
    );
  }
}

if (!dbEnabled()) {
  console.error('DATABASE_URL тохируулаагүй байна (server/.env).');
  process.exitCode = 1;
} else {
  // Аргумент нь тоо бол хязгаар, "all" бол туршилтыг ч оруулна,
  // эс бөгөөс тоглогчийн нэр.
  const args = process.argv.slice(2).filter(Boolean);
  const withTests = args.includes('all');
  const rest = args.filter((a) => a !== 'all');
  const numeric = rest.find((a) => /^\d+$/.test(a));
  const name = rest.find((a) => !/^\d+$/.test(a)) ?? null;
  const limit = Math.min(100, Math.max(1, Number(numeric ?? DEFAULT_LIMIT)));

  try {
    await show(name, limit, withTests);
  } catch (err) {
    console.error('✗', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  } finally {
    await closePool();
  }
}
