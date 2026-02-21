import { expect, test } from '@playwright/test';

const FLOW_KEY = 'meal_reco_flow_state_v1';
const BASE_URL = 'http://127.0.0.1:3100';

test('language switcher keeps current route context', async ({ page }) => {
  await page.goto('/ko/onboarding');
  await expect(page.getByRole('button', { name: '내 위치 허용하기' })).toBeVisible();

  await page.locator('.flow-lang-toggle').click();
  await expect(page.locator('.flow-lang-menu')).toBeVisible();
  await page.getByRole('menuitem', { name: 'English' }).click();
  await expect(page).toHaveURL(/\/en\/onboarding$/);
  await expect(page.getByRole('button', { name: 'Allow my location' })).toBeVisible();
});

test('supports ja and zh-Hant locale routes', async ({ page }) => {
  await page.goto('/ja/onboarding');
  await expect(page.getByRole('button', { name: '現在地を許可' })).toBeVisible();

  await page.goto('/zh-Hant/onboarding');
  await expect(page.getByRole('button', { name: '允許目前位置' })).toBeVisible();
});

test('normalizes lowercase zh-hant locale path to canonical segment', async ({ page }) => {
  await page.goto('/zh-hant/onboarding');
  await expect(page).toHaveURL(/\/zh-Hant\/onboarding$/);
});

test('falls back to IP country locale when cookie and Accept-Language are not matched', async ({ browser }) => {
  const context = await browser.newContext({
    locale: 'fr-FR',
    extraHTTPHeaders: {
      'x-vercel-ip-country': 'JP',
    },
  });
  const page = await context.newPage();
  await page.goto(`${BASE_URL}/`);
  await expect(page).toHaveURL(/\/ja\/onboarding$/);
  await context.close();
});

test('maps zh-TW Accept-Language to zh-Hant locale', async ({ browser }) => {
  const context = await browser.newContext({
    locale: 'zh-TW',
    extraHTTPHeaders: {
      'x-vercel-ip-country': 'US',
    },
  });
  const page = await context.newPage();
  await page.goto(`${BASE_URL}/`);
  await expect(page).toHaveURL(/\/zh-Hant\/onboarding$/);
  await context.close();
});

test('normalizes locale alias from cookie value', async ({ browser }) => {
  const context = await browser.newContext();
  await context.addCookies([
    {
      name: 'NEXT_LOCALE',
      value: 'zh-tw',
      url: BASE_URL,
    },
  ]);
  const page = await context.newPage();
  await page.goto(`${BASE_URL}/`);
  await expect(page).toHaveURL(/\/zh-Hant\/onboarding$/);
  await context.close();
});

test('results UI uses localized copy in English locale', async ({ page }) => {
  let recommendationCalls = 0;

  await page.addInitScript((key) => {
    window.localStorage.setItem(
      key,
      JSON.stringify({
        countryCode: 'US',
        mode: 'dinner',
        radius: 1200,
        randomness: 'balanced',
        position: { lat: 37.5665, lng: 126.978 },
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
    recommendationCalls += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'ok',
        recommendations: [
          {
            place_id: 'g1',
            name: 'Pasta Lab',
            lat: 37.567,
            lng: 126.979,
            address: '101 Sample Rd',
            rating: 4.5,
            price_level: 2,
            distance_m: 350,
            category: 'Restaurant',
            raw_category: 'Italian',
            why: ['Near your location', 'Highly rated'],
            open_now: true,
          },
          {
            place_id: 'g2',
            name: 'Soup Table',
            lat: 37.5662,
            lng: 126.977,
            address: '202 Sample Rd',
            rating: 4.2,
            price_level: 2,
            distance_m: 900,
            category: 'Restaurant',
            raw_category: 'Comfort Food',
            why: ['Near your location'],
            open_now: false,
          },
          {
            place_id: 'g3',
            name: 'Night Grill',
            lat: 37.5658,
            lng: 126.9769,
            address: '303 Sample Rd',
            rating: 4.3,
            price_level: 3,
            distance_m: 1300,
            category: 'Restaurant',
            raw_category: 'Steak',
            why: ['Fits your time-of-day preference'],
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

  await page.goto('/en/results');

  await expect(page.getByRole('button', { name: /Re-roll/i }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Change location/i }).first()).toBeVisible();
  await expect.poll(() => recommendationCalls).toBeGreaterThan(0);
  const callsBeforeSwitch = recommendationCalls;

  await page.locator('.flow-lang-toggle').click();
  await expect(page.getByRole('menuitem', { name: '한국어' })).toBeVisible();
  await page.getByRole('menuitem', { name: '한국어' }).click();
  await expect(page).toHaveURL(/\/ko\/results$/);
  await expect(page.getByRole('button', { name: /다시뽑기/ }).first()).toBeVisible();
  await page.waitForTimeout(250);
  await expect.poll(() => recommendationCalls).toBe(callsBeforeSwitch);
});
