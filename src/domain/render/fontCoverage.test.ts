import { describe, expect, it } from 'vitest';
import { buildTestIR, loadTestFont } from '../../test/ir';
import { renderLayoutPdf } from './pdfLayout';
import {
  cjkCharacters,
  irTexts,
  missingGlyphMessage,
  missingGlyphs,
  needsCjkFont,
} from './fontCoverage';

const FONT = loadTestFont();

/** 絞り込みで落ちる字の例。CJK 拡張Bの漢字で、JIS X 0208 にも追加分にも入っていない。 */
const UNCOVERED = '𪚥';

describe('和文フォントの要否', () => {
  it('は欧文だけの本文では不要と判定する', () => {
    expect(needsCjkFont(['Creative Concept', 'Shot List 01-06', 'Tokyo, 2026'])).toBe(false);
  });

  it('は和文が1文字でもあれば必要と判定する', () => {
    expect(needsCjkFont(['Creative Concept', '撮影コンセプト'])).toBe(true);
  });

  /*
   * 要件は「CJK が無ければ埋め込まない」だが、判定は欧文フォントで描けるかで行う。
   * KŌHAKU の Ō は CJK ではないが標準14書体では符号化できず、和文フォントへ回る。
   * CJK の有無で判定すると、この経路で字が消える。
   */
  it('は CJK でなくとも欧文フォントで描けない字があれば必要と判定する', () => {
    expect(needsCjkFont(['KŌHAKU'])).toBe(true);
    expect(cjkCharacters(['KŌHAKU'])).toContain('Ō');
  });

  it('は ASCII だけの語を和文側に数えない', () => {
    expect(cjkCharacters(['朝の斜光 100mm'])).not.toContain('1');
  });
});

describe('字形の過不足', () => {
  it('は収録されている字を欠けとして数えない', () => {
    expect(
      missingGlyphs(['漆黒と琥珀の撮影提案書', '髙﨑德', '①㎡㎜', 'KŌHAKU'], FONT),
    ).toEqual([]);
  });

  it('は収録外の字を拾う', () => {
    expect(missingGlyphs([`代表 ${UNCOVERED} 様`], FONT)).toEqual([UNCOVERED]);
  });

  it('は文言で該当文字と符号位置を言う', () => {
    const message = missingGlyphMessage([UNCOVERED]);
    expect(message).toContain(UNCOVERED);
    expect(message).toContain('U+2A6A5');
    expect(message).toContain('subset.py');
  });
});

describe('IR から拾う文字列', () => {
  it('は画像の実体（data URI）を含めない', () => {
    const ir = buildTestIR();
    const withData = {
      ...ir,
      sections: ir.sections.map((section) => ({
        ...section,
        blocks: section.blocks.map((block) =>
          block.type === 'image' ? { ...block, data: 'data:image/jpeg;base64,AAAA' } : block,
        ),
      })),
    };

    expect(irTexts(withData).some((text) => text.startsWith('data:'))).toBe(false);
  });

  it('は章題・本文・キャプション・警告を拾う', () => {
    const texts = irTexts(buildTestIR());
    expect(texts).toContain('撮影コンセプト');
    expect(texts.length).toBeGreaterThan(20);
  });
});

describe('出力', () => {
  it('は収録外の字があれば、1面も描かずに止める', async () => {
    const ir = buildTestIR();
    const broken = {
      ...ir,
      project: { ...ir.project, client: `${UNCOVERED}コスメティクス` },
    };

    await expect(renderLayoutPdf(broken, { fontBytes: FONT })).rejects.toThrow(
      /字形がないため PDF を生成できません/,
    );
  });

  it('は和文を使わない面付けで和文フォントを埋め込まない', async () => {
    const ir = buildTestIR();
    // 本文・章題・キャプションまで欧文に置き換えた IR。実運用では英語版がこれに近づく。
    const english = {
      ...ir,
      // 版面が持つ文字（出自ラベル・日付行）も言語で引き分ける。ja のままだと
      // 「／」だけで和文フォントを運ぶことになる。
      lang: 'en' as const,
      project: {
        ...ir.project,
        name: 'Amber and Ink',
        brand: 'Amber',
        client: 'Amber Cosmetics',
      },
      sections: ir.sections.map((section) => ({
        ...section,
        title: 'Creative Concept',
        blocks: section.blocks.map((block) =>
          block.type === 'paragraph'
            ? { ...block, text: 'A quiet study in amber and ink.' }
            : block.type === 'list'
              ? { ...block, items: ['Amber', 'Ink', 'Silk'] }
              : block.type === 'image'
                ? { ...block, caption: 'Cut 1', slotLabel: 'Frames' }
                : {
                    ...block,
                    // 軸を書き換えた＝既定ではない（工程R-8）。既定のままだと、
                    // 提出前チェックが和文の軸名を出して和文フォントが要る。
                    axesAreDefault: false,
                    axes: {
                      x: ['Classic', 'Modern'] as [string, string],
                      y: ['Quiet', 'Bold'] as [string, string],
                    },
                    points: block.points.map((point, index) => ({
                      ...point,
                      label: `House ${index + 1}`,
                    })),
                  },
        ),
      })),
      // 注意書きと提出前チェックの文はレンダラ側で組み立てるので和文のまま出る。
      // 出るかぎり和文フォントは要るので、ここでは何も出ない状態にする。
      warnings: [],
      slots: [],
    };

    const withCjk = await renderLayoutPdf(ir, { fontBytes: FONT });
    const withoutCjk = await renderLayoutPdf(english, { fontBytes: FONT });

    // 和文フォントの実体（約2.4MB）がまるごと落ちる。
    expect(withoutCjk.byteLength).toBeLessThan(withCjk.byteLength - 1_000_000);
  });
});
