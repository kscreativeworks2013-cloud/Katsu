import { describe, expect, it } from 'vitest';
import type { Asset } from '../data/types';
import {
  THUMBNAIL_BUDGET_BYTES,
  THUMBNAIL_LIMIT_BYTES,
  storageUsage,
  decideThumbnail,
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

describe('decideThumbnail', () => {
  it('は1枚の上限を超えるサムネイルを理由つきで拒む', () => {
    const decision = decideThumbnail({}, 'x'.repeat(THUMBNAIL_LIMIT_BYTES + 1));

    expect(decision.thumbnail).toBeUndefined();
    expect(decision.rejected).toMatch(/1枚あたりの上限/);
    expect(decideThumbnail({}, 'x'.repeat(100)).thumbnail).toBe('x'.repeat(100));
  });

  it('は合計上限を超える場合に理由を返す（黙って落とさない）', () => {
    // 予算をほぼ使い切った状態を1枚の巨大な既存サムネイルで作る。
    const nearBudget = {
      'ast-big': asset('ast-big', 'x'.repeat(THUMBNAIL_BUDGET_BYTES - 10)),
    };
    const decision = decideThumbnail(nearBudget, 'y'.repeat(100));

    expect(decision.thumbnail).toBeUndefined();
    expect(decision.rejected).toMatch(/いっぱい/);
  });
});

describe('storageUsage', () => {
  it('は使用量と、実体を持たないアセットの数を返す', () => {
    const usage = storageUsage({
      'ast-1': asset('ast-1', 'x'.repeat(1000)),
      'ast-2': asset('ast-2'),
    });

    expect(usage.bytes).toBe(1000);
    expect(usage.storedCount).toBe(1);
    expect(usage.referenceOnlyCount).toBe(1);
    expect(usage.level).toBe('ok');
  });

  it('は上限に近づくと warn、超えると full を返す', () => {
    const warn = storageUsage({
      'ast-1': asset('ast-1', 'x'.repeat(Math.round(THUMBNAIL_BUDGET_BYTES * 0.85))),
    });
    const full = storageUsage({
      'ast-1': asset('ast-1', 'x'.repeat(THUMBNAIL_BUDGET_BYTES)),
    });

    expect(warn.level).toBe('warn');
    expect(full.level).toBe('full');
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
