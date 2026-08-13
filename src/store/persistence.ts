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
/** v2 のペイロードの退避先。移送を確認できるまで消さない（第7章 7-12）。 */
const BACKUP_KEY = 'lbvpos.state.v2-backup';
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
  /** バックアップを確保できたか。false のときは v3 の保存を先に行ってはいけない。 */
  backedUp: boolean;
}

/** v2 の状態を v3 の形に読み替える。実体の移送は呼び出し側（非同期）で行う。 */
function migrateFromV2(parsed: LegacyState): Omit<LoadedState, 'backedUp'> {
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
 * v2 のペイロードを退避する（第7章 7-12）。
 * 移送の成功が確認できるまで元の画像を捨てないための保険で、告知の代わりではない。
 */
function backupLegacy(raw: string): boolean {
  const store = storage();
  if (!store) return false;
  try {
    store.setItem(BACKUP_KEY, raw);
    return true;
  } catch {
    // 退避する空きが無い。呼び出し側は v3 の保存を保留し、原本を残したままにする。
    return false;
  }
}

/** 退避したサムネイル。移送しきれなかった分の再試行に使う。 */
function readLegacyBackup(): Record<string, string> {
  const store = storage();
  if (!store) return {};
  try {
    const raw = store.getItem(BACKUP_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as LegacyState;
    return Object.fromEntries(
      Object.entries(parsed.assets ?? {})
        .filter(([, asset]) => asset.thumbnail)
        .map(([id, asset]) => [id, asset.thumbnail as string]),
    );
  } catch {
    return {};
  }
}

/** 移送を全件確認できたときだけ呼ぶ。ここで初めて旧データを手放す。 */
export function clearLegacyBackup(): void {
  storage()?.removeItem(BACKUP_KEY);
}

/**
 * 保存済みの状態を読む。v2 は移行して読み、それ以外の版差は捨てる。
 * v3 でも退避が残っていれば、前回移送しきれなかった分として持ち越す。
 */
export function loadState(): LoadedState | null {
  const store = storage();
  if (!store) return null;

  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedState;
    if (!Array.isArray(parsed.projects)) return null;

    if (parsed.version === 2) {
      // 退避を先に取る。取れなければ backedUp=false を返し、保存の保留で原本を守る。
      const backedUp = backupLegacy(raw);
      return { ...migrateFromV2(parsed as unknown as LegacyState), backedUp };
    }
    if (parsed.version !== SCHEMA_VERSION) return null;
    return { state: parsed, legacyThumbnails: readLegacyBackup(), backedUp: true };
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
