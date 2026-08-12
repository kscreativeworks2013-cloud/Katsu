/*
 * provenance の読み書き（第4章 4-1）。
 * 「上書きしてよいか」の判定はここだけが持つ。画面もストアもこの関数群を通す。
 */

import type { FieldMeta, Provenance } from '../data/types';

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
