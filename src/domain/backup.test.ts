import { describe, expect, it } from 'vitest';
import { defaultSettings, seedPortfolio, seedProjects, seedWorkspaces } from '../data/fixtures';
import { SCHEMA_VERSION, type PersistedState } from '../store/persistence';
import {
  BACKUP_KIND,
  BACKUP_VERSION,
  backupFileName,
  buildBackup,
  readBackup,
  summarizeBackup,
} from './backup';

function state(overrides: Partial<PersistedState> = {}): PersistedState {
  return {
    version: SCHEMA_VERSION,
    projects: seedProjects,
    workspaces: seedWorkspaces,
    provenance: {},
    runs: [],
    assets: {
      'ast-1': {
        id: 'ast-1',
        origin: 'upload',
        label: '写真',
        source: 'a.jpg',
        runId: null,
        mimeType: 'image/jpeg',
        createdAt: '2026-08-01',
        variants: [],
      },
    },
    portfolio: seedPortfolio,
    settings: defaultSettings,
    ...overrides,
  };
}

const BINARY = { key: 'ast-1:original', dataUri: 'data:image/jpeg;base64,/9j/4AAQ' };

describe('状態の書き出し', () => {
  it('は画像を含める指定のときだけ実体を載せる', () => {
    const withBinaries = buildBackup(state(), [BINARY], '2026-08-15T00:00:00.000Z', true);
    const withoutBinaries = buildBackup(state(), [BINARY], '2026-08-15T00:00:00.000Z', false);

    expect(withBinaries.binaries).toHaveLength(1);
    expect(withoutBinaries.binaries).toHaveLength(0);
    expect(withoutBinaries.includesBinaries).toBe(false);
  });

  it('はファイル名で画像の有無が分かる', () => {
    expect(backupFileName('2026-08-15T09:30:00.000Z', true)).toBe(
      'lbvpos-backup-2026-08-15-093000.json',
    );
    expect(backupFileName('2026-08-15T09:30:00.000Z', false)).toBe(
      'lbvpos-backup-2026-08-15-093000-meta.json',
    );
  });
});

describe('書き出しの読み込み', () => {
  it('は書き出したものをそのまま復元する', () => {
    const backup = buildBackup(state(), [BINARY], '2026-08-15T00:00:00.000Z', true);
    const result = readBackup(JSON.stringify(backup));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.backup.state.projects).toEqual(seedProjects);
    expect(result.backup.binaries).toEqual([BINARY]);
    expect(summarizeBackup(result.backup)).toEqual({
      projects: seedProjects.length,
      assets: 1,
      binaries: 1,
    });
  });

  it('は他所の JSON を種別で弾く', () => {
    expect(readBackup('{"hello":1}')).toEqual({
      ok: false,
      reason: 'このアプリの書き出しファイルではありません（種別が一致しません）。',
    });
  });

  it('は JSON として壊れているファイルを理由つきで拒否する', () => {
    const result = readBackup('{{{');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain('JSON');
  });

  /*
   * 版違いを黙って読まないことがこの機能の要点。
   * 保存側（loadState）は版違いを null にして落とすが、それは「保存済みの状態が古い」
   * 話であって、利用者が指定したファイルを黙って捨ててよい理由にはならない。
   */
  it('は新しい版の書き出しを、アプリの更新を促して拒否する', () => {
    const backup = { ...buildBackup(state(), [], '', true), version: BACKUP_VERSION + 1 };
    const result = readBackup(JSON.stringify(backup));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain('アプリを更新');
  });

  it('は移行の定義が無い古いデータ形式を、壊す前に拒否する', () => {
    const backup = buildBackup(state({ version: 2 }), [], '', true);
    const result = readBackup(JSON.stringify(backup));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain(`v2 から v${SCHEMA_VERSION}`);
    expect(result.reason).toContain('移行が定義されていません');
  });

  it('は新しいデータ形式も、書き出し形式が同じなら版で弾く', () => {
    const backup = buildBackup(state({ version: SCHEMA_VERSION + 1 }), [], '', true);
    const result = readBackup(JSON.stringify(backup));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain(`v${SCHEMA_VERSION + 1}`);
  });

  it('は案件データが無いファイルを拒否する', () => {
    const result = readBackup(
      JSON.stringify({ kind: BACKUP_KIND, version: BACKUP_VERSION, state: { version: 3 } }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain('案件データ');
  });

  it('は画像データが壊れていれば、部分的に読まずに拒否する', () => {
    const backup = buildBackup(state(), [], '', true);
    const result = readBackup(
      JSON.stringify({ ...backup, binaries: [{ key: 'ast-1:original' }] }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain('画像データ');
  });
});
