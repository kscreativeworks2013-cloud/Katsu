/*
 * 生成エンジンのインターフェース（第4章 4-6）。
 * 実モデル呼び出しとテストダブルはこのインターフェースを共有する。アプリはエンジンを
 * 注入で受け取り、既定はテストダブル。単体・コンポーネントテストとCIは常にテストダブルを使う。
 */

import type { PortfolioWork, Project, Settings, StepId, Workspace } from '../data/types';

export interface RunRequest {
  runId: string;
  stepId: StepId;
  project: Project;
  workspace: Workspace;
  /** 案件に紐づかない全体入力（見積もり単価、引用元の作品）。 */
  settings: Settings;
  portfolio: PortfolioWork[];
}

export interface RunResult {
  runId: string;
  /** フィールドパスをキーにした提案値。ステップの outputFields 以外を含めてはならない。 */
  values: Record<string, unknown>;
}

export interface GenerationEngine {
  /** ログと Run 履歴に残す識別子。 */
  id: string;
  run: (request: RunRequest, options?: RunOptions) => Promise<RunResult>;
}

export interface RunOptions {
  /**
   * ストリーミングは本フェーズでは採用しない（第4章 4-5）。
   * 将来採用する際の受け口だけ開けてあり、現在どのエンジンも呼び出さない。
   */
  onProgress?: (chunk: { path: string; partial: unknown }) => void;
  signal?: AbortSignal;
}
