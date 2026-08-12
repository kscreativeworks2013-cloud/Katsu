import { describe, expect, it } from 'vitest';
import { defaultSettings, seedPortfolio, seedProjects, seedWorkspaces } from '../data/fixtures';
import { FIELDS } from './fields';
import { WORKFLOW_STEPS, downstreamSteps, inputsHash } from './steps';

const project = seedProjects[0];
const workspace = seedWorkspaces[project.id];
const context = { settings: defaultSettings, portfolio: seedPortfolio };

describe('ステップ契約', () => {
  it('の outputFields は実在するフィールドパスだけを指す', () => {
    for (const step of WORKFLOW_STEPS) {
      for (const path of step.outputFields) {
        expect(FIELDS[path], `${step.id} の ${path}`).toBeDefined();
      }
    }
  });

  it('では同じフィールドを2つのステップが書かない', () => {
    const seen = new Set<string>();
    for (const step of WORKFLOW_STEPS) {
      for (const path of step.outputFields) {
        expect(seen.has(path), `${path} が重複`).toBe(false);
        seen.add(path);
      }
    }
  });

  it('の依存先は自分より前に定義されている（循環しない）', () => {
    const order = WORKFLOW_STEPS.map((step) => step.id);
    for (const step of WORKFLOW_STEPS) {
      for (const dependency of step.dependsOn) {
        expect(order.indexOf(dependency)).toBeLessThan(order.indexOf(step.id));
      }
    }
  });
});

describe('downstreamSteps', () => {
  it('は推移的に到達できる全ステップを返す', () => {
    expect(downstreamSteps('brand')).toEqual([
      'competitors',
      'concepts',
      'moodboard',
      'shots',
      'prompts',
      'proposal',
      'export',
    ]);
  });

  it('はムードボードの下流を返す', () => {
    expect(downstreamSteps('moodboard')).toEqual(['shots', 'prompts', 'proposal', 'export']);
  });

  it('は最下流では空になる', () => {
    expect(downstreamSteps('export')).toEqual([]);
  });
});

describe('inputsHash', () => {
  it('は同じ入力で同じ値になる', () => {
    expect(inputsHash('brand', project, workspace, context)).toBe(
      inputsHash('brand', project, workspace, context),
    );
  });

  it('は入力が変わると変わる', () => {
    const changed = { ...project, brandConcept: `${project.brandConcept}（改）` };
    expect(inputsHash('brand', changed, workspace, context)).not.toBe(
      inputsHash('brand', project, workspace, context),
    );
  });

  it('は下流の変更に影響されない（上流ステップの入力は下流を含まない）', () => {
    const withMoreShots = { ...workspace, shots: [] };
    expect(inputsHash('brand', project, withMoreShots, context)).toBe(
      inputsHash('brand', project, workspace, context),
    );
  });
});
