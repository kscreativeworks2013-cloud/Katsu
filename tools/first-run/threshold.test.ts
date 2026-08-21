import { mkdirSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildTestIR, loadTestFont, testAsset, workspaceWithBody } from '../../src/test/ir';
import { extractPdfTextItems } from '../../src/test/pdfText';
import { renderLayoutPdf } from '../../src/domain/render/pdfLayout';
import { A4_LANDSCAPE, SAFE_MARGIN_MM } from '../../src/domain/render/layout';
import { PROPOSAL_TEMPLATE } from '../../src/domain/proposal';
import type { ProposalIR } from '../../src/domain/ir';

/*
 * 版面が破綻し始める文字数（第9章 工程R-9）。
 *
 * 手で探すのは非効率なので、本文を段階的に水増しして章ごとに閾値を測る。
 * 見るのは2つ。
 *   (1) 溢れ  ：本文が安全マージンの外へ出るか、面が増える
 *   (2) 面の増減：画像面が分割される（＝画像帯の条件が変わる）
 *
 * 実運用の上限として仕様へ書き戻すための測定であり、合否を見るテストではない。
 */

const FONT = loadTestFont();
const OUT = 'dist/first-run';

/** 1段落ぶんの文。実際の本文に近い字種（和文＋欧文＋数字）で作る。 */
function paragraph(index: number): string {
  return (
    `第${index + 1}段落。半逆光で暗部に階調を残す方針を、被写体と光源の距離、` +
    `面光源のサイズ、黒フラッグの位置という3つの変数で説明する。85mm と 100mm を` +
    `使い分け、寄りでも歪ませない。ここは実運用の分量に近い長さの見本である。`
  );
}

/** 章の本文を n 段落に差し替えた IR。 */
function withParagraphs(base: ProposalIR, sectionId: string, count: number): ProposalIR {
  return {
    ...base,
    sections: base.sections.map((section) =>
      section.id === sectionId
        ? {
            ...section,
            blocks: [
              ...Array.from({ length: count }, (_, index) => ({
                type: 'paragraph' as const,
                text: paragraph(index),
              })),
              ...section.blocks.filter((block) => block.type !== 'paragraph'),
            ],
          }
        : section,
    ),
  };
}

/** 画像つきの案件データ。枠が埋まっていないと章がテキスト面へ落ちる。 */
function filled(): ProposalIR {
  const base = workspaceWithBody();
  const assets = Object.fromEntries(
    Array.from({ length: 12 }, (_, index) => [
      `ast-${index}`,
      testAsset(`ast-${index}`, { width: 4000, height: 3000 }),
    ]),
  );
  return buildTestIR({
    assets,
    workspace: {
      ...base,
      moodboard: base.moodboard.map((tile, index) => ({ ...tile, assetId: `ast-${index}` })),
      shots: base.shots.map((shot, index) => ({ ...shot, assetId: `ast-${index}` })),
      competitors: base.competitors.map((item, index) => ({
        ...item,
        assetId: `ast-${index}`,
      })),
    },
  });
}

/** 実体を注ぎ込む。枠に画像が載らないと面の種類が変わってしまう。 */
const TINY_JPEG =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';

function inject(ir: ProposalIR): ProposalIR {
  return {
    ...ir,
    sections: ir.sections.map((section) => ({
      ...section,
      blocks: section.blocks.map((block) =>
        block.type === 'image' && block.assetId ? { ...block, data: TINY_JPEG } : block,
      ),
    })),
  };
}

interface Probe {
  chars: number;
  pages: number;
  outside: number;
}

/** 1回ぶん描いて、面数と安全マージンからの逸脱を数える。 */
async function probe(ir: ProposalIR, sectionId: string, count: number): Promise<Probe> {
  const target = inject(withParagraphs(ir, sectionId, count));
  const bytes = await renderLayoutPdf(target, { fontBytes: FONT });
  const items = await extractPdfTextItems(bytes);

  const left = (SAFE_MARGIN_MM / A4_LANDSCAPE.widthMm) * A4_LANDSCAPE.widthPt;
  const right = A4_LANDSCAPE.widthPt - left;
  const bottom = (SAFE_MARGIN_MM / A4_LANDSCAPE.heightMm) * A4_LANDSCAPE.heightPt;

  return {
    chars: count * paragraph(0).length,
    pages: new Set(items.map((item) => item.page)).size,
    outside: items.filter(
      (item) => item.x < left - 1 || item.x > right + 1 || item.y < bottom - 1,
    ).length,
  };
}

describe('版面が破綻し始める文字数', () => {
  it('を章ごとに測る', async () => {
    const base = filled();
    const rows: Record<string, Probe[]> = {};

    for (const section of PROPOSAL_TEMPLATE) {
      const series: Probe[] = [];
      // 2 → 20 段落。実運用で1章に20段落は書かないので、これで上限に届く。
      for (const count of [2, 4, 6, 8, 10, 14, 20]) {
        series.push(await probe(base, section.id, count));
      }
      rows[section.id] = series;
    }

    mkdirSync(OUT, { recursive: true });
    writeFileSync(`${OUT}/thresholds.json`, JSON.stringify(rows, null, 2));

    // 測定なので合否は問わない。全章ぶん記録できたことだけ確かめる。
    expect(Object.keys(rows)).toHaveLength(PROPOSAL_TEMPLATE.length);
  }, 900_000);
});
