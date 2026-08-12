import { createContext, useContext, useEffect, useState } from 'react';
import type {
  Asset,
  ExportRecord,
  PortfolioWork,
  Project,
  Provenance,
  Run,
  Settings,
  StepId,
  Workspace,
} from '../data/types';
import { pickVariant, type AssetUsage } from '../domain/assets';
import type { AssetBinaryStore } from '../domain/assetStore';
import type { FieldDiff } from '../domain/run';
import type { PersistState } from '../lib/storagePersistence';
import type { ImageCache } from './imageCache';
import type { SaveOutcome } from './persistence';

/** 新規案件フォームが渡す値。未入力の項目は既定値で埋める。 */
export type NewProjectInput = Pick<Project, 'name' | 'client' | 'brand'> &
  Partial<Omit<Project, 'id' | 'name' | 'client' | 'brand' | 'steps' | 'updatedAt'>>;

/**
 * 実行中〜適用待ちの生成ライン（第4章 4-3）。
 * 同一ステップには1本まで。異なるステップの Run は並走を許容し、
 * `${projectId}:${stepId}` をキーに保持する。
 */
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

export function runKey(projectId: string, stepId: StepId): string {
  return `${projectId}:${stepId}`;
}

/** 画像の実体まわりの状態（第7章 7-10／7-11／7-12）。消えたことを黙らせないための情報。 */
export interface AssetStorageState {
  usage: AssetUsage;
  /** 永続化の状態。granted 以外は消えうることを画面で伝える。 */
  persist: PersistState;
  /** 記述子はあるのに実体が取れないアセット。 */
  missingAssetIds: string[];
  /** IndexedDB が使えず、リロードで消える状態か。 */
  ephemeral: boolean;
  /** v2 からの移行結果。移った件数と、移せずに失われた件数。 */
  migration?: { moved: number; failed: number };
}

/** 実体つきでアセットを登録するときの入力（第7章 7-6）。 */
export interface AssetBinaryInput {
  blob: Blob;
  width: number;
  height: number;
  mimeType: string;
}

export interface AppStore {
  projects: Project[];
  workspaces: Record<string, Workspace>;
  provenance: Record<string, Provenance>;
  runs: Run[];
  assets: Record<string, Asset>;
  portfolio: PortfolioWork[];
  settings: Settings;
  pendingRuns: Record<string, PendingRun>;
  /** 直近の保存結果。容量不足を黙って飲み込まないための状態（第6章 6-9）。 */
  saveOutcome: SaveOutcome;

  createProject: (input: NewProjectInput) => Project;
  updateProject: (id: string, patch: Partial<Project>) => void;

  /** 生成を要求する。完了するとそのステップの画面に差分プレビューが出る。 */
  requestRun: (projectId: string, stepId: StepId) => void;
  /** 差分プレビューでの選択切り替え。保護されたフィールドはここで明示的に選ぶ。 */
  toggleRunField: (projectId: string, stepId: StepId, path: string) => void;
  applyRun: (projectId: string, stepId: StepId) => void;
  discardRun: (projectId: string, stepId: StepId) => void;
  /** stale を「確認したが再生成不要」として解除する。上流が再変化したら stale に戻る（第4章 4-4）。 */
  acknowledgeStale: (projectId: string, stepId: StepId) => void;

  /** 手動編集。origin を edited にし、以降その値を再生成から保護する。 */
  editField: (projectId: string, path: string, value: unknown) => void;
  /** コンセプトの採用は利用者の選択であり、生成物ではない（保護対象にしない）。 */
  setAdoptedConcept: (projectId: string, conceptId: string) => void;
  recordExports: (projectId: string, records: ExportRecord[]) => void;

  /** 画像の実体まわりの状態（第7章）。 */
  assetStorage: AssetStorageState;
  /** 解決フェーズ（出力）で実体を取り出すためのストア。 */
  binaryStore: AssetBinaryStore;
  imageCache: ImageCache;

  /**
   * アセットを登録する。実体（原寸）を渡すと保存し、preview を作って添える。
   * 保存できなかった場合は rejected に理由が入る。必ず画面に出すこと（第7章 7-10）。
   */
  registerAsset: (
    asset: Omit<Asset, 'id' | 'createdAt' | 'variants'>,
    binary?: AssetBinaryInput,
  ) => Promise<{ asset: Asset; rejected?: string }>;
  /** 既存アセットに原寸を貼り直す（消失からの復旧導線。第7章 7-11）。 */
  replaceAssetBinary: (
    assetId: string,
    binary: AssetBinaryInput,
  ) => Promise<{ rejected?: string }>;
  /** アセットを削除する。実体（原寸・preview）もまとめて消す。 */
  removeAsset: (assetId: string) => void;
  addPortfolioWork: (work: Omit<PortfolioWork, 'id'>) => void;
  updatePortfolioWork: (workId: string, patch: Partial<PortfolioWork>) => void;
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

/**
 * 画面表示用の画像URL（第7章 7-7）。
 * preview を優先し、無ければ原寸を使う。取れない場合は undefined を返し、
 * 呼び出し側はプレースホルダに落とす（消失の表示は assetStorage.missingAssetIds が担う）。
 */
export function useAssetImage(asset: Asset | undefined): string | undefined {
  const { imageCache } = useAppStore();
  const variant = pickVariant(asset, 'screen');
  const key = variant?.key;
  // キーと一緒に持つ。参照が変わった直後に前の画像を出さないため。
  const [loaded, setLoaded] = useState<{ key: string; url: string } | null>(null);

  useEffect(() => {
    if (!key) return;
    let active = true;
    let retained = false;
    void imageCache.load(key).then((url) => {
      if (!active || !url) return;
      imageCache.retain(key);
      retained = true;
      setLoaded({ key, url });
    });
    return () => {
      active = false;
      // 掴んだ分だけ返す。掴めていないものを release すると他の表示を巻き添えにする。
      if (retained) imageCache.release(key);
    };
  }, [imageCache, key]);

  return loaded && loaded.key === key ? loaded.url : undefined;
}

/** 指定ステップの実行中〜確認待ちの Run。無ければ undefined。 */
export function usePendingRun(projectId: string, stepId: StepId): PendingRun | undefined {
  const { pendingRuns } = useAppStore();
  return pendingRuns[runKey(projectId, stepId)];
}
