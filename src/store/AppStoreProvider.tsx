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
  Asset,
  AssetVariant,
  CropFocus,
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
import { assetUsage, detectMissingAssets } from '../domain/assets';
import { createIndexedDbStore } from '../lib/indexedDbStore';
import { variantKey, type AssetBinaryStore } from '../domain/assetStore';
import { dataUriToBlob, makePreview, measureImage } from '../lib/imageProcessing';
import { requestPersistentStorage, type PersistState } from '../lib/storagePersistence';
import { createImageCache } from './imageCache';
import { readField, sameValue, writeField } from '../domain/fields';
import { acknowledgeStaleRecord, markEdited } from '../domain/provenance';
import { applyValues, buildDiff, defaultSelection } from '../domain/run';
import { WORKFLOW_STEPS, downstreamSteps, inputsHash } from '../domain/steps';
import type { GenerationEngine } from '../engine/types';
import { mockEngine } from '../engine/mockEngine';
import { downloadFile } from '../lib/download';
import { createId } from '../lib/projects';
import {
  AppStoreContext,
  runKey,
  type AppStore,
  type AssetBinaryInput,
  type NewProjectInput,
  type PendingRun,
} from './context';
import { loadState, saveState, writeLegacyRemainder, type SaveOutcome } from './persistence';

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
  binaryStore,
}: {
  children: ReactNode;
  /** 既定はテストダブル。実モデルはここに差し替える（第4章 4-6）。 */
  engine?: GenerationEngine;
  /** 既定は IndexedDB 実装。サーバー実装は同じ契約で差し替える（第7章 7-4）。 */
  binaryStore?: AssetBinaryStore & { persistent?: boolean };
}) {
  const loaded = useMemo(() => loadState(), []);
  const persisted = loaded?.state;
  const [projects, setProjects] = useState<Project[]>(persisted?.projects ?? seedProjects);
  const [workspaces, setWorkspaces] = useState<Record<string, Workspace>>(
    persisted?.workspaces ?? seedWorkspaces,
  );
  const [provenance, setProvenance] = useState<Record<string, Provenance>>(
    persisted?.provenance ?? seedProvenance,
  );
  const [runs, setRuns] = useState<Run[]>(persisted?.runs ?? []);
  const [assets, setAssets] = useState<Record<string, Asset>>(persisted?.assets ?? {});
  const [portfolio, setPortfolio] = useState<PortfolioWork[]>(
    persisted?.portfolio ?? seedPortfolio,
  );
  const [settings, setSettings] = useState<Settings>(persisted?.settings ?? defaultSettings);
  const [pendingRuns, setPendingRuns] = useState<Record<string, PendingRun>>({});
  const [saveOutcome, setSaveOutcome] = useState<SaveOutcome>({ status: 'saved' });
  const reportedStatus = useRef<SaveOutcome['status']>('saved');

  // 画像の実体まわり（第7章）。メタデータは上の assets、実体はこのストアに置く。
  const store = useMemo(() => binaryStore ?? createIndexedDbStore(), [binaryStore]);
  const [missingAssetIds, setMissingAssetIds] = useState<string[]>([]);
  const [persistState, setPersistState] = useState<PersistState>('unsupported');
  const [quotaBytes, setQuotaBytes] = useState<number | undefined>(undefined);
  const [migration, setMigration] = useState<
    { moved: number; unusable: number; pending: number } | undefined
  >(undefined);
  /**
   * まだ移送できていない v2 のサムネイル（第7章 7-12）。
   * 空になるまで v3 の保存を止める。先に v3 を書くと、その時点で旧サムネイルが
   * localStorage から消え、移送できなかった画像は復旧できなくなる。
   */
  const [pendingLegacy, setPendingLegacy] = useState<Record<string, string>>(
    loaded?.legacyThumbnails ?? {},
  );
  const migrationSettled = Object.keys(pendingLegacy).length === 0;

  const markMissingKey = useCallback((key: string) => {
    // キーは `${assetId}:${kind}`。実体が取れないことが消失の観測点（第7章 7-11）。
    const assetId = key.slice(0, key.lastIndexOf(':'));
    setMissingAssetIds((current) =>
      current.includes(assetId) ? current : [...current, assetId],
    );
  }, []);

  const imageCache = useMemo(
    () => createImageCache(store, markMissingKey),
    [markMissingKey, store],
  );

  // 生成完了時に最新の状態で差分を取るための参照。レンダー中には触らない。
  const latest = useRef({
    projects,
    workspaces,
    provenance,
    pendingRuns,
    settings,
    portfolio,
    assets,
  });
  useEffect(() => {
    latest.current = {
      projects,
      workspaces,
      provenance,
      pendingRuns,
      settings,
      portfolio,
      assets,
    };
  });

  useEffect(() => {
    // 移送の決着前は書かない。書けば旧サムネイルを失う（第7章 7-12）。
    if (!migrationSettled) return;

    // 書き込み自体は同期。状態変化のたびに確実に保存する。
    const outcome = saveState({
      projects,
      workspaces,
      provenance,
      runs,
      assets,
      portfolio,
      settings,
    });

    // 結果の通知だけを描画の外へ出す。保存できていないことは必ず画面に出す（第6章 6-9）。
    if (outcome.status !== reportedStatus.current) {
      reportedStatus.current = outcome.status;
      queueMicrotask(() => setSaveOutcome(outcome));
    }
  }, [projects, workspaces, provenance, runs, assets, portfolio, settings, migrationSettled]);

  const refreshUsage = useCallback(() => {
    void store.usage().then((usage) => setQuotaBytes(usage.quotaBytes));
  }, [store]);

  /**
   * 起動時の3点（第7章 7-11／7-12）。
   * 1) 永続化を要求する 2) v2 のサムネイルを実体ストアへ移す 3) メタデータと実体を突き合わせる。
   * どれも結果を状態に残し、画面で伝える。黙って消さない。
   */
  useEffect(() => {
    let active = true;

    void (async () => {
      const persist = await requestPersistentStorage();
      if (!active) return;
      setPersistState(persist);

      const stored = persisted?.assets ?? {};
      const payload = loaded?.legacyPayload;
      const remaining = { ...(loaded?.legacyThumbnails ?? {}) };
      const migrated: Record<string, AssetVariant> = {};
      // データそのものが壊れていて、どうやっても移せないもの（復旧の余地が無い）。
      let unusable = 0;

      // 実体を保持できない環境では移送しない。移せば旧サムネイルを原本から削ることになり、
      // リロードで両方失う。原本を残したまま、書き出しの導線を出すほうが安全。
      const canStore = store.persistent !== false;

      if (canStore && payload) {
        for (const [assetId, dataUri] of Object.entries(remaining)) {
          const blob = dataUriToBlob(dataUri);
          if (!blob) {
            unusable += 1;
            delete remaining[assetId];
            writeLegacyRemainder(payload, remaining);
            continue;
          }

          // 既存サムネイルは preview 規格（長辺800px・JPEG）と一致するので作り直さない。
          const key = variantKey(assetId, 'preview');
          const result = await store.put(key, blob);
          if (!result.ok) continue;

          const size = await measureImage(blob);
          migrated[assetId] = {
            kind: 'preview',
            key,
            width: size?.width ?? 0,
            height: size?.height ?? 0,
            bytes: blob.size,
            mimeType: blob.type || 'image/jpeg',
          };
          // 1件移すたびに原本から削る。使用量は増えず、中断しても残りは原本にある。
          delete remaining[assetId];
          writeLegacyRemainder(payload, remaining);
        }
      }

      if (!active) return;

      const moved = Object.keys(migrated).length;
      const withVariants: Record<string, Asset> = Object.fromEntries(
        Object.entries(stored).map(([id, asset]) => [
          id,
          migrated[id] ? { ...asset, variants: [migrated[id]] } : asset,
        ]),
      );
      if (moved > 0) setAssets(withVariants);
      if (moved > 0 || unusable > 0 || Object.keys(remaining).length > 0) {
        setMigration({ moved, unusable, pending: Object.keys(remaining).length });
      }
      // 残りが空になった時点で v3 の保存が開く。残っている間は原本（v2）のまま。
      setPendingLegacy(remaining);

      // メタデータと実体の突き合わせ。記述子があるのに実体が無いものが消失。
      const keys = await store.list();
      if (!active) return;
      setMissingAssetIds(detectMissingAssets(withVariants, keys));
      refreshUsage();
    })();

    return () => {
      active = false;
    };
    // 起動時に一度だけ。loaded は useMemo で固定されている。
  }, [loaded, persisted, refreshUsage, store]);

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
   * データは消さず、古い可能性があることだけを示す。確認済みの記録は
   * 新しい変更で前提が変わったため破棄する。
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
            next[id] = {
              status: 'done',
              lastRunId: next[id].lastRunId,
              stale: true,
              staleSince: at,
              staleCause: stepId,
            };
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

  /** Run の解決（適用・破棄・失敗の後始末）でステップを実行前の状態へ戻す。 */
  const revertStep = useCallback(
    (projectId: string, stepId: StepId) => {
      patchSteps(projectId, (steps) => ({
        ...steps,
        [stepId]: {
          ...steps[stepId],
          status: steps[stepId].lastRunId ? 'done' : 'todo',
        },
      }));
    },
    [patchSteps],
  );

  const finishRun = useCallback(
    (runId: string, projectId: string, stepId: StepId, values: Record<string, unknown>) => {
      const at = nowIso();
      const key = runKey(projectId, stepId);

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
        setPendingRuns((current) => {
          const next = { ...current };
          delete next[key];
          return next;
        });
        return;
      }

      const workspace = latest.current.workspaces[projectId] ?? emptyWorkspace();
      const prov = latest.current.provenance[projectId] ?? {};
      const diffs = buildDiff(workspace, prov, values);

      setRuns((current) =>
        current.map((run) => (run.id === runId ? { ...run, finishedAt: at } : run)),
      );
      // Run 完了・未適用は独立した状態「確認待ち（review）」（第4章 4-1）。
      patchSteps(projectId, (steps) => ({
        ...steps,
        [stepId]: { ...steps[stepId], status: 'review' },
      }));
      setPendingRuns((current) => ({
        ...current,
        [key]: {
          runId,
          projectId,
          stepId,
          status: 'ready',
          values,
          diffs,
          selected: defaultSelection(diffs),
        },
      }));
    },
    [completeStep, patchSteps],
  );

  const failRun = useCallback(
    (runId: string, projectId: string, stepId: StepId, message: string) => {
      setRuns((current) =>
        current.map((run) =>
          run.id === runId ? { ...run, status: 'failed', finishedAt: nowIso() } : run,
        ),
      );
      // 失敗時は既存データを一切変更せず、ステップの状態を実行前に戻す（第4章 4-3）。
      revertStep(projectId, stepId);
      setPendingRuns((current) => ({
        ...current,
        [runKey(projectId, stepId)]: {
          runId,
          projectId,
          stepId,
          status: 'failed',
          values: {},
          diffs: [],
          selected: [],
          error: message,
        },
      }));
    },
    [revertStep],
  );

  const requestRun = useCallback(
    (projectId: string, stepId: StepId) => {
      // 同一ステップの Run は同時に1本まで。解決（適用・破棄・閉じる）まで再実行不可（第4章 4-3）。
      if (latest.current.pendingRuns[runKey(projectId, stepId)]) return;

      const project = latest.current.projects.find((item) => item.id === projectId);
      if (!project) return;
      const workspace = latest.current.workspaces[projectId] ?? emptyWorkspace();
      const context = {
        settings: latest.current.settings,
        portfolio: latest.current.portfolio,
      };

      const runId = createId('run');
      const run: Run = {
        id: runId,
        projectId,
        stepId,
        startedAt: nowIso(),
        finishedAt: null,
        status: 'running',
        inputsHash: inputsHash(stepId, project, workspace, context),
        engine: engine.id,
      };

      setRuns((current) => [run, ...current].slice(0, RUN_HISTORY_LIMIT));
      patchSteps(projectId, (steps) => ({
        ...steps,
        [stepId]: { ...steps[stepId], status: 'running' },
      }));
      setPendingRuns((current) => ({
        ...current,
        [runKey(projectId, stepId)]: {
          runId,
          projectId,
          stepId,
          status: 'running',
          values: {},
          diffs: [],
          selected: [],
        },
      }));

      engine
        .run({ runId, stepId, project, workspace, ...context })
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
    [engine, failRun, finishRun, patchSteps],
  );

  const toggleRunField = useCallback((projectId: string, stepId: StepId, path: string) => {
    const key = runKey(projectId, stepId);
    setPendingRuns((current) => {
      const run = current[key];
      if (!run) return current;
      return {
        ...current,
        [key]: {
          ...run,
          selected: run.selected.includes(path)
            ? run.selected.filter((item) => item !== path)
            : [...run.selected, path],
        },
      };
    });
  }, []);

  const applyRun = useCallback(
    (projectId: string, stepId: StepId) => {
      const key = runKey(projectId, stepId);
      const run = latest.current.pendingRuns[key];
      if (!run || run.status !== 'ready') return;

      const at = nowIso();
      const before = latest.current.workspaces[projectId] ?? emptyWorkspace();
      const prov = latest.current.provenance[projectId] ?? {};
      const result = applyValues(before, prov, run.values, run.selected, run.runId, at);

      // 値が実際に変わったかどうかで、下流を stale にするかを決める。
      const changed = result.appliedFields.some(
        (path) => !sameValue(readField(before, path), readField(result.workspace, path)),
      );

      setWorkspaces((current) => ({ ...current, [projectId]: result.workspace }));
      setProvenance((current) => ({ ...current, [projectId]: result.provenance }));
      setRuns((current) =>
        current.map((item) =>
          item.id === run.runId
            ? {
                ...item,
                status: 'applied',
                finishedAt: at,
                appliedFields: result.appliedFields,
              }
            : item,
        ),
      );
      completeStep(projectId, stepId, run.runId);
      if (changed) cascadeStale(projectId, stepId);
      setPendingRuns((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
    },
    [cascadeStale, completeStep],
  );

  const discardRun = useCallback(
    (projectId: string, stepId: StepId) => {
      const key = runKey(projectId, stepId);
      const run = latest.current.pendingRuns[key];
      if (!run) return;

      setRuns((current) =>
        current.map((item) =>
          item.id === run.runId && item.status === 'running'
            ? { ...item, status: 'discarded', finishedAt: nowIso() }
            : item,
        ),
      );
      revertStep(projectId, stepId);
      setPendingRuns((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
    },
    [revertStep],
  );

  const acknowledgeStale = useCallback(
    (projectId: string, stepId: StepId) => {
      const at = nowIso();
      patchSteps(projectId, (steps) => ({
        ...steps,
        [stepId]: acknowledgeStaleRecord(steps[stepId], at),
      }));
    },
    [patchSteps],
  );

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

  /**
   * 切り出し位置の指定（第8章 8-7）。生成物ではなく利用者の指定なので provenance では扱わず、
   * 下流を stale にもしない（本文は変わらない）。null で既定（上寄せ）へ戻す。
   */
  const setCropFocus = useCallback(
    (projectId: string, key: string, focus: CropFocus | null) => {
      setWorkspaces((current) => {
        const workspace = current[projectId] ?? emptyWorkspace();
        const crops = { ...workspace.crops };
        if (focus) crops[key] = focus;
        else delete crops[key];
        return { ...current, [projectId]: { ...workspace, crops } };
      });
    },
    [],
  );

  /**
   * 枠に載せる項目の選択（第8章 8-7）。切り出し位置と同じく利用者の判断なので、
   * provenance では扱わず、下流も stale にしない（本文は変わらない）。
   */
  const setSlotPicks = useCallback((projectId: string, slotId: string, ids: string[]) => {
    setWorkspaces((current) => {
      const workspace = current[projectId] ?? emptyWorkspace();
      const picks = { ...workspace.picks };
      if (ids.length > 0) picks[slotId] = ids;
      else delete picks[slotId];
      return { ...current, [projectId]: { ...workspace, picks } };
    });
  }, []);

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

  /**
   * 実体を保存し、variant の記述子を作る（第7章 7-6）。
   * 原寸を保存し、続けて preview を作る。preview の生成に失敗しても原寸は残す。
   */
  const storeBinaries = useCallback(
    async (assetId: string, binary: AssetBinaryInput) => {
      const originalKey = variantKey(assetId, 'original');
      const stored = await store.put(originalKey, binary.blob);
      if (!stored.ok) return { variants: [] as AssetVariant[], rejected: stored.reason };

      const variants: AssetVariant[] = [
        {
          kind: 'original',
          key: originalKey,
          width: binary.width,
          height: binary.height,
          bytes: binary.blob.size,
          mimeType: binary.mimeType,
        },
      ];

      const preview = await makePreview(binary.blob);
      if (preview) {
        const previewKey = variantKey(assetId, 'preview');
        const savedPreview = await store.put(previewKey, preview.blob);
        if (savedPreview.ok) {
          variants.push({
            kind: 'preview',
            key: previewKey,
            width: preview.width,
            height: preview.height,
            bytes: preview.blob.size,
            mimeType: preview.mimeType,
          });
        }
      }

      return { variants, rejected: undefined };
    },
    [store],
  );

  const registerAsset = useCallback(
    async (input: Omit<Asset, 'id' | 'createdAt' | 'variants'>, binary?: AssetBinaryInput) => {
      const id = createId('ast');
      // 保存できなかった場合は理由を返し、呼び出し側が必ず利用者に見せる（第7章 7-10）。
      const outcome = binary
        ? await storeBinaries(id, binary)
        : { variants: [] as AssetVariant[], rejected: undefined };

      const asset: Asset = {
        ...input,
        id,
        createdAt: nowIso(),
        variants: outcome.variants,
      };
      setAssets((current) => ({ ...current, [asset.id]: asset }));
      refreshUsage();
      return { asset, rejected: outcome.rejected };
    },
    [refreshUsage, storeBinaries],
  );

  /** 消失したアセットに原寸を貼り直す（第7章 7-11 の再登録導線）。参照は保持したまま復旧する。 */
  const replaceAssetBinary = useCallback(
    async (assetId: string, binary: AssetBinaryInput) => {
      const outcome = await storeBinaries(assetId, binary);
      if (outcome.rejected) return { rejected: outcome.rejected };

      for (const variant of outcome.variants) imageCache.forget(variant.key);
      setAssets((current) => {
        const asset = current[assetId];
        if (!asset) return current;
        return { ...current, [assetId]: { ...asset, variants: outcome.variants } };
      });
      setMissingAssetIds((current) => current.filter((id) => id !== assetId));
      refreshUsage();
      return {};
    },
    [imageCache, refreshUsage, storeBinaries],
  );

  const removeAsset = useCallback(
    (assetId: string) => {
      const asset = latest.current.assets[assetId];
      for (const variant of asset?.variants ?? []) {
        imageCache.forget(variant.key);
        void store.delete(variant.key);
      }
      setAssets((current) => {
        const next = { ...current };
        delete next[assetId];
        return next;
      });
      // 参照している側からも外す。参照だけが残ると、解決できない assetId が漂う（第7章 7-6）。
      setWorkspaces((current) =>
        Object.fromEntries(
          Object.entries(current).map(([projectId, workspace]) => [
            projectId,
            {
              ...workspace,
              moodboard: workspace.moodboard.map((tile) =>
                tile.assetId === assetId ? { ...tile, assetId: null } : tile,
              ),
              shots: workspace.shots.map((shot) =>
                shot.assetId === assetId ? { ...shot, assetId: null } : shot,
              ),
            },
          ]),
        ),
      );
      setPortfolio((current) =>
        current.map((work) => (work.assetId === assetId ? { ...work, assetId: null } : work)),
      );
      setMissingAssetIds((current) => current.filter((id) => id !== assetId));
      refreshUsage();
    },
    [imageCache, refreshUsage, store],
  );

  /**
   * 移送できない画像の出口（第7章 7-12）。
   * 保存先の空きが無い等で移せないまま止まると、それ以降なにも保存されない。
   * 手元へ書き出してから手放せるようにして、行き止まりを作らない。
   */
  const exportPendingLegacyAssets = useCallback(async () => {
    for (const [assetId, dataUri] of Object.entries(pendingLegacy)) {
      const blob = dataUriToBlob(dataUri);
      if (!blob) continue;
      const extension = blob.type === 'image/png' ? 'png' : 'jpg';
      const bytes = new Uint8Array(await blob.arrayBuffer());
      downloadFile(`${assetId}.${extension}`, bytes, blob.type || 'image/jpeg');
    }
  }, [pendingLegacy]);

  const discardPendingLegacyAssets = useCallback(() => {
    // 原本から残りを落とす。この直後に保存が開き、v3 で上書きされる。
    if (loaded?.legacyPayload) writeLegacyRemainder(loaded.legacyPayload, {});
    setPendingLegacy({});
  }, [loaded]);

  const addPortfolioWork = useCallback((work: Omit<PortfolioWork, 'id'>) => {
    setPortfolio((current) => [{ ...work, id: createId('wrk') }, ...current]);
  }, []);

  const updatePortfolioWork = useCallback((workId: string, patch: Partial<PortfolioWork>) => {
    setPortfolio((current) =>
      current.map((work) => (work.id === workId ? { ...work, ...patch } : work)),
    );
  }, []);

  const removePortfolioWork = useCallback((workId: string) => {
    setPortfolio((current) => current.filter((work) => work.id !== workId));
  }, []);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((current) => ({ ...current, ...patch }));
  }, []);

  const assetStorage = useMemo(
    () => ({
      usage: assetUsage(assets, missingAssetIds, quotaBytes),
      persist: persistState,
      missingAssetIds,
      // IndexedDB が使えない環境ではメモリ実装に落ちており、リロードで消える。
      ephemeral: store.persistent === false,
      migration,
      pendingLegacyAssetIds: Object.keys(pendingLegacy),
    }),
    [assets, migration, missingAssetIds, pendingLegacy, persistState, quotaBytes, store],
  );

  const value = useMemo<AppStore>(
    () => ({
      projects,
      workspaces,
      provenance,
      runs,
      assets,
      portfolio,
      settings,
      pendingRuns,
      saveOutcome,
      createProject,
      updateProject,
      requestRun,
      toggleRunField,
      applyRun,
      discardRun,
      acknowledgeStale,
      editField,
      setAdoptedConcept,
      setCropFocus,
      setSlotPicks,
      recordExports,
      assetStorage,
      binaryStore: store,
      imageCache,
      registerAsset,
      replaceAssetBinary,
      removeAsset,
      exportPendingLegacyAssets,
      discardPendingLegacyAssets,
      addPortfolioWork,
      updatePortfolioWork,
      removePortfolioWork,
      updateSettings,
    }),
    [
      projects,
      workspaces,
      provenance,
      runs,
      assets,
      portfolio,
      settings,
      pendingRuns,
      saveOutcome,
      createProject,
      updateProject,
      requestRun,
      toggleRunField,
      applyRun,
      discardRun,
      acknowledgeStale,
      editField,
      setAdoptedConcept,
      setCropFocus,
      setSlotPicks,
      recordExports,
      assetStorage,
      store,
      imageCache,
      registerAsset,
      replaceAssetBinary,
      removeAsset,
      exportPendingLegacyAssets,
      discardPendingLegacyAssets,
      addPortfolioWork,
      updatePortfolioWork,
      removePortfolioWork,
      updateSettings,
    ],
  );

  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>;
}
