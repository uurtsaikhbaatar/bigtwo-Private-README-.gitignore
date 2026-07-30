/**
 * Тоглолтын түүх ба статистик.
 *
 * Тоглолт дуусах бүрд нэг бичлэг үүсгэнэ. Бүртгэлтэй тоглогчид `user_id`-аар
 * холбогдож, зочид зөвхөн нэрээрээ бүртгэгдэнэ.
 */

import type { Card } from '../../app/src/shared/cards';
import { comboLabel, detectCombo } from '../../app/src/shared/combos';
import type { GameState } from '../../app/src/shared/game';
import type {
  LeaderboardEntry,
  MatchSummary,
  PlayerStats,
  TopCombo,
} from '../../app/src/shared/protocol';
import { getPool } from './db';

/**
 * Дууссан тоглолтыг хадгална.
 * `accounts` нь тоглогчийн id → бүртгэлтэй хэрэглэгчийн id (байвал).
 */
export async function recordMatch(
  state: GameState,
  roomCode: string,
  accounts: Map<string, string>,
  /** Туршилтаас үүссэн эсэх — хүний жагсаалтад гарахгүй. */
  isTest = false,
): Promise<void> {
  if (state.phase !== 'matchEnd') return;

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const dragon = state.history.some((r) => r.dragonPlayerId);
    const match = await client.query<{ id: string }>(
      `INSERT INTO matches (room_code, rounds, target_score, stake, dragon, test)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [roomCode, state.round, state.targetScore, state.stake, dragon, isTest],
    );
    const matchId = match.rows[0].id;

    for (const player of state.players) {
      const chips = state.settlement?.find((s) => s.playerId === player.id)?.amount ?? 0;
      const userId = accounts.get(player.id) ?? null;
      await client.query(
        `INSERT INTO match_players (match_id, user_id, name, score, won, chips)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (match_id, name) DO NOTHING`,
        [matchId, userId, player.name, player.score, player.id === state.matchWinnerId, chips],
      );

      // Бүртгэлтэй тоглогчийн энэ тоглолтын хамгийн том 5 хослолыг (хос ба
      // дээш) хадгална — профайлд "том 10 хослол"-оо харуулахад.
      if (userId) {
        const top = player.matchCombos
          .filter((c) => c.size >= 2)
          .sort((a, b) => b.size - a.size || b.power - a.power)
          .slice(0, 5);
        for (const c of top) {
          await client.query(
            `INSERT INTO player_combos (match_id, user_id, cards, size, power)
             VALUES ($1, $2, $3, $4, $5)`,
            [matchId, userId, c.cards, c.size, c.power],
          );
        }
      }
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Тоглогчийн бүх цаг үеийн хамгийн том хослолууд — хэнтэй, хэзээ тавьсантай нь.
 * Хэмжээ → хүчээр эрэмбэлж, дээд `limit`-ийг буцаана.
 */
export async function topCombosForUser(userId: string, limit = 10): Promise<TopCombo[]> {
  const result = await getPool().query<{
    cards: number[];
    finished_at: Date;
    opponents: string[] | null;
  }>(
    `SELECT pc.cards, m.finished_at,
            (SELECT array_agg(mp.name)
               FROM match_players mp
              WHERE mp.match_id = pc.match_id
                AND mp.user_id IS DISTINCT FROM pc.user_id) AS opponents
       FROM player_combos pc
       JOIN matches m ON m.id = pc.match_id
      WHERE pc.user_id = $1
      ORDER BY pc.size DESC, pc.power DESC
      LIMIT $2`,
    [userId, limit],
  );
  return result.rows.map((row) => {
    const cards = row.cards as Card[];
    const combo = detectCombo(cards);
    return {
      cards,
      label: combo ? comboLabel(combo) : '',
      opponents: row.opponents ?? [],
      at: row.finished_at.toISOString(),
    };
  });
}

/** Хэрэглэгчийн нийт статистик. */
export async function statsForUser(userId: string): Promise<PlayerStats> {
  const result = await getPool().query<{
    matches: string;
    wins: string;
    ranked_wins: string;
    chips: string;
    dragons: string;
  }>(
    // ranked_wins: ЗӨВХӨН чиптэй тоглолтын хожил — цол үүгээр тодорхойлогдоно.
    // Чипгүй тоглолтоор цол цуглуулах боломжийг хаана.
    `SELECT count(*)                                            AS matches,
            count(*) FILTER (WHERE mp.won)                      AS wins,
            count(*) FILTER (WHERE mp.won AND m.stake > 0)      AS ranked_wins,
            coalesce(sum(mp.chips), 0)                          AS chips,
            count(*) FILTER (WHERE m.dragon AND mp.won)         AS dragons
       FROM match_players mp
       JOIN matches m ON m.id = mp.match_id
      WHERE mp.user_id = $1`,
    [userId],
  );
  const row = result.rows[0];
  return {
    matches: Number(row?.matches ?? 0),
    wins: Number(row?.wins ?? 0),
    rankedWins: Number(row?.ranked_wins ?? 0),
    chips: Number(row?.chips ?? 0),
    dragons: Number(row?.dragons ?? 0),
  };
}

/** Хэрэглэгчийн сүүлийн тоглолтууд. */
export async function recentMatches(userId: string, limit = 10): Promise<MatchSummary[]> {
  const result = await getPool().query<{
    id: string;
    room_code: string;
    rounds: number;
    stake: number;
    dragon: boolean;
    finished_at: Date;
    won: boolean;
    score: number;
    chips: number;
    players: Array<{ name: string; score: number; won: boolean }>;
  }>(
    `SELECT m.id, m.room_code, m.rounds, m.stake, m.dragon, m.finished_at,
            mine.won, mine.score, mine.chips,
            (SELECT json_agg(json_build_object('name', p.name, 'score', p.score, 'won', p.won)
                             ORDER BY p.won DESC, p.score ASC)
               FROM match_players p WHERE p.match_id = m.id) AS players
       FROM match_players mine
       JOIN matches m ON m.id = mine.match_id
      WHERE mine.user_id = $1
      ORDER BY m.finished_at DESC
      LIMIT $2`,
    [userId, limit],
  );

  return result.rows.map((row) => ({
    id: row.id,
    roomCode: row.room_code,
    rounds: row.rounds,
    stake: row.stake,
    dragon: row.dragon,
    finishedAt: row.finished_at.toISOString(),
    won: row.won,
    score: row.score,
    chips: row.chips,
    players: row.players ?? [],
  }));
}

/**
 * Топ тоглогчид — бүх хүнд харагдана. Цолыг тодорхойлдог чиптэй тоглолтын
 * хожлоор эрэмбэлнэ (тэнцвэл нийт хожлоор). Зөвхөн бүртгэлтэй хэрэглэгч
 * (bot биш — bot-д user_id байхгүй), тест тоглолт хасагдана. Ядаж нэг
 * удаа хожсон хүмүүсийг л оруулна.
 */
export async function leaderboard(limit = 10): Promise<LeaderboardEntry[]> {
  const result = await getPool().query<{
    username: string;
    ranked_wins: number;
    wins: number;
    matches: number;
  }>(
    `SELECT u.username,
            count(*) FILTER (WHERE mp.won AND m.stake > 0)::int AS ranked_wins,
            count(*) FILTER (WHERE mp.won)::int                 AS wins,
            count(*)::int                                       AS matches
       FROM match_players mp
       JOIN matches m ON m.id = mp.match_id
       JOIN users u ON u.id = mp.user_id
      WHERE mp.user_id IS NOT NULL AND NOT m.test
        -- Автомат тест/smoke бүртгэлийг хасна (жинхэнэ тоглогч биш).
        AND u.username NOT LIKE 'тест_%'
        AND u.username NOT LIKE 'test_%'
        AND u.username NOT LIKE 'smoke%'
      GROUP BY u.username
     HAVING count(*) FILTER (WHERE mp.won) > 0
      ORDER BY ranked_wins DESC, wins DESC, matches ASC
      LIMIT $1`,
    [limit],
  );
  return result.rows.map((row) => ({
    username: row.username,
    rankedWins: row.ranked_wins,
    wins: row.wins,
    matches: row.matches,
  }));
}
