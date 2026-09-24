import ar from './ar.json';
import en from './en.json';

export const locales = ['ar', 'en'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'ar';

const dict: Record<Locale, typeof en> = { ar, en };

export type Localized = { ar: string; en: string };

export function isLocale(v: unknown): v is Locale {
  return typeof v === 'string' && (locales as readonly string[]).includes(v);
}

/** Strings for a locale; `t('nav.home')` style lookup with `{n}` interpolation. */
export function useT(locale: Locale) {
  const d = dict[locale] as unknown as Record<string, unknown>;
  return (key: string, vars: Record<string, string | number> = {}): string => {
    const v = key.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), d);
    let s = typeof v === 'string' ? v : key;
    for (const [k, val] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(val));
    return s;
  };
}

/** Raw dictionary access for arrays/objects (e.g. how.steps). */
export function strings(locale: Locale) {
  return dict[locale];
}

export const l = (v: Localized, locale: Locale) => v[locale];

export const dir = (locale: Locale) => (locale === 'ar' ? 'rtl' : 'ltr');

/** `/ar/products/x` style path for a locale. `path` is locale-less, e.g. `/products/x`. */
export function localePath(locale: Locale, path = '/') {
  const clean = path.replace(/^\/+/, '');
  return clean ? `/${locale}/${clean}/` : `/${locale}/`;
}

/** Same page in the other locale, from a current pathname like `/en/products/x/`. */
export function altLocalePath(pathname: string, target: Locale) {
  const rest = pathname.replace(/^\/(ar|en)(\/|$)/, '');
  return localePath(target, rest);
}

export function otherLocale(locale: Locale): Locale {
  return locale === 'ar' ? 'en' : 'ar';
}

export const staticLangPaths = () => locales.map((lang) => ({ params: { lang } }));
