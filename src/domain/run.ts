/*
 * 生成結果の差分算出と適用（第4章 4-3）。
 * 「上書き／保護／変更なし」の3分類はここで決まり、画面はその結果を表示するだけにする。
 */

import type { FieldOrigin, Provenance, Workspace } from '../data/types';
import { fieldLabel, readField, sameValue, writeField } from './fields';
import { markGenerated, metaFor } from './provenance';

export type DiffKind = 'overwrite' | 'protected' | 'unchanged';

export interface FieldDiff {
  path: string;
  label: string;
  kind: DiffKind;
  origin: FieldOrigin;
  current: unknown;
  proposed: unknown;
}

export const DIFF_KIND_LABEL: Record<DiffKind, string> = {
  overwrite: '上書き',
  protected: '保護（手動編集済み）',
  unchanged: '変更なし',
};

/** 提案値と現在値を突き合わせる。値は書き込まない。 */
export function buildDiff(
  workspace: Workspace,
  provenance: Provenance,
  values: Record<string, unknown>,
): FieldDiff[] {
  return Object.entries(values).map(([path, proposed]) => {
    const current = readField(workspace, path);
    const origin = metaFor(provenance, path).origin;
    const kind: DiffKind = sameValue(current, proposed)
      ? 'unchanged'
      : origin === 'edited'
        ? 'protected'
        : 'overwrite';
    return { path, label: fieldLabel(path), kind, origin, current, proposed };
  });
}

/**
 * 既定の選択は「上書き」のみ。保護は明示的に選んだ場合だけ、
 * 変更なしは適用しても意味を持たないため選択対象にしない（第4章 4-3）。
 */
export function defaultSelection(diffs: FieldDiff[]): string[] {
  return diffs.filter((diff) => diff.kind === 'overwrite').map((diff) => diff.path);
}

/** 選択されたフィールドだけを書き込み、provenance を生成済みに更新する。 */
export function applyValues(
  workspace: Workspace,
  provenance: Provenance,
  values: Record<string, unknown>,
  selected: string[],
  runId: string,
  at: string,
): { workspace: Workspace; provenance: Provenance; appliedFields: string[] } {
  const appliedFields = selected.filter((path) => path in values);
  const nextWorkspace = appliedFields.reduce(
    (current, path) => writeField(current, path, values[path]),
    workspace,
  );

  return {
    workspace: nextWorkspace,
    provenance: markGenerated(provenance, appliedFields, runId, at),
    appliedFields,
  };
}

/** 差分の要約（「上書き2件・保護1件・変更なし4件」）。 */
export function summarizeDiff(diffs: FieldDiff[]): string {
  const count = (kind: DiffKind) => diffs.filter((diff) => diff.kind === kind).length;
  return [
    `上書き${count('overwrite')}件`,
    `保護${count('protected')}件`,
    `変更なし${count('unchanged')}件`,
  ].join('・');
}
