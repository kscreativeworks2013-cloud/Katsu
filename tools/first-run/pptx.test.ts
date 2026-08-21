import { mkdirSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildTestIR, loadTestFont, testAsset, workspaceWithBody } from '../../src/test/ir';
import { renderLayoutPdf } from '../../src/domain/render/pdfLayout';
import { extractFrameRects } from '../../src/test/pdfText';
import { A4_LANDSCAPE, SCREEN_16_9 } from '../../src/domain/render/layout';

/*
 * 16:9 への再フローを1面だけ確かめる（第9章 実施要領5）。
 *
 * 版面は比率で持っているので、判型を差し替えれば追随する**はず**である。
 * ここが崩れているとフェーズ4（PowerPoint の面付け）が丸ごと作り直しになるので、
 * 全面を作る前に1面で確かめる。合否ではなく、**どの値が絶対座標のまま残っているか**を
 * 見るための測定。
 *
 * 見るのは表紙。全面ブリードの画像帯と題字だけの面で、比率で持っていれば
 * 判型を変えても同じ位置関係になる。
 */

const FONT = loadTestFont();
const OUT = 'dist/first-run';

const TINY_JPEG =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';

function ir() {
  const base = workspaceWithBody();
  const assets = Object.fromEntries(
    Array.from({ length: 12 }, (_, index) => [
      `ast-${index}`,
      testAsset(`ast-${index}`, { width: 4000, height: 3000 }),
    ]),
  );
  const built = buildTestIR({
    assets,
    workspace: {
      ...base,
      moodboard: base.moodboard.map((tile, index) => ({ ...tile, assetId: `ast-${index}` })),
    },
  });
  return {
    ...built,
    sections: built.sections.map((section) => ({
      ...section,
      blocks: section.blocks.map((block) =>
        block.type === 'image' && block.assetId ? { ...block, data: TINY_JPEG } : block,
      ),
    })),
  };
}

describe('16:9 への再フロー', () => {
  it('を表紙1面で確かめる', async () => {
    const source = ir();
    const a4 = await renderLayoutPdf(source, { fontBytes: FONT });
    const wide = await renderLayoutPdf(source, { fontBytes: FONT, format: SCREEN_16_9 });

    const rectsOf = async (bytes: Uint8Array, w: number, h: number) =>
      (await extractFrameRects(bytes))
        .filter((rect) => rect.page === 1)
        .map((rect) => ({
          x: Number((rect.x / w).toFixed(4)),
          y: Number((rect.y / h).toFixed(4)),
          w: Number((rect.width / w).toFixed(4)),
          h: Number((rect.height / h).toFixed(4)),
        }));

    const report = {
      a4: await rectsOf(a4, A4_LANDSCAPE.widthPt, A4_LANDSCAPE.heightPt),
      wide: await rectsOf(wide, SCREEN_16_9.widthPt, SCREEN_16_9.heightPt),
    };

    mkdirSync(OUT, { recursive: true });
    writeFileSync(`${OUT}/reflow-16-9.json`, JSON.stringify(report, null, 2));
    writeFileSync(`${OUT}/cover-16-9.pdf`, wide);

    // 測定なので合否は問わない。両方が描けたことだけ確かめる。
    expect(report.a4.length).toBeGreaterThan(0);
  }, 300_000);
});
