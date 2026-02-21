import { DEFAULT_LOCALE, parseLocale, type Locale } from "@/lib/i18n/config";

export function localeFromPathname(pathname: string | null | undefined): Locale {
  if (!pathname) return DEFAULT_LOCALE;
  const firstSegment = pathname.split("/").filter(Boolean)[0];
  return parseLocale(firstSegment) ?? DEFAULT_LOCALE;
}

export function stripLocalePrefix(pathname: string): string {
  const chunks = pathname.split("/").filter(Boolean);
  if (chunks.length === 0) return "/";
  if (parseLocale(chunks[0])) {
    const rest = chunks.slice(1).join("/");
    return rest ? `/${rest}` : "/";
  }
  return pathname.startsWith("/") ? pathname : `/${pathname}`;
}

export function withLocale(locale: Locale, path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const pathWithoutLocale = stripLocalePrefix(normalized);
  if (pathWithoutLocale === "/") return `/${locale}`;
  return `/${locale}${pathWithoutLocale}`;
}

export function switchLocaleInPathname(pathname: string, locale: Locale): string {
  return withLocale(locale, stripLocalePrefix(pathname));
}
