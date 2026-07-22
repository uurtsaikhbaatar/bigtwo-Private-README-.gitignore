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

/**
 * Холболтын мөрөөс SSL-ийн параметрүүдийг хасна.
 *
 * `sslmode` нь `pg`-д ойлгомжгүй байдал үүсгэж, хувилбар солигдоход утга нь
 * өөрчлөгдөх анхааруулга өгдөг. Бид TLS-ээ дээрх `ssl` тохиргоогоор
 * тодорхой зааж өгсөн тул мөрөнд давхар байх шаардлагагүй.
 */
function stripSslParams(connectionString: string): string {
  try {
    const url = new URL(connectionString);
    url.searchParams.delete('sslmode');
    url.searchParams.delete('channel_binding');
    return url.toString();
  } catch {
    return connectionString;
  }
}

export function getPool(): pg.Pool {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL тохируулаагүй байна.');
  }
  if (!pool) {
    pool = new pg.Pool({
      connectionString: stripSslParams(process.env.DATABASE_URL),
      // Neon зэрэг үүлэн сан TLS шаарддаг. Сертификатыг БҮРЭН шалгана —
      // ингэснээр дундаас чагнах халдлагаас хамгаална. (Neon нь нийтийн
      // CA-аар гарын үсэг зурсан тул нэмэлт тохиргоо шаардлагагүй.)
      ssl: { rejectUnauthorized: true },
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

    -- Имэйл нь хожим нэмэгдсэн тул одоо байгаа хүснэгтэд ч тавигдана.
    ALTER TABLE users ADD COLUMN IF NOT EXISTS email          TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS email_key      TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT false;
    -- Имэйлгүй (хуучин) бүртгэлүүд давхцлын шалгалтад орохгүй.
    CREATE UNIQUE INDEX IF NOT EXISTS users_email_key_idx
      ON users(email_key) WHERE email_key IS NOT NULL;

    -- Виртуал токен: бүртгүүлэхэд бэлэглэгддэг, бооцоотой тоглолтод хэлбэлзэнэ.
    ALTER TABLE users ADD COLUMN IF NOT EXISTS tokens BIGINT NOT NULL DEFAULT 1000000;
    -- Профайлын зураг: emoji эсвэл data: URL (128×128 болгож жижигрүүлсэн).
    ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar TEXT;

    -- Токен дуусахад хэрэглэгч нэмэлт хүсэх бөгөөд админ гараар олгоно.
    CREATE TABLE IF NOT EXISTS token_requests (
      id           BIGSERIAL PRIMARY KEY,
      user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      granted_at   TIMESTAMPTZ,
      granted      BIGINT
    );
    CREATE INDEX IF NOT EXISTS token_requests_pending_idx
      ON token_requests(user_id) WHERE granted_at IS NULL;

    -- Баталгаажуулах код. Хэрэглэгч тутамд нэг л идэвхтэй код байна.
    CREATE TABLE IF NOT EXISTS email_codes (
      user_id    BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      code_hash  TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      attempts   INTEGER NOT NULL DEFAULT 0,
      sent_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- Нууц үг сэргээх код. Баталгаажуулах кодоос ТУСДАА хүснэгт: хэрэглэгч
    -- имэйлээ баталгаажуулж байхдаа зэрэг нууц үгээ сэргээж болно.
    CREATE TABLE IF NOT EXISTS password_resets (
      user_id    BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      code_hash  TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      attempts   INTEGER NOT NULL DEFAULT 0,
      sent_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- Урилга: хамт тоглосон найзаа дараагийн тоглолтод дуудна. Линк дахин
    -- явуулах шаардлагагүй — апп дотор нь харагдана.
    CREATE TABLE IF NOT EXISTS invites (
      id         BIGSERIAL PRIMARY KEY,
      to_user    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      from_name  TEXT NOT NULL,
      room_code  TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at TIMESTAMPTZ NOT NULL
    );
    CREATE INDEX IF NOT EXISTS invites_to_idx ON invites(to_user, expires_at);
    -- Нэг өрөөнөөс нэг хүнд нэг л урилга.
    CREATE UNIQUE INDEX IF NOT EXISTS invites_unique_idx ON invites(to_user, room_code);

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

    -- Тоглогчдоос ирсэн алдааны мэдэгдэл. Файлд биш энд хадгална — Render-ийн
    -- диск deploy бүрд цэвэрлэгддэг тул файл дээр хадгалбал мэдэгдэл алга болно.
    CREATE TABLE IF NOT EXISTS reports (
      id          TEXT PRIMARY KEY,
      at          TIMESTAMPTZ NOT NULL DEFAULT now(),
      kind        TEXT NOT NULL,
      code        TEXT,
      player_name TEXT,
      text        TEXT NOT NULL,
      context     JSONB NOT NULL DEFAULT '{}'::jsonb
    );
    CREATE INDEX IF NOT EXISTS reports_at_idx ON reports(at DESC);
  `;
  await getPool().query(sql);
}

/** Хугацаа нь дууссан session-уудыг цэвэрлэнэ. */
export async function purgeExpiredSessions(): Promise<number> {
  const result = await getPool().query('DELETE FROM sessions WHERE expires_at < now()');
  return result.rowCount ?? 0;
}
