import type { CSSProperties } from 'react';
import type { Asset } from '../data/types';
import { useAssetImage } from '../store/context';

/**
 * アセットの画面表示（第7章 7-7）。
 * 実体は非同期に取り出すので、取れるまでと取れなかった場合はプレースホルダを出す。
 * object URL の生存管理は useAssetImage（＝ImageCache）が持つ。
 */
export function AssetImage({
  asset,
  alt,
  fallback,
  className = 'tile-art',
  style,
  large = false,
}: {
  asset: Asset | undefined;
  alt: string;
  /** アセットが無い／実体が取れないときのグラデーション。 */
  fallback?: { from: string; to: string };
  className?: string;
  style?: CSSProperties;
  /** 大きく表示するスロット（幅がタイルより広い）。原寸を使う。 */
  large?: boolean;
}) {
  const url = useAssetImage(asset, large);

  if (url) {
    return (
      <img
        className={className}
        src={url}
        alt={alt}
        style={{ objectFit: 'cover', width: '100%', ...style }}
      />
    );
  }

  return (
    <div
      className={className}
      style={
        fallback
          ? ({ '--from': fallback.from, '--to': fallback.to, ...style } as CSSProperties)
          : style
      }
      aria-hidden="true"
    />
  );
}
