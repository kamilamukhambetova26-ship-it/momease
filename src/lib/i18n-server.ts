import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { LOCALE_COOKIE, type Locale } from './constants';
import { makeT, normalizeLocale } from './i18n';

/** Язык: сначала cookie, потом заголовок браузера, по умолчанию русский */
export const getI18n = cache(async () => {
  const jar = await cookies();
  const saved = jar.get(LOCALE_COOKIE)?.value;
  let locale: Locale;
  if (saved) {
    locale = normalizeLocale(saved);
  } else {
    const accept = ((await headers()).get('accept-language') ?? '').toLowerCase();
    const first = accept.split(',')[0]?.trim().slice(0, 2);
    locale = first === 'kk' ? 'kk' : first === 'en' ? 'en' : 'ru';
  }
  return { locale, t: makeT(locale) };
});
