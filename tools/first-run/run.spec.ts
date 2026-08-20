import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { BODY_BY_ID, FRONT_HALF, PROJECT, SECTIONS } from './treatment';

/*
 * 実案件1本の通し（第9章）。
 *
 * これはテストではない。**本番と同じ経路を手で通したときに何が起きるかを採る作業**を、
 * 再現できる形にしたものである。合否ではなく、出力と数値と「詰まった箇所」が成果物になる。
 *
 * 通す内容はレップ提出用の自主制作トリートメント1本（treatment.ts）。
 * クライアント実案件の素材と情報は使わない。
 *
 * 素材は dist/layout-preview/photos/ に置いた実写を使う。
 * **ムードボードと実績で同じ写真を使わない**——読み手には過去作の使い回しに見える。
 */

const PHOTO_DIR = 'dist/layout-preview/photos';
const OUT_DIR = 'dist/first-run';

/** ムードボードに使う写真。`work` を含むものと、実績と中身が同じものは外す。 */
const MOOD_PHOTOS = [
  '00-key-kimono.jpg',
  '01-mood-nyc.jpg',
  '02-mood-pink.jpg',
  '03-mood-concept.jpg',
  '03-mood-face.jpg',
  '04-mood-sign.jpg',
  '05-mood-runway.jpg',
  '07-mood-low.jpg',
  '08-mood-high.jpg',
  '09-mood-lowres.jpg',
];

/** 実績に使う写真。ムードボードとは重ならない。 */
const WORK_PHOTOS = ['10-work-shirt.jpg', '11-work-runway.jpg', '12-work-ring.jpg'];

interface Measure {
  label: string;
  ms: number;
  note?: string;
}

const measures: Measure[] = [];

/**
 * 所要時間を採る。人の手の速さではなく、**経路が何回の操作を要求するか**の目安。
 * 本文の入力は fill で一括なので、実際に手で打つ時間はここには出ない（報告で区別する）。
 */
async function timed<T>(label: string, body: () => Promise<T>, note?: string): Promise<T> {
  const started = Date.now();
  const value = await body();
  measures.push({ label, ms: Date.now() - started, note });
  return value;
}

/** 所要時間と、本体が返した注記をまとめて記録する。 */
async function timedNote(label: string, body: () => Promise<string>): Promise<void> {
  const started = Date.now();
  const note = await body();
  measures.push({ label, ms: Date.now() - started, note });
}

function photo(name: string): { name: string; mimeType: string; buffer: Buffer } {
  return { name, mimeType: 'image/jpeg', buffer: readFileSync(`${PHOTO_DIR}/${name}`) };
}

/** 生成を1ステップ回して適用する。差分プレビューを通るのが本番の経路。 */
async function generate(page: Page, button: string | RegExp): Promise<void> {
  await page.getByRole('button', { name: button }).first().click();
  const preview = page.getByRole('region', { name: '生成結果の差分プレビュー' });
  await expect(preview).toBeVisible({ timeout: 30_000 });
  await preview.getByRole('button', { name: '選択したフィールドを適用' }).click();
  await expect(preview).toBeHidden({ timeout: 30_000 });
}

/** 端末の保存状況。原寸の合計バイト数と、ブラウザの見積もり。 */
async function storage(page: Page): Promise<{ used?: number; quota?: number }> {
  return page.evaluate(async () => {
    if (!navigator.storage?.estimate) return {};
    const { usage, quota } = await navigator.storage.estimate();
    return { used: usage, quota };
  });
}

test.describe.configure({ mode: 'serial' });

