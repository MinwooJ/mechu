import { redirect, notFound } from "next/navigation";

import { isLocale } from "@/lib/i18n/config";

export const dynamic = "force-static";

export default async function LocaleIndexPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  redirect(`/${locale}/onboarding`);
}
