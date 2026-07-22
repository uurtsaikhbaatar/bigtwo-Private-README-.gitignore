/**
 * Өгөгдлийн сангийн хүснэгтүүдийг үүсгэнэ.
 *
 *   npm run db:init
 *
 * `server/.env` файлаас `DATABASE_URL`-ыг уншина. Дахин ажиллуулахад аюулгүй.
 */

import { closePool, dbEnabled, getPool, initSchema } from './db';

if (!dbEnabled()) {
  console.error('DATABASE_URL олдсонгүй.');
  console.error('server/.env файл үүсгээд Neon-ы холболтын мөрийг оруулна уу:');
  console.error('  DATABASE_URL=postgresql://…');
  process.exit(1);
}

try {
  await initSchema();
  const tables = await getPool().query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' ORDER BY table_name`,
  );
  console.log('✓ Схем бэлэн. Хүснэгтүүд:');
  for (const row of tables.rows) console.log(`   ${row.table_name}`);
} catch (err) {
  console.error('✗ Холбогдож чадсангүй:', err instanceof Error ? err.message : err);
  process.exit(1);
} finally {
  await closePool();
}
