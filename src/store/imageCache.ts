/*
 * 画面表示用のバイナリキャッシュ（第7章 7-7）。
 *
 * object URL の生成箇所をここ1つに閉じる。revoke 漏れはメモリリークになるため、
 * 生成と破棄を同じ場所で持つ。キャッシュはアプリ起動ごとに空から始める
 * （IndexedDB 自体が永続層であり、二重の永続キャッシュは持たない）。
 */

import type { AssetBinaryStore } from '../domain/assetStore';

/** 保持する object URL の上限。表示中のものは上限を超えても捨てない。 */
export const CACHE_LIMIT = 16;

interface Entry {
  url: string;
  /** 表示中の参照数。0 のものだけが LRU の対象になる。 */
  refs: number;
  usedAt: number;
}

export interface ImageCache {
  /** 実体を取り出して object URL にする。取れなければ undefined（＝消失）。 */
  load: (key: string) => Promise<string | undefined>;
  /** 表示中の印。付けている間は LRU で破棄されない。 */
  retain: (key: string) => void;
  release: (key: string) => void;
  /** アセット削除時に、対応する object URL も捨てる。 */
  forget: (key: string) => void;
}

export function createImageCache(
  store: AssetBinaryStore,
  /** 実体が取れなかったときの通知（消失の検出に使う。第7章 7-11）。 */
  onMissing?: (key: string) => void,
  limit: number = CACHE_LIMIT,
): ImageCache {
  const entries = new Map<string, Entry>();
  const inflight = new Map<string, Promise<string | undefined>>();
  let clock = 0;

  const evict = () => {
    const idle = [...entries.entries()]
      .filter(([, entry]) => entry.refs === 0)
      .sort((a, b) => a[1].usedAt - b[1].usedAt);

    while (entries.size > limit && idle.length > 0) {
      const [key, entry] = idle.shift()!;
      URL.revokeObjectURL(entry.url);
      entries.delete(key);
    }
  };

  const touch = (key: string): string | undefined => {
    const entry = entries.get(key);
    if (!entry) return undefined;
    entry.usedAt = clock += 1;
    return entry.url;
  };

  return {
    load: async (key) => {
      const cached = touch(key);
      if (cached) return cached;

      // 同じキーの同時要求は1回の取得にまとめる。
      const pending = inflight.get(key);
      if (pending) return pending;

      const task = (async () => {
        const blob = await store.get(key);
        if (!blob) {
          onMissing?.(key);
          return undefined;
        }
        const url = URL.createObjectURL(blob);
        entries.set(key, { url, refs: 0, usedAt: (clock += 1) });
        evict();
        return url;
      })().finally(() => inflight.delete(key));

      inflight.set(key, task);
      return task;
    },

    retain: (key) => {
      const entry = entries.get(key);
      if (entry) entry.refs += 1;
    },

    release: (key) => {
      const entry = entries.get(key);
      if (!entry) return;
      entry.refs = Math.max(0, entry.refs - 1);
      evict();
    },

    forget: (key) => {
      const entry = entries.get(key);
      if (!entry) return;
      URL.revokeObjectURL(entry.url);
      entries.delete(key);
    },
  };
}
