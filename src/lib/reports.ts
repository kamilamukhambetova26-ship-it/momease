/** Жалобы на профили, отзывы и переписки; обработка командой, блокировка аккаунтов (только админ) */
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { db } from '@/db';
import { bookings, providers, reports, reviews, users } from '@/db/schema';
import { REPORT_ACTIONS, REPORT_REASONS, REPORT_TARGETS, isStaff } from './constants';
import { notify } from './notify';
import { ServiceError, setProviderStatus, setUserActive, type Actor } from './services';

const reportSchema = z.object({
  targetType: z.enum(REPORT_TARGETS),
  targetId: z.coerce.number().int().positive(),
  reason: z.enum(REPORT_REASONS),
  details: z.string().trim().max(1000).default(''),
});

export async function createReport(actor: Actor, input: unknown) {
  const parsed = reportSchema.safeParse(input);
  if (!parsed.success) throw new ServiceError('invalid');
  const { targetType, targetId, reason, details } = parsed.data;

  let targetUserId: number | null = null;
  if (targetType === 'provider') {
    const [p] = await db.select({ userId: providers.userId }).from(providers).where(eq(providers.id, targetId)).limit(1);
    targetUserId = p?.userId ?? null;
  } else if (targetType === 'review') {
    const [r] = await db.select({ parentId: reviews.parentId }).from(reviews).where(eq(reviews.id, targetId)).limit(1);
    targetUserId = r?.parentId ?? null;
  } else {
    const [b] = await db
      .select({ parentId: bookings.parentId, ownerId: providers.userId })
      .from(bookings)
      .innerJoin(providers, eq(providers.id, bookings.providerId))
      .where(eq(bookings.id, targetId))
      .limit(1);
    if (b && (b.parentId === actor.id || b.ownerId === actor.id)) {
      targetUserId = b.parentId === actor.id ? b.ownerId : b.parentId;
    }
  }
  if (!targetUserId) throw new ServiceError('not_found');
  if (targetUserId === actor.id) throw new ServiceError('own_target');
  try {
    await db.insert(reports).values({ reporterId: actor.id, targetType, targetId, targetUserId, reason, details });
  } catch (e) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const err = e as any;
    if (err?.code === '23505' || err?.cause?.code === '23505') throw new ServiceError('already_reported');
    throw e;
  }
  // сообщаем команде
  const staff = await db.select({ id: users.id }).from(users).where(and(inArray(users.role, ['manager', 'admin']), eq(users.active, true)));
  for (const s of staff) await notify(s.id, 'report_new', { reason }, '/dashboard?tab=reports');
}

export async function listReports(actor: Actor, status: 'open' | 'closed' = 'open') {
  if (!isStaff(actor.role)) throw new ServiceError('forbidden');
  const reporter = alias(users, 'reporter');
  const target = alias(users, 'target');
  return db
    .select({
      id: reports.id,
      targetType: reports.targetType,
      targetId: reports.targetId,
      reason: reports.reason,
      details: reports.details,
      status: reports.status,
      resolution: reports.resolution,
      createdAt: reports.createdAt,
      reporterName: reporter.name,
      reporterEmail: reporter.email,
      targetUserId: target.id,
      targetName: target.name,
      targetEmail: target.email,
      targetRole: target.role,
      targetActive: target.active,
      reviewText: sql<string | null>`(select r.text from reviews r where r.id = ${reports.targetId} and ${reports.targetType} = 'review')`,
      reviewHidden: sql<boolean | null>`(select r.hidden from reviews r where r.id = ${reports.targetId} and ${reports.targetType} = 'review')`,
      providerId: sql<number | null>`(select p.id from providers p where p.user_id = ${target.id})`,
    })
    .from(reports)
    .innerJoin(reporter, eq(reporter.id, reports.reporterId))
    .innerJoin(target, eq(target.id, reports.targetUserId))
    .where(status === 'open' ? eq(reports.status, 'open') : sql`${reports.status} <> 'open'`)
    .orderBy(desc(reports.createdAt))
    .limit(200);
}

export async function countOpenReports(actor: Actor) {
  if (!isStaff(actor.role)) return 0;
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(reports).where(eq(reports.status, 'open'));
  return r?.n ?? 0;
}

/**
 * Закрыть жалобу с действием:
 * dismiss — отклонить; resolve — закрыть без санкций; hide_review — скрыть отзыв;
 * reject_provider — снять профиль с публикации; block_user — заблокировать аккаунт (только админ).
 */
export async function resolveReport(actor: Actor, reportId: number, action: string, note = '') {
  if (!isStaff(actor.role)) throw new ServiceError('forbidden');
  if (!(REPORT_ACTIONS as readonly string[]).includes(action)) throw new ServiceError('invalid');
  const [rep] = await db.select().from(reports).where(eq(reports.id, reportId)).limit(1);
  if (!rep) throw new ServiceError('not_found');
  if (rep.status !== 'open') throw new ServiceError('bad_state');

  if (action === 'block_user') {
    if (actor.role !== 'admin') throw new ServiceError('forbidden');
    const reason = note.trim() || `report:${rep.reason}`;
    await setUserActive(actor, rep.targetUserId, false, reason);
  } else if (action === 'hide_review') {
    if (rep.targetType !== 'review') throw new ServiceError('invalid');
    const [rv] = await db.update(reviews).set({ hidden: true }).where(eq(reviews.id, rep.targetId)).returning({ parentId: reviews.parentId });
    if (rv) await notify(rv.parentId, 'review_hidden', {}, '/dashboard');
  } else if (action === 'reject_provider') {
    const [p] = await db.select({ id: providers.id }).from(providers).where(eq(providers.userId, rep.targetUserId)).limit(1);
    if (!p) throw new ServiceError('invalid');
    await setProviderStatus(actor, p.id, 'rejected');
  }

  await db
    .update(reports)
    .set({ status: action === 'dismiss' ? 'dismissed' : 'resolved', resolution: action, handledBy: actor.id, handledAt: new Date() })
    .where(eq(reports.id, rep.id));
  await notify(rep.reporterId, 'report_closed', {}, '/dashboard');
}
