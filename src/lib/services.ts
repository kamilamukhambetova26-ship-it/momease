/**
 * Вся бизнес-логика и проверки прав. Здесь нет зависимостей от Next.js,
 * поэтому функции можно вызывать и из server actions, и из тестов.
 */
import bcrypt from 'bcryptjs';
import { and, asc, desc, eq, getTableColumns, ilike, inArray, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { db } from '@/db';
import { bookings, documents, providers, reviews, slots, users } from '@/db/schema';
import { addDays, isDateStr, isFutureSlot, todayStr, weekdayOf } from './dates';
import { notify } from './notify';
import {
  AGE_GROUPS,
  BOOKING_HORIZON_DAYS,
  SORTS,
  ASSIGNABLE_ROLES,
  DEFAULT_SEGMENT,
  DEFAULT_UNIT,
  DISTRICTS,
  DOC_STATUSES,
  DOC_TYPES,
  KIND_SEGMENTS,
  MAX_DOCS_PER_PROVIDER,
  MAX_DOC_BYTES,
  PRICE_UNITS,
  PROVIDER_KINDS,
  SEGMENTS,
  SELF_REGISTER_ROLES,
  isProviderRole,
  isStaff,
  type ProviderKind,
} from './constants';

export class ServiceError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

export type Actor = { id: number; role: string };

// ───────────────────────── вспомогательное ─────────────────────────

function isUniqueViolation(e: unknown) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const err = e as any;
  return err?.code === '23505' || err?.cause?.code === '23505';
}

function requireRole(actor: Actor, ...roles: string[]) {
  if (!roles.includes(actor.role)) throw new ServiceError('forbidden');
}

function requireStaff(actor: Actor) {
  if (!isStaff(actor.role)) throw new ServiceError('forbidden');
}

const emailSchema = z.string().trim().toLowerCase().email().max(200);

// ───────────────────────── регистрация и вход ─────────────────────────

const registerSchema = z.object({
  email: emailSchema,
  password: z.string().min(8).max(200),
  name: z.string().trim().min(2).max(80),
  phone: z.string().trim().max(30).optional().or(z.literal('')),
  role: z.enum(SELF_REGISTER_ROLES),
});

/** Согласие с правилами и политикой конфиденциальности (закон РК «О персональных данных и их защите») */
function hasConsent(input: unknown) {
  const v = (input as { consent?: unknown } | null)?.consent;
  return v === true || v === 'on' || v === '1' || v === 'true';
}

export async function registerUser(input: unknown) {
  if (!hasConsent(input)) throw new ServiceError('consent');
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) throw new ServiceError('fields');
  const { email, password, name, phone, role } = parsed.data;
  const passwordHash = await bcrypt.hash(password, 10);
  try {
    return await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({ email, passwordHash, name, phone: phone || null, role, consentAt: new Date() })
        .returning();
      if (isProviderRole(role)) {
        await tx.insert(providers).values({
          userId: user.id,
          kind: role,
          segment: DEFAULT_SEGMENT[role],
          title: name,
          priceUnit: DEFAULT_UNIT[role],
          status: 'pending',
        });
      }
      return user;
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new ServiceError('exists');
    throw e;
  }
}

// Простейшая защита от перебора пароля (в памяти процесса)
const attempts = new Map<string, { count: number; until: number }>();
const MAX_ATTEMPTS = 8;
const LOCK_MS = 5 * 60 * 1000;
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

export async function authenticate(emailRaw: string, password: string) {
  const email = emailSchema.safeParse(emailRaw);
  if (!email.success || !password) throw new ServiceError('invalid');
  const key = email.data;
  const now = Date.now();
  const rec = attempts.get(key);
  if (rec && rec.until > now && rec.count >= MAX_ATTEMPTS) throw new ServiceError('throttle');

  const [user] = await db.select().from(users).where(eq(users.email, key)).limit(1);
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) {
    const count = (rec && rec.until > now ? rec.count : 0) + 1;
    attempts.set(key, { count, until: now + LOCK_MS });
    throw new ServiceError('invalid');
  }
  if (!user.active) throw new ServiceError('disabled');
  attempts.delete(key);
  return user;
}

