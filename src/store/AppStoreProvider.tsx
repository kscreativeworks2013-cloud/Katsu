import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  defaultSettings,
  seedPortfolio,
  seedProjects,
  seedProvenance,
  seedWorkspaces,
} from '../data/fixtures';
import { emptyWorkspace } from '../data/generate';
import type {
  ExportRecord,
  PortfolioWork,
  Project,
  Provenance,
  Run,
  Settings,
  StepId,
  StepRecord,
  Workspace,
} from '../data/types';
import { readField, sameValue, writeField } from '../domain/fields';
import { markEdited } from '../domain/provenance';
import { applyValues, buildDiff, defaultSelection } from '../domain/run';
import { WORKFLOW_STEPS, downstreamSteps, inputsHash } from '../domain/steps';
import type { GenerationEngine } from '../engine/types';
import { mockEngine } from '../engine/mockEngine';
import { createId } from '../lib/projects';
import {
  AppStoreContext,
  type AppStore,
  type NewProjectInput,
  type PendingRun,
} from './context';
import { loadState, saveState } from './persistence';

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

/** Run 履歴の保持件数。localStorage を無制限に太らせない。 */
const RUN_HISTORY_LIMIT = 50;

function todoSteps(): Record<StepId, StepRecord> {
  return Object.fromEntries(
    WORKFLOW_STEPS.map((step) => [step.id, { status: 'todo', lastRunId: null, stale: false }]),
  ) as Record<StepId, StepRecord>;
}

function nowIso(): string {
  return new Date().toISOString();
}

function todayIso(): string {
  return nowIso().slice(0, 10);
}

/** フィールドパスを出力しているステップ。手動編集時の stale 伝播の起点になる。 */
function ownerStep(path: string): StepId | undefined {
  return WORKFLOW_STEPS.find((step) => step.outputFields.includes(path))?.id;
}

