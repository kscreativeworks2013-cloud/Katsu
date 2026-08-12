/*
 * ステップの入出力契約（第4章 4-2）。
 * ステップは outputFields 以外を書き換えず、dependsOn に無いステップの出力も読まない。
 * ステッパー・サイドバー・進捗率はこの定義から生成するので、ステップの増減・順序変更は
 * この配列を変えるだけで画面に反映される（第4章 4-8）。
 */

import type { Project, StepId, Workspace } from '../data/types';

export interface StepContract {
  id: StepId;
  label: string;
  segment: string;
  dependsOn: StepId[];
  outputFields: string[];
  /** 生成に使う入力。案件情報と上流の出力だけを参照する。 */
  inputs: (project: Project, workspace: Workspace) => unknown;
}

const PROMPT_FIELDS = [
  'prompts.chatgpt',
  'prompts.claude',
  'prompts.gemini',
  'prompts.imagefx',
  'prompts.midjourney',
  'prompts.flux',
];

export const WORKFLOW_STEPS: StepContract[] = [
  {
    id: 'brand',
    label: 'ブランド分析',
    segment: 'brand',
    dependsOn: [],
    outputFields: [
      'brand.worldview',
      'brand.tone',
      'brand.target',
      'brand.visualCodes',
      'brand.keywords',
      'brand.palette',
      'brand.constraints',
    ],
    inputs: (project) => ({
      brand: project.brand,
      genre: project.genre,
      brandUrl: project.brandUrl,
      brandConcept: project.brandConcept,
      targetCustomer: project.targetCustomer,
      references: project.references,
      keywords: project.keywords,
      ngNotes: project.ngNotes,
      creative: project.creative,
    }),
  },
  {
    id: 'competitors',
    label: '競合分析',
    segment: 'competitors',
    dependsOn: ['brand'],
    outputFields: ['competitors.list', 'competitors.differentiators'],
    inputs: (project, workspace) => ({
      competitorNames: project.competitorNames,
      genre: project.genre,
      texture: project.creative.texture,
      brand: workspace.brand,
    }),
  },
  {
    id: 'concepts',
    label: 'コンセプト',
    segment: 'concepts',
    dependsOn: ['brand', 'competitors'],
    outputFields: ['concepts.list'],
    inputs: (project, workspace) => ({
      brand: workspace.brand,
      differentiators: workspace.differentiators.filter((item) => item.adopted),
      productName: project.productName,
      creative: project.creative,
    }),
  },
  {
    id: 'moodboard',
    label: 'ムードボード',
    segment: 'moodboard',
    dependsOn: ['concepts'],
    outputFields: ['moodboard.tiles'],
    inputs: (project, workspace) => ({
      concept: adoptedConcept(workspace),
      palette: project.creative.palette,
      brandPalette: workspace.brand?.palette,
    }),
  },
  {
    id: 'shots',
    label: 'ショットリスト／絵コンテ',
    segment: 'shots',
    dependsOn: ['concepts', 'moodboard'],
    outputFields: ['shots.list'],
    inputs: (project, workspace) => ({
      concept: adoptedConcept(workspace),
      mustCuts: project.mustCuts,
      creative: project.creative,
      moodboard: workspace.moodboard.map((tile) => tile.caption),
    }),
  },
  {
    id: 'prompts',
    label: 'AIプロンプト',
    segment: 'prompts',
    dependsOn: ['brand', 'shots'],
    outputFields: PROMPT_FIELDS,
    inputs: (project, workspace) => ({
      brand: workspace.brand,
      concept: adoptedConcept(workspace),
      shots: workspace.shots,
      ngNotes: project.ngNotes,
    }),
  },
  {
    id: 'proposal',
    label: '提案書プレビュー',
    segment: 'proposal',
    dependsOn: ['brand', 'competitors', 'concepts', 'moodboard', 'shots'],
    // 提案書は各ステップの出力から都度組み立てるため、自身の出力フィールドを持たない。
    outputFields: [],
    inputs: (project, workspace) => ({
      language: project.language,
      brand: workspace.brand,
      competitors: workspace.competitors,
      concept: adoptedConcept(workspace),
      moodboard: workspace.moodboard,
      shots: workspace.shots,
    }),
  },
  {
    id: 'export',
    label: '出力',
    segment: 'export',
    dependsOn: ['proposal'],
    outputFields: [],
    inputs: (project) => ({ outputs: project.outputs, language: project.language }),
  },
];

export const STEP_BY_ID: Record<StepId, StepContract> = Object.fromEntries(
  WORKFLOW_STEPS.map((step) => [step.id, step]),
) as Record<StepId, StepContract>;

export function adoptedConcept(workspace: Workspace) {
  return workspace.concepts.find((concept) => concept.id === workspace.adoptedConceptId);
}

/** 直接・間接を問わず、このステップに依存する全ステップ（第4章 4-4 の stale 伝播範囲）。 */
export function downstreamSteps(stepId: StepId): StepId[] {
  const found = new Set<StepId>();
  let frontier: StepId[] = [stepId];

  while (frontier.length > 0) {
    const next: StepId[] = [];
    for (const step of WORKFLOW_STEPS) {
      if (found.has(step.id)) continue;
      if (step.dependsOn.some((dependency) => frontier.includes(dependency))) {
        found.add(step.id);
        next.push(step.id);
      }
    }
    frontier = next;
  }

  return WORKFLOW_STEPS.filter((step) => found.has(step.id)).map((step) => step.id);
}

/** 入力の要約値。順序に依存しないよう、キーをソートしてから畳み込む。 */
export function inputsHash(stepId: StepId, project: Project, workspace: Workspace): string {
  const inputs = STEP_BY_ID[stepId].inputs(project, workspace);
  const json = JSON.stringify(inputs, (_key, value) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)),
      );
    }
    return value;
  });

  let hash = 0;
  for (let index = 0; index < json.length; index += 1) {
    hash = (hash * 31 + json.charCodeAt(index)) | 0;
  }
  return (hash >>> 0).toString(36);
}