export async function getUserById(id: number) {
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return user ?? null;
}

// ───────────────────────── каталог ─────────────────────────

export type ProviderCard = Awaited<ReturnType<typeof listProviders>>[number];

const ratingAvg = sql<number | null>`(select avg(r.rating)::float from reviews r where r.provider_id = ${providers.id} and not r.hidden)`;
const ratingCount = sql<number>`(select count(*)::int from reviews r where r.provider_id = ${providers.id} and not r.hidden)`;
const docsAccepted = sql<number>`(select count(*)::int from documents d where d.provider_id = ${providers.id} and d.status = 'accepted')`;

export async function listProviders(filter: {
  kind?: string;
  district?: string;
  segment?: string;
  age?: string;
  verifiedOnly?: boolean;
  online?: boolean;
  trial?: boolean;
  q?: string;
  sort?: string;
}) {
  const conds = [eq(providers.status, 'approved'), eq(users.active, true)];
  if (filter.kind && (PROVIDER_KINDS as readonly string[]).includes(filter.kind)) {
    conds.push(eq(providers.kind, filter.kind));
  }
  if (filter.district && (DISTRICTS as readonly string[]).includes(filter.district)) {
    conds.push(eq(providers.district, filter.district));
  }
  if (filter.segment && (SEGMENTS as readonly string[]).includes(filter.segment)) {
    conds.push(eq(providers.segment, filter.segment));
  }
  const group = AGE_GROUPS.find((g) => g.id === filter.age);
  if (group) {
    // диапазон специалиста пересекается с возрастной группой
    conds.push(sql`${providers.ageFrom} <= ${group.to} and ${providers.ageTo} >= ${group.from}`);
  }
  if (filter.verifiedOnly) conds.push(eq(providers.verified, true));
  if (filter.online) conds.push(eq(providers.online, true));
  if (filter.trial) conds.push(eq(providers.trial, true));
  // поиск по тексту: каждое слово должно встретиться в названии, описании или имени
  const words = (filter.q ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 5)
    .map((w) => w.slice(0, 40).replace(/[\\%_]/g, (c) => `\\${c}`));
  for (const w of words) {
    const like = `%${w}%`;
    conds.push(or(ilike(providers.title, like), ilike(providers.bio, like), ilike(users.name, like))!);
  }
  const sort = (SORTS as readonly string[]).includes(filter.sort ?? '') ? filter.sort : 'best';
  const order =
    sort === 'rating'
      ? [sql`${ratingAvg} desc nulls last`, desc(ratingCount), desc(providers.createdAt)]
      : sort === 'price_asc'
        ? [asc(providers.priceAmount), desc(providers.createdAt)]
        : sort === 'price_desc'
          ? [desc(providers.priceAmount), desc(providers.createdAt)]
          : sort === 'new'
            ? [desc(providers.createdAt), desc(providers.id)]
            : [desc(providers.verified), sql`${ratingAvg} desc nulls last`, desc(providers.createdAt)];

  return db
    .select({
      ...getTableColumns(providers),
      ownerName: users.name,
      ratingAvg,
      ratingCount,
    })
    .from(providers)
    .innerJoin(users, eq(users.id, providers.userId))
    .where(and(...conds))
    .orderBy(...order)
    .limit(100);
}

export async function getProviderForViewer(id: number, viewer: Actor | null) {
  if (!Number.isInteger(id)) return null;
  const [row] = await db
    .select({
      ...getTableColumns(providers),
      ownerName: users.name,
      ownerId: users.id,
      ratingAvg,
      ratingCount,
      docsAccepted,
    })
    .from(providers)
    .innerJoin(users, eq(users.id, providers.userId))
    .where(eq(providers.id, id))
    .limit(1);
  if (!row) return null;
  const visible =
    row.status === 'approved' || (viewer && (viewer.id === row.ownerId || isStaff(viewer.role)));
  return visible ? row : null;
}

