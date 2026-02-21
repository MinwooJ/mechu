import { expect, test } from '@playwright/test';

test('root redirects to onboarding and shows primary CTA', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/(ko|en)\/onboarding$/);
  await expect(page.getByRole('button', { name: /내 위치 허용하기|Allow my location/i })).toBeVisible();
});

test('status error page shows recovery actions', async ({ page }) => {
  await page.goto('/ko/status?kind=error');
  await expect(page.getByRole('heading', { name: '연결이 불안정해요' })).toBeVisible();
  await expect(page.getByRole('link', { name: '다시 시도' })).toBeVisible();
  await expect(page.getByRole('link', { name: '결과 다시 보기' })).toBeVisible();
});

test('preferences page renders key controls', async ({ page }) => {
  await page.goto('/ko/preferences');
  await expect(page.getByRole('heading', { name: '언제 드시나요?' })).toBeVisible();
  await expect(page.getByRole('button', { name: '초기화' })).toBeVisible();
  await expect(page.getByRole('button', { name: '맛집 찾기' })).toBeVisible();
});
