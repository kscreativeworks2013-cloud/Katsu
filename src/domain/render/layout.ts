/*
 * 版面定義（第8章 8-4）。
 *
 * 位置と大きさは判型に対する**比率**で持ち、実寸（ポイント）への展開はレンダラが行う。
 * これにより 16:9 は A4横の版面からの派生になり、版面定義を判型ごとに書き分けずに済む。
 * 比率で表せないもの（本文の最小可読サイズ）だけを絶対値で持つ。
 */

export interface PageFormat {
  label: string;
  widthPt: number;
  heightPt: number;
  widthMm: number;
}

const MM_PER_PT = 25.4 / 72;

export const A4_LANDSCAPE: PageFormat = {
  label: 'A4横',
  widthPt: 841.89,
  heightPt: 595.28,
  widthMm: 297,
};

/** PowerPoint と同じ 16:9。A4横の版面をそのまま流し込む先（第8章 8-2）。 */
export const SCREEN_16_9: PageFormat = {
  label: '16:9',
  widthPt: 960,
  heightPt: 540,
  widthMm: 960 * MM_PER_PT,
};

/** 版面内の矩形。左上原点・0..1 の比率で持つ（PDF の座標系への変換はレンダラ側）。 */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 比率の矩形を実寸へ。PDF は左下原点なので y を反転する。 */
export function toPoints(
  rect: Rect,
  format: PageFormat,
): { x: number; y: number; width: number; height: number } {
  const width = rect.w * format.widthPt;
  const height = rect.h * format.heightPt;
  return {
    x: rect.x * format.widthPt,
    y: format.heightPt - (rect.y + rect.h) * format.heightPt,
    width,
    height,
  };
}

/** 比率の配置幅を mm に。印刷解像度の判定（第7章 7-2）はこの実寸で行う。 */
export function widthToMm(ratio: number, format: PageFormat): number {
  return Math.round(ratio * format.widthMm);
}

export type CoverStyle = 'full-bleed' | 'split' | 'stack';
export type ShotStyle = 'filmstrip' | 'grid';

export interface LayoutVariant {
  id: 'editorial' | 'gallery' | 'contact';
  label: string;
  /** 方針。仕様書に載せる10行程度の記述と対応する。 */
  summary: string;
  /** ページ余白（幅に対する比率）。断ち落としの面はこれを無視する。 */
  margin: number;
  cover: CoverStyle;
  /** ムードボードのタイル配置。bleed=true は余白なしの断ち落とし。 */
  moodboard: { cols: number; rows: number; gap: number; bleed: boolean; captions: boolean };
  shots: ShotStyle;
  /** テキスト章の版面。band は先頭に置く画像帯の高さ比（0 なら画像なし）。 */
  textPage: { columns: 1 | 2; band: number };
  /** 文字サイズ（ページ高さに対する比率）。 */
  type: { title: number; heading: number; body: number; caption: number };
}

/**
 * 版面案3本（第8章 8-3 の観点で比較する）。
 * 差は「画像がどれだけ面を支配するか」と「テキストがどこに従属するか」に集約している。
 */
export const LAYOUT_VARIANTS: LayoutVariant[] = [
  {
    id: 'editorial',
    label: 'A：エディトリアル',
    summary:
      '表紙は全面ブリード。各章は右2/3が画像、左1/3がテキストの固定グリッドで、視線が常に画像から始まる。ムードボードは3×2の大判タイル、ショットリストは横フィルムストリップ。',
    margin: 0.045,
    moodboard: { cols: 3, rows: 2, gap: 0.012, bleed: false, captions: true },
    cover: 'full-bleed',
    shots: 'filmstrip',
    textPage: { columns: 1, band: 0.42 },
    type: { title: 0.062, heading: 0.032, body: 0.017, caption: 0.013 },
  },
  {
    id: 'gallery',
    label: 'B：ギャラリー',
    summary:
      '画像を最優先し、テキストは最小限のキャプションに落とす。表紙も章扉も全面ブリード。ムードボードは4×3の断ち落としグリッドで余白を持たない。ページ数は増えるが、1面あたりの情報は最も少ない。',
    margin: 0.03,
    cover: 'full-bleed',
    moodboard: { cols: 4, rows: 3, gap: 0, bleed: true, captions: false },
    shots: 'grid',
    textPage: { columns: 1, band: 0.62 },
    type: { title: 0.07, heading: 0.03, body: 0.016, caption: 0.012 },
  },
  {
    id: 'contact',
    label: 'C：コンタクトシート',
    summary:
      '情報密度を優先する。表紙は上2/3が画像、下1/3に案件情報。ムードボードは6×3の小タイルを1ページに収め、ショットリストは絵コンテ＋仕様を並べる。テキストは2段組。ページ数は最も少ない。',
    margin: 0.04,
    cover: 'stack',
    moodboard: { cols: 6, rows: 3, gap: 0.008, bleed: false, captions: true },
    shots: 'grid',
    textPage: { columns: 2, band: 0.3 },
    type: { title: 0.05, heading: 0.026, body: 0.015, caption: 0.011 },
  },
];

export function variantById(id: string): LayoutVariant {
  const found = LAYOUT_VARIANTS.find((variant) => variant.id === id);
  if (!found) throw new Error(`未知の版面案：${id}`);
  return found;
}
