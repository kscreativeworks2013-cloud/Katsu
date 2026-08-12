/*
 * 画像アセットの参照解決と容量方針（第5章 5-1）。
 * メタデータと実体を分け、localStorage にはサムネイルのみを上限付きで持つ。
 */

import type { Asset } from '../data/types';

/** サムネイル1枚あたりの上限（data URI の文字数 ≒ バイト数として扱う）。 */
export const THUMBNAIL_LIMIT_BYTES = 96_000;

/** サムネイル合計の上限。超えた分は登録時にサムネイルなしで受け付ける。 */
export const THUMBNAIL_BUDGET_BYTES = 2_000_000;

/** 参照解決。見つからない場合は undefined を返し、呼び出し側がプレースホルダに落とす。 */
export function resolveAsset(
  assets: Record<string, Asset>,
  assetId: string | null | undefined,
): Asset | undefined {
  if (!assetId) return undefined;
  return assets[assetId];
}

export function thumbnailBytes(assets: Record<string, Asset>): number {
  return Object.values(assets).reduce((sum, asset) => sum + (asset.thumbnail?.length ?? 0), 0);
}

/** 登録時の受け入れ判定。上限超過はサムネイルを落として受け付ける（メタデータは常に保持）。 */
export function fitThumbnail(
  assets: Record<string, Asset>,
  thumbnail: string | undefined,
): string | undefined {
  if (!thumbnail) return undefined;
  if (thumbnail.length > THUMBNAIL_LIMIT_BYTES) return undefined;
  if (thumbnailBytes(assets) + thumbnail.length > THUMBNAIL_BUDGET_BYTES) return undefined;
  return thumbnail;
}

/** 容量超過時の退避：全アセットのサムネイルを落とす。参照とメタデータは失わない。 */
export function stripThumbnails(assets: Record<string, Asset>): Record<string, Asset> {
  return Object.fromEntries(
    Object.entries(assets).map(([id, asset]) => {
      if (!asset.thumbnail) return [id, asset];
      const rest = { ...asset };
      delete rest.thumbnail;
      return [id, rest];
    }),
  );
}

/** 出力物に載せる出自表示（第5章 5-1：説明責任）。 */
export const ASSET_ORIGIN_LABEL: Record<Asset['origin'], string> = {
  upload: '持ち込み',
  external: '外部参照',
  ai: 'AI生成',
};
