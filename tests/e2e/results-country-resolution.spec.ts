import { expect, test } from "@playwright/test";

const FLOW_KEY = "meal_reco_flow_state_v1";

test("recovers KR countryCode from KR coordinates when stored state misses country", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "Desktop-only assertion");

  let availabilityCountry: string | null = null;
  let recommendationCountry: string | null = null;

  await page.addInitScript((key) => {
    window.localStorage.setItem(
      key,
      JSON.stringify({
        // Intentionally omit countryCode to simulate stale/legacy localStorage data.
        mode: "lunch",
        radius: 1000,
        randomness: "balanced",
        position: { lat: 37.5665, lng: 126.978 },
      }),
    );
  }, FLOW_KEY);

  await page.route("**/api/availability**", async (route) => {
    const requestUrl = new URL(route.request().url());
    availabilityCountry = requestUrl.searchParams.get("country_code");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ supported: true }),
    });
  });

  await page.route("**/api/recommendations", async (route) => {
    const body = route.request().postDataJSON() as { country_code?: string };
    recommendationCountry = body.country_code ?? null;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "ok",
        recommendations: [
          {
            place_id: "kakao_1",
            name: "테스트 식당",
            lat: 37.567,
            lng: 126.978,
            address: "서울 중구 세종대로",
            rating: 4.4,
            price_level: 2,
            distance_m: 120,
            category: "korean",
            raw_category: "한식",
            why: ["Near your location"],
            open_now: true,
          },
        ],
      }),
    });
  });

  await page.route("**/api/events", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    });
  });

  await page.goto("/ko/results");

  await expect.poll(() => availabilityCountry).toBe("KR");
  await expect.poll(() => recommendationCountry).toBe("KR");
  await expect(page.getByRole("link", { name: /카카오 지도/ }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /네이버 지도/ }).first()).toBeVisible();
});
