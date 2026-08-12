import { createContext, useContext } from 'react';
import type {
  PortfolioWork,
  Project,
  Settings,
  StepId,
  StepStatus,
  Workspace,
} from '../data/types';

/** 新規案件フォームが渡す値。未入力の項目は既定値で埋める。 */
export type NewProjectInput = Pick<Project, 'name' | 'client' | 'brand'> &
  Partial<Omit<Project, 'id' | 'name' | 'client' | 'brand' | 'steps' | 'updatedAt'>>;

export interface AppStore {
  projects: Project[];
  workspaces: Record<string, Workspace>;
  portfolio: PortfolioWork[];
  settings: Settings;
  /** 実行中の生成処理を `${projectId}:${stepId}` で保持する。 */
  generating: string | null;

  createProject: (input: NewProjectInput) => Project;
  updateProject: (id: string, patch: Partial<Project>) => void;
  setStepStatus: (id: string, step: StepId, status: StepStatus) => void;
  updateWorkspace: (id: string, patch: Partial<Workspace>) => void;
  /** AIワークフローのステップ実行。現時点では生成をモックし、状態遷移だけを本物にしている。 */
  runStep: (id: string, step: StepId) => void;
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

/** 案件と、その案件のワークスペースをまとめて取り出す。 */
export function useProject(projectId: string | undefined): {
  project: Project | undefined;
  workspace: Workspace | undefined;
} {
  const { projects, workspaces } = useAppStore();
  if (!projectId) return { project: undefined, workspace: undefined };
  return {
    project: projects.find((item) => item.id === projectId),
    workspace: workspaces[projectId],
  };
}
