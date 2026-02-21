import { expect, test } from '@playwright/test';

const FLOW_KEY = 'meal_reco_flow_state_v1';

test('mobile results sheet follows swipe and snaps between states', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes('mobile'), 'Mobile-only interaction test');

  await page.addInitScript((key) => {
    window.localStorage.setItem(
      key,
      JSON.stringify({
        countryCode: 'KR',
        mode: 'lunch',
        radius: 1000,
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
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'ok',
        recommendations: [
          {
            place_id: 'kakao_1',
            name: '임대감댁 시청점',
            lat: 37.5669,
            lng: 126.9784,
            address: '서울 중구 세종대로 23',
            rating: 4.4,
            price_level: 2,
            distance_m: 97,
            category: '한식',
            raw_category: '설렁탕',
            why: ['Near your location', 'Fits your time-of-day preference'],
            open_now: true,
          },
          {
            place_id: 'kakao_2',
            name: '풀앤빵',
            lat: 37.5671,
            lng: 126.9778,
            address: '서울 중구 을지로 12',
            rating: 4.2,
            price_level: 2,
            distance_m: 108,
            category: '디저트',
            raw_category: '제과/베이커리',
            why: ['Near your location'],
            open_now: true,
          },
          {
            place_id: 'kakao_3',
            name: '원주추어탕',
            lat: 37.5661,
            lng: 126.9782,
            address: '서울 중구 무교로 17-37',
            rating: 4.1,
            price_level: 2,
            distance_m: 109,
            category: '한식',
            raw_category: '추어',
            why: ['Near your location', 'Fits your time-of-day preference'],
            open_now: false,
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

  await page.goto('/ko/results');

  const panel = page.locator('.cards-panel.mobile-sheet');
  await expect(panel).toBeVisible();
  await expect(panel).toHaveClass(/sheet-collapsed/);

  const dragBy = async (deltaY: number) => {
    await panel.evaluate((el, delta) => {
      const rect = el.getBoundingClientRect();
      const x = rect.left + rect.width * 0.5;
      const startY = rect.top + 24;
      const endY = startY + delta;
      const steps = 14;

      const dispatch = (type: string, y: number) => {
        const ev = new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerId: 1,
          pointerType: 'touch',
          isPrimary: true,
          clientX: x,
          clientY: y,
        });
        el.dispatchEvent(ev);
      };

      dispatch('pointerdown', startY);
      for (let i = 1; i <= steps; i += 1) {
        const y = startY + ((endY - startY) * i) / steps;
        dispatch('pointermove', y);
      }
      dispatch('pointerup', endY);
    }, deltaY);
  };

  await dragBy(-280);
  await expect(panel).toHaveClass(/sheet-(half|expanded)/);

  await dragBy(360);
  await expect(panel).toHaveClass(/sheet-(collapsed|half)/);

  await dragBy(380);
  await expect(panel).toHaveClass(/sheet-collapsed/);
});