/** Свободные слоты на конкретную дату (прошедшее время не показываем) */
export async function listSlotsForDate(providerId: number, date: string) {
  if (!isDateStr(date)) return [];
  const rows = await db
    .select({
      id: slots.id,
      weekday: slots.weekday,
      time: slots.time,
      taken: sql<boolean>`exists (select 1 from bookings b where b.slot_id = ${slots.id} and b.date = ${date} and b.status in ('pending','confirmed'))`,
    })
    .from(slots)
    .where(and(eq(slots.providerId, providerId), eq(slots.weekday, weekdayOf(date))))
    .orderBy(asc(slots.time));
  return rows.filter((r) => isFutureSlot(date, r.time));
}

/** Календарь: для каждой из ближайших дат число свободных времён */
export async function getCalendar(providerId: number, days: number) {
  const from = todayStr();
  const to = addDays(from, days - 1);
  const [slotRows, taken] = await Promise.all([
    db.select({ id: slots.id, weekday: slots.weekday, time: slots.time }).from(slots).where(eq(slots.providerId, providerId)),
    db
      .select({ slotId: bookings.slotId, date: bookings.date })
      .from(bookings)
      .where(and(eq(bookings.providerId, providerId), inArray(bookings.status, ['pending', 'confirmed']), sql`${bookings.date} between ${from} and ${to}`)),
  ]);
  const takenSet = new Set(taken.map((x) => `${x.slotId}|${x.date}`));
  const out: { date: string; free: number }[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(from, i);
    const wd = weekdayOf(date);
    const free = slotRows.filter((s) => s.weekday === wd && isFutureSlot(date, s.time) && !takenSet.has(`${s.id}|${date}`)).length;
    out.push({ date, free });
  }
  return out;
}

export async function listReviews(providerId: number) {
  const rows = await db
    .select({
      id: reviews.id,
      parentId: reviews.parentId,
      rating: reviews.rating,
      text: reviews.text,
      createdAt: reviews.createdAt,
      parentName: users.name,
    })
    .from(reviews)
    .innerJoin(users, eq(users.id, reviews.parentId))
    .where(and(eq(reviews.providerId, providerId), eq(reviews.hidden, false)))
    .orderBy(desc(reviews.createdAt))
    .limit(50);
  // Показываем только имя, без фамилии
  return rows.map((r) => ({ ...r, parentName: r.parentName.split(' ')[0] }));
}

// ───────────────────────── записи (родитель) ─────────────────────────

export async function createBooking(actor: Actor, slotId: number, date: string) {
  requireRole(actor, 'parent');
  if (!Number.isInteger(slotId) || !isDateStr(date)) throw new ServiceError('invalid');
  const [slot] = await db
    .select({
      id: slots.id,
      providerId: slots.providerId,
      weekday: slots.weekday,
      time: slots.time,
      status: providers.status,
      active: users.active,
      ownerId: users.id,
      title: providers.title,
    })
    .from(slots)
    .innerJoin(providers, eq(providers.id, slots.providerId))
    .innerJoin(users, eq(users.id, providers.userId))
    .where(eq(slots.id, slotId))
    .limit(1);
  if (!slot || slot.status !== 'approved' || !slot.active) throw new ServiceError('not_found');
  if (weekdayOf(date) !== slot.weekday) throw new ServiceError('invalid');
  if (!isFutureSlot(date, slot.time)) throw new ServiceError('past_date');
  if (date > addDays(todayStr(), BOOKING_HORIZON_DAYS)) throw new ServiceError('too_far');
  let b;
  try {
    [b] = await db
      .insert(bookings)
      .values({ parentId: actor.id, providerId: slot.providerId, slotId: slot.id, date, status: 'pending' })
      .returning();
  } catch (e) {
    if (isUniqueViolation(e)) throw new ServiceError('slot_taken');
    throw e;
  }
  const [parent] = await db.select({ name: users.name }).from(users).where(eq(users.id, actor.id)).limit(1);
  await notify(slot.ownerId, 'booking_new', { who: parent?.name ?? '', date, time: slot.time }, '/dashboard');
  return b;
}

