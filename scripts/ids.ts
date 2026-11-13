/**
 * Записывает ID демо-пользователей в .data/test-ids.json для scripts/http-smoke.ts.
 * Нужен отдельным шагом, потому что встроенная БД открывается только одним процессом.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { eq } from 'drizzle-orm';
import { db } from '../src/db';
import { providers, users } from '../src/db/schema';

async function idOf(email: string) {
  const [u] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (!u) throw new Error(`Нет пользователя ${email}. Сначала выполните npm run db:seed:demo`);
  return u.id;
}

async function main() {
  const pendingOwner = await idOf('nanny-new@demo.momease.kz');
  const [pending] = await db.select({ id: providers.id }).from(providers).where(eq(providers.userId, pendingOwner)).limit(1);
  const ids = {
    admin: await idOf('admin@momease.kz'),
    manager: await idOf('manager@momease.kz'),
    parent1: await idOf('parent1@demo.momease.kz'),
    parent2: await idOf('parent2@demo.momease.kz'),
    parent3: await idOf('parent3@demo.momease.kz'),
    nanny1: await idOf('nanny1@demo.momease.kz'),
    pendingProvider: pending.id,
  };
  mkdirSync('.data', { recursive: true });
  writeFileSync('.data/test-ids.json', JSON.stringify(ids));
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
