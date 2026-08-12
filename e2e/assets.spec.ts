import { deflateSync } from 'node:zlib';
import { expect, test } from '@playwright/test';

/*
 * 原寸アセット（第7章）の通し確認。
 * IndexedDB・canvas・object URL・ダウンロードはどれも jsdom に無いため、
 * 「登録した画像がリロードで消えず、原寸のまま PDF に入る」ことは実ブラウザでしか確かめられない。
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

/** 単色の PNG を作る。原寸として十分な画素数を持たせる（表紙 210mm でも 200ppi を満たす）。 */
function makePng(width: number, height: number): Buffer {
  const raw = new Uint8Array(height * (width * 3 + 1));
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 3 + 1);
    raw[row] = 0; // フィルタなし
    for (let x = 0; x < width; x += 1) {
      raw.set([200, 170, 130], row + 1 + x * 3);
    }
  }

  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  ihdr.set([8, 2, 0, 0, 0], 8); // 8bit / truecolor

  return Buffer.from([
    ...[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    ...chunk('IHDR', ihdr),
    ...chunk('IDAT', new Uint8Array(deflateSync(Buffer.from(raw)))),
    ...chunk('IEND', new Uint8Array()),
  ]);
}

test.describe('原寸アセット', () => {
  test('は登録した画像をリロード後も保持し、原寸のまま PDF に入れる', async ({ page }) => {
    const png = makePng(1800, 1200);

    await page.goto('/portfolio');
    const work = page.getByRole('figure').first();
    const title = (await work.getByRole('heading', { level: 4 }).innerText()).trim();

    await work.getByRole('button', { name: `${title}に画像を登録` }).click();
    await page
      .getByLabel(`${title}の画像ファイル`)
      .setInputFiles({ name: 'key.png', mimeType: 'image/png', buffer: png });

    // 登録できたら preview が表示される（画面は preview、出力は原寸）。
    await expect(work.getByRole('img', { name: title })).toBeVisible();

    // ここが本題：リロードしても実体が残る（IndexedDB に入っている）。
    await page.reload();
    await expect(
      page.getByRole('figure').first().getByRole('img', { name: title }),
    ).toBeVisible();

    // 設定画面には原寸の寸法と使用量が出る。
    await page.goto('/settings');
    await expect(page.getByText('1800×1200px')).toBeVisible();
    await expect(page.getByText(/原寸あり 1件/)).toBeVisible();

    // 出力：原寸で解決できているので -draft は付かない。
    await page.goto('/projects/prj-maison/export');
    await page.getByRole('checkbox', { name: 'PowerPoint' }).uncheck();
    await page.getByRole('button', { name: '出力を実行' }).click();
    const confirm = page.getByRole('button', { name: 'このまま出力する' });
    if (await confirm.isVisible()) await confirm.click();

    // 実ファイルが降りてくることと、履歴が「原寸で出た」ことを示すことを確かめる。
    // （suggestedFilename は blob ダウンロードだと環境依存なので、履歴の表示で見る。）
    await page.waitForEvent('download');
    const row = page.getByRole('row').filter({ hasText: `_Proposal_JA_` }).first();
    await expect(row).toContainText('原寸 1件');
    await expect(row.getByRole('cell').first()).not.toContainText('-draft');
  });
});
