/**
 * 案件データに対する純粋関数。DOM もネットワークも触らない層なので、
 * 端のケースはここでテストする。
 */

import type { Project, StepId, StepRecord, StepStatus } from '../data/types';
import { STEP_BY_ID, WORKFLOW_STEPS } from '../domain/steps';

/** 完了ステップの割合（0〜100の整数）。生成中は半分の重みで数える。 */
export function workflowProgress(steps: Record<StepId, StepRecord>): number {
  const weights: Record<StepStatus, number> = { todo: 0, running: 0.5, done: 1 };
  const total = WORKFLOW_STEPS.length;
  const earned = WORKFLOW_STEPS.reduce((sum, step) => sum + weights[steps[step.id].status], 0);
  return Math.round((earned / total) * 100);
}

/** 復帰先のステップ。未完了の先頭を返し、すべて完了なら最後のステップを返す。 */
export function currentStep(steps: Record<StepId, StepRecord>): StepId {
  const next = WORKFLOW_STEPS.find((step) => steps[step.id].status !== 'done');
  return (next ?? WORKFLOW_STEPS[WORKFLOW_STEPS.length - 1]).id;
}

/** 依存関係（第4章 4-2 の dependsOn）のうち未完了のもの。 */
export function unmetPrerequisites(
  steps: Record<StepId, StepRecord>,
  stepId: StepId,
): string[] {
  return STEP_BY_ID[stepId].dependsOn
    .filter((dependency) => steps[dependency].status !== 'done')
    .map((dependency) => STEP_BY_ID[dependency].label);
}

/** stale なステップのラベル。提案書プレビューと出力画面の警告に使う（第4章 4-4）。 */
export function staleStepLabels(steps: Record<StepId, StepRecord>): string[] {
  return WORKFLOW_STEPS.filter((step) => steps[step.id].stale).map((step) => step.label);
}

/** stale なステップID。一括再生成の対象。 */
export function staleStepIds(steps: Record<StepId, StepRecord>): StepId[] {
  return WORKFLOW_STEPS.filter((step) => steps[step.id].stale).map((step) => step.id);
}

export interface ProjectFilter {
  query?: string;
  status?: string;
  genre?: string;
}

/**
 * 案件一覧の検索・絞り込み。検索は案件名・ブランド・クライアント・キーワードを
 * 大文字小文字を無視して部分一致で見る。
 */
export function filterProjects(projects: Project[], filter: ProjectFilter): Project[] {
  const query = filter.query?.trim().toLowerCase() ?? '';
  return projects.filter((project) => {
    if (filter.status && filter.status !== 'all' && project.status !== filter.status) {
      return false;
    }
    if (filter.genre && filter.genre !== 'all' && project.genre !== filter.genre) {
      return false;
    }
    if (query.length === 0) return true;
    const haystack = [project.name, project.brand, project.client, ...project.keywords]
      .join(' ')
      .toLowerCase();
    return haystack.includes(query);
  });
}

/** 円建ての金額表示。端数は丸めず整数円で出す。 */
export function formatYen(amount: number): string {
  return `¥${Math.round(amount).toLocaleString('ja-JP')}`;
}

/** ISO 日付（YYYY-MM-DD）を YYYY/MM/DD で表示する。空文字は「未定」。 */
export function formatDate(iso: string): string {
  if (!iso) return '未定';
  const [year, month, day] = iso.split('-');
  if (!year || !month || !day) return iso;
  return `${year}/${month}/${day}`;
}

/** 納期までの日数。過去日は負の数を返す。 */
export function daysUntil(iso: string, today: Date): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  const due = new Date(`${iso}T00:00:00`);
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((due.getTime() - base.getTime()) / 86_400_000);
}

/** 今週（7日以内）に納期を迎える案件。納品済みは除く。 */
export function dueThisWeek(projects: Project[], today: Date): Project[] {
  return projects.filter((project) => {
    if (project.status === 'delivered') return false;
    const days = daysUntil(project.dueDate, today);
    return days >= 0 && days <= 7;
  });
}

/** 衝突しない程度に短いID。永続化層が入るまでの暫定。 */
export function createId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}
