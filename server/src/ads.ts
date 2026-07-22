/**
 * Реклам — зураг эсвэл текст, хугацаа, байршлын шүүлтүүр.
 *
 * Зурагтай, зөвхөн текстээр, эсвэл хоёуланг нь хослуулж болно.
 *
 * БАЙРШИЛ: тоглогчийн цагийн бүс (`Asia/Ulaanbaatar`) ба хэл (`mn-MN`) хоёрыг
 * л ашиглана. Хөтөч эдгээрийг зөвшөөрөл асуухгүйгээр өгдөг бөгөөд гадны
 * үйлчилгээ шаардахгүй. Рекламын `regions` дотор бичсэн аль нэг үг тэр хоёрын
 * дотор таарвал харагдана — жишээ нь `Asia/Ulaanbaatar`, `Asia/`, эсвэл `mn`.
 * Хоосон бол хаана ч харагдана.
 *
 * Нарийн (хот хүртэл) ялгах бол IP хаягийн үйлчилгээ хэрэгтэй болно.
 */

import { getPool } from './db';

/** Зургийн дээд хэмжээ. Хөдөлдөг GIF ч ихэвчлэн үүнд багтана. */
export const MAX_AD_BYTES = 512 * 1024;
/** Текстийн дээд урт — тоглогчийн дэлгэцийг эзлэхгүйн тулд. */
export const MAX_AD_TEXT = 200;

const ALLOWED_MIME = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

export class AdError extends Error {}

export interface AdRow {
  id: string;
  title: string;
  body: string | null;
  hasImage: boolean;
  link: string | null;
  startsAt: string | null;
  endsAt: string | null;
  regions: string[];
  weight: number;
  active: boolean;
  impressions: number;
  clicks: number;
  bytes: number;
}

export interface NewAd {
  title: string;
  /** Зураг — текст өгсөн бол заавал биш. */
  image?: Buffer | null;
  mime?: string | null;
  /** Текст — зураг өгсөн бол заавал биш. */
  body?: string | null;
  link?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  regions?: string[];
  weight?: number;
}

export async function addAd(input: NewAd): Promise<string> {
  const title = input.title.trim();
  if (!title) throw new AdError('Гарчиг хоосон байна.');

  const body = input.body?.trim() || null;
  const image = input.image ?? null;

  // Дор хаяж нэг нь байх ёстой — эс бөгөөс хоосон реклам үүснэ.
  if (!image && !body) throw new AdError('Зураг эсвэл текстийн аль нэгийг өгнө үү.');

  if (body && body.length > MAX_AD_TEXT) {
    throw new AdError(`Текст хэт урт: ${body.length} тэмдэгт. Дээд тал нь ${MAX_AD_TEXT}.`);
  }

  if (image) {
    if (!input.mime || !ALLOWED_MIME.includes(input.mime)) {
      throw new AdError(`Зөвшөөрөгдөх төрөл: ${ALLOWED_MIME.join(', ')}`);
    }
    if (image.byteLength > MAX_AD_BYTES) {
      throw new AdError(
        `Зураг хэт том: ${(image.byteLength / 1024).toFixed(0)}KB. ` +
          `Дээд тал нь ${MAX_AD_BYTES / 1024}KB.`,
      );
    }
  }

  const result = await getPool().query<{ id: string }>(
    `INSERT INTO ads (title, image, mime, body, link, starts_at, ends_at, regions, weight)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
    [
      title,
      image,
      image ? input.mime : null,
      body,
      input.link ?? null,
      input.startsAt ?? null,
      input.endsAt ?? null,
      input.regions ?? [],
      Math.max(1, Math.round(input.weight ?? 1)),
    ],
  );
  return result.rows[0].id;
}

export async function listAds(): Promise<AdRow[]> {
  const result = await getPool().query(
    `SELECT id, title, body, link, starts_at, ends_at, regions, weight, active,
            impressions, clicks, coalesce(octet_length(image), 0) AS bytes
       FROM ads ORDER BY active DESC, created_at DESC`,
  );
  return result.rows.map((r) => ({
    id: String(r.id),
    title: r.title,
    body: r.body,
    hasImage: Number(r.bytes) > 0,
    link: r.link,
    startsAt: r.starts_at ? new Date(r.starts_at).toISOString() : null,
    endsAt: r.ends_at ? new Date(r.ends_at).toISOString() : null,
    regions: r.regions ?? [],
    weight: Number(r.weight),
    active: r.active,
    impressions: Number(r.impressions),
    clicks: Number(r.clicks),
    bytes: Number(r.bytes),
  }));
}

export async function setAdActive(id: string, active: boolean): Promise<boolean> {
  const r = await getPool().query('UPDATE ads SET active = $2 WHERE id = $1', [id, active]);
  return (r.rowCount ?? 0) > 0;
}

export async function deleteAd(id: string): Promise<boolean> {
  const r = await getPool().query('DELETE FROM ads WHERE id = $1', [id]);
  return (r.rowCount ?? 0) > 0;
}

/** Рекламын зураг — дамжуулахад. */
export async function adImage(id: string): Promise<{ image: Buffer; mime: string } | null> {
  const r = await getPool().query<{ image: Buffer | null; mime: string | null }>(
    'SELECT image, mime FROM ads WHERE id = $1 AND active AND image IS NOT NULL',
    [id],
  );
  const row = r.rows[0];
  return row?.image && row.mime ? { image: row.image, mime: row.mime } : null;
}

/**
 * Тухайн тоглогчид харуулах рекламууд.
 *
 * Хугацаа, идэвх, байршлаар шүүнэ. Жин их реклам эргэлтэд олон удаа орохын
 * тулд жингийнхээ тоогоор давтагдаж, дараа нь холилдоно.
 */
export async function adsFor(
  timezone: string,
  language: string,
): Promise<
  Array<{ id: string; title: string; text: string | null; hasImage: boolean; link: string | null }>
> {
  const result = await getPool().query<{
    id: string;
    title: string;
    body: string | null;
    has_image: boolean;
    link: string | null;
    regions: string[];
    weight: number;
  }>(
    `SELECT id, title, body, (image IS NOT NULL) AS has_image, link, regions, weight
       FROM ads
      WHERE active
        AND (starts_at IS NULL OR starts_at <= now())
        AND (ends_at   IS NULL OR ends_at   >= now())`,
  );

  const haystack = `${timezone}|${language}`.toLowerCase();
  const matching = result.rows.filter(
    (r) => r.regions.length === 0 || r.regions.some((t) => haystack.includes(t.toLowerCase())),
  );

  const pool: Array<{
    id: string;
    title: string;
    text: string | null;
    hasImage: boolean;
    link: string | null;
  }> = [];
  for (const row of matching) {
    const times = Math.min(10, Math.max(1, row.weight));
    for (let i = 0; i < times; i += 1) {
      pool.push({
        id: String(row.id),
        title: row.title,
        text: row.body,
        hasImage: row.has_image,
        link: row.link,
      });
    }
  }

  // Fisher–Yates — тоглогч бүрд өөр дараалалтай гарна.
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool;
}

/** Харагдсан эсвэл дарагдсаныг тоолно. */
export async function countAdEvent(id: string, kind: 'seen' | 'click'): Promise<void> {
  const column = kind === 'click' ? 'clicks' : 'impressions';
  await getPool().query(`UPDATE ads SET ${column} = ${column} + 1 WHERE id = $1`, [id]);
}
