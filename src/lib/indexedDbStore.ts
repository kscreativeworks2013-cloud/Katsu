/*
 * AssetBinaryStore の IndexedDB 実装（第7章 7-4）。
 *
 * localStorage は文字列で約5MB が上限のため原寸を置けない。IndexedDB は Blob を
 * そのまま保持でき、実用上は数百MB規模まで扱える。ただし割り当ては端末の空き容量に
 * 依存し、best-effort の保存は後から破棄されうる（第7章 7-11）。
 */

import {
  createMemoryBinaryStore,
  type AssetBinaryStore,
  type PutResult,
  type StoreUsage,
} from '../domain/assetStore';

const DB_NAME = 'lbvpos.assets';
const DB_VERSION = 1;
const STORE_NAME = 'binaries';

export function hasIndexedDb(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    return false;
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.addEventListener('upgradeneeded', () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    });
    request.addEventListener('success', () => resolve(request.result));
    request.addEventListener('error', () =>
      reject(request.error ?? new Error('IndexedDB を開けませんでした')),
    );
    request.addEventListener('blocked', () =>
      reject(new Error('IndexedDB が他のタブに占有されています')),
    );
  });
}

function run<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  body: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const request = body(transaction.objectStore(STORE_NAME));
    request.addEventListener('success', () => resolve(request.result));
    request.addEventListener('error', () =>
      reject(request.error ?? new Error('IndexedDB の操作に失敗しました')),
    );
    transaction.addEventListener('abort', () =>
      reject(transaction.error ?? new Error('IndexedDB の操作が中断されました')),
    );
  });
}

/** ブラウザの見積もり。取れない環境では undefined を返し、画面では「不明」と出す。 */
async function estimate(): Promise<Pick<StoreUsage, 'usedBytes' | 'quotaBytes'>> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return {};
    const { usage, quota } = await navigator.storage.estimate();
    return { usedBytes: usage, quotaBytes: quota };
  } catch {
    return {};
  }
}

/**
 * IndexedDB 実装を作る。IndexedDB が無い環境ではメモリ実装へ落とす。
 * 落ちたことは呼び出し側から `persistent` で分かるようにし、画面で伝える。
 */
export function createIndexedDbStore(): AssetBinaryStore & { persistent: boolean } {
  if (!hasIndexedDb()) return { ...createMemoryBinaryStore(), persistent: false };

  // 接続は使い回す。開けなかった場合は毎回作り直さず、失敗として扱う。
  let connection: Promise<IDBDatabase> | null = null;
  const db = () => (connection ??= openDb());

  return {
    persistent: true,

    put: async (key, blob): Promise<PutResult> => {
      try {
        await run(await db(), 'readwrite', (store) => store.put(blob, key));
        return { ok: true };
      } catch (cause) {
        const quota = cause instanceof DOMException && cause.name === 'QuotaExceededError';
        return {
          ok: false,
          reason: quota
            ? '端末の空き容量が足りず、画像を保存できませんでした。不要な画像を解除してください'
            : '画像を保存できませんでした（ブラウザの保存領域にアクセスできません）',
        };
      }
    },

    get: async (key) => {
      try {
        return await run<Blob | undefined>(await db(), 'readonly', (store) => store.get(key));
      } catch {
        // 取れないことは消失と同じ扱いにする。呼び出し側が missing として表示する。
        return undefined;
      }
    },

    delete: async (key) => {
      try {
        await run(await db(), 'readwrite', (store) => store.delete(key));
      } catch {
        // 消せなくてもアプリは止めない。孤児は次回の突き合わせで拾う。
      }
    },

    usage: async () => {
      const measured = await estimate();
      try {
        // getAll が返すのは Blob の参照なので、中身を読まずにサイズだけを合算できる。
        const blobs = await run<Blob[]>(await db(), 'readonly', (store) => store.getAll());
        return {
          bytes: blobs.reduce((sum, blob) => sum + (blob?.size ?? 0), 0),
          ...measured,
        };
      } catch {
        return { bytes: 0, ...measured };
      }
    },

    list: async () => {
      try {
        const keys = await run<IDBValidKey[]>(await db(), 'readonly', (store) =>
          store.getAllKeys(),
        );
        return keys.map(String);
      } catch {
        return [];
      }
    },
  };
}
