import type { Metadata } from "next";
import { notFound } from "next/navigation";

import StatusPage from "@/app/status/status-client";
import { isLocale } from "@/lib/i18n/config";
import { getLocalizedPageMetadata } from "@/lib/seo/metadata";

export const dynamic = "force-static";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return getLocalizedPageMetadata(locale, "status");
}

export default StatusPage;
