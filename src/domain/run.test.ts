import { describe, expect, it } from 'vitest';
import { emptyWorkspace } from '../data/generate';
import type { Provenance, Workspace } from '../data/types';
import { applyValues, buildDiff, defaultSelection, summarizeDiff } from './run';

// Pattern: unit tests. 上書き・保護・変更なしの判定は再生成の中心なので、ここで固める。

function workspaceWith(tone: string): Workspace {
  return {
    ...emptyWorkspace(),
    brand: {
      worldview: '既存の世界観',
      tone,
      target: '既存のターゲット',
      visualCodes: [],
      keywords: [],
      palette: [],
      constraints: [],
    },
  };
}

const generated = (at = '2026-08-01T00:00:00.000Z'): Provenance => ({
  'brand.worldview': { origin: 'generated', runId: 'run-1', updatedAt: at },
  'brand.tone': { origin: 'generated', runId: 'run-1', updatedAt: at },
});

describe('buildDiff', () => {
  it('は生成済みで値が変わるフィールドを上書きにする', () => {
    const diffs = buildDiff(workspaceWith('古いトーン'), generated(), {
      'brand.tone': '新しいトーン',
    });

    expect(diffs).toHaveLength(1);
    expect(diffs[0].kind).toBe('overwrite');
    expect(diffs[0].label).toBe('トーン＆マナー');
  });

  it('は手動編集済みのフィールドを保護にする', () => {
    const provenance: Provenance = {
      ...generated(),
      'brand.tone': { origin: 'edited', runId: 'run-1', updatedAt: '2026-08-02T00:00:00.000Z' },
    };

    const diffs = buildDiff(workspaceWith('手で書いたトーン'), provenance, {
      'brand.tone': '新しいトーン',
    });

    expect(diffs[0].kind).toBe('protected');
  });

  it('は値が同じなら変更なしにする', () => {
    const diffs = buildDiff(workspaceWith('同じトーン'), generated(), {
      'brand.tone': '同じトーン',
    });

    expect(diffs[0].kind).toBe('unchanged');
  });

  it('は未生成のフィールドを上書きにする（保護しない）', () => {
    const diffs = buildDiff(emptyWorkspace(), {}, { 'brand.tone': '最初のトーン' });

    expect(diffs[0].kind).toBe('overwrite');
    expect(diffs[0].origin).toBe('empty');
  });
});

describe('defaultSelection', () => {
  it('は保護されたフィールドを既定で選ばない', () => {
    const provenance: Provenance = {
      'brand.tone': { origin: 'edited', runId: null, updatedAt: '' },
    };
    const diffs = buildDiff(workspaceWith('手で書いたトーン'), provenance, {
      'brand.tone': '新しいトーン',
      'brand.target': '新しいターゲット',
    });

    expect(defaultSelection(diffs)).toEqual(['brand.target']);
  });
});

describe('applyValues', () => {
  it('は選択されたフィールドだけを書き込み、provenance を生成済みにする', () => {
    const before = workspaceWith('古いトーン');
    const result = applyValues(
      before,
      generated(),
      { 'brand.tone': '新しいトーン', 'brand.target': '新しいターゲット' },
      ['brand.tone'],
      'run-2',
      '2026-08-12T00:00:00.000Z',
    );

    expect(result.workspace.brand?.tone).toBe('新しいトーン');
    expect(result.workspace.brand?.target).toBe('既存のターゲット');
    expect(result.provenance['brand.tone']).toEqual({
      origin: 'generated',
      runId: 'run-2',
      updatedAt: '2026-08-12T00:00:00.000Z',
    });
    expect(result.appliedFields).toEqual(['brand.tone']);
  });

  it('は元のワークスペースを書き換えない', () => {
    const before = workspaceWith('古いトーン');
    applyValues(
      before,
      generated(),
      { 'brand.tone': '新しいトーン' },
      ['brand.tone'],
      'run-2',
      '',
    );

    expect(before.brand?.tone).toBe('古いトーン');
  });
});

describe('summarizeDiff', () => {
  it('は3分類の件数を並べる', () => {
    const provenance: Provenance = {
      'brand.tone': { origin: 'edited', runId: null, updatedAt: '' },
      'brand.worldview': { origin: 'generated', runId: 'run-1', updatedAt: '' },
    };
    const diffs = buildDiff(workspaceWith('手で書いたトーン'), provenance, {
      'brand.tone': '新しいトーン',
      'brand.worldview': '新しい世界観',
      'brand.target': '既存のターゲット',
    });

    expect(summarizeDiff(diffs)).toBe('上書き1件・保護1件・変更なし1件');
  });
});
