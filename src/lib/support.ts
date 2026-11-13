/** Обращения в поддержку: от гостей и пользователей; разбирает команда */
import { and, count, desc, eq, gte } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { supportTickets, users } from '@/db/schema';
import { isStaff } from './constants';
import { notify } from './notify';
import { ServiceError, type Actor } from './services';

export const TICKET_TOPICS = ['question', 'bug', 'appeal', 'other'] as const;

const ticketSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email().max(200),
  topic: z.enum(TICKET_TOPICS),
  message: z.string().trim().min(10).max(2000),
});

const MAX_PER_HOUR = 5;

export async function createTicket(actor: Actor | null, input: unknown) {
  const parsed = ticketSchema.safeParse(input);
  if (!parsed.success) throw new ServiceError('invalid');
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const [recent] = await db
    .select({ n: count() })
    .from(supportTickets)
    .where(and(eq(supportTickets.email, parsed.data.email), gte(supportTickets.createdAt, since)));
  if ((recent?.n ?? 0) >= MAX_PER_HOUR) throw new ServiceError('rate_limited');
  const [t] = await db
    .insert(supportTickets)
    .values({ ...parsed.data, userId: actor?.id ?? null })
    .returning({ id: supportTickets.id });
  const team = await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.active, true));
  for (const m of team.filter((x) => isStaff(x.role))) {
    await notify(m.id, 'ticket_new', { topic: parsed.data.topic }, '/dashboard?tab=support');
  }
  return t;
}

export async function listTickets(actor: Actor, status: 'open' | 'closed' = 'open') {
  if (!isStaff(actor.role)) throw new ServiceError('forbidden');
  return db
    .select()
    .from(supportTickets)
    .where(eq(supportTickets.status, status))
    .orderBy(desc(supportTickets.createdAt))
    .limit(200);
}

export async function countOpenTickets(actor: Actor) {
  if (!isStaff(actor.role)) return 0;
  const [r] = await db.select({ n: count() }).from(supportTickets).where(eq(supportTickets.status, 'open'));
  return r?.n ?? 0;
}

export async function closeTicket(actor: Actor, id: number) {
  if (!isStaff(actor.role)) throw new ServiceError('forbidden');
  const res = await db
    .update(supportTickets)
    .set({ status: 'closed', closedBy: actor.id })
    .where(and(eq(supportTickets.id, id), eq(supportTickets.status, 'open')))
    .returning({ id: supportTickets.id });
  if (!res.length) throw new ServiceError('not_found');
}
