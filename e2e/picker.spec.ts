import { expect, test } from '@playwright/test';

/*
 * 枠の選択と切り出し位置の画面（第9章 工程00-e）。
 *
 * 実案件1本を手で通すとき、この2つは必ず通る経路である。壊れていれば通しそのものが
 * 失敗するので、通しの前に**結線と保存だけ**を確かめる。選択順の反映・既定に戻す・
 * 枠数以下でピッカーが出ないこと・切り出し10択の反映は、通しで仕様が動きうるので
 * 通したあとに書く。
 *
 * リロードを挟むので実ブラウザで見る（jsdom では localStorage 経由の復元を
 * 「本当に読み直したか」まで確かめられない）。
 */

/** 実績の枠は容量3に対して供給元が6件。超過するのでピッカーが出る。 */
const PICKER = '掲載する選定作品を選ぶ（6件中3件）';

test.describe('枠の選択', () => {
  test('はチェックの操作が掲載内容に反映される', async ({ page }) => {
    await page.goto('/projects/prj-maison/proposal');

    const works = page.locator('#page-works');
    await works.getByText(PICKER).click();

    // 既定は供給元の先頭から3件。4件目は出ていない。
    await expect(works.getByRole('figure').filter({ hasText: 'Morning Silk' })).toBeVisible();
    await expect(works.getByRole('figure').filter({ hasText: 'Atelier Hands' })).toHaveCount(0);

    // 1件外して別の1件を入れる。枠数に達している間は未選択を押せないので、順序が要る。
    await works.getByRole('checkbox', { name: 'Morning Silk' }).uncheck();
    await works.getByRole('checkbox', { name: 'Atelier Hands' }).check();

    await expect(works.getByRole('figure').filter({ hasText: 'Atelier Hands' })).toBeVisible();
    await expect(works.getByRole('figure').filter({ hasText: 'Morning Silk' })).toHaveCount(0);
  });

  test('は選択がリロード後も残る', async ({ page }) => {
    await page.goto('/projects/prj-maison/proposal');

    const works = page.locator('#page-works');
    await works.getByText(PICKER).click();
    await works.getByRole('checkbox', { name: 'Morning Silk' }).uncheck();
    await works.getByRole('checkbox', { name: 'Atelier Hands' }).check();
    await expect(works.getByRole('figure').filter({ hasText: 'Atelier Hands' })).toBeVisible();

    await page.reload();

    const after = page.locator('#page-works');
    await expect(after.getByRole('figure').filter({ hasText: 'Atelier Hands' })).toBeVisible();
    await expect(after.getByRole('figure').filter({ hasText: 'Morning Silk' })).toHaveCount(0);
  });
});
