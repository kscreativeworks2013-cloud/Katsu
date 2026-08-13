import { describe, expect, it } from 'vitest';
import type { PortfolioWork, Workspace } from '../../data/types';
import { seedPortfolio } from '../../data/fixtures';
import { buildTestIR, loadTestFont, testAsset, workspaceWithBody } from '../../test/ir';
import { extractFrameRects } from '../../test/pdfText';
import { A4_LANDSCAPE } from './layout';
import { renderLayoutPdf } from './pdfLayout';
import type { ProposalIR } from '../ir';

/*
 * 配置幅の申告と実配置の一致（第8章 8-4）。
 *
 * 印刷解像度の警告は「この枠は何ミリで置かれる」を根拠に出す。根拠が実配置とずれると、
 * 誤検知も見逃しも起きる（実測：実績は147mmと申告して97mmで置いていた＝誤検知、
 * ムードボードは2列の面でも83mmと申告していた＝見逃し）。
 * ここでは PDF から実際のクリップ矩形を読み、IR が申告した mm と突き合わせる。
 */

const MM_PER_PT = A4_LANDSCAPE.widthMm / A4_LANDSCAPE.widthPt;

/** 画像つきの案件データ。枠数はスロットごとに指定する。 */
function irWith({ tiles, cuts, works }: { tiles: number; cuts: number; works: number }): {
  ir: ProposalIR;
  data: Record<string, string>;
} {
  const base = workspaceWithBody();
  const assets = Object.fromEntries(
    Array.from({ length: tiles + cuts + works }, (_, index) => [
      `ast-${index}`,
      testAsset(`ast-${index}`, { width: 4000, height: 3000 }),
    ]),
  );

  const workspace: Workspace = {
    ...base,
    moodboard: Array.from({ length: tiles }, (_, index) => ({
      ...base.moodboard[index % base.moodboard.length],
      id: `mood-${index}`,
      assetId: `ast-${index}`,
    })),
    shots: Array.from({ length: cuts }, (_, index) => ({
      ...base.shots[index % base.shots.length],
      id: `shot-${index}`,
      no: index + 1,
      assetId: `ast-${tiles + index}`,
    })),
  };
  const portfolio: PortfolioWork[] = seedPortfolio
    .slice(0, works)
    .map((work, index) => ({ ...work, assetId: `ast-${tiles + cuts + index}` }));

  const ir = buildTestIR({ assets, workspace, portfolio });
  // 解決フェーズの代わり。実体が無いとレンダラが枠を描かない。
  const data = Object.fromEntries(Object.keys(assets).map((id) => [id, TINY_JPEG]));
  return { ir, data };
}

/** 1×1 の JPEG。枠の幾何だけを見るので中身は問わない。 */
const TINY_JPEG =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';

function inject(ir: ProposalIR, data: Record<string, string>): ProposalIR {
  return {
    ...ir,
    sections: ir.sections.map((section) => ({
      ...section,
      blocks: section.blocks.map((block) =>
        block.type === 'image' && block.assetId
          ? { ...block, data: data[block.assetId] }
          : block,
      ),
    })),
  };
}

/** IR が申告した配置幅（mm）をスロットごとに集める。 */
function declared(ir: ProposalIR): Map<string, number> {
  const widths = new Map<string, number>();
  for (const section of ir.sections) {
    for (const block of section.blocks) {
      if (block.type === 'image') widths.set(block.slotId, block.printWidthMm);
    }
  }
  return widths;
}

async function drawnWidths(ir: ProposalIR): Promise<number[]> {
  const bytes = await renderLayoutPdf(ir, { fontBytes: loadTestFont() });
  return extractFrameRects(bytes).map((rect) => Math.round(rect.width * MM_PER_PT));
}

describe('配置幅', () => {
  it('は申告した mm と実際に置いた mm が一致する（全枠種）', async () => {
    // タイル10（3列＋2列の2面）、カット6（3+3）、実績3（3列）、表紙・コンセプトは全面。
    const { ir, data } = irWith({ tiles: 10, cuts: 6, works: 3 });
    const resolved = inject(ir, data);
    const widths = declared(resolved);
    const drawn = await drawnWidths(resolved);

    // 申告値は全て実配置のどこかに現れる（誤差は丸めの1mmまで）。
    for (const [slot, mm] of widths) {
      expect(
        drawn.some((actual) => Math.abs(actual - mm) <= 1),
        `${slot}: 申告 ${mm}mm / 実配置 ${[...new Set(drawn)].join(',')}mm`,
      ).toBe(true);
    }

    // 面付けごとの値そのものも固定する。
    expect(widths.get('cover-key')).toBe(297);
    expect(widths.get('concept-key')).toBe(297);
    expect(widths.get('brand-mood')).toBe(147);
    expect(widths.get('works-grid')).toBe(97);
    expect(widths.get('mood-tiles')).toBe(83);
    expect(widths.get('shot-frames')).toBe(88);
  }, 120_000);

  it('はムードボードの寸法を面をまたいでも変えない', async () => {
    const { ir, data } = irWith({ tiles: 10, cuts: 4, works: 3 });
    const bytes = await renderLayoutPdf(inject(ir, data), { fontBytes: loadTestFont() });
    const rects = extractFrameRects(bytes);
    // タイルは 83mm。1面目6枚・2面目4枚のどちらも同じ幅で出る。
    const tiles = rects.filter((rect) => Math.abs(rect.width * MM_PER_PT - 83) < 1);

    expect(tiles).toHaveLength(10);
    expect(new Set(tiles.map((rect) => Math.round(rect.width)))).toHaveProperty('size', 1);
  }, 120_000);

  it('はカットが減れば枠を広げる（4分割固定にしない）', async () => {
    const six = irWith({ tiles: 6, cuts: 6, works: 3 });
    const eight = irWith({ tiles: 6, cuts: 8, works: 3 });

    expect(declared(six.ir).get('shot-frames')).toBeGreaterThan(
      declared(eight.ir).get('shot-frames') as number,
    );
  });
});
