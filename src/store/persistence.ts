/*
 * localStorage への永続化（第4章 4-7、第5章 5-1、第7章 7-4）。
 * ここに載るのはメタデータだけで、画像の実体は AssetBinaryStore（IndexedDB）にある。
 * 保存に失敗してもアプリは止めないが、失敗したことは必ず画面に出す。
 * サーバー側の永続化とマルチユーザーの同時編集はスコープ外。
 */

import type {
  Asset,
  PortfolioWork,
  Project,
  Provenance,
  Run,
  Settings,
  Workspace,
} from '../data/types';

const STORAGE_KEY = 'lbvpos.state';
// v2: StepStatus に review、StepRecord に確認済み、assets を追加。
// v3: Asset.thumbnail（data URI）を廃し、実体を AssetBinaryStore へ出して variants を持つ。
const SCHEMA_VERSION = 3;

export interface PersistedState {
  version: number;
  projects: Project[];
  workspaces: Record<string, Workspace>;
  provenance: Record<string, Provenance>;
  runs: Run[];
  assets: Record<string, Asset>;
  portfolio: PortfolioWork[];
  settings: Settings;
}

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    // プライベートモード等で localStorage 自体が触れないことがある。
    return null;
  }
}

/** v2 のアセット。実体を data URI で持っていた（第7章 7-12 の移行元）。 */
type LegacyAsset = Omit<Asset, 'variants'> & { thumbnail?: string };

type LegacyState = Omit<PersistedState, 'assets'> & { assets: Record<string, LegacyAsset> };

export interface LoadedState {
  state: PersistedState;
  /**
   * v2 から持ち越したサムネイル（assetId → data URI）。
   * 起動時に AssetBinaryStore へ移し、preview の variant にする（第7章 7-12）。
   */
  legacyThumbnails: Record<string, string>;
}

/** v2 の状態を v3 の形に読み替える。実体の移送は呼び出し側（非同期）で行う。 */
function migrateFromV2(parsed: LegacyState): LoadedState {
  const legacyThumbnails: Record<string, string> = {};
  const assets: Record<string, Asset> = {};

  for (const [id, legacy] of Object.entries(parsed.assets ?? {})) {
    const { thumbnail, ...rest } = legacy;
    if (thumbnail) legacyThumbnails[id] = thumbnail;
    assets[id] = { ...rest, variants: [] };
  }

  return { state: { ...parsed, version: SCHEMA_VERSION, assets }, legacyThumbnails };
}

/**
 * 保存済みの状態を読む。v2 は移行して読み、それ以外の版差は捨てる。
 */
export function loadState(): LoadedState | null {
  const store = storage();
  if (!store) return null;

  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedState;
    if (!Array.isArray(parsed.projects)) return null;
    if (parsed.version === 2) return migrateFromV2(parsed as unknown as LegacyState);
    if (parsed.version !== SCHEMA_VERSION) return null;
    return { state: parsed, legacyThumbnails: {} };
  } catch {
    return null;
  }
}

/**
 * 保存の結果（第6章 6-9）。
 * 失敗は必ず呼び出し側へ返し、画面で伝える。黙って継続しない。
 * v3 以降ここに載るのはメタデータだけなので、画像を退避して再試行する経路は無い。
 */
export type SaveOutcome =
  { status: 'saved' } | { status: 'unavailable' } | { status: 'failed'; message: string };

export function saveState(state: Omit<PersistedState, 'version'>): SaveOutcome {
  const store = storage();
  if (!store) return { status: 'unavailable' };

  try {
    store.setItem(STORAGE_KEY, JSON.stringify({ version: SCHEMA_VERSION, ...state }));
    return { status: 'saved' };
  } catch {
    return {
      status: 'failed',
      message:
        '保存容量が足りず、変更を保存できていません。このまま操作を続けると、リロード時に失われます。',
    };
  }
}

export function clearState(): void {
  storage()?.removeItem(STORAGE_KEY);
}
