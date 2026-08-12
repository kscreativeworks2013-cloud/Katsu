import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { defaultSettings, seedPortfolio, seedProjects, seedWorkspaces } from '../data/fixtures';
import {
  emptyWorkspace,
  generateBrand,
  generateCompetitors,
  generateConcepts,
  generateMoodboard,
  generatePrompt,
  generateShots,
} from '../data/generate';
import type {
  PortfolioWork,
  Project,
  Settings,
  StepId,
  StepStatus,
  Workspace,
} from '../data/types';
import { PROMPT_TARGETS } from '../data/workflow';
import { createId } from '../lib/projects';
import { AppStoreContext, type AppStore, type NewProjectInput } from './context';

/** 生成中の表示を確認できる程度の待ち時間。実AI接続時はこの待ちが実処理に置き換わる。 */
export const GENERATION_MS = 600;

const EMPTY_CREATIVE: Project['creative'] = {
  worldview: '',
  palette: [],
  lighting: '',
  lens: '',
  composition: '',
  staging: '',
  texture: '',
  retouch: '',
};

const EMPTY_PRODUCTION: Project['production'] = {
  shootDays: 1,
  location: '',
  models: 1,
  hairMakeup: '',
  stylist: '',
  gear: '',
  delivery: '',
};

const TODO_STEPS: Record<StepId, StepStatus> = {
  brand: 'todo',
  competitors: 'todo',
  concepts: 'todo',
  moodboard: 'todo',
  shots: 'todo',
  prompts: 'todo',
  proposal: 'todo',
  export: 'todo',
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<Project[]>(seedProjects);
  const [workspaces, setWorkspaces] = useState<Record<string, Workspace>>(seedWorkspaces);
  const [portfolio, setPortfolio] = useState<PortfolioWork[]>(seedPortfolio);
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [generating, setGenerating] = useState<string | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // アンマウント後に生成完了が走らないよう、保留中のタイマーを片付ける。
  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending) clearTimeout(timer);
    };
  }, []);

  const patchProject = useCallback((id: string, patch: Partial<Project>) => {
    setProjects((current) =>
      current.map((project) =>
        project.id === id ? { ...project, ...patch, updatedAt: todayIso() } : project,
      ),
    );
  }, []);

  const createProject = useCallback((input: NewProjectInput) => {
    const project: Project = {
      genre: 'ビューティー',
      purposes: [],
      proposalDate: todayIso(),
      dueDate: '',
      budget: 0,
      language: 'ja',
      status: 'draft',
      brandUrl: '',
      brandConcept: '',
      targetCustomer: '',
      competitorNames: [],
      productName: '',
      keywords: [],
      mustCuts: [],
      ngNotes: [],
      references: [],
      outputs: [],
      creative: EMPTY_CREATIVE,
      production: EMPTY_PRODUCTION,
      ...input,
      id: createId('prj'),
      steps: { ...TODO_STEPS },
      updatedAt: todayIso(),
    };
    setProjects((current) => [project, ...current]);
    setWorkspaces((current) => ({ ...current, [project.id]: emptyWorkspace() }));
    return project;
  }, []);

  const setStepStatus = useCallback((id: string, step: StepId, status: StepStatus) => {
    setProjects((current) =>
      current.map((project) =>
        project.id === id
          ? {
              ...project,
              steps: { ...project.steps, [step]: status },
              status: project.status === 'draft' ? 'in_progress' : project.status,
              updatedAt: todayIso(),
            }
          : project,
      ),
    );
  }, []);

  const updateWorkspace = useCallback((id: string, patch: Partial<Workspace>) => {
    setWorkspaces((current) => ({
      ...current,
      [id]: { ...(current[id] ?? emptyWorkspace()), ...patch },
    }));
  }, []);

  const runStep = useCallback(
    (id: string, step: StepId) => {
      // 生成の入力は「実行を押した時点の案件」。実AI接続後も同じ扱いにする。
      const project = projects.find((item) => item.id === id);
      if (!project) return;

      setStepStatus(id, step, 'in_progress');
      setGenerating(`${id}:${step}`);

      const timer = setTimeout(() => {
        setWorkspaces((current) => ({
          ...current,
          [id]: applyStep(project, current[id] ?? emptyWorkspace(), step),
        }));
        setStepStatus(id, step, 'done');
        setGenerating(null);
      }, GENERATION_MS);

      timers.current.push(timer);
    },
    [projects, setStepStatus],
  );

  const addPortfolioWork = useCallback((work: Omit<PortfolioWork, 'id'>) => {
    setPortfolio((current) => [{ ...work, id: createId('wrk') }, ...current]);
  }, []);

  const removePortfolioWork = useCallback((workId: string) => {
    setPortfolio((current) => current.filter((work) => work.id !== workId));
  }, []);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((current) => ({ ...current, ...patch }));
  }, []);

  const value = useMemo<AppStore>(
    () => ({
      projects,
      workspaces,
      portfolio,
      settings,
      generating,
      createProject,
      updateProject: patchProject,
      setStepStatus,
      updateWorkspace,
      runStep,
      addPortfolioWork,
      removePortfolioWork,
      updateSettings,
    }),
    [
      projects,
      workspaces,
      portfolio,
      settings,
      generating,
      createProject,
      patchProject,
      setStepStatus,
      updateWorkspace,
      runStep,
      addPortfolioWork,
      removePortfolioWork,
      updateSettings,
    ],
  );

  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>;
}

/** ステップごとの生成結果をワークスペースへ反映する。既存の手動編集は上書きしない。 */
function applyStep(project: Project, workspace: Workspace, step: StepId): Workspace {
  switch (step) {
    case 'brand':
      return { ...workspace, brand: workspace.brand ?? generateBrand(project) };
    case 'competitors': {
      if (workspace.competitors.length > 0) return workspace;
      const { competitors, differentiators } = generateCompetitors(project);
      return { ...workspace, competitors, differentiators };
    }
    case 'concepts':
      return workspace.concepts.length > 0
        ? workspace
        : { ...workspace, concepts: generateConcepts(project) };
    case 'moodboard':
      return workspace.moodboard.length > 0
        ? workspace
        : { ...workspace, moodboard: generateMoodboard(project) };
    case 'shots':
      return workspace.shots.length > 0
        ? workspace
        : { ...workspace, shots: generateShots(project) };
    case 'prompts': {
      const prompts = { ...workspace.prompts };
      for (const target of PROMPT_TARGETS) {
        prompts[target.id] ??= generatePrompt(project, workspace, target.id);
      }
      return { ...workspace, prompts };
    }
    default:
      return workspace;
  }
}
