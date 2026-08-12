/*
 * localStorage への永続化（第4章 4-7、第5章 5-1）。
 * 保存に失敗してもアプリは止めない。容量超過時はまずアセットのサムネイルを退避し、
 * それでも失敗すればメモリ上の状態だけで動作を継続する。
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
import { stripThumbnails } from '../domain/assets';

const STORAGE_KEY = 'lbvpos.state';
// v2: StepStatus に review、StepRecord に確認済み、assets を追加。
const SCHEMA_VERSION = 2;

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

/**
 * 保存済みの状態を読む。スキーマバージョンが違う場合は捨てる
 * （本フェーズでは移行処理を書かない）。
 */
export function loadState(): PersistedState | null {
  const store = storage();
  if (!store) return null;

  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedState;
    if (parsed.version !== SCHEMA_VERSION) return null;
    if (!Array.isArray(parsed.projects)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveState(state: Omit<PersistedState, 'version'>): void {
  const store = storage();
  if (!store) return;

  const write = (payload: Omit<PersistedState, 'version'>) =>
    store.setItem(STORAGE_KEY, JSON.stringify({ version: SCHEMA_VERSION, ...payload }));

  try {
    write(state);
  } catch {
    // 容量超過。サムネイルを退避して再試行する（メタデータと参照は保持）。
    try {
      write({ ...state, assets: stripThumbnails(state.assets) });
    } catch {
      // それでも失敗した場合は保存を諦め、操作は続行させる。
    }
  }
}

export function clearState(): void {
  storage()?.removeItem(STORAGE_KEY);
}
