import { DEFAULT_LOCALE, LOCALES, type Locale } from './constants';
import { DICTS } from './dict';

export type TFn = (key: string, vars?: Record<string, string | number>) => string;

export function normalizeLocale(value: string | undefined | null): Locale {
  return (LOCALES as readonly string[]).includes(value ?? '') ? (value as Locale) : DEFAULT_LOCALE;
}

export function makeT(locale: Locale): TFn {
  const dict = DICTS[locale] as Record<string, string>;
  const fallback = DICTS[DEFAULT_LOCALE] as Record<string, string>;
  return (key, vars) => {
    let text = dict[key] ?? fallback[key] ?? key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        text = text.split(`{${k}}`).join(String(v));
      }
    }
    return text;
  };
}

export function hasKey(key: string) {
  return key in DICTS[DEFAULT_LOCALE];
}

export function formatPrice(amount: number, unit: string, t: TFn) {
  const n = new Intl.NumberFormat('ru-RU').format(amount).replace(/ /g, ' ');
  return `${n} ${t('unit.' + unit)}`;
}
