import type { MetadataRoute } from "next";

import { DEFAULT_LOCALE, LOCALES, type Locale } from "@/lib/i18n/config";
import { SEO_SECTIONS, getLocalizedPath, getMetadataBase, type SeoSection } from "@/lib/seo/metadata";

const SECTION_PRIORITY: Record<SeoSection, number> = {
  onboarding: 1.0,
  preferences: 0.8,
  results: 0.7,
  status: 0.5,
};

const SECTION_FREQUENCY: Record<SeoSection, MetadataRoute.Sitemap[number]["changeFrequency"]> = {
  onboarding: "daily",
  preferences: "daily",
  results: "daily",
  status: "weekly",
};

function toAbsolute(path: string): string {
  return new URL(path, getMetadataBase()).toString();
}

function getAlternates(section: SeoSection): Record<string, string> {
  const languages = Object.fromEntries(LOCALES.map((locale) => [locale, toAbsolute(getLocalizedPath(locale, section))]));
  languages["x-default"] = toAbsolute(getLocalizedPath(DEFAULT_LOCALE, section));
  return languages;
}

function isIndexableSection(section: SeoSection): boolean {
  return section !== "status";
}

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const entries: MetadataRoute.Sitemap = [];

  for (const section of SEO_SECTIONS) {
    if (!isIndexableSection(section)) continue;
    const alternates = getAlternates(section);
    for (const locale of LOCALES as readonly Locale[]) {
      entries.push({
        url: toAbsolute(getLocalizedPath(locale, section)),
        lastModified: now,
        changeFrequency: SECTION_FREQUENCY[section],
        priority: SECTION_PRIORITY[section],
        alternates: { languages: alternates },
      });
    }
  }

  return entries;
}
