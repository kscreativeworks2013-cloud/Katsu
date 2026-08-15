import { deflateSync } from 'node:zlib';
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

/*
 * 状態の書き出しと読み込み（第9章 工程00-a）。
 *
 * 章本文を実物の分量で手入力すると、数時間ぶんの作業が localStorage と IndexedDB
 * だけに載る。どちらもブラウザの都合で消えうるので、ファイルへ出して戻せることを
 * 「本当にブラウザのデータを全部消してから戻す」形で確かめる。
 * ダウンロード・IndexedDB・canvas は jsdom に無いため、ここは実ブラウザでしか通せない。
 */

function crc32(bytes: Uint8Array): number {
  let crc = ~0;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const name = new TextEncoder().encode(type);
  const body = new Uint8Array([...name, ...data]);
  const out = new Uint8Array(body.length + 8);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(body, 4);
  view.setUint32(out.length - 4, crc32(body));
  return out;
}

/** 単色の PNG。原寸として通る画素数を持たせる。 */
function makePng(width: number, height: number): Buffer {
  const raw = new Uint8Array(height * (width * 3 + 1));
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < width; x += 1) raw.set([180, 140, 120], row + 1 + x * 3);
  }

  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  ihdr.set([8, 2, 0, 0, 0], 8);

  return Buffer.from([
    ...[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    ...chunk('IHDR', ihdr),
    ...chunk('IDAT', new Uint8Array(deflateSync(Buffer.from(raw)))),
    ...chunk('IEND', new Uint8Array()),
  ]);
}

/** ブラウザ側の保存を両方とも消す。破棄された端末を作る。 */
async function wipeBrowserData(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        localStorage.clear();
        const request = indexedDB.deleteDatabase('lbvpos.assets');
        request.onerror = () => reject(request.error);
        request.onblocked = () => resolve();
        request.onsuccess = () => resolve();
      }),
  );
}

test.describe('状態の書き出しと読み込み', () => {
  test('は全消去のあとファイルから復元できる', async ({ page }) => {
    await page.goto('/portfolio');
    const work = page.getByRole('figure').first();
    const title = (await work.getByRole('heading', { level: 4 }).innerText()).trim();

    await work.getByRole('button', { name: `${title}に画像を登録` }).click();
    await page
      .getByLabel(`${title}の画像ファイル`)
      .setInputFiles({ name: 'key.png', mimeType: 'image/png', buffer: makePng(900, 600) });
    await expect(work.getByRole('img', { name: title })).toBeVisible();

    // 書き出し。画像の実体まで1ファイルに入る側を使う。
    await page.goto('/settings');
    await expect(page.getByText(/原寸あり 1件/)).toBeVisible();

    const waitForDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: '画像を含めて書き出す' }).click();
    const payload = await readFile(await (await waitForDownload).path());
    expect(payload.byteLength).toBeGreaterThan(1000);

    // ブラウザのデータを全部消す。ここから先は「消えた端末」。
    await wipeBrowserData(page);
    await page.reload();
    await expect(page.getByText(/原寸あり 0件/)).toBeVisible();

    // ファイルから戻す。
    await page.getByLabel('書き出しファイル').setInputFiles({
      name: 'backup.json',
      mimeType: 'application/json',
      buffer: payload,
    });
    await expect(page.getByText(/を復元しました/)).toBeVisible();
    await expect(page.getByText(/原寸あり 1件/)).toBeVisible();

    // 実体まで戻っている（メタデータだけではない）。
    await page.goto('/portfolio');
    await expect(
      page.getByRole('figure').first().getByRole('img', { name: title }),
    ).toBeVisible();
  });

  test('は他所のファイルを読まずに理由を出す', async ({ page }) => {
    await page.goto('/settings');
    await page.getByLabel('書き出しファイル').setInputFiles({
      name: 'other.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{"projects":[]}'),
    });

    await expect(page.getByText(/このアプリの書き出しファイルではありません/)).toBeVisible();
    // 状態には触れていない。
    await expect(page.getByText(/原寸あり 0件/)).toBeVisible();
  });
});
