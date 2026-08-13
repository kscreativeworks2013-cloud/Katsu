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

  it('は面ごとに1行にし、どの面かを章名で言う', () => {
    // タイルが1枚しか無ければ、表紙・ブランド分析・撮影コンセプトは同じ1枚に回り込む。
    // 同じ画像でも面ごとに配置幅が違うので、面の数だけ行が出る。
    const base = workspaceWithAsset('ast-tiny');
    const ir = buildTestIR({
      assets: { 'ast-tiny': testAsset('ast-tiny', { width: 800, height: 1200 }) },
      workspace: { ...base, moodboard: base.moodboard.slice(0, 1) },
    });
    const summary = warningSummary(ir).filter((line) => line.includes('印刷解像度'));

    // 表紙・ブランド分析・撮影コンセプト・ムードボードの4面。タイルが1枚だけの面では
    // 枠が面いっぱいに広がるので、タイルにも不足が出る（配置幅は面付けから決まる）。
    expect(summary).toHaveLength(4);
    // どの面の話かはスロット名ではなく章名で言う（同名の枠を持つ表紙を疑わせない）。
    expect(summary.filter((line) => line.includes('（撮影コンセプト）'))).toHaveLength(1);
    expect(summary.filter((line) => line.includes('（ブランド分析）'))).toHaveLength(1);
    expect(summary.some((line) => line.includes('キービジュアル'))).toBe(false);
  });

  it('は面をまたいで同文になる警告だけを畳む', () => {
    // 原寸が無い（preview だけ）は面によらず同じ事実なので、何面に出ても1行。
    const previewOnly = testAsset('ast-prev', {
      variants: [
        {
          kind: 'preview',
          key: 'ast-prev:preview',
          width: 800,
          height: 600,
          bytes: 1000,
          mimeType: 'image/jpeg',
        },
      ],
    });
    const ir = buildTestIR({
      assets: { 'ast-prev': previewOnly },
      workspace: workspaceWithAsset('ast-prev'),
    });
    const raw = ir.warnings.filter((warning) => warning.kind === 'preview-only');

    expect(raw.length).toBeGreaterThan(1);
    expect(warningSummary(ir).filter((line) => line.includes('縮小版'))).toHaveLength(1);
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
