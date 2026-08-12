/*
 * 解決フェーズ（第7章 7-8）。
 *
 * 構築（buildProposalIR、同期）とレンダリング（IR のみ、ネットワーク不可）の間に挟み、
 * AssetBinaryStore から実体を取り出して image ブロックに data を埋める。
 * これで第6章のレンダラ契約を崩さずに原寸を成果物へ運べる。
 */

import type { Asset, AssetResolution } from '../data/types';
import { pickVariant } from './assets';
import type { AssetBinaryStore } from './assetStore';
import type { IRWarning, ProposalIR } from './ir';
import { blobToDataUri } from '../lib/imageProcessing';

export interface ResolveOutcome {
  /** 実体を埋めた IR。revision は構築時のまま変わらない（第7章 7-9）。 */
  ir: ProposalIR;
  resolution: AssetResolution;
  /** 消失（記述子はあるのに実体が無い）を検出したアセットID。 */
  missingAssetIds: string[];
}

/** 原寸で解決できなかった出力は、履歴とファイル名で区別する（第7章 7-9）。 */
export function isDegraded(resolution: AssetResolution): boolean {
  return resolution.previewFallback > 0 || resolution.missing > 0;
}

/**
 * 出力用に実体を解決する。
 * 原寸が取れないときは preview へ落とし、それも無ければ欠損として警告を足す。
 * 黙って劣化させない（第7章 7-11）。
 */
export async function resolveProposalAssets(
  ir: ProposalIR,
  store: AssetBinaryStore,
  assets: Record<string, Asset>,
): Promise<ResolveOutcome> {
  const resolution: AssetResolution = { original: 0, previewFallback: 0, missing: 0 };
  const warnings: IRWarning[] = [];
  const missingAssetIds = new Set<string>();
  // 同じアセットが複数のスロットに出るため、取得は1アセット1回に抑える。
  const loaded = new Map<string, string | undefined>();

  const dataFor = async (key: string): Promise<string | undefined> => {
    if (loaded.has(key)) return loaded.get(key);
    const blob = await store.get(key);
    const uri = blob ? await blobToDataUri(blob).catch(() => undefined) : undefined;
    loaded.set(key, uri);
    return uri;
  };

  const sections = await Promise.all(
    ir.sections.map(async (section) => ({
      ...section,
      blocks: await Promise.all(
        section.blocks.map(async (block) => {
          if (block.type !== 'image' || !block.assetId) return block;

          const asset = assets[block.assetId];
          const original = pickVariant(asset, 'output');
          const data = original ? await dataFor(original.key) : undefined;
          if (data) {
            resolution.original += 1;
            return { ...block, data };
          }

          // 原寸が取れない：preview で出せるか試す（出せても劣化として数える）。
          const preview = asset?.variants.find((variant) => variant.kind === 'preview');
          const fallback = preview ? await dataFor(preview.key) : undefined;
          // 記述子があるのに実体が取れないものだけが消失（第7章 7-11）。
          if (original) missingAssetIds.add(asset.id);

          if (fallback) {
            resolution.previewFallback += 1;
            // 原寸が最初から無い場合は構築時の preview-only 警告で足りるので重ねない。
            if (original) {
              warnings.push({
                kind: 'missing-binary',
                severity: 'warn',
                sectionId: section.id,
                message: `${block.caption} は原寸を取り出せなかったため、表示用の縮小版で出力します（印刷品質は下がります）。`,
              });
            }
            return { ...block, data: fallback };
          }

          if (asset && asset.variants.length > 0) {
            resolution.missing += 1;
            missingAssetIds.add(asset.id);
            warnings.push({
              kind: 'missing-binary',
              severity: 'warn',
              sectionId: section.id,
              message: `${block.caption} の画像が失われているため、この出力には含まれません。登録し直してください。`,
            });
          }
          return block;
        }),
      ),
    })),
  );

  return {
    ir: { ...ir, sections, warnings: [...ir.warnings, ...warnings] },
    resolution,
    missingAssetIds: [...missingAssetIds],
  };
}
