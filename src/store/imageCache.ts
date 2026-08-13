/*
 * 画面表示用のバイナリキャッシュ（第7章 7-7）。
 *
 * object URL の生成箇所をここ1つに閉じる。revoke 漏れはメモリリークになるため、
 * 生成と破棄を同じ場所で持つ。キャッシュはアプリ起動ごとに空から始める
 * （IndexedDB 自体が永続層であり、二重の永続キャッシュは持たない）。
 *
 * 予算は件数でもファイルサイズでもなく、**デコード後の推定サイズ**で持つ。
 * 件数は原寸（数MB）と preview（数十KB）が混在すると消費量を代理しない。
 * ファイルサイズも同様に外れる：2339×1654 の JPEG は 500KB でも、表示のために
 * 展開されれば約15MB を占める。ファイル基準の予算はモバイル Safari で破綻する。
 */

import type { AssetBinaryStore } from '../domain/assetStore';

/**
 * 保持するデコード後サイズの合計上限。
 * 800px の preview（約1.9MB）なら30枚強、A4横全面の原寸（約15MB）なら4枚で埋まる。
 * モバイル Safari のタブあたりの余力を踏まえ、控えめに置く。
 */
export const CACHE_BUDGET_BYTES = 64_000_000;

/** 寸法が分からないときの1枚あたりの見積もり。分からない側に倒して大きく見る。 */
const UNKNOWN_DECODED_BYTES = 16_000_000;

/** デコード後の占有サイズ（幅×高さ×4バイト／RGBA）。 */
export function decodedBytes(width: number, height: number): number {
  if (width <= 0 || height <= 0) return UNKNOWN_DECODED_BYTES;
  return width * height * 4;
}

interface Entry {
  url: string;
  bytes: number;
  /** 表示中の参照数。0 のものだけが予算超過時の対象になる。 */
  refs: number;
  usedAt: number;
}

export interface ImageCache {
  /**
   * 実体を取り出して object URL にする。取れなければ undefined（＝消失）。
   * size には variant の寸法を渡す。予算はここから求めたデコード後サイズで計算する。
   */
  load: (key: string, size?: { width: number; height: number }) => Promise<string | undefined>;
  /** 表示中の印。付けている間は予算を超えても破棄されない。 */
  retain: (key: string) => void;
  release: (key: string) => void;
  /** アセット削除時に、対応する object URL も捨てる。 */
  forget: (key: string) => void;
  /** 保持しているデコード後サイズの合計（テストと診断用）。 */
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
    load: async (key, size) => {
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
        // 占有量はファイルサイズではなく、展開後のビットマップで測る。
        const bytes = size ? decodedBytes(size.width, size.height) : UNKNOWN_DECODED_BYTES;
        entries.set(key, { url, bytes, refs: 0, usedAt: (clock += 1) });
        held += bytes;
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
