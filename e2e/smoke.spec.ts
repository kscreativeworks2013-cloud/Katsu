import { expect, test } from '@playwright/test';

// Pattern: end-to-end smoke tests. Keep this suite small and about wiring —
// the app boots, routes, and responds to a real click in a real browser.
// Detailed behaviour belongs in the faster component tests.
test.describe('app shell', () => {
  test('boots on the dashboard', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('ダッシュボード');
  });

  test('walks from the project list into a project workflow', async ({ page }) => {
    await page.goto('/');

    await page
      .getByRole('navigation', { name: 'グローバルナビゲーション' })
      .getByRole('link', { name: '案件一覧' })
      .click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('案件一覧');

    await page.getByRole('searchbox', { name: '検索' }).fill('AURELIA');
    await expect(page.getByRole('heading', { name: '案件 1件' })).toBeVisible();

    await page.getByRole('link', { name: 'フレグランス新香調 ローンチ広告' }).click();
    await expect(page.getByRole('navigation', { name: '制作ステップ' })).toBeVisible();
  });

  // Deep links must survive a reload — the production preview has to serve
  // index.html for client-side routes, not a 404.
  test('serves a deep link directly', async ({ page }) => {
    await page.goto('/projects/prj-maison/concepts');

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('撮影コンセプト');
  });

  test('loads without console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    expect(errors).toEqual([]);
  });
});
