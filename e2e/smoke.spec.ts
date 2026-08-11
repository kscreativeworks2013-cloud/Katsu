import { expect, test } from '@playwright/test';

// Pattern: end-to-end smoke tests. Keep this suite small and about wiring —
// the app boots, renders, and responds to a real click in a real browser.
// Detailed behaviour belongs in the faster component tests.
test.describe('app shell', () => {
  test('boots and renders the greeting', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Hello there!');
  });

  test('responds to user input end to end', async ({ page }) => {
    await page.goto('/');

    await page.getByLabel(/your name/i).fill('Katsu');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Hello, Katsu!');

    await page.getByRole('button').click();
    await expect(page.getByRole('button')).toHaveText('1 click');
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
