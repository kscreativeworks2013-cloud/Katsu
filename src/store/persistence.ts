/*
 * localStorage への永続化（第4章 4-7）。
 * 保存に失敗してもアプリは止めない。メモリ上の状態だけで動作を継続する。
 * サーバー側の永続化とマルチユーザーの同時編集はスコープ外。
 */

import type {
  PortfolioWork,
  Project,
  Provenance,
  Run,
  Settings,
  Workspace,
} from '../data/types';

const STORAGE_KEY = 'lbvpos.state';
const SCHEMA_VERSION = 1;

export interface PersistedState {
  version: number;
  projects: Project[];
  workspaces: Record<string, Workspace>;
  provenance: Record<string, Provenance>;
  runs: Run[];
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

  try {
    store.setItem(STORAGE_KEY, JSON.stringify({ version: SCHEMA_VERSION, ...state }));
  } catch {
    // 容量超過など。保存できなくても操作は続行させる。
  }
}

export function clearState(): void {
  storage()?.removeItem(STORAGE_KEY);
}
