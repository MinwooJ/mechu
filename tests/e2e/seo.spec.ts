import { expect, test } from '@playwright/test';
import { DEFAULT_LOCALE } from '../../lib/i18n/config';

const LOCALES = ['ko', 'en', 'ja', 'zh-Hant'] as const;
const INDEXABLE_SECTIONS = ['onboarding', 'preferences', 'results'] as const;
const FLOW_KEY = 'meal_reco_flow_state_v1';

test('locale onboarding pages expose canonical and hreflang alternates', async ({ page }) => {
  for (const locale of LOCALES) {
    await page.goto(`/${locale}/onboarding`);

    const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
    expect(canonical).toContain(`/${locale}/onboarding`);

    const alternates = await page.$$eval('link[rel="alternate"]', (nodes) =>
      nodes.map((node) => ({
        hrefLang: node.getAttribute('hreflang') ?? '',
        href: node.getAttribute('href') ?? '',
      })),
    );

    const alternateMap = Object.fromEntries(alternates.map((entry) => [entry.hrefLang, entry.href]));
    expect(alternateMap.ko).toContain('/ko/onboarding');
    expect(alternateMap.en).toContain('/en/onboarding');
    expect(alternateMap.ja).toContain('/ja/onboarding');
    expect(alternateMap['zh-Hant']).toContain('/zh-Hant/onboarding');
    expect(alternateMap['x-default']).toContain(`/${DEFAULT_LOCALE}/onboarding`);
  }
});

test('results page exposes canonical/hreflang and OG metadata', async ({ page }) => {
  const locale = 'ja';

  await page.addInitScript((key) => {
    window.localStorage.setItem(
      key,
      JSON.stringify({
        countryCode: 'JP',
        mode: 'dinner',
        radius: 1000,
        randomness: 'balanced',
        position: { lat: 35.6895, lng: 139.6917 },
      }),
    );
  }, FLOW_KEY);

  await page.route('**/api/availability**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ supported: true }),
    });
  });

  await page.route('**/api/recommendations', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'ok',
        recommendations: [
          {
            place_id: 'g1',
            name: 'Sample Izakaya',
            lat: 35.6898,
            lng: 139.692,
            address: '1-1 Sample, Tokyo',
            rating: 4.2,
            price_level: 2,
            distance_m: 320,
            category: 'Restaurant',
            raw_category: 'Izakaya',
            why: ['Near your location'],
            open_now: true,
          },
        ],
      }),
    });
  });

  await page.route('**/api/events', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    });
  });

  await page.goto(`/${locale}/results`);
  await expect(page).toHaveURL(/\/ja\/results$/);

  const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
  expect(canonical).toContain(`/${locale}/results`);

  const alternates = await page.$$eval('link[rel="alternate"]', (nodes) =>
    nodes.map((node) => ({
      hrefLang: node.getAttribute('hreflang') ?? '',
      href: node.getAttribute('href') ?? '',
    })),
  );
  const alternateMap = Object.fromEntries(alternates.map((entry) => [entry.hrefLang, entry.href]));
  expect(alternateMap['x-default']).toContain(`/${DEFAULT_LOCALE}/results`);
  expect(alternateMap.ko).toContain('/ko/results');
  expect(alternateMap.en).toContain('/en/results');
  expect(alternateMap.ja).toContain('/ja/results');
  expect(alternateMap['zh-Hant']).toContain('/zh-Hant/results');

  const ogLocale = await page.locator('meta[property="og:locale"]').getAttribute('content');
  const ogUrl = await page.locator('meta[property="og:url"]').getAttribute('content');
  const ogImage = await page.locator('meta[property="og:image"]').getAttribute('content');
  const twitterImage = await page.locator('meta[name="twitter:image"]').getAttribute('content');

  expect(ogLocale).toBe('ja_JP');
  expect(ogUrl).toContain('/ja/results');
  expect(ogImage).toContain('/preview/og-ja.png');
  expect(twitterImage).toContain('/preview/og-ja.png');
});

test('status page is noindex and excluded from index targets', async ({ page }) => {
  await page.goto('/ko/status');

  const robots = await page.locator('meta[name="robots"]').getAttribute('content');
  expect(robots).toContain('noindex');
  expect(robots).toContain('nofollow');

  const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
  expect(canonical).toContain('/ko/status');
});

test('robots.txt disallows API crawling and exposes sitemap', async ({ request }) => {
  const response = await request.get('/robots.txt');
  expect(response.ok()).toBeTruthy();
  const text = await response.text();

  expect(text).toContain('Disallow: /api');
  expect(text).not.toContain('Disallow: /api/');
  expect(text).toContain('Sitemap: ');
});

test('sitemap.xml contains localized URLs and alternates', async ({ request }) => {
  const response = await request.get('/sitemap.xml');
  expect(response.ok()).toBeTruthy();
  const xml = await response.text();

  expect(xml).toContain('/ko/onboarding');
  expect(xml).toContain('/en/onboarding');
  expect(xml).toContain('/ja/onboarding');
  expect(xml).toContain('/zh-Hant/onboarding');
  expect(xml).toContain('hreflang="x-default"');
  expect(xml).not.toContain('/status');

  const locCount = (xml.match(/<loc>/g) ?? []).length;
  expect(locCount).toBe(LOCALES.length * INDEXABLE_SECTIONS.length);
});
