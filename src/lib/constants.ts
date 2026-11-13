export const PROVIDER_KINDS = ['nanny', 'club', 'tutor'] as const;
export type ProviderKind = (typeof PROVIDER_KINDS)[number];

export const SELF_REGISTER_ROLES = ['parent', 'nanny', 'tutor', 'club'] as const;
export const ALL_ROLES = ['parent', 'nanny', 'tutor', 'club', 'manager', 'admin'] as const;
export type Role = (typeof ALL_ROLES)[number];

/** Роли, которые админ может назначать вручную */
export const ASSIGNABLE_ROLES = ['parent', 'manager', 'admin'] as const;

export const DISTRICTS = ['esil', 'almaty', 'saryarka', 'baikonur'] as const;
export type District = (typeof DISTRICTS)[number];

export const PRICE_UNITS = ['hour', 'session', 'month'] as const;
export type PriceUnit = (typeof PRICE_UNITS)[number];

export const DEFAULT_UNIT: Record<ProviderKind, PriceUnit> = {
  nanny: 'hour',
  tutor: 'session',
  club: 'month',
};

/** Сегменты услуг: что именно предлагает специалист. У каждого типа свой набор. */
export const SEGMENTS = [
  'care_home',
  'after_school',
  'evening_weekend',
  'school_prep',
  'languages',
  'school_subjects',
  'stem',
  'sport',
  'art',
  'music',
  'logic',
] as const;
export type Segment = (typeof SEGMENTS)[number];

export const KIND_SEGMENTS: Record<ProviderKind, readonly Segment[]> = {
  nanny: ['care_home', 'after_school', 'evening_weekend'],
  tutor: ['school_prep', 'languages', 'school_subjects', 'stem'],
  club: ['sport', 'art', 'music', 'stem', 'logic', 'languages'],
};
export const DEFAULT_SEGMENT: Record<ProviderKind, Segment> = {
  nanny: 'care_home',
  tutor: 'school_subjects',
  club: 'art',
};

export const SEGMENT_EMOJI: Record<Segment, string> = {
  care_home: '🏠',
  after_school: '🎒',
  evening_weekend: '🌙',
  school_prep: '✏️',
  languages: '🗣️',
  school_subjects: '📚',
  stem: '🤖',
  sport: '🏊',
  art: '🎨',
  music: '🎵',
  logic: '♟️',
};

/** Возрастные группы детей для фильтра. Специалист подходит, если его диапазон пересекается с группой. */
export const AGE_GROUPS = [
  { id: '0-3', from: 0, to: 3 },
  { id: '4-6', from: 4, to: 6 },
  { id: '7-10', from: 7, to: 10 },
  { id: '11-14', from: 11, to: 14 },
  { id: '15-18', from: 15, to: 18 },
] as const;
export type AgeGroupId = (typeof AGE_GROUPS)[number]['id'];

/** Документы специалиста: сертификаты и резюме */
export const DOC_TYPES = ['certificate', 'resume'] as const;
export type DocType = (typeof DOC_TYPES)[number];
export const DOC_STATUSES = ['pending', 'accepted', 'rejected'] as const;
export const MAX_DOC_BYTES = 3 * 1024 * 1024;
export const MAX_DOCS_PER_PROVIDER = 10;

export const THEMES = ['light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];
export const THEME_COOKIE = 'momease_theme';

export const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;

export const LOCALES = ['ru', 'kk', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'ru';
export const LOCALE_LABEL: Record<Locale, string> = { ru: 'RU', kk: 'ҚАЗ', en: 'EN' };
export const LOCALE_NAME: Record<Locale, string> = { ru: 'Русский', kk: 'Қазақша', en: 'English' };

export const SESSION_COOKIE = 'momease_session';
export const LOCALE_COOKIE = 'momease_lang';

export function isProviderRole(role: string): role is ProviderKind {
  return (PROVIDER_KINDS as readonly string[]).includes(role);
}
export function isStaff(role: string) {
  return role === 'manager' || role === 'admin';
}

/** Жалобы */
export const REPORT_REASONS = ['spam', 'inappropriate', 'fraud', 'safety', 'other'] as const;
export const REPORT_TARGETS = ['provider', 'review', 'chat'] as const;
export type ReportTarget = (typeof REPORT_TARGETS)[number];
export const REPORT_STATUSES = ['open', 'resolved', 'dismissed'] as const;
export const REPORT_ACTIONS = ['dismiss', 'resolve', 'hide_review', 'reject_provider', 'block_user'] as const;

/** Сортировка каталога */
export const SORTS = ['best', 'rating', 'price_asc', 'price_desc', 'new'] as const;
export type Sort = (typeof SORTS)[number];

/** Календарь записи: на сколько дней вперёд можно записаться и сколько дней показывать */
export const BOOKING_HORIZON_DAYS = 60;
export const CALENDAR_DAYS = 28;

export const MAX_MESSAGE_LEN = 1000;
