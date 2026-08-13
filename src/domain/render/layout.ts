/*
 * 版面定義（第8章 8-4）。
 *
 * 位置と大きさは判型に対する**比率**で持ち、実寸（ポイント）への展開はレンダラが行う。
 * これにより 16:9 は A4横の版面からの派生になり、版面定義を判型ごとに書き分けずに済む。
 */

export interface PageFormat {
  label: string;
  widthPt: number;
  heightPt: number;
  widthMm: number;
  heightMm: number;
}

const MM_PER_PT = 25.4 / 72;

export const A4_LANDSCAPE: PageFormat = {
  label: 'A4横',
  widthPt: 841.89,
  heightPt: 595.28,
  widthMm: 297,
  heightMm: 210,
};

/** PowerPoint と同じ 16:9。A4横の版面をそのまま流し込む先（第8章 8-2）。 */
export const SCREEN_16_9: PageFormat = {
  label: '16:9',
  widthPt: 960,
  heightPt: 540,
  widthMm: 960 * MM_PER_PT,
  heightMm: 540 * MM_PER_PT,
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
  return {
    x: rect.x * format.widthPt,
    y: format.heightPt - (rect.y + rect.h) * format.heightPt,
    width: rect.w * format.widthPt,
    height: rect.h * format.heightPt,
  };
}

/** 比率の配置幅を mm に。印刷解像度の判定（第7章 7-2）はこの実寸で行う。 */
export function widthToMm(ratio: number, format: PageFormat): number {
  return Math.round(ratio * format.widthMm);
}

/**
 * 印刷の安全マージン（mm）。文字はこれより内側に置く。
 * 裁ち落としの画像は面いっぱいに敷いてよいが、読ませる要素は必ずこの内側。
 */
export const SAFE_MARGIN_MM = 15;

export function safeMargin(format: PageFormat): { x: number; y: number } {
  return { x: SAFE_MARGIN_MM / format.widthMm, y: SAFE_MARGIN_MM / format.heightMm };
}

/**
 * 章ごとの扱い（第8章 8-5）。
 * ・visual：画像が面を支配する。前半（提案の見せ場）。
 * ・dense：情報密度を優先する。後半（実務の詰め）。
 */
export type SectionMode = 'visual' | 'dense';

export const SECTION_MODE: Record<string, SectionMode> = {
  cover: 'visual',
  brand: 'visual',
  competitors: 'visual',
  concept: 'visual',
  moodboard: 'visual',
  shots: 'dense',
  lighting: 'dense',
  works: 'dense',
  staff: 'dense',
  schedule: 'dense',
  budget: 'dense',
  risk: 'dense',
};

export function sectionMode(sectionId: string): SectionMode {
  return SECTION_MODE[sectionId] ?? 'dense';
}

export interface LayoutSpec {
  id: string;
  label: string;
  summary: string;
  /** 画像帯の高さの下限・上限（本文量に応じてこの範囲で伸縮する）。 */
  band: { min: number; max: number };
  /** ムードボードのタイル配置。最終ページは残数に応じて再配分する。 */
  moodboard: { cols: number; rows: number; gap: number };
  /**
   * ショットリストのフィルムストリップ。枠幅は常に perPage 分割で、枚数では変えない。
   * 面に入る段数は rows まで（残りが1段に満たない面を作らない）。
   * 帯の高さは仕様の量に応じて strip の範囲で伸縮する。
   */
  shots: { perPage: number; rows: number; strip: { min: number; max: number } };
  /** dense 面の段組み。テキストだけの章は1段＝1章として詰める。 */
  dense: { columns: number; gap: number };
  /** 文字サイズ（ページ高さに対する比率）。 */
  type: { title: number; heading: number; body: number; caption: number };
}

/**
 * 採用版面（第8章 8-5）。
 * 前半は B（ギャラリー）の画像支配度、後半は C（コンタクトシート）の密度に
 * A（エディトリアル）の仕様併記を組み合わせる。表紙は C。
 * 見出し・キャプション・出自表示はどのモードでも落とさない（機能であって装飾ではない）。
 */
