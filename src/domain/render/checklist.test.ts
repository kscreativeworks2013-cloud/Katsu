import { describe, expect, it } from 'vitest';
import { buildTestIR, testAsset, workspaceWithAsset } from '../../test/ir';
import { checklistSummary } from './types';

/*
 * 提出前チェック（第8章 8-7）。
 * info 級の指摘は出力を壊さないので warn にしないが、件数は提出前に見えている必要がある。
 * 内訳の見出しは**枠の名前**で出す。章名でまとめると「表紙1件」となり、
 * 画像の入っている面に未登録があるように読めてしまう（実体はロゴ枠）。
 */

describe('checklistSummary', () => {
  it('は未登録の件数を枠の名前で内訳にする', () => {
    const ir = buildTestIR({
      assets: { 'ast-1': testAsset('ast-1') },
      workspace: workspaceWithAsset('ast-1'),
    });
    const line = checklistSummary(ir).find((item) => item.includes('画像未登録'));

    expect(line).toMatch(/画像未登録が\d+件あります/);
    expect(line).toContain('ブランドロゴ1');
    // 章名（表紙）ではまとめない。表紙にはキービジュアルが入っている。
    expect(line).not.toContain('表紙1');
  });

  it('は全点が載っていて指摘も無ければ何も出さない', () => {
    const ir = buildTestIR();
    const empty = {
      ...ir,
      warnings: [],
      // 軸も確かめ終えた状態（工程R-8）。既定のままなら、それ自体が指摘になる。
      sections: ir.sections.map((section) => ({
        ...section,
        blocks: section.blocks.map((block) =>
          block.type === 'map' ? { ...block, axesAreDefault: false } : block,
        ),
      })),
      // 主要枠を選び終えた状態。選んでいなければ、それ自体が指摘になる（工程R-1）。
      slots: ir.slots.map((slot) => ({
        ...slot,
        pool: slot.shown,
        unnamed: 0,
        chosen: true,
      })),
    };

    expect(checklistSummary(empty)).toEqual([]);
  });

  it('は載らなかった件数を枠の使われ方から出す（警告の積み忘れに依存しない）', () => {
    const ir = buildTestIR();
    const trimmed = {
      ...ir,
      warnings: [],
      slots: ir.slots.map((slot) =>
        slot.slotId === 'mood-tiles' ? { ...slot, pool: 20, shown: 12 } : slot,
      ),
    };

    expect(checklistSummary(trimmed)).toContain(
      'ムードボードは20件中12件のみ掲載されます（「タイル」の枠）。',
    );
  });

  it('は説明文の無い画像を件数で出す（内部の名前を版面に出さない）', () => {
    const ir = buildTestIR();
    const unnamed = {
      ...ir,
      warnings: [],
      slots: ir.slots.map((slot) =>
        slot.slotId === 'mood-tiles' ? { ...slot, pool: slot.shown, unnamed: 2 } : slot,
      ),
    };

    expect(checklistSummary(unnamed).some((line) => line.includes('説明文が未設定'))).toBe(
      true,
    );
  });
});

/*
 * 英語版の提出前チェック（第9章 工程00-b-2）。
 * 「見出しだけ英語で中身が和文」だと、通しで英語版を見ても判断材料にならない。
 * ここで見るのはレンダラが組む文と枠名まで。個々の警告文は IR 側が和文で持っており、
 * そちらは別問題として残っている。
 */
describe('英語版の提出前チェック', () => {
  it('は載らなかった件数を英文で出し、枠名も英語にする', () => {
    const ir = buildTestIR({ lang: 'en' });
    const trimmed = {
      ...ir,
      warnings: [],
      slots: ir.slots.map((slot) =>
        slot.slotId === 'works-grid' ? { ...slot, pool: 6, shown: 3 } : slot,
      ),
    };
    const line = checklistSummary(trimmed).find((item) => item.includes('only 3 of 6'));

    expect(line).toBe('Selected Works: only 3 of 6 items are shown (slot "Selected works").');
    expect(line).not.toMatch(/[ぁ-んァ-ヶ一-龠]/);
  });

  it('は説明文の無い画像も英文で数える', () => {
    const ir = buildTestIR({ lang: 'en' });
    const unnamed = {
      ...ir,
      warnings: [],
      slots: ir.slots.map((slot, index) =>
        index === 0 ? { ...slot, pool: slot.shown, unnamed: 2 } : { ...slot, pool: slot.shown },
      ),
    };
    const line = checklistSummary(unnamed).find((item) => item.includes('no caption'));

    expect(line).toBe(
      '2 image(s) have no caption; only the source label will appear beneath them.',
    );
  });

  it('は未登録の内訳も英語の枠名でまとめる', () => {
    const ir = buildTestIR({
      lang: 'en',
      assets: { 'ast-1': testAsset('ast-1') },
      workspace: workspaceWithAsset('ast-1'),
    });
    const line = checklistSummary(ir).find((item) => item.includes('image slot(s) are empty'));

    expect(line).toContain('Brand logo 1');
    expect(line).not.toMatch(/[ぁ-んァ-ヶ一-龠]/);
  });
});

