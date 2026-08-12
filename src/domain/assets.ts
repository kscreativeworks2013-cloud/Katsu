/*
 * 画像アセットの参照解決と容量方針（第5章 5-1、第6章 6-9）。
 * メタデータと実体を分け、localStorage にはサムネイルのみを上限付きで持つ。
 *
 * この上限（1枚96KB／合計2MB）は localStorage しか保存先が無いことに由来する暫定制約で、
 * backlog 1「原寸アセットの扱い」で保存先ごと置き換える。この制約を前提にした分岐を
 * これ以上増やさないこと（増やすほど置き換え時の手戻りが大きくなる）。
 */

import type { Asset } from '../data/types';

/** サムネイル1枚あたりの上限（data URI の文字数 ≒ バイト数として扱う）。 */
export const THUMBNAIL_LIMIT_BYTES = 96_000;

/** サムネイル合計の上限。 */
export const THUMBNAIL_BUDGET_BYTES = 2_000_000;

/** 上限に近づいたと見なす割合。これを超えたら画面で警告する（第6章 6-9）。 */
export const STORAGE_WARN_RATIO = 0.8;

export type StorageLevel = 'ok' | 'warn' | 'full';

export interface StorageUsage {
  bytes: number;
  budgetBytes: number;
  ratio: number;
  level: StorageLevel;
  /** 実体（サムネイル）を持つアセットの数。 */
  storedCount: number;
  /** 実体を持たない（成果物に入らない）アセットの数。 */
  referenceOnlyCount: number;
}

/** 画像保存の使用量。設定画面での可視化と、登録時の判定に使う（第6章 6-9）。 */
export function storageUsage(assets: Record<string, Asset>): StorageUsage {
  const all = Object.values(assets);
  const bytes = thumbnailBytes(assets);
  const ratio = bytes / THUMBNAIL_BUDGET_BYTES;
  return {
    bytes,
    budgetBytes: THUMBNAIL_BUDGET_BYTES,
    ratio,
    level: ratio >= 1 ? 'full' : ratio >= STORAGE_WARN_RATIO ? 'warn' : 'ok',
    storedCount: all.filter((asset) => asset.thumbnail).length,
    referenceOnlyCount: all.filter((asset) => !asset.thumbnail).length,
  };
}

export interface ThumbnailDecision {
  thumbnail?: string;
  /** 受け入れなかった理由。画面はこれをそのまま利用者に示す（黙って落とさない）。 */
  rejected?: string;
}

/**
 * 登録時の受け入れ判定（第6章 6-9）。
 * 収まらない場合は理由を返す。呼び出し側は必ずその理由を利用者に見せること。
 */
export function decideThumbnail(
  assets: Record<string, Asset>,
  thumbnail: string | undefined,
): ThumbnailDecision {
  if (!thumbnail) return {};

  if (thumbnail.length > THUMBNAIL_LIMIT_BYTES) {
    return {
      rejected: `1枚あたりの上限（${Math.round(THUMBNAIL_LIMIT_BYTES / 1000)}KB）を超えるため保存できません`,
    };
  }

  const used = thumbnailBytes(assets);
  if (used + thumbnail.length > THUMBNAIL_BUDGET_BYTES) {
    return {
      rejected: `画像の保存容量（${Math.round(THUMBNAIL_BUDGET_BYTES / 1_000_000)}MB）がいっぱいのため保存できません。不要な画像を解除してください`,
    };
  }

  return { thumbnail };
}

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
