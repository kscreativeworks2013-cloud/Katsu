import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryBinaryStore } from '../domain/assetStore';
import { createImageCache } from './imageCache';

/*
 * 表示用キャッシュ（第7章 7-7）。
 * 予算はバイト数で持ち、表示中のものは超過しても捨てない。
 */

let created = 0;
let revoked: string[] = [];

beforeEach(() => {
  created = 0;
  revoked = [];
  // jsdom には object URL が無いので、生成と revoke を数えられる形で置く。
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: () => `blob:test-${(created += 1)}`,
    revokeObjectURL: (url: string) => revoked.push(url),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function storeWithBlobs(sizes: Record<string, number>) {
  const store = createMemoryBinaryStore();
  for (const [key, size] of Object.entries(sizes)) {
    void store.put(key, new Blob([new Uint8Array(size)]));
  }
  return store;
}

describe('createImageCache', () => {
  it('は予算を超えた分だけ古い順に手放す（件数ではなくバイト数）', async () => {
    const store = storeWithBlobs({ a: 400, b: 400, c: 400 });
    const cache = createImageCache(store, undefined, 1000);

    const first = await cache.load('a');
    await cache.load('b');
    await cache.load('c');

    // 400×3 は 1000 を超えるので、最も古い a だけが落ちる。
    expect(revoked).toEqual([first]);
    expect(cache.size()).toBe(800);
    // 落ちた分は取り直せる（実体はストアに残っている）。
    expect(await cache.load('a')).toBeDefined();
  });

  it('は表示中のものを予算超過でも捨てない', async () => {
    const store = storeWithBlobs({ a: 800, b: 800 });
    const cache = createImageCache(store, undefined, 1000);

    await cache.load('a');
    cache.retain('a');
    await cache.load('b');

    // a は表示中なので残り、予算超過のまま保持する（見えている画像を消さない）。
    expect(revoked).toEqual([]);
    expect(cache.size()).toBe(1600);

    // 表示が外れた時点で予算に収める。
    cache.release('a');
    expect(cache.size()).toBe(800);
  });

  it('は実体が取れないことを消失として通知する（第7章 7-11）', async () => {
    const missing: string[] = [];
    const cache = createImageCache(storeWithBlobs({}), (key) => missing.push(key), 1000);

    expect(await cache.load('ast-1:original')).toBeUndefined();
    expect(missing).toEqual(['ast-1:original']);
  });

  it('は同じキーの同時要求を1回の取得にまとめる', async () => {
    const store = storeWithBlobs({ a: 100 });
    const spy = vi.spyOn(store, 'get');
    const cache = createImageCache(store, undefined, 1000);

    const [first, second] = await Promise.all([cache.load('a'), cache.load('a')]);

    expect(first).toBe(second);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('は削除したアセットの object URL を捨てる', async () => {
    const cache = createImageCache(storeWithBlobs({ a: 100 }), undefined, 1000);
    const url = await cache.load('a');

    cache.forget('a');

    expect(revoked).toEqual([url]);
    expect(cache.size()).toBe(0);
  });
});
