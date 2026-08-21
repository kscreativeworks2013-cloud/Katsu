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
 * 台紙（ムードボードのタイル面）の内側の余白（mm）。
 * 台紙そのものは安全マージンに揃える。半端な位置（版面とも断ち落としとも違う）に置くと、
 * 面の中に3本目の基準線ができる。タイルはこの余白ぶん内側に入る。
 */
export const MAT_PADDING_MM = 6;

export function matPadding(format: PageFormat): { x: number; y: number } {
  return { x: MAT_PADDING_MM / format.widthMm, y: MAT_PADDING_MM / format.heightMm };
}

/**
 * 本文の最大測度（全角の字数）。日本語の本文はこれより長いと行を追えなくなる。
 * 段組みをやめて1段で組む面でも、面の幅いっぱいには広げない根拠。
 */
export const MAX_MEASURE_CHARS = 45;

/**
 * 本文の最小測度（全角の字数）。これを割ると1行に入る語が少なすぎて読めない。
 * 段組みは面の幅ではなく測度で決める（狭い面で2段に割らないための下限）。
 */
export const MIN_MEASURE_CHARS = 24;

/**
 * 1段に置く最小の項目数（段落・箇条の数）。
 * 判定を行数にすると、1項目が2行に折れただけの段を「足りている」と見なしてしまう。
 * 読み手が段として認識するのは行ではなく項目の並びなので、項目数で判定する。
 */
export const MIN_COLUMN_ITEMS = 2;

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

/**
 * リード文として置ける行数（第9章 工程R-3）。
 *
 * 表紙とムードボードは画像が面を支配するので、本文をそのまま流す場所がない。
 * それでも**何も置けない**わけではなく、表紙は題字の下、ムードボードは台紙の上に
 * リードを2行まで置ける。ここを超えた行は版面に載らない。
 *
 * この数はレンダラと提出前チェックの両方が参照する。片方だけが知っていると、
 * 「載らなかったのに知らせない」（実測：199字が黙って消えた）か、
 * 「知らせたのに実は載っていた」のどちらかが起きる。
 */
export const LEAD_LINES = 2;

/**
 * 章の本文を何行まで版面が受け取るか。
 * `Infinity` は段組みへ全量流し込む面（本文が主役の面）。
 */
