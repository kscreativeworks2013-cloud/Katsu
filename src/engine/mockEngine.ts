/*
 * テストダブルのエンジン（第4章 4-6）。
 * 実モデル接続後も削除しない。案件の入力値から決定的に組み立てるため、
 * 同じ入力に対して常に同じ出力になり、Vitest の実行結果が安定する。
 */

import {
  generateBrand,
  generateCompetitors,
  generateConcepts,
  generateMoodboard,
  generatePrompt,
  generateShots,
} from '../data/generate';
import type { PromptTarget, StepId } from '../data/types';
import { STEP_BY_ID } from '../domain/steps';
import type { GenerationEngine, RunRequest, RunResult } from './types';

/** 生成中の表示を確認できる程度の待ち時間。実エンジンではこれが実処理時間になる。 */
export const MOCK_LATENCY_MS = 400;

function valuesFor(request: RunRequest): Record<string, unknown> {
  const { project, workspace, stepId } = request;

  switch (stepId) {
    case 'brand': {
      const brand = generateBrand(project);
      return {
        'brand.worldview': brand.worldview,
        'brand.tone': brand.tone,
        'brand.target': brand.target,
        'brand.visualCodes': brand.visualCodes,
        'brand.keywords': brand.keywords,
        'brand.palette': brand.palette,
        'brand.constraints': brand.constraints,
      };
    }
    case 'competitors': {
      const { competitors, differentiators } = generateCompetitors(project);
      return {
        'competitors.list': competitors,
        'competitors.differentiators': differentiators,
      };
    }
    case 'concepts':
      return { 'concepts.list': generateConcepts(project) };
    case 'moodboard':
      return { 'moodboard.tiles': generateMoodboard(project) };
    case 'shots':
      return { 'shots.list': generateShots(project) };
    case 'prompts': {
      const targets: PromptTarget[] = [
        'chatgpt',
        'claude',
        'gemini',
        'imagefx',
        'midjourney',
        'flux',
      ];
      return Object.fromEntries(
        targets.map((target) => [
          `prompts.${target}`,
          generatePrompt(project, workspace, target),
        ]),
      );
    }
    // 提案書と出力は既存の生成物から組み立てるだけで、自身の出力フィールドを持たない。
    default:
      return {};
  }
}

/** 契約違反（outputFields 外への書き込み）はテストダブルの段階で落とす。 */
function assertContract(stepId: StepId, values: Record<string, unknown>): void {
  const allowed = new Set(STEP_BY_ID[stepId].outputFields);
  for (const path of Object.keys(values)) {
    if (!allowed.has(path)) {
      throw new Error(`ステップ ${stepId} は ${path} を出力できない（outputFields 外）`);
    }
  }
}

export function createMockEngine(latencyMs = MOCK_LATENCY_MS): GenerationEngine {
  return {
    id: 'mock',
    run(request): Promise<RunResult> {
      const values = valuesFor(request);
      assertContract(request.stepId, values);
      return new Promise((resolve) => {
        setTimeout(() => resolve({ runId: request.runId, values }), latencyMs);
      });
    },
  };
}

export const mockEngine = createMockEngine();
