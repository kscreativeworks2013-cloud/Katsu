/*
 * アセット実体の保存先の契約（第7章 7-4）。
 *
 * 前倒しするのは「契約」であって稼働サーバーではない。当面の実装は IndexedDB
 * （src/lib/indexedDbStore.ts）に置き、サーバー実装は同じ契約の別実装として
 * API・サーバー永続化フェーズで差し替える。呼び出し側はこの契約しか知らない。
 */

/** 保存結果。容量不足は例外ではなく結果として返す（黙って落とさないため）。 */
export type PutResult = { ok: true } | { ok: false; reason: string };

export interface StoreUsage {
  /** このストアが保持している実体の合計バイト数。 */
  bytes: number;
  /** ブラウザが見積もるオリジン全体の使用量。取得できない環境では undefined。 */
  usedBytes?: number;
  /** ブラウザが見積もる利用可能容量。固定の上限値は仕様に置かない（第7章 7-10）。 */
  quotaBytes?: number;
}

export interface AssetBinaryStore {
  put: (key: string, blob: Blob) => Promise<PutResult>;
  get: (key: string) => Promise<Blob | undefined>;
  delete: (key: string) => Promise<void>;
  usage: () => Promise<StoreUsage>;
  /** 保持しているキーの一覧。メタデータとの突き合わせ（消失検出・孤児の掃除）に使う。 */
  list: () => Promise<string[]>;
}

/**
 * メモリ実装。IndexedDB が無い環境（テスト・プライベートモード等）の代替。
 * リロードで消えるため、利用側は永続化されていないことを画面に出すこと。
 */
export function createMemoryBinaryStore(): AssetBinaryStore {
  const items = new Map<string, Blob>();
  return {
    put: async (key, blob) => {
      items.set(key, blob);
      return { ok: true };
    },
    get: async (key) => items.get(key),
    delete: async (key) => {
      items.delete(key);
    },
    usage: async () => ({
      bytes: [...items.values()].reduce((sum, blob) => sum + blob.size, 0),
    }),
    list: async () => [...items.keys()],
  };
}

/** variant のキー。アセットIDと種類から決めるので、記述子が無くても掃除できる。 */
export function variantKey(assetId: string, kind: 'original' | 'preview'): string {
  return `${assetId}:${kind}`;
}
