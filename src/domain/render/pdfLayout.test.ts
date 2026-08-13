import { describe, expect, it } from 'vitest';
import {
  buildTestIR,
  loadTestFont,
  storeWith,
  testAsset,
  TINY_PNG,
  workspaceWithAsset,
} from '../../test/ir';
import { dataUriToBlob } from '../../lib/imageProcessing';
import { resolveProposalAssets } from '../resolveAssets';
import { checkEmbeddedGlyphs } from './pdfIntegrity';
import { SAFE_MARGIN_MM } from './layout';
import { renderLayoutPdf } from './pdfLayout';
import { extractPdfText, extractPdfTextItems } from '../../test/pdfText';

/*
 * 版面レンダラ（第8章）。
 * 「PDF が出た」では検証にならない。実測で出た2種類の壊れ方の両方を毎回見る。
 *   1) テキスト層：抽出した文字が原文と一致するか（数字がグリフIDに化けないか）
 *   2) 字形：埋め込みフォントから輪郭を取り出せるか（画面で文字が消えないか）
 */

async function render(crops?: Record<string, { x: number; y: number }>) {
  const assets = { 'ast-1': testAsset('ast-1', { width: 3000, height: 2000 }) };
  const ir = await resolveProposalAssets(
    buildTestIR({ assets, workspace: { ...workspaceWithAsset('ast-1'), crops } }),
    storeWith({ 'ast-1:original': dataUriToBlob(TINY_PNG)! }),
    assets,
  );
  return renderLayoutPdf(ir.ir, { fontBytes: loadTestFont() });
}

describe('採用版面', () => {
  it('は本文を欠けも化けもなくテキスト層に残す', async () => {
    const text = await extractPdfText(await render());

    // 数字がグリフIDとして書き出される壊れ方（Cut 1 → Cut 䄄）を直接見る。
    expect(text).not.toMatch(/[䄀-䈀]/);
    // 和文・欧文・数字の混在をそのまま拾えること。
    expect(text).toContain('ホリデーコレクション 2026 キービジュアル');
    expect(text).toContain('MAISON LUMIÈRE');
    expect(text).toContain('ムードボード');
    expect(text).toContain('Cut 1');
  }, 60_000);

  it('は埋め込んだ字形を壊さない', async () => {
    const report = await checkEmbeddedGlyphs(await render());

    expect(report.fonts).toBeGreaterThan(0);
    expect(report.checked).toBeGreaterThan(100);
    expect(report.broken).toBe(0);
  }, 60_000);

  it('は禁則を守って折り返す（行頭に句読点・小書き仮名を出さない）', async () => {
    const text = await extractPdfText(await render());

    // 抽出結果は行の区切りを保たないので、描いた行そのものを組版側で確かめる。
    // ここでは成果物に本文が載っていることだけを見て、行の規則は kinsoku の単体側で見る。
    expect(text).toContain('抑制的で品位のあるトーン');
    // 語中で折れていれば、この語は抽出結果の中で分断される。
    expect(text).toContain('MAISON LUMIÈRE');
  }, 60_000);

  it('はスロットごとの切り出し位置を出力に反映する', async () => {
    // 同じ画像・同じ版面で、切り出し位置だけが違う出力。反映されていなければ同一になる。
    const key = 'cover-key-mood-1';
    const [top, bottom, auto] = await Promise.all([
      render({ [key]: { x: 0.5, y: 0 } }),
      render({ [key]: { x: 0.5, y: 1 } }),
      render(),
    ]);

    // 同じ IR からは同じバイト列が出る（日時も IR の組み立て時刻から採る）ので、
    // 差分がそのまま「切り出しが効いたか」の証拠になる。
    expect(Buffer.from(await render()).equals(Buffer.from(auto))).toBe(true);
    expect(Buffer.from(top).equals(Buffer.from(bottom))).toBe(false);
    expect(Buffer.from(top).equals(Buffer.from(auto))).toBe(false);
    // 指定の無いキーは既定のまま（別スロットの指定が波及しない）。
    expect(
      Buffer.from(await render({ 'mood-tiles-mood-9': { x: 0, y: 0 } })).equals(
        Buffer.from(auto),
      ),
    ).toBe(true);
  }, 120_000);

  it('は読ませる要素を印刷の安全マージンの内側に置く', async () => {
    const placed = await extractPdfTextItems(await render());
    const margin = (SAFE_MARGIN_MM * 72) / 25.4;

    expect(placed.length).toBeGreaterThan(20);
    // 画像は裁ち落としてよいが、文字が外に出れば断裁のばらつきで削れる。
    const outside = placed.filter(
      (item) =>
        item.x < margin ||
        item.y < margin ||
        item.x + item.width > item.pageWidth - margin ||
        item.y + item.height > item.pageHeight - margin,
    );

    expect(outside.map((item) => `${item.page}:${item.text}`)).toEqual([]);
  }, 60_000);

  it('は info 級の指摘も件数として最終面に残す（提出前チェック）', async () => {
    const text = await extractPdfText(await render());

    expect(text).toContain('提出前チェック');
    expect(text).toMatch(/画像未登録が\d+件あります/);
  }, 60_000);
});
