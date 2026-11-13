import { sql } from 'drizzle-orm';
import {
  boolean,
  customType,
  index,
  integer,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

/**
 * Роли: parent | nanny | tutor | club | manager | admin
 * Статусы профиля: pending | approved | rejected
 * Статусы записи: pending | confirmed | declined | cancelled | completed
 * (значения хранятся строками, чтобы схему было легко менять; допустимые
 * значения проверяются в src/lib/services.ts)
 */

/** Бинарные данные (файлы документов). pg отдаёт Buffer, PGlite — Uint8Array. */
const bytea = customType<{ data: Buffer; driverData: Buffer | Uint8Array }>({
  dataType() {
    return 'bytea';
  },
  toDriver(value) {
    return value;
  },
  fromDriver(value) {
    return Buffer.from(value);
  },
});

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  phone: text('phone'),
  role: text('role').notNull().default('parent'),
  active: boolean('active').notNull().default(true),
  blockedReason: text('blocked_reason'), // причина блокировки (видна только команде)
  consentAt: timestamp('consent_at', { withTimezone: true }), // когда принял правила и политику конфиденциальности
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const providers = pgTable(
  'providers',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(), // nanny | tutor | club
    segment: text('segment').notNull().default('care_home'), // см. SEGMENTS в constants.ts
    title: text('title').notNull(),
    bio: text('bio').notNull().default(''),
    district: text('district').notNull().default('esil'),
    priceAmount: integer('price_amount').notNull().default(0),
    priceUnit: text('price_unit').notNull().default('hour'), // hour | session | month
    ageFrom: integer('age_from').notNull().default(0),
    ageTo: integer('age_to').notNull().default(12),
    status: text('status').notNull().default('pending'),
    verified: boolean('verified').notNull().default(false),
    online: boolean('online').notNull().default(false),
    trial: boolean('trial').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('providers_status_kind_idx').on(t.status, t.kind)],
);

/** Сертификаты и резюме специалистов. Файл хранится в БД, доступ только владельцу и команде. */
export const documents = pgTable(
  'documents',
  {
    id: serial('id').primaryKey(),
    providerId: integer('provider_id')
      .notNull()
      .references(() => providers.id, { onDelete: 'cascade' }),
    docType: text('doc_type').notNull(), // certificate | resume
    title: text('title').notNull(),
    fileName: text('file_name').notNull(),
    mime: text('mime').notNull(),
    size: integer('size').notNull(),
    data: bytea('data').notNull(),
    status: text('status').notNull().default('pending'), // pending | accepted | rejected
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('documents_provider_idx').on(t.providerId)],
);

export const slots = pgTable(
  'slots',
  {
    id: serial('id').primaryKey(),
    providerId: integer('provider_id')
      .notNull()
      .references(() => providers.id, { onDelete: 'cascade' }),
    weekday: integer('weekday').notNull(), // 0 = Пн ... 6 = Вс
    time: text('time').notNull(), // HH:MM
  },
  (t) => [uniqueIndex('slots_unique_idx').on(t.providerId, t.weekday, t.time)],
);

export const bookings = pgTable(
  'bookings',
  {
    id: serial('id').primaryKey(),
    parentId: integer('parent_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    providerId: integer('provider_id')
      .notNull()
      .references(() => providers.id, { onDelete: 'cascade' }),
    slotId: integer('slot_id')
      .notNull()
      .references(() => slots.id, { onDelete: 'cascade' }),
    date: text('date').notNull(), // конкретная дата занятия, YYYY-MM-DD (время Астаны)
    status: text('status').notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // На один слот в конкретную дату может быть только одна активная запись (защита от гонок)
    uniqueIndex('bookings_active_slot_date_idx')
      .on(t.slotId, t.date)
      .where(sql.raw(`status in ('pending','confirmed')`)),
    index('bookings_parent_idx').on(t.parentId),
    index('bookings_provider_idx').on(t.providerId),
  ],
);

export const reviews = pgTable('reviews', {
  id: serial('id').primaryKey(),
  bookingId: integer('booking_id')
    .notNull()
    .unique()
    .references(() => bookings.id, { onDelete: 'cascade' }),
  parentId: integer('parent_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  providerId: integer('provider_id')
    .notNull()
    .references(() => providers.id, { onDelete: 'cascade' }),
  rating: integer('rating').notNull(),
  text: text('text').notNull().default(''),
  hidden: boolean('hidden').notNull().default(false), // скрыт по жалобе
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Чат внутри записи: переписка мамы и специалиста */
export const messages = pgTable(
  'messages',
  {
    id: serial('id').primaryKey(),
    bookingId: integer('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'cascade' }),
    senderId: integer('sender_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('messages_booking_idx').on(t.bookingId, t.id)],
);

/** Уведомления внутри платформы. Текст собирается при показе из type + params на языке читателя. */
export const notifications = pgTable(
  'notifications',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    params: text('params').notNull().default('{}'), // JSON со значениями для подстановки
    link: text('link').notNull().default('/dashboard'),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('notifications_user_idx').on(t.userId, t.readAt)],
);

/**
 * Жалобы. targetType: provider | review | chat (targetId = id профиля, отзыва, записи).
 * Статусы: open | resolved | dismissed.
 */
export const reports = pgTable(
  'reports',
  {
    id: serial('id').primaryKey(),
    reporterId: integer('reporter_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    targetType: text('target_type').notNull(),
    targetId: integer('target_id').notNull(),
    targetUserId: integer('target_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    reason: text('reason').notNull(),
    details: text('details').notNull().default(''),
    status: text('status').notNull().default('open'),
    resolution: text('resolution'), // dismiss | resolve | hide_review | reject_provider | block_user
    handledBy: integer('handled_by').references(() => users.id, { onDelete: 'set null' }),
    handledAt: timestamp('handled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // один человек не может подать вторую открытую жалобу на то же самое
    uniqueIndex('reports_open_unique_idx')
      .on(t.reporterId, t.targetType, t.targetId)
      .where(sql.raw(`status = 'open'`)),
    index('reports_status_idx').on(t.status),
  ],
);

/** Обращения в поддержку (в том числе апелляции по блокировкам). Могут приходить от гостей. */
export const supportTickets = pgTable(
  'support_tickets',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    email: text('email').notNull(),
    topic: text('topic').notNull(), // question | bug | appeal | other
    message: text('message').notNull(),
    status: text('status').notNull().default('open'), // open | closed
    closedBy: integer('closed_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('support_status_idx').on(t.status, t.createdAt)],
);

export type User = typeof users.$inferSelect;
export type Provider = typeof providers.$inferSelect;
export type Document = typeof documents.$inferSelect;
export type Slot = typeof slots.$inferSelect;
export type Booking = typeof bookings.$inferSelect;
export type Review = typeof reviews.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type Report = typeof reports.$inferSelect;
export type SupportTicket = typeof supportTickets.$inferSelect;

/** Избранные специалисты родителя */
export const favorites = pgTable(
  'favorites',
  {
    userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    providerId: integer('provider_id').notNull().references(() => providers.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.providerId] })],
);
