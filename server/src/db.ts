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

    -- Туршилтын тоглолтыг тэмдэглэнэ. Устгахгүй — алдаа засахад хэрэгтэй —
    -- гэхдээ хүний харах жагсаалтад гаргахгүй.
    ALTER TABLE matches ADD COLUMN IF NOT EXISTS test BOOLEAN NOT NULL DEFAULT false;

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

    -- Тоглогчийн тавьсан том хослолууд (хос ба түүнээс дээш). Профайлд "хамгийн
    -- том 10 хослол"-оо хэнтэй, хэзээ тавьсныг харуулахад ашиглана.
    CREATE TABLE IF NOT EXISTS player_combos (
      id       BIGSERIAL PRIMARY KEY,
      match_id BIGINT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
      user_id  BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      cards    INTEGER[] NOT NULL,
      size     SMALLINT NOT NULL,
      power    BIGINT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS player_combos_top_idx
      ON player_combos(user_id, size DESC, power DESC);

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

    -- Реклам. Зурагтай эсвэл зөвхөн текстээр байж болно. Зургийг өөрсдийн
    -- санд хадгална: гадны хостинг хэрэггүй, холбоос эвдрэхгүй. Хөдөлдөг
    -- GIF ч багтана.
    CREATE TABLE IF NOT EXISTS ads (
      id          BIGSERIAL PRIMARY KEY,
      title       TEXT NOT NULL,
      -- Зураг ба текст — дор хаяж нэг нь байх ёстой.
      image       BYTEA,
      mime        TEXT,
      body        TEXT,
      -- Дарахад нээгдэх хаяг. Байхгүй бол зүгээр зураг.
      link        TEXT,
      -- Харагдах хугацаа. NULL бол хязгааргүй.
      starts_at   TIMESTAMPTZ,
      ends_at     TIMESTAMPTZ,
      -- Байршлын шүүлтүүр: цагийн бүс/хэлтэй тулгах хэсгүүд.
      -- Хоосон бол хаана ч харагдана.
      regions     TEXT[] NOT NULL DEFAULT '{}',
      -- Эргэлтийн жин: их бол илүү олон удаа гарна.
      weight      INTEGER NOT NULL DEFAULT 1,
      active      BOOLEAN NOT NULL DEFAULT true,
      impressions BIGINT NOT NULL DEFAULT 0,
      clicks      BIGINT NOT NULL DEFAULT 0,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    ALTER TABLE ads ALTER COLUMN image DROP NOT NULL;
    ALTER TABLE ads ALTER COLUMN mime  DROP NOT NULL;
    ALTER TABLE ads ADD COLUMN IF NOT EXISTS body TEXT;
    CREATE INDEX IF NOT EXISTS ads_active_idx ON ads(active) WHERE active;

    -- Сайтын хандалт. Апп нээгдэх (WebSocket холбогдох) бүрд тэмдэглэнэ.
    -- Нэг өдөрт нэг төхөөрөмж = нэг мөр (visitor нь IP-ийн hash — жинхэнэ IP
    -- хадгалахгүй, нууцлал хамгаална). hits нь тухайн өдөр хэдэн удаа нээснийг.
    CREATE TABLE IF NOT EXISTS visits (
      day       DATE NOT NULL,
      visitor   TEXT NOT NULL,
      hits      INTEGER NOT NULL DEFAULT 1,
      first_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (day, visitor)
    );
    CREATE INDEX IF NOT EXISTS visits_day_idx ON visits(day DESC);

    -- Тойргийн бүртгэл. Тойрог дуусах бүрд тэр даруй бичнэ — тоглолт
    -- дуустал хүлээхгүй. Ингэснээр дундаас ОРХИГДСОН тоглолтын дууссан
    -- тойргууд ч хадгалагдана. Тоглогч тус бүрд нэг мөр. game_uid нь тоглолт
    -- бүрд өвөрмөг (эхлэхэд үүснэ) — өрөө нэг код дор олон тоглолт хийж болно.
    CREATE TABLE IF NOT EXISTS round_log (
      id         BIGSERIAL PRIMARY KEY,
      game_uid   TEXT NOT NULL,
      room_code  TEXT NOT NULL,
      round_no   INTEGER NOT NULL,
      ended_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      name       TEXT NOT NULL,
      is_bot     BOOLEAN NOT NULL,
      user_id    BIGINT REFERENCES users(id) ON DELETE SET NULL,
      won        BOOLEAN NOT NULL,
      cards_left INTEGER NOT NULL,
      test       BOOLEAN NOT NULL DEFAULT false
    );
    CREATE INDEX IF NOT EXISTS round_log_game_idx ON round_log(game_uid, round_no);

    -- Идэвхтэй өрөөний snapshot. Өрөө санах ойд байдаг тул сервер дахин асахад
    -- (deploy, restart, crash) устдаг байв — тоглож байсан хүмүүс шидэгддэг.
    -- Энд өрөөний төлөвийг тогтмол хадгалж, сервер асахад сэргээнэ.
    CREATE TABLE IF NOT EXISTS room_state (
      code       TEXT PRIMARY KEY,
      data       JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `;
  await getPool().query(sql);
}

/** Өрөөний snapshot-ыг санд хадгална (upsert). */
export async function saveRoomState(code: string, data: unknown): Promise<void> {
  if (!dbEnabled()) return;
  await getPool().query(
    `INSERT INTO room_state (code, data, updated_at) VALUES ($1, $2, now())
       ON CONFLICT (code) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
    [code, JSON.stringify(data)],
  );
}

/** Өрөөнүүдийн snapshot-ыг санаас устгана. */
export async function deleteRoomStates(codes: string[]): Promise<void> {
  if (!dbEnabled() || codes.length === 0) return;
  await getPool().query(`DELETE FROM room_state WHERE code = ANY($1)`, [codes]);
}

/**
 * Санд хадгалсан бүх өрөөний snapshot-ыг унших (сервер асахад).
 * Хэт хуучин (maxAgeMs-ээс өмнөх) snapshot-уудыг эхлээд устгана.
 */
export async function loadRoomStates(
  maxAgeMs: number,
): Promise<Array<{ code: string; data: unknown }>> {
  if (!dbEnabled()) return [];
  await getPool().query(
    `DELETE FROM room_state WHERE updated_at < now() - ($1::int * interval '1 millisecond')`,
    [maxAgeMs],
  );
  const r = await getPool().query<{ code: string; data: unknown }>(
    `SELECT code, data FROM room_state`,
  );
  return r.rows;
}

/** Нэг тойрогт нэг тоглогчийн бичлэг. */
export interface RoundLogRow {
  name: string;
  isBot: boolean;
  /** Бүртгэлтэй хэрэглэгчийн id (байвал), эс бөгөөс null. */
  userId: string | null;
  /** Тухайн тойргийг хожсон эсэх (place === 1). */
  won: boolean;
  /** Тойрог дуусахад үлдсэн хөзрийн тоо. */
  cardsLeft: number;
}

/**
 * Нэг дууссан тойргийг хадгална (тоглогч тус бүрд нэг мөр, нэг INSERT-ээр).
 * Тойргийн тоолол чухал биш — санд алдаа гарвал тоглоомд саад болохгүйгээр
 * чимээгүй өнгөрнө.
 */
export async function recordRound(
  gameUid: string,
  roomCode: string,
  roundNo: number,
  rows: RoundLogRow[],
  isTest = false,
): Promise<void> {
  if (!dbEnabled() || rows.length === 0) return;
  try {
    // Мөр бүрд 9 параметр: ($1..$9), ($10..$18), …
    const values: unknown[] = [];
    const tuples = rows.map((r, i) => {
      const b = i * 9;
      values.push(gameUid, roomCode, roundNo, r.name, r.isBot, r.userId, r.won, r.cardsLeft, isTest);
      return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6}, $${b + 7}, $${b + 8}, $${b + 9})`;
    });
    await getPool().query(
      `INSERT INTO round_log
         (game_uid, room_code, round_no, name, is_bot, user_id, won, cards_left, test)
       VALUES ${tuples.join(', ')}`,
      values,
    );
  } catch (err) {
    console.error('тойрог хадгалж чадсангүй:', err instanceof Error ? err.message : err);
  }
}

/**
 * Сайтын хандалтыг тэмдэглэнэ. visitor нь IP-ийн hash (нэг өдөрт нэг
 * төхөөрөмжийг нэг зочин гэж үзнэ). Санд алдаа гарвал тоглоомд саад
 * болохгүйгээр чимээгүй өнгөрнө.
 */
export async function recordVisit(visitor: string): Promise<void> {
  if (!dbEnabled() || !visitor) return;
  try {
    await getPool().query(
      `INSERT INTO visits (day, visitor) VALUES (current_date, $1)
         ON CONFLICT (day, visitor) DO UPDATE
         SET hits = visits.hits + 1, last_at = now()`,
      [visitor],
    );
  } catch {
    // хандалтын тоолол чухал биш — алдааг залгина
  }
}

/** Хугацаа нь дууссан session-уудыг цэвэрлэнэ. */
export async function purgeExpiredSessions(): Promise<number> {
  const result = await getPool().query('DELETE FROM sessions WHERE expires_at < now()');
  return result.rowCount ?? 0;
}
