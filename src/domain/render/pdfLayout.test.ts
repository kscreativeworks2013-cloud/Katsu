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
import { renderLayoutPdf } from './pdfLayout';
import { extractPdfText } from '../../test/pdfText';

/*
 * 版面レンダラ（第8章）。
 * 「PDF が出た」では検証にならない。実測で出た2種類の壊れ方の両方を毎回見る。
 *   1) テキスト層：抽出した文字が原文と一致するか（数字がグリフIDに化けないか）
 *   2) 字形：埋め込みフォントから輪郭を取り出せるか（画面で文字が消えないか）
 */

async function render() {
  const assets = { 'ast-1': testAsset('ast-1', { width: 3000, height: 2000 }) };
  const ir = await resolveProposalAssets(
    buildTestIR({ assets, workspace: workspaceWithAsset('ast-1') }),
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
});
