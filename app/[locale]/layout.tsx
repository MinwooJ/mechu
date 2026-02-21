import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";

import LocaleHtmlLangSync from "@/app/components/locale-html-lang-sync";
import { isLocale, type Locale } from "@/lib/i18n/config";

const OG_ALTERNATE_LOCALES = ["ko_KR", "en_US", "ja_JP", "zh_TW"] as const;

const LOCALE_META: Record<
  Locale,
  { title: string; description: string; image: string; ogLocale: (typeof OG_ALTERNATE_LOCALES)[number] }
> = {
  ko: {
    title: "mechu | 점메추? 저메추?",
    description: "위치 기반으로 점심/저녁 맛집을 추천해요.",
    image: "/preview/og-ko.png",
    ogLocale: "ko_KR",
  },
  en: {
    title: "mechu | Lunch Pick? Dinner Pick?",
    description: "Location-based lunch and dinner recommendations.",
    image: "/preview/og-en.png",
    ogLocale: "en_US",
  },
  ja: {
    title: "mechu | ランチどうする？ディナーどうする？",
    description: "位置ベースでランチ・ディナーのおすすめを提案します。",
    image: "/preview/og-ja.png",
    ogLocale: "ja_JP",
  },
  "zh-Hant": {
    title: "mechu | 午餐吃什麼？晚餐吃什麼？",
    description: "依據位置推薦午餐與晚餐餐廳。",
    image: "/preview/og-zh-hant.png",
    ogLocale: "zh_TW",
  },
};

function getMetadataBase(): URL | undefined {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!raw) return undefined;
  try {
    return new URL(raw);
  } catch {
    return undefined;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};

  const base = getMetadataBase();
  const meta = LOCALE_META[locale];
  const alternateLocale = OG_ALTERNATE_LOCALES.filter((value) => value !== meta.ogLocale);

  return {
    ...(base ? { metadataBase: base } : {}),
    title: meta.title,
    description: meta.description,
    openGraph: {
      type: "website",
      title: meta.title,
      description: meta.description,
      locale: meta.ogLocale,
      alternateLocale,
      images: [{ url: meta.image, width: 1200, height: 630, alt: meta.title }],
    },
    twitter: {
      card: "summary_large_image",
      title: meta.title,
      description: meta.description,
      images: [meta.image],
    },
  };
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
