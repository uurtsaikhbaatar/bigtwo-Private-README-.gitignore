/**
 * Тоглогчдоос ирсэн алдааны мэдэгдлийг хадгалах.
 *
 * Мэдэгдэл бүр `data/reports.jsonl` файлд нэг мөр болж бичигдэнэ (JSON Lines) —
 * ингэснээр `npm run reports` эсвэл ямар ч хэрэгслээр амархан уншина.
 *
 * ЧУХАЛ: Render-ийн үнэгүй багц дээр диск түр зуурынх — сервер дахин ачаалахад
 * файл цэвэрлэгдэнэ. Тогтвортой авахын тулд `REPORT_WEBHOOK` орчны хувьсагчид
 * Discord/Slack/Telegram-ийн webhook хаягийг өгвөл мэдэгдэл тэр даруй тийш очно.
 */

import { randomUUID } from 'node:crypto';
import { appendFile, mkdir, readFile, rename, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ReportKind } from '../../app/src/shared/protocol';

const here = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = path.resolve(here, '..', 'data');
export const REPORTS_FILE = path.join(DATA_DIR, 'reports.jsonl');

/** Файл энэ хэмжээнээс хэтэрвэл нэг удаа архивлана. */
const MAX_FILE_BYTES = 5 * 1024 * 1024;

export interface StoredReport {
  id: string;
  at: string;
  kind: ReportKind;
  /** Өрөөний код (мэдэгдэл ирэх үеийн). */
  code: string | null;
  playerName: string | null;
  text: string;
  context: Record<string, unknown>;
}

export interface NewReport {
  kind: ReportKind;
  text: string;
  code: string | null;
  playerName: string | null;
  context: Record<string, unknown>;
}

/** Мэдэгдлийг хадгалж, тохируулсан бол webhook руу илгээнэ. */
export async function saveReport(input: NewReport): Promise<StoredReport> {
  const report: StoredReport = {
    id: randomUUID().slice(0, 8),
    at: new Date().toISOString(),
    kind: input.kind,
    code: input.code,
    playerName: input.playerName,
    text: input.text,
    context: input.context,
  };

  await mkdir(DATA_DIR, { recursive: true });
  await rotateIfLarge();
  await appendFile(REPORTS_FILE, `${JSON.stringify(report)}\n`, 'utf8');
  void notifyWebhook(report);
  return report;
}

/** Хадгалсан мэдэгдлүүдийг шинэхнээс нь эрэмбэлж уншина. */
export async function readReports(limit = 100): Promise<StoredReport[]> {
  try {
    const raw = await readFile(REPORTS_FILE, 'utf8');
    const lines = raw.split('\n').filter(Boolean);
    return lines
      .slice(-limit)
      .map((line) => {
        try {
          return JSON.parse(line) as StoredReport;
        } catch {
          return null;
        }
      })
      .filter((r): r is StoredReport => r !== null)
      .reverse();
  } catch {
    return [];
  }
}

async function rotateIfLarge(): Promise<void> {
  try {
    const info = await stat(REPORTS_FILE);
    if (info.size > MAX_FILE_BYTES) {
      await rename(REPORTS_FILE, `${REPORTS_FILE}.1`);
    }
  } catch {
    // Файл байхгүй — асуудалгүй.
  }
}

/**
 * `REPORT_WEBHOOK` тохируулсан бол мэдэгдлийг тийш илгээнэ.
 * Discord, Slack хоёулаа `content`/`text` талбарыг хүлээж авдаг.
 */
async function notifyWebhook(report: StoredReport): Promise<void> {
  const url = process.env.REPORT_WEBHOOK;
  if (!url) return;

  const summary = [
    `🐞 **${report.kind === 'crash' ? 'Алдаа (автомат)' : 'Мэдэгдэл'}** \`${report.id}\``,
    report.playerName ? `Тоглогч: ${report.playerName}` : null,
    report.code ? `Өрөө: ${report.code}` : null,
    '',
    report.text.slice(0, 1500),
    '',
    '```json',
    JSON.stringify(report.context).slice(0, 800),
    '```',
  ]
    .filter((line) => line !== null)
    .join('\n');

  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: summary, text: summary }),
    });
  } catch (err) {
    console.error('webhook илгээж чадсангүй:', err);
  }
}
