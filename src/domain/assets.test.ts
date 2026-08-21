import { describe, expect, it } from 'vitest';
import type { Asset } from '../data/types';
import {
  assetUsage,
  detectMissingAssets,
  effectivePpi,
  hasOriginal,
  orphanKeys,
  pickVariant,
  requiredPixels,
  resolveAsset,
  detachAsset,
} from './assets';
import { variantKey } from './assetStore';

function asset(id: string, kinds: ('original' | 'preview')[], width = 2000): Asset {
  return {
    id,
    origin: 'upload',
    label: id,
    source: `${id}.jpg`,
    runId: null,
    mimeType: 'image/jpeg',
    createdAt: '2026-08-12T00:00:00.000Z',
    variants: kinds.map((kind) => ({
      kind,
      key: variantKey(id, kind),
      width: kind === 'original' ? width : 800,
      height: 600,
      bytes: kind === 'original' ? 1_000_000 : 60_000,
      mimeType: 'image/jpeg',
    })),
  };
}

describe('resolveAsset', () => {
  it('は未登録・null 参照で undefined を返す（参照切れで壊れない）', () => {
    const assets = { 'ast-1': asset('ast-1', []) };
    expect(resolveAsset(assets, 'ast-1')?.id).toBe('ast-1');
    expect(resolveAsset(assets, 'ast-missing')).toBeUndefined();
    expect(resolveAsset(assets, null)).toBeUndefined();
    expect(resolveAsset(assets, undefined)).toBeUndefined();
  });
});

describe('印刷解像度', () => {
  it('は配置幅とppiから必要ピクセル数を出す（第7章 7-2）', () => {
    // A4全面（210mm）は 300ppi で約2480px、200ppi で約1654px。
    expect(requiredPixels(210, 300)).toBe(2480);
    expect(requiredPixels(210, 200)).toBe(1654);
    expect(requiredPixels(62, 200)).toBe(488);
  });

  it('は1K級の生成画像が表紙に足りず、タイルには足りることを示す（第7章 7-3）', () => {
    expect(effectivePpi(1024, 210)).toBe(124);
    expect(effectivePpi(1024, 62)).toBe(420);
    expect(effectivePpi(2048, 210)).toBe(248);
  });
});

describe('variant の選択', () => {
  it('は画面では preview を、出力では原寸だけを選ぶ（第7章 7-7）', () => {
    const both = asset('ast-1', ['original', 'preview']);

    expect(pickVariant(both, 'screen')?.kind).toBe('preview');
    expect(pickVariant(both, 'output')?.kind).toBe('original');
  });

  it('は preview しか無いアセットを出力に使わない（第7章 7-6）', () => {
    const previewOnly = asset('ast-2', ['preview']);

    expect(hasOriginal(previewOnly)).toBe(false);
    expect(pickVariant(previewOnly, 'output')).toBeUndefined();
    // 画面には出せる。出力に使えないだけ。
    expect(pickVariant(previewOnly, 'screen')?.kind).toBe('preview');
  });

  it('は preview が無ければ画面でも原寸を使う', () => {
    expect(pickVariant(asset('ast-3', ['original']), 'screen')?.kind).toBe('original');
  });
});

describe('assetUsage', () => {
  it('は原寸あり・表示用のみ・参照のみ・消失を数える', () => {
    const assets = {
      'ast-1': asset('ast-1', ['original', 'preview']),
      'ast-2': asset('ast-2', ['preview']),
      'ast-3': asset('ast-3', []),
      'ast-4': asset('ast-4', ['original']),
    };
    const usage = assetUsage(assets, ['ast-4'], 500_000_000);

    expect(usage.originalCount).toBe(1);
    expect(usage.previewOnlyCount).toBe(1);
    expect(usage.referenceOnlyCount).toBe(1);
    expect(usage.missingCount).toBe(1);
    expect(usage.bytes).toBe(1_000_000 + 60_000 + 60_000 + 1_000_000);
    expect(usage.quotaBytes).toBe(500_000_000);
  });
});

describe('消失の検出（第7章 7-11）', () => {
  it('は記述子があるのに実体が無いものを消失として挙げる', () => {
    const assets = {
      'ast-1': asset('ast-1', ['original', 'preview']),
      'ast-2': asset('ast-2', ['original']),
      'ast-3': asset('ast-3', []),
    };
    // ast-2 の実体だけが保存領域から消えている。
    const missing = detectMissingAssets(assets, [
      variantKey('ast-1', 'original'),
      variantKey('ast-1', 'preview'),
    ]);

    expect(missing).toEqual(['ast-2']);
  });

  it('はどの記述子からも参照されない実体を孤児として挙げる', () => {
    const assets = { 'ast-1': asset('ast-1', ['original']) };
    const orphans = orphanKeys(assets, [
      variantKey('ast-1', 'original'),
      variantKey('ast-old', 'original'),
    ]);

    expect(orphans).toEqual([variantKey('ast-old', 'original')]);
  });
});

/*
 * 削除したアセットへの参照の掃除（第7章 7-10／第9章 工程N-1）。
 * 競合とロゴは第8章で画像を持つようになったが、掃除の対象に入っていなかった。
 */
describe('detachAsset', () => {
  const workspace = {
    moodboard: [{ assetId: 'ast-1' }, { assetId: 'ast-2' }],
    shots: [{ assetId: 'ast-1' }],
    competitors: [{ assetId: 'ast-1' }, { assetId: null }],
    logoAssetId: 'ast-1',
  };

  it('は全ての参照元から assetId を外す', () => {
    const next = detachAsset(workspace, 'ast-1');

    expect(next.moodboard).toEqual([{ assetId: null }, { assetId: 'ast-2' }]);
    expect(next.shots).toEqual([{ assetId: null }]);
    expect(next.competitors).toEqual([{ assetId: null }, { assetId: null }]);
    expect(next.logoAssetId).toBeNull();
  });

  it('は他のアセットを触らない', () => {
    expect(detachAsset(workspace, 'ast-9')).toEqual(workspace);
  });
});
