import type { ReactNode } from "react";
import { notFound } from "next/navigation";

import LocaleHtmlLangSync from "@/app/components/locale-html-lang-sync";
import { isLocale } from "@/lib/i18n/config";
import { generateLocaleStaticParams } from "@/lib/i18n/static-params";

export const dynamicParams = false;

export function generateStaticParams() {
  return generateLocaleStaticParams();
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  return (
    <>
      <LocaleHtmlLangSync locale={locale} />
      {children}
    </>
  );
}
