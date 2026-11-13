/**
 * Даты занятий хранятся строками YYYY-MM-DD по времени Астаны (UTC+5, без перехода на летнее время).
 * Так не возникает сдвигов из-за часовых поясов сервера.
 */
const OFFSET_MS = 5 * 60 * 60 * 1000;

export function todayStr(now: number = Date.now()) {
  return new Date(now + OFFSET_MS).toISOString().slice(0, 10);
}

export function timeNowStr(now: number = Date.now()) {
  return new Date(now + OFFSET_MS).toISOString().slice(11, 16);
}

export function isDateStr(s: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function addDays(date: string, n: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 0 = понедельник ... 6 = воскресенье */
export function weekdayOf(date: string) {
  return (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
}

/** Ближайшая дата не позже `onOrBefore` с нужным днём недели (нужна для демо-данных) */
export function lastDateWithWeekday(weekday: number, onOrBefore: string) {
  const diff = (weekdayOf(onOrBefore) - weekday + 7) % 7;
  return addDays(onOrBefore, -diff);
}

/** Занятие ещё не прошло? */
export function isFutureSlot(date: string, time: string, now: number = Date.now()) {
  const today = todayStr(now);
  if (date !== today) return date > today;
  return time > timeNowStr(now);
}

const LOCALE_TAG: Record<string, string> = { ru: 'ru-RU', kk: 'kk-KZ', en: 'en-GB' };

export function formatDate(date: string, locale: string, style: 'short' | 'long' = 'short') {
  const opts: Intl.DateTimeFormatOptions =
    style === 'long'
      ? { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }
      : { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' };
  return new Intl.DateTimeFormat(LOCALE_TAG[locale] ?? 'ru-RU', opts).format(new Date(`${date}T00:00:00Z`));
}

export function formatMonthDay(date: string, locale: string) {
  return new Intl.DateTimeFormat(LOCALE_TAG[locale] ?? 'ru-RU', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
    new Date(`${date}T00:00:00Z`),
  );
}
