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

/*
 * 枠数1の枠（第9章 工程R-1）。
 *
 * チェックボックスで組んでいたときは操作できなかった：枠数に達しているので他は押せず、
 * 唯一の選択を外すと空配列＝「既定に戻す」になって元へ戻る。表紙とコンセプトの
 * キービジュアルがこれで、画面から一度も変更できなかった。
 */
test.describe('枠数1の選択', () => {
  test('はラジオで一度に入れ替わる', async ({ page }) => {
    await page.goto('/projects/prj-maison/proposal');

    const cover = page.locator('#page-cover');
    await cover
      .getByText(/^掲載するキービジュアルを選ぶ/)
      .first()
      .click();

    const options = cover.getByRole('radio');
    await expect(options.first()).toBeChecked();
    // 既定以外も押せる（チェックボックスのときは disabled だった）。
    await expect(options.nth(1)).toBeEnabled();

    await options.nth(1).check();
    await expect(options.nth(1)).toBeChecked();
    await expect(options.first()).not.toBeChecked();
  });

  test('は既定のまま確定した選択も記録する', async ({ page }) => {
    await page.goto('/projects/prj-maison/proposal');

    const cover = page.locator('#page-cover');
    await cover
      .getByText(/^掲載するキービジュアルを選ぶ/)
      .first()
      .click();
    // すでにチェック済みのものを押す。onChange は来ないので onClick で拾っている。
    await cover.getByRole('radio').first().click();

    const picks = await page.evaluate(() => {
      const raw = localStorage.getItem('lbvpos.state');
      if (!raw) return null;
      const state = JSON.parse(raw) as {
        workspaces: Record<string, { picks?: Record<string, string[]> }>;
      };
      return Object.values(state.workspaces).map((w) => w.picks?.['cover-key'] ?? null);
    });

    expect(picks?.some((entry) => entry !== null && entry.length === 1)).toBe(true);
  });
});