export const ADOPTED_LAYOUT: LayoutSpec = {
  id: 'adopted',
  label: '採用版面（前半＝画像支配／後半＝密度）',
  summary:
    '表紙は画像＋クリーム地。前半は画像が面を支配し、見出しとキャプション（出自つき）は必ず残す。後半は2段組の密度でまとめ、ショットリストはフィルムストリップにカット別仕様を併記する。',
  band: { min: 0.4, max: 0.74 },
  moodboard: { cols: 3, rows: 2, gap: 0.01 },
  shots: { perPage: 4, rows: 2, strip: { min: 0.4, max: 0.56 } },
  dense: { columns: 2, gap: 0.035 },
  // 本文は2段組の測度（片段で約33字）に対して決める。小さすぎると提案書として読めない。
  type: { title: 0.055, heading: 0.03, body: 0.0185, caption: 0.0125 },
};

/**
 * スロットの配置幅（判型に対する比率）を版面定義から導く（第8章 8-4）。
 *
 * 印刷解像度の判定（第7章 7-2）はここから mm に展開した値で行う。手で並べた定数だと、
 * 版面を動かしたときに判定だけが古いまま残る。版面が真実の側であることを崩さない。
 */
export function slotWidthRatio(slotId: string, spec: LayoutSpec = ADOPTED_LAYOUT): number {
  const inner =
    1 - SAFE_MARGIN_MM / A4_LANDSCAPE.widthMm - SAFE_MARGIN_MM / A4_LANDSCAPE.widthMm;
  const tile = (cols: number, gap: number): number => (inner - gap * (cols - 1)) / cols;

  switch (slotId) {
    // 表紙とコンセプトは全面ブリード（余白を取らない）。
    case 'cover-key':
    case 'concept-key':
      return 1;
    // 画像帯に2枚並ぶ面。
    case 'brand-mood':
    case 'works-grid':
      return (1 - 0.008) / 2;
    case 'competitor-refs':
      return (1 - 0.008 * 2) / 3;
    case 'mood-tiles':
      return tile(spec.moodboard.cols, spec.moodboard.gap);
    case 'shot-frames':
      return tile(spec.shots.perPage, 0.006);
    case 'cover-logo':
      return 0.2;
    default:
      return tile(3, 0.01);
  }
}

/** スロットの配置幅（mm）。判定はこの実寸で行う。 */
export function slotWidthMm(slotId: string, format: PageFormat = A4_LANDSCAPE): number {
  return widthToMm(slotWidthRatio(slotId), format);
}

export interface TileGridOptions {
  /** 1行に並べる最大枚数。枚数がこれを下回る面では、その枚数が列数になる。 */
  cols: number;
  /** タイル間の隙間（幅比率）。行間にも同じ値を使う。 */
  gap: number;
  /** 枠の縦横比（横/縦）の上限。超えて横に伸ばすと縦位置の人物が帯になる。 */
  maxAspect: number;
  /** 枠のうちキャプションに残す高さ（高さ比率）。縦横比は画像部分で判定する。 */
  captionRatio: number;
  format: PageFormat;
}

/**
 * タイル面の格子（第8章 8-6）。
 *
 * **列グリッドと左端は面の中で一定に保つ。** 残数に応じて変えてよいのは面全体の列数だけで、
 * 半端な行だけを広げたり中央に寄せたりしない（上段と下段で幅も左端も違う面になる）。
 * 枚数が列数を下回る面では、その枚数を列数として組み直す（2枚だけの面を作らない）。
 */
export function tileGrid(count: number, area: Rect, options: TileGridOptions): Rect[] {
  const { cols, gap, maxAspect, captionRatio, format } = options;
  const usedCols = Math.max(1, Math.min(cols, count));
  const usedRows = Math.max(1, Math.ceil(count / usedCols));

  const cellH = (area.h - gap * (usedRows - 1)) / usedRows;
  // 縦横比の上限は画像部分（キャプションを除いた高さ）で見る。比率は判型で実寸に直す。
  const capped = ((cellH - captionRatio) * maxAspect * format.heightPt) / format.widthPt;
  const cellW = Math.min((area.w - gap * (usedCols - 1)) / usedCols, capped);

  return Array.from({ length: count }, (_, index) => {
    const row = Math.floor(index / usedCols);
    return {
      x: area.x + (index - row * usedCols) * (cellW + gap),
      y: area.y + row * (cellH + gap),
      w: cellW,
      h: cellH,
    };
  });
}