export async function cancelBooking(actor: Actor, bookingId: number) {
  requireRole(actor, 'parent');
  const [b] = await db.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1);
  if (!b || b.parentId !== actor.id) throw new ServiceError('not_found');
  if (b.status !== 'pending' && b.status !== 'confirmed') throw new ServiceError('bad_state');
  await db.update(bookings).set({ status: 'cancelled' }).where(eq(bookings.id, b.id));
  const [info] = await db
    .select({ ownerId: providers.userId, time: slots.time, parent: users.name })
    .from(providers)
    .innerJoin(slots, eq(slots.id, b.slotId))
    .innerJoin(users, eq(users.id, b.parentId))
    .where(eq(providers.id, b.providerId))
    .limit(1);
  if (info) await notify(info.ownerId, 'booking_cancelled', { who: info.parent, date: b.date, time: info.time }, '/dashboard');
}

export async function listParentBookings(parentId: number) {
  return db
    .select({
      id: bookings.id,
      status: bookings.status,
      createdAt: bookings.createdAt,
      providerId: providers.id,
      providerTitle: providers.title,
      providerKind: providers.kind,
      weekday: slots.weekday,
      time: slots.time,
      date: bookings.date,
      reviewId: reviews.id,
      unread: sql<number>`(select count(*)::int from messages m where m.booking_id = ${bookings.id} and m.sender_id <> ${bookings.parentId} and m.read_at is null)`,
    })
    .from(bookings)
    .innerJoin(providers, eq(providers.id, bookings.providerId))
    .innerJoin(slots, eq(slots.id, bookings.slotId))
    .leftJoin(reviews, eq(reviews.bookingId, bookings.id))
    .where(eq(bookings.parentId, parentId))
    .orderBy(desc(bookings.date), desc(slots.time));
}

const reviewSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  text: z.string().trim().max(1000).default(''),
});

export async function createReview(actor: Actor, bookingId: number, input: unknown) {
  requireRole(actor, 'parent');
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) throw new ServiceError('invalid');
  const [b] = await db.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1);
  if (!b || b.parentId !== actor.id) throw new ServiceError('not_found');
  if (b.status !== 'confirmed' && b.status !== 'completed') throw new ServiceError('bad_state');
  try {
    await db.insert(reviews).values({
      bookingId: b.id,
      parentId: actor.id,
      providerId: b.providerId,
      rating: parsed.data.rating,
      text: parsed.data.text,
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new ServiceError('already_reviewed');
    throw e;
  }
}

// ───────────────────────── кабинет специалиста ─────────────────────────

export async function getProviderByUser(userId: number) {
  const [p] = await db.select().from(providers).where(eq(providers.userId, userId)).limit(1);
  return p ?? null;
}

async function ownProvider(actor: Actor) {
  requireRole(actor, ...PROVIDER_KINDS);
  const p = await getProviderByUser(actor.id);
  if (!p) throw new ServiceError('not_found');
  return p;
}

const profileSchema = z
  .object({
    title: z.string().trim().min(2).max(120),
    segment: z.enum(SEGMENTS),
    bio: z.string().trim().max(2000),
    district: z.enum(DISTRICTS),
    priceAmount: z.coerce.number().int().min(0).max(5_000_000),
    priceUnit: z.enum(PRICE_UNITS),
    ageFrom: z.coerce.number().int().min(0).max(18),
    ageTo: z.coerce.number().int().min(0).max(18),
    online: z.coerce.boolean().default(false),
    trial: z.coerce.boolean().default(false),
  })
  .refine((v) => v.ageFrom <= v.ageTo);

export async function updateProviderProfile(actor: Actor, input: unknown) {
  const p = await ownProvider(actor);
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) throw new ServiceError('invalid');
  // сегмент должен подходить типу специалиста (няня не может быть «спортом»)
  if (!(KIND_SEGMENTS[p.kind as ProviderKind] as readonly string[]).includes(parsed.data.segment)) {
    throw new ServiceError('invalid');
  }
  await db.update(providers).set(parsed.data).where(eq(providers.id, p.id));
}

