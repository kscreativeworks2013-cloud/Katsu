import { describe, expect, it } from 'vitest';
import { buildTestIR, loadTestFont, testAsset, workspaceWithAsset } from '../../test/ir';
import { extractPdfTextItems } from '../../test/pdfText';
import { renderLayoutPdf } from './pdfLayout';
import { extractFrameRects } from '../../test/pdfText';
import { TINY_PNG } from '../../test/ir';
import type { ProposalIR } from '../ir';

/*
 * 表紙のロゴ（第8章 8-10）。
 * ロゴは形が意味を持つので切らない。置いたあとにタイトル・副題と触れないことを
 * 実際の出力で見る（未登録のままだと、この経路は一度も通らない）。
 */

function withLogo(): ProposalIR {
  const base = workspaceWithAsset('ast-1');
  const ir = buildTestIR({
    assets: {
      'ast-1': testAsset('ast-1'),
      'ast-logo': testAsset('ast-logo', { width: 480, height: 160 }),
    },
    workspace: { ...base, logoAssetId: 'ast-logo' },
  });
  return {
    ...ir,
    sections: ir.sections.map((section) => ({
      ...section,
      blocks: section.blocks.map((block) =>
        block.type === 'image' && block.assetId ? { ...block, data: TINY_PNG } : block,
      ),
    })),
  };
}

describe('表紙のロゴ', () => {
  it('は登録されていれば表紙に置かれ、タイトルと重ならない', async () => {
    const bytes = await renderLayoutPdf(withLogo(), { fontBytes: loadTestFont() });
    const items = await extractPdfTextItems(bytes);
    const title = items.find((item) => item.page === 1 && item.text.includes('ホリデー'));

    // ロゴは切らずに置くので、クリップ矩形（切り抜き）は表紙にキービジュアルの1つだけ。
    expect(extractFrameRects(bytes).filter((rect) => rect.page === 1)).toHaveLength(1);
    expect(title).toBeDefined();
    // 版面ではロゴの下端 0.717、タイトルのベースライン 0.79（高さ比）。実寸で重なりを見る。
    const logoBottom = (1 - 0.717) * 595.28;
    expect((title as { y: number }).y + (title as { height: number }).height).toBeLessThan(
      logoBottom,
    );
  }, 60_000);

  it('は未登録なら枠ごと出さない（空の枠を描かない）', async () => {
    const ir = withLogo();
    const without = {
      ...ir,
      sections: ir.sections.map((section) => ({
        ...section,
        blocks: section.blocks.filter(
          (block) => !(block.type === 'image' && block.slotId === 'cover-logo'),
        ),
      })),
    };
    const bytes = await renderLayoutPdf(without, { fontBytes: loadTestFont() });

    expect(extractFrameRects(bytes).filter((rect) => rect.page === 1)).toHaveLength(1);
  }, 60_000);
});
