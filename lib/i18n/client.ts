"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";

import { type Locale } from "@/lib/i18n/config";
import { getMessages, tFromMessages } from "@/lib/i18n/messages";
import { localeFromPathname, withLocale } from "@/lib/i18n/routing";

export function useLocale(): Locale {
  const pathname = usePathname();
  return localeFromPathname(pathname);
}

export function useT() {
  const locale = useLocale();
  const messages = useMemo(() => getMessages(locale), [locale]);

  return useMemo(
    () => (key: string, vars?: Record<string, string | number>) => tFromMessages(messages, key, vars),
    [messages],
  );
}

export function useLocaleHref() {
  const locale = useLocale();
  return useMemo(() => (path: string) => withLocale(locale, path), [locale]);
}
