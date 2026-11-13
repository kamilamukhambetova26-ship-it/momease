import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from './schema';

export type DB = PgDatabase<PgQueryResultHKT, typeof schema>;

/**
 * Один код для двух режимов:
 *  - DATABASE_URL задан  -> настоящий PostgreSQL через драйвер `pg` (продакшен)
 *  - не задан            -> встроенный PostgreSQL (PGlite), файлы в .data/pglite
 */
const globalForDb = globalThis as unknown as { __momeaseDb?: DB };

function createDb(): DB {
  const url = process.env.DATABASE_URL;
  if (url) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { drizzle } = require('drizzle-orm/node-postgres');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Pool } = require('pg');
    const pool = new Pool({
      connectionString: url,
      max: 10,
      ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
    });
    return drizzle(pool, { schema }) as DB;
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { drizzle } = require('drizzle-orm/pglite');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PGlite } = require('@electric-sql/pglite');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { mkdirSync } = require('node:fs');
  const dir = process.env.PGLITE_DIR || '.data/pglite';
  mkdirSync(dir, { recursive: true });
  return drizzle(new PGlite(dir), { schema }) as DB;
}

export const db: DB = globalForDb.__momeaseDb ?? (globalForDb.__momeaseDb = createDb());
export { schema };
