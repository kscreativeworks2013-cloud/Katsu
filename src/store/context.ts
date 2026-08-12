import { createContext, useContext } from 'react';
import type {
  ExportRecord,
  PortfolioWork,
  Project,
  Provenance,
  Run,
  Settings,
  StepId,
  Workspace,
} from '../data/types';
import type { FieldDiff } from '../domain/run';

/** 新規案件フォームが渡す値。未入力の項目は既定値で埋める。 */
export type NewProjectInput = Pick<Project, 'name' | 'client' | 'brand'> &
  Partial<Omit<Project, 'id' | 'name' | 'client' | 'brand' | 'steps' | 'updatedAt'>>;

/** 実行中〜適用待ちの生成ライン（第4章 4-3）。同時に1本だけ走る。 */
export interface PendingRun {
  runId: string;
  projectId: string;
  stepId: StepId;
  status: 'running' | 'ready' | 'failed';
  /** 提案値。適用するまで Workspace には書き込まない。 */
  values: Record<string, unknown>;
  diffs: FieldDiff[];
  /** 適用対象として選択されているフィールドパス。 */
  selected: string[];
  error?: string;
}

export interface AppStore {
  projects: Project[];
  workspaces: Record<string, Workspace>;
  provenance: Record<string, Provenance>;
  runs: Run[];
  portfolio: PortfolioWork[];
  settings: Settings;
  pendingRun: PendingRun | null;

  createProject: (input: NewProjectInput) => Project;
  updateProject: (id: string, patch: Partial<Project>) => void;

  /** 生成を要求する。完了すると差分プレビューが出る（変更が無ければ自動適用）。 */
  requestRun: (projectId: string, stepId: StepId) => void;
  /** 差分プレビューでの選択切り替え。保護されたフィールドはここで明示的に選ぶ。 */
  toggleRunField: (path: string) => void;
  applyRun: () => void;
  discardRun: () => void;

  /** 手動編集。origin を edited にし、以降その値を再生成から保護する。 */
  editField: (projectId: string, path: string, value: unknown) => void;
  /** コンセプトの採用は利用者の選択であり、生成物ではない（保護対象にしない）。 */
  setAdoptedConcept: (projectId: string, conceptId: string) => void;
  recordExports: (projectId: string, records: ExportRecord[]) => void;

  addPortfolioWork: (work: Omit<PortfolioWork, 'id'>) => void;
  removePortfolioWork: (workId: string) => void;
  updateSettings: (patch: Partial<Settings>) => void;
}

export const AppStoreContext = createContext<AppStore | null>(null);

export function useAppStore(): AppStore {
  const store = useContext(AppStoreContext);
  if (!store) throw new Error('useAppStore は <AppStoreProvider> の内側でのみ使える');
  return store;
}

/** 案件と、その案件のワークスペース・provenance をまとめて取り出す。 */
export function useProject(projectId: string | undefined): {
  project: Project | undefined;
  workspace: Workspace | undefined;
  provenance: Provenance;
} {
  const { projects, workspaces, provenance } = useAppStore();
  if (!projectId) return { project: undefined, workspace: undefined, provenance: {} };
  return {
    project: projects.find((item) => item.id === projectId),
    workspace: workspaces[projectId],
    provenance: provenance[projectId] ?? {},
  };
}

/** 指定ステップが生成中か。 */
export function useIsRunning(projectId: string, stepId: StepId): boolean {
  const { pendingRun } = useAppStore();
  return (
    pendingRun?.projectId === projectId &&
    pendingRun.stepId === stepId &&
    pendingRun.status === 'running'
  );
}