const slotSchema = z.object({
  weekday: z.coerce.number().int().min(0).max(6),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
});

export async function addSlot(actor: Actor, input: unknown) {
  const p = await ownProvider(actor);
  const parsed = slotSchema.safeParse(input);
  if (!parsed.success) throw new ServiceError('invalid');
  try {
    await db.insert(slots).values({ providerId: p.id, ...parsed.data });
  } catch (e) {
    if (isUniqueViolation(e)) throw new ServiceError('slot_exists');
    throw e;
  }
}

export async function removeSlot(actor: Actor, slotId: number) {
  const p = await ownProvider(actor);
  const [s] = await db.select().from(slots).where(eq(slots.id, slotId)).limit(1);
  if (!s || s.providerId !== p.id) throw new ServiceError('not_found');
  const [active] = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(and(eq(bookings.slotId, s.id), inArray(bookings.status, ['pending', 'confirmed'])))
    .limit(1);
  if (active) throw new ServiceError('slot_has_booking');
  await db.delete(slots).where(eq(slots.id, s.id));
}

export async function listProviderSlots(providerId: number) {
  return db
    .select()
    .from(slots)
    .where(eq(slots.providerId, providerId))
    .orderBy(asc(slots.weekday), asc(slots.time));
}

export async function listProviderBookings(providerId: number) {
  return db
    .select({
      id: bookings.id,
      status: bookings.status,
      createdAt: bookings.createdAt,
      weekday: slots.weekday,
      time: slots.time,
      date: bookings.date,
      parentName: users.name,
      parentPhone: users.phone,
      unread: sql<number>`(select count(*)::int from messages m where m.booking_id = ${bookings.id} and m.sender_id = ${bookings.parentId} and m.read_at is null)`,
    })
    .from(bookings)
    .innerJoin(slots, eq(slots.id, bookings.slotId))
    .innerJoin(users, eq(users.id, bookings.parentId))
    .where(eq(bookings.providerId, providerId))
    .orderBy(desc(bookings.date), desc(slots.time));
}

export async function respondBooking(actor: Actor, bookingId: number, action: string) {
  const p = await ownProvider(actor);
  const [b] = await db.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1);
  if (!b || b.providerId !== p.id) throw new ServiceError('not_found');
  const transitions: Record<string, { from: string; to: string }> = {
    confirm: { from: 'pending', to: 'confirmed' },
    decline: { from: 'pending', to: 'declined' },
    complete: { from: 'confirmed', to: 'completed' },
  };
  const tr = transitions[action];
  if (!tr) throw new ServiceError('invalid');
  if (b.status !== tr.from) throw new ServiceError('bad_state');
  await db.update(bookings).set({ status: tr.to }).where(eq(bookings.id, b.id));
  const [slot] = await db.select({ time: slots.time }).from(slots).where(eq(slots.id, b.slotId)).limit(1);
  await notify(b.parentId, `booking_${tr.to}` as 'booking_confirmed', { who: p.title, date: b.date, time: slot?.time ?? '' }, '/dashboard');
}

// ───────────────────────── модерация (менеджер и админ) ─────────────────────────

export async function listAllProviders() {
  return db
    .select({
      ...getTableColumns(providers),
      ownerName: users.name,
      ownerEmail: users.email,
      ratingAvg,
      ratingCount,
    })
    .from(providers)
    .innerJoin(users, eq(users.id, providers.userId))
    .orderBy(
      sql`case ${providers.status} when 'pending' then 0 when 'rejected' then 1 else 2 end`,
      desc(providers.createdAt),
    );
}

