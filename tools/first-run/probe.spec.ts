import { expect, test } from '@playwright/test';

/*
 * 容量表示の経路を確かめる（第9章 工程R-4）。
 *
 * 通しで「6MB 使用」と `navigator.storage.estimate()` の 597,210 が10倍違い、
 * 画面は「利用可能量は取得できません」と出しながら estimate() は quota を返していた。
 * どちらの数字がどこから来ているのか、表示が出るまでに何が起きているのかを見る。
 */
test('容量表示の出所を調べる', async ({ page }) => {
  await page.goto('/settings');

  // 描画直後（非同期の見積もりが返る前）。
  const immediate = (await page.getByText(/MB 使用/).innerText()).trim();

  // 見積もりが返ったあと。
  await page.waitForTimeout(1500);
  const settled = (await page.getByText(/MB 使用/).innerText()).trim();

  const estimate = await page.evaluate(async () => {
    if (!navigator.storage?.estimate) return null;
    const { usage, quota } = await navigator.storage.estimate();
    return { usage, quota };
  });

  console.log('直後  :', immediate);
  console.log('待機後:', settled);
  console.log('estimate:', JSON.stringify(estimate));
  expect(settled).toBeTruthy();
});
