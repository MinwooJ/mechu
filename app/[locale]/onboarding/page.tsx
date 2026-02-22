import type { Metadata } from "next";
import { notFound } from "next/navigation";

import OnboardingPage from "@/app/onboarding/onboarding-client";
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
  return getLocalizedPageMetadata(locale, "onboarding");
}

export default OnboardingPage;
