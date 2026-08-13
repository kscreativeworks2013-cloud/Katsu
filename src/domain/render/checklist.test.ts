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
      slots: ir.slots.map((slot) => ({ ...slot, pool: slot.shown, unnamed: 0 })),
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
