/**
 * Postgres холболт ба схем.
 *
 * `DATABASE_URL` тохируулаагүй бол өгөгдлийн сан унтраалттай горимд ажиллана —
 * бүртгэлгүйгээр зочноор тоглох боломж хэвээр үлдэнэ. Ингэснээр локал
 * хөгжүүлэлтэд сан заавал шаардлагагүй.
 */

import pg from 'pg';

let pool: pg.Pool | null = null;

/** Өгөгдлийн сан тохируулагдсан эсэх. */
export function dbEnabled(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export function getPool(): pg.Pool {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL тохируулаагүй байна.');
  }
  if (!pool) {
    pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      // Neon зэрэг үүлэн сан TLS шаарддаг.
      ssl: { rejectUnauthorized: false },
      max: 5,
      idleTimeoutMillis: 30_000,
    });
    pool.on('error', (err) => console.error('Postgres pool алдаа:', err.message));
  }
  return pool;
}

export async function closePool(): Promise<void> {
  await pool?.end();
  pool = null;
}

/** Хүснэгтүүдийг үүсгэнэ. Дахин дуудахад аюулгүй. */
export async function initSchema(): Promise<void> {
  const sql = `
    CREATE TABLE IF NOT EXISTS users (
      id           BIGSERIAL PRIMARY KEY,
      username     TEXT NOT NULL,
      username_key TEXT NOT NULL UNIQUE,
      password     TEXT NOT NULL,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token      TEXT PRIMARY KEY,
      user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at TIMESTAMPTZ NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);

    CREATE TABLE IF NOT EXISTS matches (
      id           BIGSERIAL PRIMARY KEY,
      room_code    TEXT NOT NULL,
      rounds       INTEGER NOT NULL,
      target_score INTEGER NOT NULL,
      stake        INTEGER NOT NULL,
      dragon       BOOLEAN NOT NULL DEFAULT false,
      finished_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS match_players (
      match_id  BIGINT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
      user_id   BIGINT REFERENCES users(id) ON DELETE SET NULL,
      name      TEXT NOT NULL,
      score     INTEGER NOT NULL,
      won       BOOLEAN NOT NULL,
      chips     INTEGER NOT NULL,
      PRIMARY KEY (match_id, name)
    );
    CREATE INDEX IF NOT EXISTS match_players_user_idx ON match_players(user_id);
  `;
  await getPool().query(sql);
}

/** Хугацаа нь дууссан session-уудыг цэвэрлэнэ. */
export async function purgeExpiredSessions(): Promise<number> {
  const result = await getPool().query('DELETE FROM sessions WHERE expires_at < now()');
  return result.rowCount ?? 0;
}
