/**
 * Тоглолтын түүх ба статистик.
 *
 * Тоглолт дуусах бүрд нэг бичлэг үүсгэнэ. Бүртгэлтэй тоглогчид `user_id`-аар
 * холбогдож, зочид зөвхөн нэрээрээ бүртгэгдэнэ.
 */

import type { GameState } from '../../app/src/shared/game';
import type { MatchSummary, PlayerStats } from '../../app/src/shared/protocol';
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
      await client.query(
        `INSERT INTO match_players (match_id, user_id, name, score, won, chips)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (match_id, name) DO NOTHING`,
        [
          matchId,
          accounts.get(player.id) ?? null,
          player.name,
          player.score,
          player.id === state.matchWinnerId,
          chips,
        ],
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
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