test('実案件1本を通す（前半：表紙〜ムードボード）', async ({ page }) => {
  mkdirSync(OUT_DIR, { recursive: true });
  expect(existsSync(PHOTO_DIR), `素材が要る：${PHOTO_DIR}`).toBe(true);

  // ── 案件を作る ────────────────────────────────────────
  await timed('案件の作成（入力24項目）', async () => {
    await page.goto('/projects/new');
    await page.getByLabel('案件名').fill(PROJECT.name);
    await page.getByLabel('クライアント名').fill(PROJECT.client);
    await page.getByLabel('ブランド名').fill(PROJECT.brand);
    await page.getByLabel('提案日').fill(PROJECT.proposalDate);
    await page.getByLabel('納期').fill(PROJECT.dueDate);
    await page.getByLabel(/^予算/).fill(String(PROJECT.budget));
    await page
      .getByRole('textbox', { name: 'ブランドコンセプト', exact: true })
      .fill(PROJECT.concept);
    await page
      .getByRole('textbox', { name: 'ターゲット顧客', exact: true })
      .fill(PROJECT.target);
    await page.getByLabel(/^競合ブランド/).fill(PROJECT.competitors);
    await page.getByLabel('ジャンル').selectOption(PROJECT.genre);
    await page.getByRole('textbox', { name: '商品名', exact: true }).fill(PROJECT.product);
    await page.getByLabel(/^キーワード/).fill(PROJECT.keywords);
    await page.getByLabel(/^必須カット/).fill(PROJECT.mustCuts);
    await page.getByLabel(/^NG事項/).fill(PROJECT.ngList);
    await page.getByRole('textbox', { name: '世界観', exact: true }).fill(PROJECT.worldview);
    await page.getByLabel(/^カラーパレット/).fill(PROJECT.palette);
    await page.getByRole('textbox', { name: 'ライティング' }).fill(PROJECT.lighting);
    await page.getByRole('textbox', { name: 'レンズイメージ', exact: true }).fill(PROJECT.lens);
    await page.getByRole('textbox', { name: '構図' }).fill(PROJECT.composition);
    await page.getByRole('textbox', { name: '演出', exact: true }).fill(PROJECT.staging);
    await page.getByRole('textbox', { name: '質感', exact: true }).fill(PROJECT.texture);
    await page
      .getByRole('textbox', { name: 'レタッチ方針', exact: true })
      .fill(PROJECT.retouch);
    await page.getByLabel('撮影日数').fill(String(PROJECT.shootDays));
    await page
      .getByRole('textbox', { name: 'ロケーション／スタジオ', exact: true })
      .fill(PROJECT.location);
    await page.getByLabel('モデル人数').fill(String(PROJECT.models));
    await page
      .getByRole('textbox', { name: 'ヘアメイク', exact: true })
      .fill(PROJECT.hairMakeup);
    await page
      .getByRole('textbox', { name: 'スタイリスト', exact: true })
      .fill(PROJECT.stylist);
    await page.getByRole('textbox', { name: '撮影機材', exact: true }).fill(PROJECT.gear);
    await page.getByRole('button', { name: '案件を作成してブランド分析へ' }).click();
    await expect(page).toHaveURL(/\/projects\/prj-[^/]+\/brand/, { timeout: 20_000 });
  });

  const projectId = (/\/projects\/(prj-[^/]+)\//.exec(page.url()) ?? [])[1];
  expect(projectId).toBeTruthy();

  // ── 生成を回す ────────────────────────────────────────
  await timed('ブランド分析の生成', () => generate(page, 'AIで解析'));

  await page.goto(`/projects/${projectId}/competitors`);
  await timed('競合分析の生成', () => generate(page, 'AIで分析'));

  await page.goto(`/projects/${projectId}/concepts`);
  await timed('コンセプトの生成と採用', async () => {
    await generate(page, 'AIで生成');
    await page
      .getByRole('button', { name: /を採用$/ })
      .first()
      .click();
  });

  await page.goto(`/projects/${projectId}/moodboard`);
  await timed('ムードボードの生成', () => generate(page, 'AIで生成'));

  await page.goto(`/projects/${projectId}/shots`);
  await timed('ショットリストの生成', () => generate(page, 'AIで生成'));

  await page.goto(`/projects/${projectId}/proposal`);
  await timed('提案書本文の生成', () => generate(page, '提案書を生成'));

  // ── 素材を登録する ────────────────────────────────────
  const registered = await timed('ムードボード10点の登録', async () => {
    await page.goto(`/projects/${projectId}/moodboard`);
    const pickers = page.getByRole('button', { name: /に画像を登録$/ });
    let count = await pickers.count();

    /*
     * 生成されるタイルは8枚。素材は10点あるので2枚足す（枠を素材に合わせる）。
     *
     * 足したタイルの説明文はどれも「新しいタイル」で、そのまま登録しようとすると
     * 枠を見分けられない（画像登録ボタンの名前も画像の代替テキストも同じになる）。
     * 実際に手で通すときも、まず名前を付け直すことになる。通しで見つかった事象として
     * 記録した（第9章 9-20）。
     */
    while (count < MOOD_PHOTOS.length) {
      await page.getByRole('button', { name: 'タイルを追加' }).first().click();
      const added = page.getByRole('textbox').filter({ hasText: '' });
      void added;
      const fresh = page.locator('input[value="新しいタイル"]').first();
      await fresh.fill(`追加タイル ${count - 7}`);
      count = await pickers.count();
    }

    // 登録が済んだタイルの「画像を登録」は消える（貼り直しに変わる）ので、
    // 添字で回すとずれる。常に残っている先頭を取る。
    for (const file of MOOD_PHOTOS) {
      const picker = pickers.first();
      const label = (await picker.getAttribute('aria-label')) ?? '';
      const name = label.replace(/に画像を登録$/, '');
      await picker.click();
      await page.getByLabel(`${name}の画像ファイル`).setInputFiles(photo(file));
      await expect(page.getByRole('img', { name }).first()).toBeVisible({ timeout: 20_000 });
    }
    return MOOD_PHOTOS.length;
  });
  expect(registered).toBe(MOOD_PHOTOS.length);

  await timed('実績3点の登録', async () => {
    await page.goto('/portfolio');
    for (let index = 0; index < WORK_PHOTOS.length; index += 1) {
      const work = page.getByRole('figure').nth(index);
      const title = (await work.getByRole('heading', { level: 4 }).innerText()).trim();
      await work.getByRole('button', { name: `${title}に画像を登録` }).click();
      await page.getByLabel(`${title}の画像ファイル`).setInputFiles(photo(WORK_PHOTOS[index]));
      await expect(work.getByRole('img', { name: title })).toBeVisible({ timeout: 20_000 });
    }
  });

  /*
   * 面を左右する枠を選ぶ（第9章 工程R-1）。
   *
   * 既定は供給元の並び順なので、放っておくと「たまたま先頭にあった写真」が表紙になる。
   * 実際に手で通すときも、ここで選び直すことになる。
   * 全面配置（297mm）は 200ppi に 2,339px 要るので、候補はその条件を満たすタイルに限る。
   */
  await timedNote('主要枠の選択（表紙・コンセプト）', async () => {
    await page.goto(`/projects/${projectId}/proposal`);

    // どのタイルが全面配置に耐えるかは、登録済みの原寸から決まる。
    const wide = await page.evaluate(() => {
      const raw = localStorage.getItem('lbvpos.state');
      if (!raw) return [] as string[];
      const state = JSON.parse(raw) as {
        projects: { id: string; name: string }[];
        workspaces: Record<string, { moodboard: { caption: string; assetId?: string }[] }>;
        assets: Record<string, { variants: { kind: string; width: number }[] }>;
      };
      const project = state.projects.find((item) => item.name.includes('TOKYO SHADE'));
      const tiles = project ? (state.workspaces[project.id]?.moodboard ?? []) : [];
      return tiles
        .filter((tile) => {
          const original = tile.assetId
            ? state.assets[tile.assetId]?.variants.find((v) => v.kind === 'original')
            : undefined;
          return (original?.width ?? 0) >= 2339;
        })
        .map((tile) => tile.caption);
    });

    if (wide.length < 2) return `全面配置に耐えるタイルが ${wide.length} 件しかない`;

    // 既定と違うものを選ぶ。既定のままでも記録はされるが、
    // 選び直しが反映されることを見たいので別の1枚にする。
    for (const [sectionId, caption] of [
      ['cover', wide[1]],
      ['concept', wide[3] ?? wide[2]],
    ] as const) {
      const slot = page.locator(`#page-${sectionId}`);
      await slot
        .getByText(/^掲載する.*を選ぶ/)
        .first()
        .click();
      // 枠数1の枠はラジオ。押した時点で入れ替わる（第9章 工程R-1）。
      await slot.getByRole('radio', { name: caption }).check();
    }
    return `全面配置に耐えるタイル ${wide.length} 件から選択`;
  });

  // ── 本文を実物の分量で入れる（前半5章）────────────────
  await page.goto(`/projects/${projectId}/proposal`);
  for (const id of FRONT_HALF) {
    const lines = BODY_BY_ID.get(id);
    if (!lines) continue;
    await timed(`本文入力：${id}（${lines.join('').length}字）`, async () => {
      const page_ = page.locator(`#page-${id}`);
      await page_.getByRole('button', { name: 'この章を編集' }).click();
      await page_.getByLabel('本文（日本語）').fill(lines.join('\n'));
      await page_.getByRole('button', { name: '編集を終える' }).click();
      await expect(page_.getByText('手動編集済み（再生成から保護）')).toBeVisible();
    });

    // 1章ごとに書き出す。数時間の入力を端末の中だけに置かない（工程00-a）。
    await timedNote(`書き出し：${id} まで`, async () => {
      await page.goto('/settings');
      const waitFor = page.waitForEvent('download');
      await page.getByRole('button', { name: '画像を含めて書き出す' }).click();
      const file = await waitFor;
      const path = `${OUT_DIR}/backup-${id}.json`;
      await file.saveAs(path);
      await page.goto(`/projects/${projectId}/proposal`);
      return `${readFileSync(path).byteLength.toLocaleString()} バイト`;
    });
  }

  // ── 出力 ──────────────────────────────────────────────
  // 端末の保存状況は2つ採る。アプリ自身が数えている実体の合計と、ブラウザの見積もり。
  // 後者は粒度が粗く、前者と桁が合わないことがある（合わなければそれ自体が報告対象）。
  await page.goto('/settings');
  const appUsage = (await page.getByText(/MB 使用/).innerText()).trim();
  const used = await storage(page);

  await timed('PDF 出力（日本語）', async () => {
    await page.goto(`/projects/${projectId}/export`);
    // 形式は PDF だけに絞る。既定で複数選ばれていると、そのぶん時間も採れなくなる。
    for (const format of ['PowerPoint', 'Word', 'Markdown']) {
      const box = page.getByRole('checkbox', { name: format });
      if ((await box.count()) > 0 && (await box.isChecked())) await box.uncheck();
    }
    const pdf = page.getByRole('checkbox', { name: 'PDF' });
    if (!(await pdf.isChecked())) await pdf.check();

    const waitFor = page.waitForEvent('download');
    await page.getByRole('button', { name: '出力を実行' }).click();
    // 提出前の確認が出たら、そのまま出す（何が出たかは成果物の注意書きに残る）。
    const confirm = page.getByRole('button', { name: 'このまま出力する' });
    if (await confirm.isVisible({ timeout: 3_000 }).catch(() => false)) await confirm.click();
    const file = await waitFor;
    await file.saveAs(`${OUT_DIR}/front-half-ja.pdf`);
  });

  const pdfBytes = readFileSync(`${OUT_DIR}/front-half-ja.pdf`).byteLength;

  writeFileSync(
    `${OUT_DIR}/measures.json`,
    JSON.stringify(
      {
        projectId,
        appUsage,
        storage: used,
        pdfBytes,
        photos: readdirSync(PHOTO_DIR).length,
        chars: Object.fromEntries(
          SECTIONS.map((section) => [section.id, section.ja.join('').length]),
        ),
        measures,
      },
      null,
      2,
    ),
  );
});
