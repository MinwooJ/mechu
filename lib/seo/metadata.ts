import type { Metadata } from "next";

import { DEFAULT_LOCALE, LOCALES, type Locale } from "@/lib/i18n/config";

export const SEO_SECTIONS = ["onboarding", "preferences", "results", "status"] as const;

export type SeoSection = (typeof SEO_SECTIONS)[number];

const DEV_FALLBACK_SITE_URL = "http://localhost:3000";
let didWarnSiteUrlFallback = false;

const OG_LOCALE_BY_LOCALE: Record<Locale, string> = {
  ko: "ko_KR",
  en: "en_US",
  ja: "ja_JP",
  "zh-Hant": "zh_TW",
};

const OG_IMAGE_BY_LOCALE: Record<Locale, string> = {
  ko: "/preview/og-ko.png",
  en: "/preview/og-en.png",
  ja: "/preview/og-ja.png",
  "zh-Hant": "/preview/og-zh-hant.png",
};

const SEO_COPY: Record<Locale, Record<SeoSection, { title: string; description: string }>> = {
  ko: {
    onboarding: {
      title: "mechu | 점메추? 저메추?",
      description: "지금 위치 기준으로 오늘 점심과 저녁 맛집 Top3를 추천받아보세요.",
    },
    preferences: {
      title: "mechu | 검색 조건 선택",
      description: "점심/저녁, 거리 범위, 바이브를 선택해 내 취향에 맞는 추천을 받아보세요.",
    },
    results: {
      title: "mechu | Top3 추천 결과",
      description: "위치 기반 추천 결과 Top3를 지도와 함께 확인하고 바로 지도앱으로 이동하세요.",
    },
    status: {
      title: "mechu | 상태 안내",
      description: "지원 지역/네트워크 상태/빈 결과를 확인하고 다음 행동으로 빠르게 이동하세요.",
    },
  },
  en: {
    onboarding: {
      title: "mechu | Lunch Pick? Dinner Pick?",
      description: "Get top 3 nearby food recommendations for lunch and dinner.",
    },
    preferences: {
      title: "mechu | Choose Your Preferences",
      description: "Set meal time, search radius, and vibe to personalize your recommendations.",
    },
    results: {
      title: "mechu | Top 3 Picks",
      description: "View your top 3 location-based restaurant picks on the map and open map apps quickly.",
    },
    status: {
      title: "mechu | Service Status",
      description: "Check unsupported areas, connection issues, or empty results and continue smoothly.",
    },
  },
  ja: {
    onboarding: {
      title: "mechu | ランチどうする？ディナーどうする？",
      description: "現在地をもとに、ランチとディナーのおすすめ3件を提案します。",
    },
    preferences: {
      title: "mechu | 条件を選択",
      description: "食事時間・検索半径・雰囲気を選んで、自分に合うお店を探しましょう。",
    },
    results: {
      title: "mechu | おすすめTop3",
      description: "位置情報ベースのTop3結果を地図で確認し、地図アプリへすぐ移動できます。",
    },
    status: {
      title: "mechu | ステータス案内",
      description: "対応地域・接続状態・検索結果なしの状態を確認し、次の操作へ進めます。",
    },
  },
  "zh-Hant": {
    onboarding: {
      title: "mechu | 午餐吃什麼？晚餐吃什麼？",
      description: "依據目前位置，推薦午餐與晚餐的 Top3 餐廳。",
    },
    preferences: {
      title: "mechu | 設定搜尋條件",
      description: "選擇用餐時段、搜尋半徑與風格，快速找到符合今天心情的餐廳。",
    },
    results: {
      title: "mechu | Top 3 推薦",
      description: "在地圖上查看位置推薦的 Top3 餐廳，並可快速開啟地圖服務。",
    },
    status: {
      title: "mechu | 狀態提示",
      description: "確認服務區域、連線狀態與無結果情況，並繼續下一步操作。",
    },
  },
};

export function getMetadataBase(): URL {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();

  if (!raw) {
    if (isStrictSiteUrlRequired()) {
      throw new Error(
        "[seo] NEXT_PUBLIC_SITE_URL is required in CI/production-like environments for canonical and sitemap URLs.",
      );
    }
    if (process.env.NODE_ENV !== "production") {
      warnSiteUrlFallback(`[seo] NEXT_PUBLIC_SITE_URL is missing. Falling back to ${DEV_FALLBACK_SITE_URL}.`);
    }
    return new URL(DEV_FALLBACK_SITE_URL);
  }

  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error(`unsupported protocol: ${parsed.protocol}`);
    }
    return parsed;
  } catch {
    if (isStrictSiteUrlRequired()) {
      throw new Error(`[seo] NEXT_PUBLIC_SITE_URL is invalid: "${raw}"`);
    }
    if (process.env.NODE_ENV !== "production") {
      warnSiteUrlFallback(
        `[seo] NEXT_PUBLIC_SITE_URL is invalid ("${raw}"). Falling back to ${DEV_FALLBACK_SITE_URL}.`,
      );
    }
    return new URL(DEV_FALLBACK_SITE_URL);
  }
}

export function getLocalizedPath(locale: Locale, section: SeoSection): string {
  return `/${locale}/${section}`;
}

function getAlternateLanguageMap(section: SeoSection): Record<string, string> {
  const languages = Object.fromEntries(
    LOCALES.map((locale) => [locale, getLocalizedPath(locale, section)]),
  );
  languages["x-default"] = getLocalizedPath(DEFAULT_LOCALE, section);
  return languages;
}

export function getLocalizedPageMetadata(locale: Locale, section: SeoSection): Metadata {
  const text = SEO_COPY[locale][section];
  const ogLocale = OG_LOCALE_BY_LOCALE[locale];
  const alternateLocale = Object.values(OG_LOCALE_BY_LOCALE).filter((value) => value !== ogLocale);
  const path = getLocalizedPath(locale, section);

  return {
    title: text.title,
    description: text.description,
    alternates: {
      canonical: path,
      languages: getAlternateLanguageMap(section),
    },
    openGraph: {
      type: "website",
      title: text.title,
      description: text.description,
      url: path,
      locale: ogLocale,
      alternateLocale,
      images: [{ url: OG_IMAGE_BY_LOCALE[locale], width: 1200, height: 630, alt: text.title }],
    },
    twitter: {
      card: "summary_large_image",
      title: text.title,
      description: text.description,
      images: [OG_IMAGE_BY_LOCALE[locale]],
    },
    ...(section === "status"
      ? {
          robots: {
            index: false,
            follow: false,
          },
        }
      : {}),
  };
}

function isStrictSiteUrlRequired(): boolean {
  return process.env.SEO_STRICT_SITE_URL === "1" || process.env.CI === "true" || Boolean(process.env.CF_PAGES);
}

function warnSiteUrlFallback(message: string): void {
  if (didWarnSiteUrlFallback) return;
  didWarnSiteUrlFallback = true;
  console.warn(message);
}
