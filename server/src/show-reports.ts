/**
 * Ирсэн алдааны мэдэгдлүүдийг уншиж хэвлэнэ.
 *
 *   npm run reports              — сүүлийн 20
 *   npm run reports -- 100       — сүүлийн 100
 *   npm run reports -- 20 raw    — JSON хэлбэрээр (хуулж өгөхөд тохиромжтой)
 */

import { REPORTS_FILE, readReports } from './reports';

const limit = Number(process.argv[2]) || 20;
const raw = process.argv[3] === 'raw';

const reports = await readReports(limit);

if (raw) {
  console.log(JSON.stringify(reports, null, 2));
} else if (reports.length === 0) {
  console.log(`Мэдэгдэл алга.\nФайл: ${REPORTS_FILE}`);
} else {
  console.log(`${reports.length} мэдэгдэл (шинэхнээс нь):\n`);
  for (const r of reports) {
    const icon = r.kind === 'crash' ? '💥' : '🐞';
    const when = r.at.replace('T', ' ').slice(0, 19);
    console.log(`${icon} ${r.id}  ${when}  ${r.playerName ?? '?'}  өрөө ${r.code ?? '-'}`);
    console.log(`   ${r.text.replace(/\n/g, '\n   ')}`);
    console.log(`   ${JSON.stringify(r.context).slice(0, 300)}`);
    console.log();
  }
  console.log(`Бүтнээр нь харах:  npm run reports -- ${limit} raw`);
}