/*
 * 面を左右する枠の未選択（第9章 工程R-1）。
 * 既定は供給元の並び順なので、放っておくと「たまたま先頭にあった写真」が表紙になる。
 * 実測：本文が暗部と半逆光を述べている案件で、表紙にハイキーの着物が入った。
 */
describe('主要枠の未選択', () => {
  it('は件数と枠名を出す', () => {
    const ir = buildTestIR();
    // 供給元が枠数を超えている＝選ぶ余地がある状態（第9章 工程N-7）。
    const line = checklistSummary({
      ...ir,
      warnings: [],
      slots: ir.slots.map((slot) => ({ ...slot, pool: slot.shown + 5, unnamed: 0 })),
    }).find((item) => item.includes('未選択'));

    expect(line).toContain('表紙／キービジュアル');
    expect(line).toContain('撮影コンセプト／キービジュアル');
  });

  it('は選んだ枠を数えない', () => {
    const ir = buildTestIR();
    const lines = checklistSummary({
      ...ir,
      warnings: [],
      slots: ir.slots.map((slot) => ({
        ...slot,
        pool: slot.shown + 5,
        unnamed: 0,
        chosen: true,
      })),
    });

    expect(lines.some((line) => line.includes('未選択'))).toBe(false);
  });

  it('は選ぶ余地が無い枠を数えない（供給元が枠数以下＝ロゴ）', () => {
    const ir = buildTestIR();
    const lines = checklistSummary({
      ...ir,
      warnings: [],
      slots: ir.slots.map((slot) => ({ ...slot, pool: slot.shown, unnamed: 0 })),
    });

    expect(lines.some((line) => line.includes('未選択'))).toBe(false);
  });

  it('は画像が1枚も入っていない枠を数えない（未登録として別に出る）', () => {
    const ir = buildTestIR();
    const lines = checklistSummary({
      ...ir,
      warnings: [],
      slots: ir.slots.map((slot) => ({ ...slot, pool: 0, shown: 0, unnamed: 0 })),
    });

    expect(lines.some((line) => line.includes('未選択'))).toBe(false);
  });
});

/*
 * 書いたのに版面に載らない本文（第9章 工程R-3）。
 * 実測：表紙に65字、ムードボードに134字を書いて PDF に1文字も出なかった。
 * 気づけないまま残さないよう、件数を提出前チェックに出す。
 */
describe('版面に載らない本文', () => {
  /** 段落 n 本と画像1点を持つ章に差し替える。 */
  function withBody(ir: ReturnType<typeof buildTestIR>, sectionId: string, paragraphs: number) {
    return {
      ...ir,
      warnings: [],
      slots: ir.slots.map((slot) => ({ ...slot, pool: slot.shown, unnamed: 0, chosen: true })),
      sections: ir.sections.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              blocks: [
                ...Array.from({ length: paragraphs }, (_, index) => ({
                  type: 'paragraph' as const,
                  text: `段落${index + 1}`,
                })),
                // 画像が入っている面であることが条件。1枚も無い章はテキスト面へ落ち、
                // 本文は全量が載る（bodyCapacity がそう定義している）。
                {
                  type: 'image' as const,
                  caption: '',
                  slotId: `${sectionId}-key`,
                  slotLabel: '枠',
                  printWidthMm: 297,
                  assetId: 'ast-1',
                },
              ],
            }
          : section,
      ),
    };
  }

  it('は表紙のリードを超えた行数を件数で出す', () => {
    const ir = buildTestIR();
    const line = checklistSummary(withBody(ir, 'cover', 5)).find((item) =>
      item.includes('版面に載りません'),
    );

    expect(line).toContain('表紙');
    expect(line).toContain('3行');
  });

  it('はリードに収まる行数では出さない', () => {
    const ir = buildTestIR();
    const lines = checklistSummary(withBody(ir, 'cover', 2));

    expect(lines.some((line) => line.includes('版面に載りません'))).toBe(false);
  });

  it('は本文が主役の章では出さない（全量が段組みへ流れる）', () => {
    const ir = buildTestIR();
    const lines = checklistSummary(withBody(ir, 'brand', 12));

    expect(lines.some((line) => line.includes('版面に載りません'))).toBe(false);
  });
});
