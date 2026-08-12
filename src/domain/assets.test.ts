import { describe, expect, it } from 'vitest';
import type { Asset } from '../data/types';
import {
  THUMBNAIL_BUDGET_BYTES,
  THUMBNAIL_LIMIT_BYTES,
  fitThumbnail,
  resolveAsset,
  stripThumbnails,
} from './assets';

function asset(id: string, thumbnail?: string): Asset {
  return {
    id,
    origin: 'upload',
    label: id,
    source: `${id}.jpg`,
    runId: null,
    mimeType: 'image/jpeg',
    createdAt: '2026-08-12T00:00:00.000Z',
    ...(thumbnail === undefined ? {} : { thumbnail }),
  };
}

describe('resolveAsset', () => {
  it('は未登録・null 参照で undefined を返す（参照切れで壊れない）', () => {
    const assets = { 'ast-1': asset('ast-1') };
    expect(resolveAsset(assets, 'ast-1')?.id).toBe('ast-1');
    expect(resolveAsset(assets, 'ast-missing')).toBeUndefined();
    expect(resolveAsset(assets, null)).toBeUndefined();
    expect(resolveAsset(assets, undefined)).toBeUndefined();
  });
});

describe('fitThumbnail', () => {
  it('は1枚の上限を超えるサムネイルを受け付けない', () => {
    expect(fitThumbnail({}, 'x'.repeat(THUMBNAIL_LIMIT_BYTES + 1))).toBeUndefined();
    expect(fitThumbnail({}, 'x'.repeat(100))).toBe('x'.repeat(100));
  });

  it('は合計上限を超える場合サムネイルを落として受け付ける', () => {
    // 予算をほぼ使い切った状態を1枚の巨大な既存サムネイルで作る。
    const nearBudget = {
      'ast-big': asset('ast-big', 'x'.repeat(THUMBNAIL_BUDGET_BYTES - 10)),
    };
    expect(fitThumbnail(nearBudget, 'y'.repeat(100))).toBeUndefined();
  });
});

describe('stripThumbnails', () => {
  it('はサムネイルだけを落とし、メタデータと参照は残す', () => {
    const stripped = stripThumbnails({
      'ast-1': asset('ast-1', 'data:image/jpeg;base64,xxxx'),
      'ast-2': asset('ast-2'),
    });

    expect(stripped['ast-1'].thumbnail).toBeUndefined();
    expect(stripped['ast-1'].source).toBe('ast-1.jpg');
    expect(stripped['ast-2']).toBeDefined();
  });
});
