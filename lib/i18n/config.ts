export const LOCALES = ["ko", "en", "ja", "zh-Hant"] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "NEXT_LOCALE";

const LOCALE_ALIASES: Record<string, Locale> = {
  ko: "ko",
  en: "en",
  ja: "ja",
  "zh-hant": "zh-Hant",
  "zh-hk": "zh-Hant",
  "zh-mo": "zh-Hant",
  "zh-tw": "zh-Hant",
};

export const LOCALE_NATIVE_LABEL: Record<Locale, string> = {
  ko: "한국어",
  en: "English",
  ja: "日本語",
  "zh-Hant": "繁體中文",
};

export function parseLocale(value: string | null | undefined): Locale | undefined {
  if (!value) return undefined;
  const normalized = value.trim();
  if (LOCALES.includes(normalized as Locale)) {
    return normalized as Locale;
  }

  return LOCALE_ALIASES[normalized.toLowerCase()];
}

export function isLocale(value: string | null | undefined): value is Locale {
  return Boolean(value && LOCALES.includes(value as Locale));
}
