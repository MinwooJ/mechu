import { LOCALES, type Locale } from "@/lib/i18n/config";

export type LocaleParam = { locale: Locale };

export function generateLocaleStaticParams(): LocaleParam[] {
  return LOCALES.map((locale) => ({ locale }));
}
