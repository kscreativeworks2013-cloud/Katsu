import { describe, expect, it } from 'vitest';
import { buildTestIR, loadTestFont, testAsset, workspaceWithAsset } from '../../test/ir';
import { extractPdfText } from '../../test/pdfText';
import { renderLayoutPdf } from './pdfLayout';
import { warningSummary } from './types';

/*
 * 印刷解像度の警告（第7章 7-2／7-3、第8章）。
 *
 * この経路は目視では守れない。1320px の素材を A4横の表紙全面（297mm）に置いても、
 * 画面で見る限り破綻して見えないからである。印刷して初めて分かる不足を、
 * 出力前と成果物の両方で言えているかをここで固定する。
 */

/** 実案件で起きた形：スクリーンショット由来の 1320×1999 を表紙に置く。 */
const LOW_RES = testAsset('ast-low', { width: 1320, height: 1999 });

function irWithLowResCover() {
  // ムードボードの先頭タイルが表紙のキービジュアルになる（第5章 5-2）。
  return buildTestIR({
    assets: { 'ast-low': LOW_RES },
    workspace: workspaceWithAsset('ast-low'),
  });
}

describe('low-resolution 警告', () => {
  it('は不足するスロットで発火し、ppi と必要px・実px を示す', () => {
    const warnings = irWithLowResCover().warnings.filter(
      (warning) => warning.kind === 'low-resolution',
    );

    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0].severity).toBe('warn');
    // 297mm 全面には 200ppi で 2339px 必要。1320px では 113ppi にしかならない。
    expect(warnings[0].message).toContain('113ppi');
    expect(warnings[0].message).toContain('2339px 必要');
    expect(warnings[0].message).toContain('1320px');
  });

  it('は足りているスロットでは発火しない', () => {
    // タイル（90mm）には 709px あれば足りる。同じ素材でも判定はスロット単位。
    const tileOnly = buildTestIR({
      assets: { 'ast-low': LOW_RES },
      workspace: {
        ...workspaceWithAsset('ast-low'),
        // 先頭タイルを外し、表紙・コンセプトの 297mm スロットに載せない。
        moodboard: workspaceWithAsset('ast-low').moodboard.map((tile, index) =>
          index === 0 ? { ...tile, assetId: null } : tile,
        ),
      },
    });

    expect(tileOnly.warnings.some((warning) => warning.kind === 'low-resolution')).toBe(false);
  });

  it('は同じ画像が複数スロットに出ても要約では1行に畳む', () => {
    // タイルが1枚しか無ければ、表紙と撮影コンセプト（どちらも 297mm スロット）は
    // 同じ1枚に回り込む。同じ配置幅・同じ画像なので警告は同文で2件出る。
    const base = workspaceWithAsset('ast-low');
    const ir = buildTestIR({
      assets: { 'ast-low': LOW_RES },
      workspace: { ...base, moodboard: base.moodboard.slice(0, 1) },
    });
    const raw = ir.warnings.filter((warning) => warning.kind === 'low-resolution');
    const summary = warningSummary(ir).filter((line) => line.includes('印刷解像度'));

    expect(raw.length).toBeGreaterThan(1);
    expect(summary).toHaveLength(1);
  });

  it('は成果物にも残る（画面で見ただけでは後から分からない）', async () => {
    const text = await extractPdfText(
      await renderLayoutPdf(irWithLowResCover(), { fontBytes: loadTestFont() }),
    );

    expect(text).toContain('出力時の注意');
    expect(text).toContain('印刷解像度が不足しています');
    expect(text).toContain('113ppi');
  }, 60_000);
});
