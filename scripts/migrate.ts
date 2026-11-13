/**
 * Применяет SQL-миграции из папки drizzle/ к базе данных.
 * Запуск: npm run db:migrate
 * Работает и с PostgreSQL (DATABASE_URL), и со встроенной PGlite.
 */
import './env';
import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator';
import { migrate as migrateLite } from 'drizzle-orm/pglite/migrator';
import { db } from '../src/db';

async function main() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyDb = db as any;
  if (process.env.DATABASE_URL) {
    await migratePg(anyDb, { migrationsFolder: './drizzle' });
  } else {
    await migrateLite(anyDb, { migrationsFolder: './drizzle' });
  }
  console.log('Миграции применены.');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
