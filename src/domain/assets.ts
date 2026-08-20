/*
 * 画像アセットの参照解決と印刷解像度の判定（第5章 5-1、第7章 7-2／7-5／7-6）。
 *
 * メタデータ（この Asset）は localStorage、実体（Blob）は AssetBinaryStore という分離。
 * 出力に使えるのは original だけで、preview は画面表示専用。この一貫性を崩さないこと。
 */

import type { Asset, AssetVariant, VariantKind } from '../data/types';

/** 実寸配置での最低ライン。これを下回る画像は警告する（第7章 7-2）。 */
export const MIN_PPI = 200;

/** 目標解像度。表紙などはここを狙う。 */
export const TARGET_PPI = 300;

/** 必要ピクセル数：配置幅(mm) ÷ 25.4 × ppi。 */
export function requiredPixels(widthMm: number, ppi: number = MIN_PPI): number {
  return Math.round((widthMm / 25.4) * ppi);
}

/** 実配置での有効解像度（ppi）。 */
export function effectivePpi(pixels: number, widthMm: number): number {
  if (widthMm <= 0) return 0;
  return Math.round(pixels / (widthMm / 25.4));
}

/** 参照解決。見つからない場合は undefined を返し、呼び出し側がプレースホルダに落とす。 */
export function resolveAsset(
  assets: Record<string, Asset>,
  assetId: string | null | undefined,
): Asset | undefined {
  if (!assetId) return undefined;
  return assets[assetId];
}

export function variantOf(
  asset: Asset | undefined,
  kind: VariantKind,
): AssetVariant | undefined {
  return asset?.variants.find((variant) => variant.kind === kind);
}

/** 出力に使える実体（原寸）を持つか。preview しか無いアセットは出力に使えない。 */
export function hasOriginal(asset: Asset | undefined): boolean {
  return !!variantOf(asset, 'original');
}

/**
 * 用途ごとの variant の選択（第7章 7-7）。
 * ・screen：一覧・タイル。preview を優先する（多数が同時に並ぶため軽さを取る）。
 * ・screen-large：提案書プレビューの大きなスロット。実測で 780px 前後・Retina で
 *   1500px 超になるため preview（長辺800px）では甘い。原寸を優先する。
 * ・output：原寸のみ。無ければ呼び出し側が警告する。
 */
export function pickVariant(
  asset: Asset | undefined,
  use: 'screen' | 'screen-large' | 'output',
): AssetVariant | undefined {
  if (!asset) return undefined;
  const original = variantOf(asset, 'original');
  const preview = variantOf(asset, 'preview');
  if (use === 'output') return original;
  return use === 'screen-large' ? (original ?? preview) : (preview ?? original);
}

/** variant を差し替える（同じ kind は1つまで）。 */
export function withVariant(asset: Asset, variant: AssetVariant): Asset {
  return {
    ...asset,
    variants: [...asset.variants.filter((item) => item.kind !== variant.kind), variant],
  };
}

export interface AssetUsage {
  /** メタデータ上の実体の合計バイト数。 */
  bytes: number;
  /** ブラウザが見積もる利用可能容量（取得できない環境では undefined）。 */
  quotaBytes?: number;
  /** 原寸を持つアセットの数（＝出力に使えるもの）。 */
  originalCount: number;
  /** preview しか持たないアセットの数（＝出力に使えないもの）。 */
  previewOnlyCount: number;
  /** 実体をまったく持たないアセットの数。 */
  referenceOnlyCount: number;
  /** 記述子はあるのに実体が取れないアセットの数（第7章 7-11）。 */
  missingCount: number;
}

/**
 * 保存状況の集計（第7章 7-10）。
 * IndexedDB の上限はブラウザが動的に決めるため、固定の上限値は持たない。
 */
/**
 * 保存領域が逼迫していると見なす割合（第9章 工程R-4）。
 *
 * 分子はアプリが数えた variant のバイト数、分母はブラウザの見積もる quota。
 * `navigator.storage.estimate()` の usage は使わない——実測で桁が合わなかった
 * （アプリの合計 5,670,182 に対し estimate は 597,210。書き出したファイルの大きさ
 * 7,614,731 ＝ 合計 × 4/3 ＋ JSON 分 と整合するのはアプリ側の数字のほう）。
 */
export const STORAGE_WARN_RATIO = 0.8;

/** 保存領域の逼迫度。quota が取れない環境では判定しない（undefined）。 */
export function storagePressure(usage: AssetUsage): number | undefined {
  if (!usage.quotaBytes || usage.quotaBytes <= 0) return undefined;
  return usage.bytes / usage.quotaBytes;
}

/** 逼迫していて、これ以上の登録が失敗しうる状態か。 */
export function storageIsTight(usage: AssetUsage): boolean {
  const ratio = storagePressure(usage);
  return ratio !== undefined && ratio >= STORAGE_WARN_RATIO;
}

export function assetUsage(
  assets: Record<string, Asset>,
  missingIds: readonly string[] = [],
  quotaBytes?: number,
): AssetUsage {
  const all = Object.values(assets);
  const missing = new Set(missingIds);
  return {
    bytes: all.reduce(
      (sum, asset) => sum + asset.variants.reduce((inner, item) => inner + item.bytes, 0),
      0,
    ),
    quotaBytes,
    originalCount: all.filter((asset) => hasOriginal(asset) && !missing.has(asset.id)).length,
    previewOnlyCount: all.filter(
      (asset) => !hasOriginal(asset) && asset.variants.length > 0 && !missing.has(asset.id),
    ).length,
    referenceOnlyCount: all.filter((asset) => asset.variants.length === 0).length,
    missingCount: all.filter((asset) => missing.has(asset.id)).length,
  };
}

/**
 * メタデータと実体の突き合わせ（第7章 7-11）。
 * 記述子はあるのに実体が無いものが消失。両者の不一致が消失の唯一の観測点になる。
 */
export function detectMissingAssets(
  assets: Record<string, Asset>,
  storedKeys: readonly string[],
): string[] {
  const keys = new Set(storedKeys);
  return Object.values(assets)
    .filter(
      (asset) =>
        asset.variants.length > 0 && asset.variants.every((variant) => !keys.has(variant.key)),
    )
    .map((asset) => asset.id);
}

/** どのアセットからも参照されていない実体のキー（孤児）。 */
export function orphanKeys(
  assets: Record<string, Asset>,
  storedKeys: readonly string[],
): string[] {
  const known = new Set(
    Object.values(assets).flatMap((asset) => asset.variants.map((variant) => variant.key)),
  );
  return storedKeys.filter((key) => !known.has(key));
}

/** 出力物に載せる出自表示（第5章 5-1：説明責任）。 */
export const ASSET_ORIGIN_LABEL: Record<Asset['origin'], string> = {
  upload: '持ち込み',
  external: '外部参照',
  ai: 'AI生成',
};
