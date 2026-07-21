/**
 * Вэб хувилбарыг (`app/dist`) дамжуулах энгийн статик файл сервер.
 *
 * Ингэснээр нэг л хаяг байрлуулахад хангалттай: тэр хаягаас апп нээгдэж,
 * тэр хаяг руугаа WebSocket-оор холбогдоно.
 */

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const WEB_ROOT = path.resolve(here, '..', '..', 'app', 'dist');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
};

/**
 * Хүсэлтэд тохирох файлыг олж илгээнэ.
 * Файл олдоогүй бол SPA-гийн заншлаар `index.html`-ийг буцаана.
 * Ямар ч файл байхгүй бол `false` буцааж, дуудагч талд шийдвэрлүүлнэ.
 */
export async function serveStatic(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const requested = decodeURIComponent((req.url ?? '/').split('?')[0]);
  const candidate = requested === '/' ? 'index.html' : requested.replace(/^\/+/, '');

  // Хавтас руу гарах оролдлогоос хамгаална.
  const resolved = path.resolve(WEB_ROOT, candidate);
  const safe = resolved === WEB_ROOT || resolved.startsWith(WEB_ROOT + path.sep);

  const target = safe && (await isFile(resolved)) ? resolved : path.join(WEB_ROOT, 'index.html');
  if (!(await isFile(target))) return false;

  const ext = path.extname(target).toLowerCase();
  const immutable = target.includes(`${path.sep}_expo${path.sep}`);
  res.writeHead(200, {
    'content-type': MIME[ext] ?? 'application/octet-stream',
    'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  createReadStream(target).pipe(res);
  return true;
}

async function isFile(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isFile();
  } catch {
    return false;
  }
}
