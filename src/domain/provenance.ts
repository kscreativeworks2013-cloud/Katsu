/*
 * provenance の読み書き（第4章 4-1）。
 * 「上書きしてよいか」の判定はここだけが持つ。画面もストアもこの関数群を通す。
 */

import type { FieldMeta, Provenance, StepRecord } from '../data/types';

const UNKNOWN: FieldMeta = { origin: 'empty', runId: null, updatedAt: '' };

export function metaFor(provenance: Provenance, path: string): FieldMeta {
  return provenance[path] ?? UNKNOWN;
}

/** 手動編集済みのフィールドは再生成から保護される。 */
export function isProtected(provenance: Provenance, path: string): boolean {
  return metaFor(provenance, path).origin === 'edited';
}

/** 生成結果を書き込んだフィールドに刻む。 */
export function markGenerated(
  provenance: Provenance,
  paths: string[],
  runId: string,
  at: string,
): Provenance {
  const next = { ...provenance };
  for (const path of paths) {
    next[path] = { origin: 'generated', runId, updatedAt: at };
  }
  return next;
}

/** 手動編集。編集直前の runId は追跡のために引き継ぐ。 */
export function markEdited(provenance: Provenance, path: string, at: string): Provenance {
  return {
    ...provenance,
    [path]: { origin: 'edited', runId: metaFor(provenance, path).runId, updatedAt: at },
  };
}

/** 指定範囲のうち手動編集済みのパス。 */
export function editedPaths(provenance: Provenance, paths: string[]): string[] {
  return paths.filter((path) => isProtected(provenance, path));
}

/*
 * stale の「確認済み」（第4章 4-4）。
 * 値の出自ではなくステップ単位の人の判断なので、FieldMeta ではなくステップ記録に持つ。
 * 記録するのは判断時刻と、そのとき古くしていた上流ステップ。次に上流が変化すると
 * cascadeStale がこの記録ごと上書きし、再び stale に戻る。
 */

/** 「確認したが再生成不要」を記録する。stale でないステップは変更しない。 */
export function acknowledgeStaleRecord(record: StepRecord, at: string): StepRecord {
  if (!record.stale) return record;
  return {
    status: record.status,
    lastRunId: record.lastRunId,
    stale: false,
    staleAcknowledgedAt: at,
    staleAcknowledgedCause: record.staleCause,
  };
}

/** 確認済みの判断が残っているか。 */
export function isStaleAcknowledged(record: StepRecord): boolean {
  return record.staleAcknowledgedAt !== undefined;
}
