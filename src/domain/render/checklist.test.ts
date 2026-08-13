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

  it('は指摘が無ければ何も出さない', () => {
    const ir = buildTestIR();
    const empty = { ...ir, warnings: [] };

    expect(checklistSummary(empty)).toEqual([]);
  });
});
