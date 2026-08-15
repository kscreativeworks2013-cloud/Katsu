/*
 * 状態の書き出しと読み込み（第9章 9-6／工程00-a）。
 *
 * 章本文を実物の分量で手入力すると、数時間ぶんの作業が localStorage と IndexedDB
 * だけに載る。どちらもブラウザの都合で消えうる（v2→v3 の移行でシードへ戻った実績があり、
 * 永続化が denied の端末では放置で破棄される）。手元にファイルとして持ち出せる経路を
 * 用意し、消えてもそこから戻せるようにする。
 *
 * 設計上の約束：
 * ・**版が違うものを黙って読まない。** 読めないなら理由を出して拒否する。
 *   保存側（loadState）は版違いを null にして落とすが、それは「保存済みの状態が古い」
 *   場合の話で、利用者が明示的に指定したファイルを黙って捨ててよい理由にはならない。
 * ・**画像の実体を含めるかを選べる。** 含めれば1ファイルで完全に戻るが大きくなる。
 *   含めなければ小さいが、復元後に原寸の貼り直しが要る（既存の消失復旧導線に乗る）。
 */

import type { PersistedState } from '../store/persistence';
import { SCHEMA_VERSION } from '../store/persistence';

export const BACKUP_KIND = 'lbvpos.backup';

/** 書き出し形式そのものの版。中身の状態の版（PersistedState.version）とは別。 */
export const BACKUP_VERSION = 1;

/** 画像の実体1件。data URI で持つので、形式と中身が1つの文字列に収まる。 */
export interface BackupBinary {
  /** AssetBinaryStore のキー（`<assetId>:<kind>`）。 */
  key: string;
  /** `data:image/jpeg;base64,...`。 */
  dataUri: string;
}

export interface BackupFile {
  kind: typeof BACKUP_KIND;
  version: number;
  exportedAt: string;
  /** 画像の実体を含むか。false なら復元後に貼り直しが要る。 */
  includesBinaries: boolean;
  state: PersistedState;
  binaries: BackupBinary[];
}

export function buildBackup(
  state: PersistedState,
  binaries: BackupBinary[],
  exportedAt: string,
  includesBinaries: boolean,
): BackupFile {
  return {
    kind: BACKUP_KIND,
    version: BACKUP_VERSION,
    exportedAt,
    includesBinaries,
    state,
    binaries: includesBinaries ? binaries : [],
  };
}

export type BackupReadResult = { ok: true; backup: BackupFile } | { ok: false; reason: string };

/*
 * 状態の版が違うときの移行。
 *
 * いまは空でよい。書き出しは v3 の状態からしか作られないため、v3 以外が入っている
 * ファイルは「手で書き換えたもの」か「将来の版で作ったもの」のどちらかである。
 * v4 を作るときは、ここに `4: (state) => …` ではなく **`3: (v3) => v4`** を足す
 * （古い版から現在の版へ引き上げる向きで持つ）。届かない版は拒否する。
 */
const STATE_MIGRATIONS: Record<number, (state: PersistedState) => PersistedState> = {};

/** 状態を現在の版まで引き上げる。届かなければ理由を返す。 */
function liftState(
  state: PersistedState,
): { ok: true; state: PersistedState } | { ok: false; reason: string } {
  let current = state;
  const seen = new Set<number>();

  while (current.version !== SCHEMA_VERSION) {
    if (current.version > SCHEMA_VERSION) {
      return {
        ok: false,
        reason: `この書き出しは新しい版のアプリ（データ形式 v${current.version}）で作られています。このアプリが読めるのは v${SCHEMA_VERSION} までです。アプリを更新してから読み込んでください。`,
      };
    }
    // 同じ版を2度通ったら移行が循環している。無限ループより拒否を選ぶ。
    if (seen.has(current.version)) {
      return { ok: false, reason: `データ形式 v${current.version} の移行が循環しています。` };
    }
    seen.add(current.version);

    const migrate = STATE_MIGRATIONS[current.version];
    if (!migrate) {
      return {
        ok: false,
        reason: `データ形式 v${current.version} から v${SCHEMA_VERSION} への移行が定義されていません。読み込むと内容が壊れるため中止しました。`,
      };
    }
    current = migrate(current);
  }

  return { ok: true, state: current };
}

/**
 * 書き出しファイルを読む。
 * 壊れている・版が違う場合は必ず理由つきで拒否し、部分的に読むことはしない。
 */
export function readBackup(text: string): BackupReadResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'ファイルを JSON として読めませんでした。' };
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return { ok: false, reason: 'ファイルの中身がこのアプリの書き出しではありません。' };
  }

  const file = parsed as Partial<BackupFile>;
  if (file.kind !== BACKUP_KIND) {
    return {
      ok: false,
      reason: 'このアプリの書き出しファイルではありません（種別が一致しません）。',
    };
  }
  if (typeof file.version !== 'number') {
    return { ok: false, reason: '書き出しの版が記録されていません。' };
  }
  if (file.version > BACKUP_VERSION) {
    return {
      ok: false,
      reason: `この書き出しは新しい版のアプリ（書き出し形式 v${file.version}）で作られています。アプリを更新してから読み込んでください。`,
    };
  }

  const state = file.state;
  if (
    typeof state !== 'object' ||
    state === null ||
    !Array.isArray(state.projects) ||
    typeof state.version !== 'number'
  ) {
    return { ok: false, reason: '案件データが入っていないか、壊れています。' };
  }

  const lifted = liftState(state);
  if (!lifted.ok) return { ok: false, reason: lifted.reason };

  const binaries = Array.isArray(file.binaries) ? file.binaries : [];
  const usable = binaries.filter(
    (item): item is BackupBinary =>
      typeof item?.key === 'string' && typeof item?.dataUri === 'string',
  );
  if (usable.length !== binaries.length) {
    return { ok: false, reason: '画像データの一部が壊れています。' };
  }

  return {
    ok: true,
    backup: {
      kind: BACKUP_KIND,
      version: file.version,
      exportedAt: typeof file.exportedAt === 'string' ? file.exportedAt : '',
      includesBinaries: file.includesBinaries === true,
      state: lifted.state,
      binaries: usable,
    },
  };
}

/** 画面に出す要約。読み込む前に「何が入っているか」を見せるために使う。 */
export function summarizeBackup(backup: BackupFile): {
  projects: number;
  assets: number;
  binaries: number;
} {
  return {
    projects: backup.state.projects.length,
    assets: Object.keys(backup.state.assets ?? {}).length,
    binaries: backup.binaries.length,
  };
}

/** 書き出しのファイル名。日時で並ぶようにし、画像の有無が名前で分かるようにする。 */
export function backupFileName(exportedAt: string, includesBinaries: boolean): string {
  const stamp = exportedAt.replace(/[:]/g, '').replace(/\..*$/, '').replace('T', '-');
  return `lbvpos-backup-${stamp}${includesBinaries ? '' : '-meta'}.json`;
}
