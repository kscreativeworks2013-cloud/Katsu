import { describe, expect, it } from 'vitest';
import type { Project, StepId, StepStatus } from '../data/types';
import { seedProjects } from '../data/fixtures';
import {
  currentStep,
  daysUntil,
  dueThisWeek,
  filterProjects,
  formatDate,
  formatYen,
  unmetPrerequisites,
  workflowProgress,
} from './projects';

// Pattern: unit tests. Pure functions, so the edge cases live here rather than
// in the slower component tests.

function steps(
  overrides: Partial<Record<StepId, StepStatus>> = {},
): Record<StepId, StepStatus> {
  return {
    brand: 'todo',
    competitors: 'todo',
    concepts: 'todo',
    moodboard: 'todo',
    shots: 'todo',
    prompts: 'todo',
    proposal: 'todo',
    export: 'todo',
    ...overrides,
  };
}

describe('workflowProgress', () => {
  it('は未着手のみのとき0を返す', () => {
    expect(workflowProgress(steps())).toBe(0);
  });

  it('は全ステップ完了で100を返す', () => {
    expect(
      workflowProgress(
        steps({
          brand: 'done',
          competitors: 'done',
          concepts: 'done',
          moodboard: 'done',
          shots: 'done',
          prompts: 'done',
          proposal: 'done',
          export: 'done',
        }),
      ),
    ).toBe(100);
  });

  it('は進行中を半分の重みで数える', () => {
    // 完了2 + 進行中1 = 2.5 / 8 ステップ
    expect(
      workflowProgress(steps({ brand: 'done', competitors: 'done', concepts: 'in_progress' })),
    ).toBe(31);
  });
});

describe('currentStep', () => {
  it('は未完了の先頭ステップを返す', () => {
    expect(currentStep(steps({ brand: 'done', competitors: 'done' }))).toBe('concepts');
  });

  it('はすべて完了なら最後のステップを返す', () => {
    const all = steps();
    for (const key of Object.keys(all) as StepId[]) all[key] = 'done';
    expect(currentStep(all)).toBe('export');
  });
});

describe('unmetPrerequisites', () => {
  it('は手前の未完了ステップだけを挙げる', () => {
    expect(unmetPrerequisites(steps({ brand: 'done' }), 'concepts')).toEqual(['競合分析']);
  });

  it('は最初のステップでは空になる', () => {
    expect(unmetPrerequisites(steps(), 'brand')).toEqual([]);
  });
});

describe('filterProjects', () => {
  it('はブランド名の部分一致で絞り込む', () => {
    const result = filterProjects(seedProjects, { query: 'aurelia' });
    expect(result.map((project) => project.brand)).toEqual(['AURELIA']);
  });

  it('はキーワードでも一致する', () => {
    const result = filterProjects(seedProjects, { query: '夜気' });
    expect(result).toHaveLength(1);
  });

  it('はステータスとジャンルを併用できる', () => {
    const result = filterProjects(seedProjects, { status: 'draft', genre: 'メイク' });
    expect(result.map((project) => project.id)).toEqual(['prj-kohaku']);
  });

  it('は条件なしなら全件返す', () => {
    expect(filterProjects(seedProjects, {})).toHaveLength(seedProjects.length);
  });
});

describe('formatYen', () => {
  it('は3桁区切りで表示する', () => {
    expect(formatYen(4_800_000)).toBe('¥4,800,000');
  });

  it('は0も表示する', () => {
    expect(formatYen(0)).toBe('¥0');
  });
});

describe('formatDate', () => {
  it('はスラッシュ区切りにする', () => {
    expect(formatDate('2026-08-12')).toBe('2026/08/12');
  });

  it('は空文字を「未定」にする', () => {
    expect(formatDate('')).toBe('未定');
  });
});

describe('daysUntil', () => {
  const today = new Date(2026, 7, 12);

  it('は残日数を返す', () => {
    expect(daysUntil('2026-08-19', today)).toBe(7);
  });

  it('は過去日で負の数を返す', () => {
    expect(daysUntil('2026-08-10', today)).toBe(-2);
  });
});

describe('dueThisWeek', () => {
  const base: Project = { ...seedProjects[0] };
  const today = new Date(2026, 7, 12);

  it('は7日以内の未納品案件だけを拾う', () => {
    const projects: Project[] = [
      { ...base, id: 'a', dueDate: '2026-08-15', status: 'in_progress' },
      { ...base, id: 'b', dueDate: '2026-08-30', status: 'in_progress' },
      { ...base, id: 'c', dueDate: '2026-08-13', status: 'delivered' },
      { ...base, id: 'd', dueDate: '2026-08-01', status: 'review' },
    ];
    expect(dueThisWeek(projects, today).map((project) => project.id)).toEqual(['a']);
  });
});