export function AppStoreProvider({
  children,
  engine = mockEngine,
}: {
  children: ReactNode;
  /** 既定はテストダブル。実モデルはここに差し替える（第4章 4-6）。 */
  engine?: GenerationEngine;
}) {
  const persisted = useMemo(() => loadState(), []);
  const [projects, setProjects] = useState<Project[]>(persisted?.projects ?? seedProjects);
  const [workspaces, setWorkspaces] = useState<Record<string, Workspace>>(
    persisted?.workspaces ?? seedWorkspaces,
  );
  const [provenance, setProvenance] = useState<Record<string, Provenance>>(
    persisted?.provenance ?? seedProvenance,
  );
  const [runs, setRuns] = useState<Run[]>(persisted?.runs ?? []);
  const [portfolio, setPortfolio] = useState<PortfolioWork[]>(
    persisted?.portfolio ?? seedPortfolio,
  );
  const [settings, setSettings] = useState<Settings>(persisted?.settings ?? defaultSettings);
  const [pendingRun, setPendingRun] = useState<PendingRun | null>(null);

  // 生成完了時に最新の状態で差分を取るための参照。レンダー中には触らない。
  const latest = useRef({ projects, workspaces, provenance });
  useEffect(() => {
    latest.current = { projects, workspaces, provenance };
  });

  useEffect(() => {
    saveState({ projects, workspaces, provenance, runs, portfolio, settings });
  }, [projects, workspaces, provenance, runs, portfolio, settings]);

  const patchSteps = useCallback(
    (
      projectId: string,
      patch: (steps: Record<StepId, StepRecord>) => Record<StepId, StepRecord>,
    ) => {
      setProjects((current) =>
        current.map((project) =>
          project.id === projectId
            ? { ...project, steps: patch(project.steps), updatedAt: todayIso() }
            : project,
        ),
      );
    },
    [],
  );

  /**
   * 上流が変わったときに下流を stale にする（第4章 4-4 選択肢B）。
   * データは消さず、古い可能性があることだけを示す。
   */
  const cascadeStale = useCallback(
    (projectId: string, stepId: StepId) => {
      const affected = downstreamSteps(stepId);
      if (affected.length === 0) return;
      const at = nowIso();
      patchSteps(projectId, (steps) => {
        const next = { ...steps };
        for (const id of affected) {
          if (next[id].status === 'done' && !next[id].stale) {
            next[id] = { ...next[id], stale: true, staleSince: at, staleCause: stepId };
          }
        }
        return next;
      });
    },
    [patchSteps],
  );

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
      steps: todoSteps(),
      updatedAt: todayIso(),
    };
    setProjects((current) => [project, ...current]);
    setWorkspaces((current) => ({ ...current, [project.id]: emptyWorkspace() }));
    setProvenance((current) => ({ ...current, [project.id]: {} }));
    return project;
  }, []);

  const updateProject = useCallback((id: string, patch: Partial<Project>) => {
    setProjects((current) =>
      current.map((project) =>
        project.id === id ? { ...project, ...patch, updatedAt: todayIso() } : project,
      ),
    );
  }, []);

  /** ステップを完了にする。Run の適用と、出力を持たないステップの完了で共有する。 */
  const completeStep = useCallback((projectId: string, stepId: StepId, runId: string) => {
    setProjects((current) =>
      current.map((project) =>
        project.id === projectId
          ? {
              ...project,
              status: project.status === 'draft' ? 'in_progress' : project.status,
              steps: {
                ...project.steps,
                [stepId]: { status: 'done', lastRunId: runId, stale: false },
              },
              updatedAt: todayIso(),
            }
          : project,
      ),
    );
  }, []);

  const finishRun = useCallback(
    (runId: string, projectId: string, stepId: StepId, values: Record<string, unknown>) => {
      const at = nowIso();

      // 出力フィールドを持たないステップ（提案書・出力）は差分が生じないので、
      // プレビューを挟まずそのまま完了にする。
      if (Object.keys(values).length === 0) {
        setRuns((current) =>
          current.map((run) =>
            run.id === runId
              ? { ...run, status: 'applied', finishedAt: at, appliedFields: [] }
              : run,
          ),
        );
        completeStep(projectId, stepId, runId);
        setPendingRun(null);
        return;
      }

      const workspace = latest.current.workspaces[projectId] ?? emptyWorkspace();
      const prov = latest.current.provenance[projectId] ?? {};
      const diffs = buildDiff(workspace, prov, values);

      setRuns((current) =>
        current.map((run) => (run.id === runId ? { ...run, finishedAt: at } : run)),
      );
      setPendingRun({
        runId,
        projectId,
        stepId,
        status: 'ready',
        values,
        diffs,
        selected: defaultSelection(diffs),
      });
    },
    [completeStep],
  );

  const failRun = useCallback(
    (runId: string, projectId: string, stepId: StepId, message: string) => {
      setRuns((current) =>
        current.map((run) =>
          run.id === runId ? { ...run, status: 'failed', finishedAt: nowIso() } : run,
        ),
      );
      // 失敗時は既存データを一切変更せず、ステップの状態を実行前に戻す（第4章 4-3）。
      patchSteps(projectId, (steps) => ({
        ...steps,
        [stepId]: {
          ...steps[stepId],
          status: steps[stepId].lastRunId ? 'done' : 'todo',
        },
      }));
      setPendingRun({
        runId,
        projectId,
        stepId,
        status: 'failed',
        values: {},
        diffs: [],
        selected: [],
        error: message,
      });
    },
    [patchSteps],
  );

  const requestRun = useCallback(
    (projectId: string, stepId: StepId) => {
      if (pendingRun?.status === 'running') return;

      const project = latest.current.projects.find((item) => item.id === projectId);
      if (!project) return;
      const workspace = latest.current.workspaces[projectId] ?? emptyWorkspace();

      const runId = createId('run');
      const run: Run = {
        id: runId,
        projectId,
        stepId,
        startedAt: nowIso(),
        finishedAt: null,
        status: 'running',
        inputsHash: inputsHash(stepId, project, workspace),
        engine: engine.id,
      };

      setRuns((current) => [run, ...current].slice(0, RUN_HISTORY_LIMIT));
      patchSteps(projectId, (steps) => ({
        ...steps,
        [stepId]: { ...steps[stepId], status: 'running' },
      }));
      setPendingRun({
        runId,
        projectId,
        stepId,
        status: 'running',
        values: {},
        diffs: [],
        selected: [],
      });

      engine
        .run({ runId, stepId, project, workspace })
        .then((result) => finishRun(runId, projectId, stepId, result.values))
        .catch((error: unknown) =>
          failRun(
            runId,
            projectId,
            stepId,
            error instanceof Error ? error.message : '生成に失敗しました',
          ),
        );
    },
    [engine, failRun, finishRun, patchSteps, pendingRun],
  );

  const toggleRunField = useCallback((path: string) => {
    setPendingRun((current) =>
      current === null
        ? current
        : {
            ...current,
            selected: current.selected.includes(path)
              ? current.selected.filter((item) => item !== path)
              : [...current.selected, path],
          },
    );
  }, []);

  const applyRun = useCallback(() => {
    const run = pendingRun;
    if (!run || run.status !== 'ready') return;

    const at = nowIso();
    const before = latest.current.workspaces[run.projectId] ?? emptyWorkspace();
    const prov = latest.current.provenance[run.projectId] ?? {};
    const result = applyValues(before, prov, run.values, run.selected, run.runId, at);

    // 値が実際に変わったかどうかで、下流を stale にするかを決める。
    const changed = result.appliedFields.some(
      (path) => !sameValue(readField(before, path), readField(result.workspace, path)),
    );

    setWorkspaces((current) => ({ ...current, [run.projectId]: result.workspace }));
    setProvenance((current) => ({ ...current, [run.projectId]: result.provenance }));
    setRuns((current) =>
      current.map((item) =>
        item.id === run.runId
          ? { ...item, status: 'applied', finishedAt: at, appliedFields: result.appliedFields }
          : item,
      ),
    );

    completeStep(run.projectId, run.stepId, run.runId);
    if (changed) cascadeStale(run.projectId, run.stepId);
    setPendingRun(null);
  }, [cascadeStale, completeStep, pendingRun]);

  const discardRun = useCallback(() => {
    const run = pendingRun;
    if (!run) return;

    setRuns((current) =>
      current.map((item) =>
        item.id === run.runId && item.status === 'running'
          ? { ...item, status: 'discarded', finishedAt: nowIso() }
          : item,
      ),
    );
    patchSteps(run.projectId, (steps) => ({
      ...steps,
      [run.stepId]: {
        ...steps[run.stepId],
        status: steps[run.stepId].lastRunId ? 'done' : 'todo',
      },
    }));
    setPendingRun(null);
  }, [patchSteps, pendingRun]);

  const editField = useCallback(
    (projectId: string, path: string, value: unknown) => {
      const before = latest.current.workspaces[projectId] ?? emptyWorkspace();
      if (sameValue(readField(before, path), value)) return;

      setWorkspaces((current) => ({
        ...current,
        [projectId]: writeField(current[projectId] ?? emptyWorkspace(), path, value),
      }));
      setProvenance((current) => ({
        ...current,
        [projectId]: markEdited(current[projectId] ?? {}, path, nowIso()),
      }));

      // 手動編集も下流の入力を変える。生成と同じく stale を伝播させる。
      const owner = ownerStep(path);
      if (owner) cascadeStale(projectId, owner);
    },
    [cascadeStale],
  );

  const setAdoptedConcept = useCallback(
    (projectId: string, conceptId: string) => {
      setWorkspaces((current) => ({
        ...current,
        [projectId]: {
          ...(current[projectId] ?? emptyWorkspace()),
          adoptedConceptId: conceptId,
        },
      }));
      // 採用案はムードボード以降の入力なので、下流は stale にする。
      cascadeStale(projectId, 'concepts');
    },
    [cascadeStale],
  );

  const recordExports = useCallback(
    (projectId: string, records: ExportRecord[]) => {
      setWorkspaces((current) => {
        const workspace = current[projectId] ?? emptyWorkspace();
        return {
          ...current,
          [projectId]: { ...workspace, exports: [...records, ...workspace.exports] },
        };
      });
      patchSteps(projectId, (steps) => ({
        ...steps,
        export: { ...steps.export, status: 'done', stale: false },
      }));
    },
    [patchSteps],
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
      provenance,
      runs,
      portfolio,
      settings,
      pendingRun,
      createProject,
      updateProject,
      requestRun,
      toggleRunField,
      applyRun,
      discardRun,
      editField,
      setAdoptedConcept,
      recordExports,
      addPortfolioWork,
      removePortfolioWork,
      updateSettings,
    }),
    [
      projects,
      workspaces,
      provenance,
      runs,
      portfolio,
      settings,
      pendingRun,
      createProject,
      updateProject,
      requestRun,
      toggleRunField,
      applyRun,
      discardRun,
      editField,
      setAdoptedConcept,
      recordExports,
      addPortfolioWork,
      removePortfolioWork,
      updateSettings,
    ],
  );

  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>;
}
