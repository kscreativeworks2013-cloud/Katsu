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

/** 1×1 の JPEG（data URI）。v2 のサムネイルを模す。 */
const LEGACY_THUMBNAIL =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';

/** v2 のペイロードを localStorage に置く。移行の入口を実データで踏む。 */
function legacyState(thumbnail: string): string {
  return JSON.stringify({
    version: 2,
    projects: [],
    workspaces: {},
    provenance: {},
    runs: [],
    portfolio: [],
    assets: {
      'ast-legacy': {
        id: 'ast-legacy',
        origin: 'upload',
        label: '旧サムネイル',
        source: 'legacy.jpg',
        runId: null,
        mimeType: 'image/jpeg',
        createdAt: '2026-08-01T00:00:00.000Z',
        thumbnail,
      },
    },
  });
}

test.describe('v2 からの移行', () => {
  const seed = (payload: string) => ({ key: 'lbvpos.state', payload });

  test('は旧サムネイルを実体ストアへ移し、原本を v3 へ進める', async ({ page }) => {
    await page.addInitScript(
      ({ key, payload }) => localStorage.setItem(key, payload),
      seed(legacyState(LEGACY_THUMBNAIL)),
    );

    await page.goto('/settings');

    await expect(page.getByText(/1件を移しました/)).toBeVisible();
    await expect(page.getByText(/表示用のみ 1件/)).toBeVisible();
    // 全件移せたので保存が開き、原本は v3 になる。
    await expect
      .poll(() =>
        page.evaluate(() => {
          const raw = localStorage.getItem('lbvpos.state');
          return raw ? (JSON.parse(raw) as { version: number }).version : null;
        }),
      )
      .toBe(3);
  });

  test('は壊れた画像を移行できなかったものとして報告する', async ({ page }) => {
    // data URI として読めない＝復旧の余地が無いデータ。
    await page.addInitScript(
      ({ key, payload }) => localStorage.setItem(key, payload),
      seed(legacyState('not-a-data-uri')),
    );

    await page.goto('/settings');

    await expect(
      page.getByRole('alert').filter({ hasText: 'データが壊れていて移行できませんでした' }),
    ).toBeVisible();
  });

  test('は保存先へ移せないとき、保存を止めて書き出しと破棄の出口を出す', async ({ page }) => {
    // 保存先の空きが無い状態。原本を消さずに止まることを確かめる。
    await page.addInitScript(() => {
      IDBObjectStore.prototype.put = () => {
        throw new DOMException('quota', 'QuotaExceededError');
      };
    });
    await page.addInitScript(
      ({ key, payload }) => localStorage.setItem(key, payload),
      seed(legacyState(LEGACY_THUMBNAIL)),
    );

    await page.goto('/settings');

    const notice = page.getByRole('alert').filter({ hasText: '保存先へ移せていません' });
    await expect(notice).toBeVisible();
    // 原本は v2 のまま。旧サムネイルは失われていない。
    const before = await page.evaluate(() => localStorage.getItem('lbvpos.state'));
    expect(before).toContain('"version":2');
    expect(before).toContain('data:image/jpeg');

    // 出口：破棄して続行すると保存が開き、v3 へ進む。
    await notice.getByRole('button', { name: '破棄して続行する' }).click();
    await expect
      .poll(() =>
        page.evaluate(() => {
          const raw = localStorage.getItem('lbvpos.state');
          return raw ? (JSON.parse(raw) as { version: number }).version : null;
        }),
      )
      .toBe(3);
  });
});

test.describe('保存できないとき', () => {
  test('は理由を出し、成果物に使えないことを示す', async ({ page }) => {
    // 端末の空き容量が尽きた状態を作る（IndexedDB の書き込みだけを失敗させる）。
    await page.addInitScript(() => {
      IDBObjectStore.prototype.put = () => {
        throw new DOMException('quota', 'QuotaExceededError');
      };
    });

    await page.goto('/portfolio');
    const work = page.getByRole('figure').first();
    const title = (await work.getByRole('heading', { level: 4 }).innerText()).trim();

    await work.getByRole('button', { name: `${title}に画像を登録` }).click();
    await page
      .getByLabel(`${title}の画像ファイル`)
      .setInputFiles({ name: 'key.png', mimeType: 'image/png', buffer: makePng(600, 400) });

    await expect(work.getByText(/空き容量が足りず/)).toBeVisible();
    await expect(work.getByText('出力に使えません')).toBeVisible();
  });
});

test.describe('実体の消失', () => {
  test('は検出して画面に出し、貼り直しで復旧できる', async ({ page }) => {
    await page.goto('/portfolio');
    const work = page.getByRole('figure').first();
    const title = (await work.getByRole('heading', { level: 4 }).innerText()).trim();

    await work.getByRole('button', { name: `${title}に画像を登録` }).click();
    await page
      .getByLabel(`${title}の画像ファイル`)
      .setInputFiles({ name: 'key.png', mimeType: 'image/png', buffer: makePng(900, 600) });
    await expect(work.getByRole('img', { name: title })).toBeVisible();

    // ブラウザが保存領域を破棄した状態を作る（メタデータは残り、実体だけ消える）。
    await page.evaluate(
      () =>
        new Promise((resolve, reject) => {
          const request = indexedDB.open('lbvpos.assets', 1);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const db = request.result;
            const tx = db.transaction('binaries', 'readwrite');
            tx.objectStore('binaries').clear();
            tx.oncomplete = () => {
              db.close();
              resolve(null);
            };
            tx.onerror = () => reject(tx.error);
          };
        }),
    );
    await page.reload();

    // 黙って空欄にせず、失われたことと復旧の手段を出す。
    await expect(page.getByRole('alert')).toContainText(/画像 1件が.*失われています/);
    const restored = page.getByRole('figure').first();
    await expect(restored.getByText('画像が失われています')).toBeVisible();

    await restored.getByRole('button', { name: '画像を貼り直す', exact: true }).click();
    await page
      .getByLabel(`${title}の画像を貼り直す`)
      .setInputFiles({ name: 'again.png', mimeType: 'image/png', buffer: makePng(900, 600) });

    await expect(restored.getByText('画像が失われています')).toBeHidden();
    await expect(page.getByRole('alert')).toBeHidden();
  });
});

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
