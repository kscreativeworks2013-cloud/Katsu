/*
 * 画面表示用のバイナリキャッシュ（第7章 7-7）。
 *
 * object URL の生成箇所をここ1つに閉じる。revoke 漏れはメモリリークになるため、
 * 生成と破棄を同じ場所で持つ。キャッシュはアプリ起動ごとに空から始める
 * （IndexedDB 自体が永続層であり、二重の永続キャッシュは持たない）。
 *
 * 予算は件数ではなくバイト数で持つ。原寸（数MB）と preview（数十KB）が同じ
 * キャッシュに混在するため、件数では実際の消費量を代理できない。
 */

import type { AssetBinaryStore } from '../domain/assetStore';

/** 保持する実体の合計バイト数の上限。超えた分は古い順に手放す。 */
export const CACHE_BUDGET_BYTES = 48_000_000;

interface Entry {
  url: string;
  bytes: number;
  /** 表示中の参照数。0 のものだけが予算超過時の対象になる。 */
  refs: number;
  usedAt: number;
}

export interface ImageCache {
  /** 実体を取り出して object URL にする。取れなければ undefined（＝消失）。 */
  load: (key: string) => Promise<string | undefined>;
  /** 表示中の印。付けている間は予算を超えても破棄されない。 */
  retain: (key: string) => void;
  release: (key: string) => void;
  /** アセット削除時に、対応する object URL も捨てる。 */
  forget: (key: string) => void;
  /** 保持している合計バイト数（テストと診断用）。 */
  size: () => number;
}

export function createImageCache(
  store: AssetBinaryStore,
  /** 実体が取れなかったときの通知（消失の検出に使う。第7章 7-11）。 */
  onMissing?: (key: string) => void,
  budgetBytes: number = CACHE_BUDGET_BYTES,
): ImageCache {
  const entries = new Map<string, Entry>();
  const inflight = new Map<string, Promise<string | undefined>>();
  let clock = 0;
  let held = 0;

  const drop = (key: string, entry: Entry) => {
    URL.revokeObjectURL(entry.url);
    entries.delete(key);
    held -= entry.bytes;
  };

  /**
   * 予算を超えた分だけ、使われていない古いものから手放す。
   * 表示中（refs > 0）と、いま取り出したばかりのものは対象にしない。前者は
   * ムードボードのように多数のタイルが並ぶ画面で見えている画像を消さないため、
   * 後者は呼び出し側へ返す直前の URL を無効化しないため。手放せるものが無ければ
   * 予算超過のまま保持する（予算は目安であり、表示の維持を優先する）。
   */
  const evict = (justLoaded?: string) => {
    if (held <= budgetBytes) return;
    const idle = [...entries.entries()]
      .filter(([key, entry]) => entry.refs === 0 && key !== justLoaded)
      .sort((a, b) => a[1].usedAt - b[1].usedAt);

    while (held > budgetBytes && idle.length > 0) {
      const [key, entry] = idle.shift()!;
      drop(key, entry);
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
        entries.set(key, { url, bytes: blob.size, refs: 0, usedAt: (clock += 1) });
        held += blob.size;
        evict(key);
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
      if (entry) drop(key, entry);
    },

    size: () => held,
  };
}
