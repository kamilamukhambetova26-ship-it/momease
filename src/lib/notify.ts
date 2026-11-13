/**
 * Уведомления. Хранится тип и значения; текст собирается при показе на языке читателя
 * (ключи notif.<type> в dict.ts). Письмо, если настроен SMTP, уходит на русском.
 */
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/db';
import { notifications, users } from '@/db/schema';
import { formatDate } from './dates';
import { makeT } from './i18n';
import { sendMail } from './mail';

export type NotifType =
  | 'booking_new'
  | 'booking_confirmed'
  | 'booking_declined'
  | 'booking_completed'
  | 'booking_cancelled'
  | 'message_new'
  | 'profile_approved'
  | 'profile_rejected'
  | 'doc_accepted'
  | 'doc_rejected'
  | 'report_new'
  | 'report_closed'
  | 'review_hidden'
  | 'ticket_new';

type Params = Record<string, string | number>;

export async function notify(
  userId: number,
  type: NotifType,
  params: Params = {},
  link = '/dashboard',
  opts: { coalesceKey?: string } = {},
) {
  const payload = JSON.stringify(opts.coalesceKey ? { ...params, key: opts.coalesceKey } : params);
  if (opts.coalesceKey) {
    // одно непрочитанное уведомление на переписку, а не по письму на каждое сообщение
    const [exists] = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.type, type), isNull(notifications.readAt), eq(notifications.params, payload)))
      .limit(1);
    if (exists) return;
  }
  await db.insert(notifications).values({ userId, type, params: payload, link });
  // письмо не должно ломать основное действие
  void emailCopy(userId, type, params, link).catch(() => {});
}

/** Значения для подстановки в текст: дата и время форматируются на языке читателя */
export function notifVars(params: Record<string, unknown>, locale: string): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === 'string' || typeof v === 'number') out[k] = v;
  }
  if (typeof params.date === 'string') {
    out.when = `${formatDate(params.date, locale)}${typeof params.time === 'string' ? ' ' + params.time : ''}`;
  }
  return out;
}

async function emailCopy(userId: number, type: NotifType, params: Params, link: string) {
  if (!process.env.SMTP_URL) return;
  const [u] = await db.select({ email: users.email, active: users.active }).from(users).where(eq(users.id, userId)).limit(1);
  if (!u || !u.active) return;
  const t = makeT('ru');
  const vars = notifVars(params, 'ru');
  const base = (process.env.APP_URL || '').replace(/\/$/, '');
  await sendMail(u.email, `momease: ${t(`notif.${type}`, vars)}`, `${t(`notif.${type}`, vars)}\n\n${base}${link}\n\nmomease`);
}

export async function listNotifications(userId: number, limit = 50) {
  return db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.id)).limit(limit);
}

export async function countUnreadNotifications(userId: number) {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return r?.n ?? 0;
}

export async function markAllNotificationsRead(userId: number) {
  await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
}