export function bodyCapacity(sectionId: string, hasImages: boolean): number {
  // 画像が1枚も無い章はテキスト面へ落ちるので、全量が載る。
  if (!hasImages) return Number.POSITIVE_INFINITY;
  if (sectionId === 'cover' || sectionId === 'moodboard') return LEAD_LINES;
  return Number.POSITIVE_INFINITY;
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

/** 枠の縦横比（横/縦）の上限。超えて横に伸ばすと縦位置の人物が帯になる。 */
export const MAX_CELL_ASPECT = 1.5;

/**
 * 面に共通の寸法。レンダラと配置幅の導出が同じ値を読むための一次情報（第8章 8-4）。
 * ここを唯一の出所にしないと、「警告が言う配置幅」と「実際に置いた幅」がずれる。
 */
export function pageMetrics(
  spec: LayoutSpec = ADOPTED_LAYOUT,
  format: PageFormat = A4_LANDSCAPE,
) {
  const margin = safeMargin(format);
  return {
    margin,
    /** 枠の下にキャプションのために残す高さ。 */
    captionRatio: spec.type.caption * 1.9,
    /** 見出しの下端から本文・画像までの間隔。 */
    afterHeading: 0.035,
    /**
     * 面の頭に置く見出しのベースライン。安全マージンは字面ではなくフォントの
     * アセンダ枠で見る（1mm でも外に出れば、断裁のばらつきで削れる）。
     */
    headTop: margin.y + spec.type.heading * 1.2,
    /** 画像帯の枠間。 */
    bandGap: 0.008,
    /** フィルムストリップの枠間。 */
    shotGap: 0.006,
  };
}

export interface GridOptions {
  /** 1行に並べる最大枚数。 */
  cols: number;
  /** 1面に積む最大の段数。 */
  rows: number;
  gap: number;
  maxAspect: number;
  captionRatio: number;
  format: PageFormat;
}

/**
 * その面に置く列数（第8章 8-6）。
 * 「段数を増やさずに、行の欠けが最も少なくなる数」を選ぶ。
 * 6枚→3+3、5枚→3+2、4枚→2+2、2枚→2。4枚を3+1にすると最終面の右が大きく空く。
 */
export function gridColumns(count: number, cols: number): number {
  if (count <= 0) return 1;
  const rows = Math.max(1, Math.ceil(count / cols));
  return Math.max(1, Math.min(cols, Math.ceil(count / rows)));
}

/**
 * 章全体で1つの枠寸法を決める（第8章 8-6）。
 * 面ごとに残数から寸法を出すと、同じ章の同じ枠が面によって大きさを変える
 * （実測：1面目 83mm・2面目 106mm）。寸法は**最初の面の並び**で決め、
 * 以降の面は枚数が減っても同じ寸法を使う。
 */
export function cellSize(
  total: number,
  area: Rect,
  options: GridOptions,
): { w: number; h: number } {
  const { cols, rows, gap, maxAspect, captionRatio, format } = options;
  const first = Math.max(1, Math.min(total, cols * rows));
  const usedCols = gridColumns(first, cols);
  const usedRows = Math.max(1, Math.ceil(first / usedCols));

  const h = (area.h - gap * (usedRows - 1)) / usedRows;
  // 縦横比の上限は画像部分（キャプションを除いた高さ）で見る。比率は判型で実寸に直す。
  const capped = ((h - captionRatio) * maxAspect * format.heightPt) / format.widthPt;
  return { w: Math.min((area.w - gap * (usedCols - 1)) / usedCols, capped), h };
}

/**
 * その面の枠の位置。**左端と列グリッドは面の中で一定に保つ。**
 * 半端な行だけを広げたり中央に寄せたりしない（上段と下段で幅も左端も違う面になる）。
 */
export function gridCells(
  count: number,
  area: Rect,
  cell: { w: number; h: number },
  options: GridOptions,
): Rect[] {
  const usedCols = gridColumns(count, options.cols);
  const rows = Math.ceil(count / usedCols);

  return Array.from({ length: count }, (_, index) => {
    const row = Math.floor(index / usedCols);
    const column = index - row * usedCols;
    /*
     * 欠けた行は中央に寄せる（第9章 工程R-7）。
     *
     * 左詰めのままだと、5点の面が 3+2 になって最終行の右が空き、面が left-heavy に見える。
     * 台紙は列数ぶんの幅で引くので、行だけを中に寄せれば版面の重心が戻る。
     * 枠寸法は動かさない（面をまたいだ寸法の統一を崩さない／第8章 8-6）。
     */
    const inRow = row === rows - 1 ? count - row * usedCols : usedCols;
    const indent = ((usedCols - inRow) * (cell.w + options.gap)) / 2;

    return {
      x: area.x + indent + column * (cell.w + options.gap),
      y: area.y + row * (cell.h + options.gap),
      w: cell.w,
      h: cell.h,
    };
  });
}

/** タイル面（ムードボード）の格子の条件。 */
export function tileOptions(
  spec: LayoutSpec = ADOPTED_LAYOUT,
  format: PageFormat = A4_LANDSCAPE,
): GridOptions {
  return {
    cols: spec.moodboard.cols,
    rows: spec.moodboard.rows,
    gap: spec.moodboard.gap,
    maxAspect: MAX_CELL_ASPECT,
    captionRatio: pageMetrics(spec, format).captionRatio,
    format,
  };
}

/** タイルを置ける領域（台紙の内側）。台紙自身はタイル群の実寸に合わせて縮める。 */
export function tileArea(
  spec: LayoutSpec = ADOPTED_LAYOUT,
  format: PageFormat = A4_LANDSCAPE,
): Rect {
  const { margin, headTop, afterHeading } = pageMetrics(spec, format);
  const pad = matPadding(format);
  const top = headTop + afterHeading;
  return {
    x: margin.x + pad.x,
    y: top + pad.y,
    w: 1 - margin.x * 2 - pad.x * 2,
    h: 1 - top - margin.y - pad.y * 2,
  };
}

/** フィルムストリップの格子の条件。 */
export function shotOptions(
  spec: LayoutSpec = ADOPTED_LAYOUT,
  format: PageFormat = A4_LANDSCAPE,
): GridOptions {
  return {
    cols: spec.shots.perPage,
    rows: spec.shots.rows,
    gap: pageMetrics(spec, format).shotGap,
    maxAspect: MAX_CELL_ASPECT,
    captionRatio: pageMetrics(spec, format).captionRatio,
    format,
  };
}

/**
 * フィルムストリップを置ける領域。
 * 高さは**段数だけ**から決める（本文の量で動かさない）。本文量に連動させると、
 * 配置幅が組版の結果に依存して先に決められなくなり、解像度の判定が版面とずれる。
 */
export function shotArea(
  total: number,
  spec: LayoutSpec = ADOPTED_LAYOUT,
  format: PageFormat = A4_LANDSCAPE,
): Rect {
  const { margin, headTop, afterHeading } = pageMetrics(spec, format);
  const first = Math.max(1, Math.min(total, spec.shots.perPage * spec.shots.rows));
  const usedRows = Math.max(1, Math.ceil(first / gridColumns(first, spec.shots.perPage)));
  const top = headTop + afterHeading;
  return {
    x: margin.x,
    y: top,
    w: 1 - margin.x * 2,
    h: usedRows > 1 ? spec.shots.strip.max * 1.1 : spec.shots.strip.max,
  };
}

/** 画像帯（ブランド分析・競合分析・実績）の枠。最大3枠を面幅に等分する。 */
export function bandCells(
  count: number,
  band: number,
  spec: LayoutSpec = ADOPTED_LAYOUT,
  format: PageFormat = A4_LANDSCAPE,
): Rect[] {
  const gap = pageMetrics(spec, format).bandGap;
  const shown = Math.max(1, Math.min(count, 3));
  const w = (1 - gap * (shown - 1)) / shown;
  return Array.from({ length: shown }, (_, index) => ({
    x: index * (w + gap),
    y: 0,
    w,
    h: band,
  }));
}

/**
 * スロットに置く枠の幅（判型に対する比率）を、**その面での実際の面付け**から導く。
 *
 * 枠種ごとに単一の定数を返していたときは、同じ枠でも面付けが変わると値が古くなった
 * （実測：実績は147mmと申告して97mmで置き、ムードボードは2列の面でも83mmと申告していた）。
 * 配置幅は列数と領域から決まるので、レンダラが使うのと同じ関数から取る。
 */
export function slotWidthRatio(
  slotId: string,
  count = 1,
  spec: LayoutSpec = ADOPTED_LAYOUT,
  format: PageFormat = A4_LANDSCAPE,
): number {
  switch (slotId) {
    // 表紙とコンセプトは全面ブリード（余白を取らない）。
    case 'cover-key':
    case 'concept-key':
      return 1;
    case 'cover-logo':
      return 0.12;
    case 'mood-tiles':
      return cellSize(count, tileArea(spec, format), tileOptions(spec, format)).w;
    case 'shot-frames':
      return cellSize(count, shotArea(count, spec, format), shotOptions(spec, format)).w;
    // 画像帯に並ぶ面（ブランド分析・競合分析・実績）。
    default:
      return bandCells(count, 0.5, spec, format)[0].w;
  }
}

/** スロットの配置幅（mm）。印刷解像度の判定はこの実寸で行う。 */
export function slotWidthMm(
  slotId: string,
  count = 1,
  spec: LayoutSpec = ADOPTED_LAYOUT,
  format: PageFormat = A4_LANDSCAPE,
): number {
  return widthToMm(slotWidthRatio(slotId, count, spec, format), format);
}
