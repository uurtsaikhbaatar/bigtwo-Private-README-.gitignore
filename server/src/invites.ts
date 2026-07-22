/**
 * Урилга — хамт тоглосон найзаа дараагийн тоглолтод дуудах.
 *
 * Найзууд ихэвчлэн ижил хүмүүс байдаг тул тоглолт бүрд шинэ линк явуулах нь
 * төвөгтэй. Оронд нь урилга апп дотор нь харагдана: онлайн байвал тэр дороо,
 * эс бөгөөс дараа нээхэд нь.
 *
 * Зөвхөн БҮРТГЭЛТЭЙ тоглогчийг урина — зочинд хүрэх суваг байхгүй.
 */

import { getPool } from './db';

/** Урилга хэдэн цаг хүчинтэй байх вэ. */
const INVITE_TTL_HOURS = 2;

export interface Invite {
  id: string;
  /** Урьсан хүний нэр — тоглоомын доторх нэр. */
  from: string;
  roomCode: string;
  at: string;
}

/**
 * Урилга үүсгэнэ. Аль хэдийн урьсан бол хугацааг нь сунгана.
 * Урьсан хүмүүсийн userId-г буцаана — онлайн байвал шууд мэдэгдэхэд хэрэгтэй.
 */
export async function inviteUsers(
  userIds: string[],
  fromName: string,
  roomCode: string,
): Promise<string[]> {
  if (userIds.length === 0) return [];
  const expires = new Date(Date.now() + INVITE_TTL_HOURS * 60 * 60 * 1000);

  const result = await getPool().query<{ to_user: string }>(
    `INSERT INTO invites (to_user, from_name, room_code, expires_at)
     SELECT unnest($1::bigint[]), $2, $3, $4
     ON CONFLICT (to_user, room_code) DO UPDATE
       SET from_name = $2, expires_at = $4, created_at = now()
     RETURNING to_user`,
    [userIds, fromName, roomCode, expires],
  );
  return result.rows.map((r) => String(r.to_user));
}

/** Хүчинтэй урилгууд, шинэхнээс нь. */
export async function invitesFor(userId: string): Promise<Invite[]> {
  const result = await getPool().query<{
    id: string;
    from_name: string;
    room_code: string;
    created_at: Date;
  }>(
    `SELECT id, from_name, room_code, created_at
       FROM invites
      WHERE to_user = $1 AND expires_at > now()
      ORDER BY created_at DESC
      LIMIT 5`,
    [userId],
  );
  return result.rows.map((r) => ({
    id: String(r.id),
    from: r.from_name,
    roomCode: r.room_code,
    at: r.created_at.toISOString(),
  }));
}

/** Урилгыг устгана — өрөөнд орсон эсвэл татгалзсан үед. */
export async function dropInvite(userId: string, roomCode: string): Promise<void> {
  await getPool().query('DELETE FROM invites WHERE to_user = $1 AND room_code = $2', [
    userId,
    roomCode,
  ]);
}

/** Хугацаа нь дууссаныг цэвэрлэнэ. */
export async function purgeExpiredInvites(): Promise<number> {
  const result = await getPool().query('DELETE FROM invites WHERE expires_at < now()');
  return result.rowCount ?? 0;
}