export async function setProviderStatus(actor: Actor, providerId: number, status: string) {
  requireStaff(actor);
  if (!['approved', 'rejected', 'pending'].includes(status)) throw new ServiceError('invalid');
  const res = await db
    .update(providers)
    .set({ status })
    .where(eq(providers.id, providerId))
    .returning({ id: providers.id, userId: providers.userId, title: providers.title });
  if (!res.length) throw new ServiceError('not_found');
  if (status === 'approved' || status === 'rejected') {
    await notify(res[0].userId, status === 'approved' ? 'profile_approved' : 'profile_rejected', { who: res[0].title }, '/dashboard');
  }
}

export async function setVerified(actor: Actor, providerId: number, verified: boolean) {
  requireStaff(actor);
  if (verified) {
    // значок «Проверен» выдаётся только при хотя бы одном принятом документе
    const [d] = await db
      .select({ id: documents.id })
      .from(documents)
      .where(and(eq(documents.providerId, providerId), eq(documents.status, 'accepted')))
      .limit(1);
    if (!d) throw new ServiceError('no_documents');
  }
  const res = await db
    .update(providers)
    .set({ verified })
    .where(eq(providers.id, providerId))
    .returning({ id: providers.id });
  if (!res.length) throw new ServiceError('not_found');
}

// ───────────────────────── администратор ─────────────────────────

export async function listUsers(actor: Actor) {
  requireRole(actor, 'admin');
  return db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      phone: users.phone,
      role: users.role,
      active: users.active,
      blockedReason: users.blockedReason,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(desc(users.createdAt))
    .limit(500);
}

export async function setUserRole(actor: Actor, userId: number, role: string) {
  requireRole(actor, 'admin');
  if (actor.id === userId) throw new ServiceError('own_account');
  if (!(ASSIGNABLE_ROLES as readonly string[]).includes(role)) throw new ServiceError('invalid');
  const [target] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!target) throw new ServiceError('not_found');
  if (isProviderRole(target.role)) throw new ServiceError('fixed_role');
  await db.update(users).set({ role }).where(eq(users.id, userId));
}

export async function setUserActive(actor: Actor, userId: number, active: boolean, reason = '') {
  requireRole(actor, 'admin');
  if (actor.id === userId) throw new ServiceError('own_account');
  const why = reason.trim().slice(0, 300);
  if (!active && why.length < 3) throw new ServiceError('reason_required');
  const res = await db
    .update(users)
    .set({ active, blockedReason: active ? null : why })
    .where(eq(users.id, userId))
    .returning({ id: users.id, role: users.role, name: users.name });
  if (!res.length) throw new ServiceError('not_found');
  if (!active) await cancelActiveBookingsOf(userId);
}

/** Заблокированного человека нельзя оставлять в чужих активных записях: отменяем и предупреждаем вторую сторону */
async function cancelActiveBookingsOf(userId: number) {
  const parent = alias(users, 'bk_parent');
  const owner = alias(users, 'bk_owner');
  const rows = await db
    .select({
      id: bookings.id,
      date: bookings.date,
      time: slots.time,
      parentId: bookings.parentId,
      ownerId: owner.id,
      parentName: parent.name,
      title: providers.title,
    })
    .from(bookings)
    .innerJoin(providers, eq(providers.id, bookings.providerId))
    .innerJoin(owner, eq(owner.id, providers.userId))
    .innerJoin(parent, eq(parent.id, bookings.parentId))
    .innerJoin(slots, eq(slots.id, bookings.slotId))
    .where(and(inArray(bookings.status, ['pending', 'confirmed']), or(eq(bookings.parentId, userId), eq(owner.id, userId))));
  for (const r of rows) {
    await db.update(bookings).set({ status: 'cancelled' }).where(eq(bookings.id, r.id));
    if (r.parentId === userId) {
      await notify(r.ownerId, 'booking_cancelled', { who: r.parentName, date: r.date, time: r.time }, '/dashboard');
    } else {
      await notify(r.parentId, 'booking_cancelled', { who: r.title, date: r.date, time: r.time }, '/dashboard');
    }
  }
}

