/**
 * Чат внутри записи. Писать могут только мама и специалист этой записи.
 * Команда (менеджер, админ) может читать переписку только если на неё подана жалоба.
 */
import { and, asc, eq, gte, isNull, ne, or, sql } from 'drizzle-orm';
import { db } from '@/db';
import { bookings, messages, providers, reports, users } from '@/db/schema';
import { MAX_MESSAGE_LEN, isStaff } from './constants';
import { notify } from './notify';
import { ServiceError, type Actor } from './services';

const WRITABLE = ['pending', 'confirmed', 'completed'];
const RATE_LIMIT_PER_MINUTE = 15;

export async function getChatAccess(actor: Actor, bookingId: number) {
  if (!Number.isInteger(bookingId)) throw new ServiceError('not_found');
  const [row] = await db
    .select({
      id: bookings.id,
      status: bookings.status,
      date: bookings.date,
      parentId: bookings.parentId,
      providerId: bookings.providerId,
      ownerId: providers.userId,
      title: providers.title,
    })
    .from(bookings)
    .innerJoin(providers, eq(providers.id, bookings.providerId))
    .where(eq(bookings.id, bookingId))
    .limit(1);
  if (!row) throw new ServiceError('not_found');

  const isParent = row.parentId === actor.id;
  const isOwner = row.ownerId === actor.id;
  let staffView = false;
  if (!isParent && !isOwner) {
    if (!isStaff(actor.role)) throw new ServiceError('not_found'); // не раскрываем, что чат существует
    const [rep] = await db
      .select({ id: reports.id })
      .from(reports)
      .where(and(eq(reports.targetType, 'chat'), eq(reports.targetId, bookingId)))
      .limit(1);
    if (!rep) throw new ServiceError('not_found');
    staffView = true;
  }
  const [parent] = await db.select({ name: users.name, active: users.active }).from(users).where(eq(users.id, row.parentId)).limit(1);
  const [owner] = await db.select({ name: users.name, active: users.active }).from(users).where(eq(users.id, row.ownerId)).limit(1);
  const otherId = isParent ? row.ownerId : row.parentId;
  const other = isParent ? owner : parent;
  return {
    booking: row,
    staffView,
    meIsParent: isParent,
    otherId,
    otherName: staffView ? `${parent?.name} / ${owner?.name}` : isParent ? row.title : (other?.name ?? ''),
    canWrite: !staffView && WRITABLE.includes(row.status) && Boolean(other?.active),
  };
}

export async function listMessages(actor: Actor, bookingId: number) {
  const access = await getChatAccess(actor, bookingId);
  const rows = await db
    .select({ id: messages.id, senderId: messages.senderId, body: messages.body, createdAt: messages.createdAt })
    .from(messages)
    .where(eq(messages.bookingId, bookingId))
    .orderBy(asc(messages.id))
    .limit(500);
  if (!access.staffView) {
    // всё, что написал собеседник, считается прочитанным
    await db
      .update(messages)
      .set({ readAt: new Date() })
      .where(and(eq(messages.bookingId, bookingId), ne(messages.senderId, actor.id), isNull(messages.readAt)));
  }
  return { access, rows };
}

export async function sendMessage(actor: Actor, bookingId: number, bodyRaw: string) {
  const body = bodyRaw.trim();
  if (body.length === 0 || body.length > MAX_MESSAGE_LEN) throw new ServiceError('invalid');
  const access = await getChatAccess(actor, bookingId);
  if (!access.canWrite) throw new ServiceError('chat_closed');
  const since = new Date(Date.now() - 60_000);
  const [recent] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(messages)
    .where(and(eq(messages.senderId, actor.id), gte(messages.createdAt, since)));
  if ((recent?.n ?? 0) >= RATE_LIMIT_PER_MINUTE) throw new ServiceError('rate_limited');
  await db.insert(messages).values({ bookingId, senderId: actor.id, body });
  const [me] = await db.select({ name: users.name }).from(users).where(eq(users.id, actor.id)).limit(1);
  await notify(access.otherId, 'message_new', { who: access.meIsParent ? access.booking.title : (me?.name ?? '') }, `/chat/${bookingId}`, {
    coalesceKey: `chat${bookingId}`,
  });
}

/** Входящие: все переписки человека, свежие сверху. Специалист попадает в чат с мамой в один клик. */
export async function listChats(actor: Actor) {
  const rows = await db
    .select({
      id: bookings.id,
      status: bookings.status,
      date: bookings.date,
      parentId: bookings.parentId,
      ownerId: providers.userId,
      title: providers.title,
      parentName: users.name,
      lastBody: sql<string | null>`(select m.body from messages m where m.booking_id = ${bookings.id} order by m.id desc limit 1)`,
      lastAt: sql<Date | null>`(select m.created_at from messages m where m.booking_id = ${bookings.id} order by m.id desc limit 1)`,
      unread: sql<number>`(select count(*)::int from messages m where m.booking_id = ${bookings.id} and m.sender_id <> ${actor.id} and m.read_at is null)`,
    })
    .from(bookings)
    .innerJoin(providers, eq(providers.id, bookings.providerId))
    .innerJoin(users, eq(users.id, bookings.parentId))
    .where(or(eq(bookings.parentId, actor.id), eq(providers.userId, actor.id)))
    .limit(300);
  const list = rows
    .filter((r) => WRITABLE.includes(r.status) || r.lastBody !== null)
    .map((r) => ({
      id: r.id,
      status: r.status,
      date: r.date,
      other: r.parentId === actor.id ? r.title : r.parentName,
      lastBody: r.lastBody,
      lastAt: r.lastAt ? new Date(r.lastAt) : null,
      unread: r.unread,
    }));
  // сначала с непрочитанными, потом по свежести
  return list.sort((a, b) => (b.unread > 0 ? 1 : 0) - (a.unread > 0 ? 1 : 0) || (b.lastAt?.getTime() ?? 0) - (a.lastAt?.getTime() ?? 0) || b.id - a.id);
}

export async function countUnreadMessages(userId: number) {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(messages)
    .innerJoin(bookings, eq(bookings.id, messages.bookingId))
    .innerJoin(providers, eq(providers.id, bookings.providerId))
    .where(and(isNull(messages.readAt), ne(messages.senderId, userId), or(eq(bookings.parentId, userId), eq(providers.userId, userId))));
  return r?.n ?? 0;
}
