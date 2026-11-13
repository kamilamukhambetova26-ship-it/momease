/** Избранные специалисты: сердечко на странице специалиста, список в кабинете родителя */
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { favorites, providers, users } from '@/db/schema';
import { ServiceError, type Actor } from './services';

export async function isFavorite(userId: number, providerId: number) {
  const [r] = await db
    .select({ n: sql<number>`1` })
    .from(favorites)
    .where(and(eq(favorites.userId, userId), eq(favorites.providerId, providerId)))
    .limit(1);
  return Boolean(r);
}

/** Добавить или убрать из избранного. Возвращает true, если теперь в избранном. */
export async function toggleFavorite(actor: Actor, providerId: number) {
  if (actor.role !== 'parent') throw new ServiceError('forbidden');
  if (!Number.isInteger(providerId)) throw new ServiceError('not_found');
  if (await isFavorite(actor.id, providerId)) {
    await db.delete(favorites).where(and(eq(favorites.userId, actor.id), eq(favorites.providerId, providerId)));
    return false;
  }
  const [p] = await db
    .select({ id: providers.id })
    .from(providers)
    .innerJoin(users, eq(users.id, providers.userId))
    .where(and(eq(providers.id, providerId), eq(providers.status, 'approved'), eq(users.active, true)))
    .limit(1);
  if (!p) throw new ServiceError('not_found');
  await db.insert(favorites).values({ userId: actor.id, providerId }).onConflictDoNothing();
  return true;
}

/** Только опубликованные и активные: скрытые профили из избранного пропадают */
export async function listFavorites(userId: number) {
  return db
    .select({ id: providers.id, title: providers.title, kind: providers.kind, segment: providers.segment, district: providers.district })
    .from(favorites)
    .innerJoin(providers, eq(providers.id, favorites.providerId))
    .innerJoin(users, eq(users.id, providers.userId))
    .where(and(eq(favorites.userId, userId), eq(providers.status, 'approved'), eq(users.active, true)))
    .orderBy(desc(favorites.createdAt));
}