export async function getStats(actor: Actor) {
  requireRole(actor, 'admin');
  const [row] = await db
    .select({
      users: sql<number>`(select count(*)::int from users)`,
      parents: sql<number>`(select count(*)::int from users where role = 'parent')`,
      staff: sql<number>`(select count(*)::int from users where role in ('manager','admin'))`,
      inactive: sql<number>`(select count(*)::int from users where active = false)`,
      providers: sql<number>`(select count(*)::int from providers)`,
      nannies: sql<number>`(select count(*)::int from providers where kind = 'nanny')`,
      tutors: sql<number>`(select count(*)::int from providers where kind = 'tutor')`,
      clubs: sql<number>`(select count(*)::int from providers where kind = 'club')`,
      pending: sql<number>`(select count(*)::int from providers where status = 'pending')`,
      verified: sql<number>`(select count(*)::int from providers where verified = true)`,
      bookings: sql<number>`(select count(*)::int from bookings)`,
      bookingsActive: sql<number>`(select count(*)::int from bookings where status in ('pending','confirmed'))`,
      bookingsCompleted: sql<number>`(select count(*)::int from bookings where status = 'completed')`,
      reviews: sql<number>`(select count(*)::int from reviews where not hidden)`,
      avgRating: sql<number | null>`(select avg(rating)::float from reviews where not hidden)`,
      reportsOpen: sql<number>`(select count(*)::int from reports where status = 'open')`,
      messages: sql<number>`(select count(*)::int from messages)`,
      docsPending: sql<number>`(select count(*)::int from documents where status = 'pending')`,
      docsTotal: sql<number>`(select count(*)::int from documents)`,
    })
    .from(sql`(select 1) as t`);
  return row;
}

/** Все записи платформы: только админ */
export async function listAllBookings(actor: Actor) {
  requireRole(actor, 'admin');
  const parent = alias(users, 'parent_user');
  return db
    .select({
      id: bookings.id,
      status: bookings.status,
      createdAt: bookings.createdAt,
      parentName: parent.name,
      parentEmail: parent.email,
      providerId: providers.id,
      providerTitle: providers.title,
      providerKind: providers.kind,
      weekday: slots.weekday,
      time: slots.time,
      date: bookings.date,
    })
    .from(bookings)
    .innerJoin(parent, eq(parent.id, bookings.parentId))
    .innerJoin(providers, eq(providers.id, bookings.providerId))
    .innerJoin(slots, eq(slots.id, bookings.slotId))
    .orderBy(desc(bookings.date), desc(slots.time))
    .limit(500);
}

// ───────────────────────── документы (сертификаты и резюме) ─────────────────────────

/** Определяем тип файла по первым байтам, а не по имени и заголовку, который прислал браузер */
export function sniffMime(buf: Buffer): string | null {
  if (buf.length >= 5 && buf.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  return null;
}

const docMeta = z.object({
  docType: z.enum(DOC_TYPES),
  title: z.string().trim().min(2).max(120),
});

export async function addDocument(
  actor: Actor,
  input: { docType: string; title: string; fileName: string; data: Buffer },
) {
  const p = await ownProvider(actor);
  const meta = docMeta.safeParse({ docType: input.docType, title: input.title });
  if (!meta.success) throw new ServiceError('invalid');
  if (input.data.length === 0) throw new ServiceError('file_empty');
  if (input.data.length > MAX_DOC_BYTES) throw new ServiceError('file_too_big');
  const mime = sniffMime(input.data);
  if (!mime) throw new ServiceError('file_type');
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(documents)
    .where(eq(documents.providerId, p.id));
  if (n >= MAX_DOCS_PER_PROVIDER) throw new ServiceError('too_many_docs');
  const fileName = input.fileName.replace(/[^\w.\- ()а-яА-ЯёЁәӘіІңҢғҒүҮұҰқҚөӨһҺ]/g, '_').slice(0, 120) || 'file';
  const [d] = await db
    .insert(documents)
    .values({
      providerId: p.id,
      docType: meta.data.docType,
      title: meta.data.title,
      fileName,
      mime,
      size: input.data.length,
      data: input.data,
    })
    .returning({ id: documents.id });
  return d;
}

const docColumns = {
  id: documents.id,
  providerId: documents.providerId,
  docType: documents.docType,
  title: documents.title,
  fileName: documents.fileName,
  mime: documents.mime,
  size: documents.size,
  status: documents.status,
  createdAt: documents.createdAt,
};

/** Список документов без содержимого файла */
export async function listDocuments(providerId: number) {
  return db
    .select(docColumns)
    .from(documents)
    .where(eq(documents.providerId, providerId))
    .orderBy(desc(documents.createdAt));
}

export async function listDocumentsForStaff(actor: Actor) {
  requireStaff(actor);
  return db
    .select({ ...docColumns, providerTitle: providers.title, ownerEmail: users.email })
    .from(documents)
    .innerJoin(providers, eq(providers.id, documents.providerId))
    .innerJoin(users, eq(users.id, providers.userId))
    .orderBy(sql`case ${documents.status} when 'pending' then 0 else 1 end`, desc(documents.createdAt))
    .limit(500);
}

/** Файл отдаётся только владельцу и команде */
export async function getDocumentFile(actor: Actor, id: number) {
  if (!Number.isInteger(id)) throw new ServiceError('not_found');
  const [row] = await db
    .select({ doc: documents, ownerId: providers.userId })
    .from(documents)
    .innerJoin(providers, eq(providers.id, documents.providerId))
    .where(eq(documents.id, id))
    .limit(1);
  if (!row) throw new ServiceError('not_found');
  if (row.ownerId !== actor.id && !isStaff(actor.role)) throw new ServiceError('not_found');
  return row.doc;
}

export async function deleteDocument(actor: Actor, id: number) {
  const p = await ownProvider(actor);
  const [d] = await db.select({ id: documents.id, providerId: documents.providerId }).from(documents).where(eq(documents.id, id)).limit(1);
  if (!d || d.providerId !== p.id) throw new ServiceError('not_found');
  await db.delete(documents).where(eq(documents.id, d.id));
  // если принятых документов не осталось, значок «Проверен» снимается
  const [acc] = await db
    .select({ id: documents.id })
    .from(documents)
    .where(and(eq(documents.providerId, p.id), eq(documents.status, 'accepted')))
    .limit(1);
  if (!acc) await db.update(providers).set({ verified: false }).where(eq(providers.id, p.id));
}

export async function setDocumentStatus(actor: Actor, id: number, status: string) {
  requireStaff(actor);
  if (!(DOC_STATUSES as readonly string[]).includes(status)) throw new ServiceError('invalid');
  const [d] = await db
    .update(documents)
    .set({ status })
    .where(eq(documents.id, id))
    .returning({ providerId: documents.providerId, title: documents.title });
  if (!d) throw new ServiceError('not_found');
  if (status === 'accepted' || status === 'rejected') {
    const [own] = await db.select({ userId: providers.userId }).from(providers).where(eq(providers.id, d.providerId)).limit(1);
    if (own) await notify(own.userId, status === 'accepted' ? 'doc_accepted' : 'doc_rejected', { who: d.title }, '/dashboard');
  }
  if (status !== 'accepted') {
    const [acc] = await db
      .select({ id: documents.id })
      .from(documents)
      .where(and(eq(documents.providerId, d.providerId), eq(documents.status, 'accepted')))
      .limit(1);
    if (!acc) await db.update(providers).set({ verified: false }).where(eq(providers.id, d.providerId));
  }
}

export type { ProviderKind };
