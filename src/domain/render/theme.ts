/*
 * ブランドカラーからの版面色の導出（第8章 8-7）。
 *
 * 紙色・墨色・差し色・台紙をブランドのパレットから相対的に決める。定数で持つと
 * テンプレートを差し替えたときに色だけが前の案件のまま残る。特に台紙（ムードボードの
 * タイル面）は紙色と差し色からの相対値であることが要件で、固定値にすると紙色を
 * 変えたときに関係が壊れる（第8章 8-5 の台紙はこの関係を保ったまま動く必要がある）。
 *
 * 出力形式に依存しないよう、ここでは色を16進文字列で持つ（PDF・PowerPoint の双方が使う）。
 */

export interface RenderTheme {
  /** 紙色。面の地。 */
  paper: string;
  /** 墨色。本文と見出し。 */
  ink: string;
  /** 差し色。ブランド名や小見出し。 */
  accent: string;
  /** 台紙。タイル面だけに敷く、紙色より1〜2段暗いトーン。 */
  mat: string;
  /** 台紙の上に置くタイルの境界線。素材の明暗に関わらず枠を成立させる。 */
  matEdge: string;
  /** キャプション・注記の弱い文字色。 */
  muted: string;
}

interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** パレットが空のときの既定（第1章のトーン）。 */
const FALLBACK = ['#12100E', '#F3ECE2', '#B3936A', '#7C6A58'];

function parseHex(hex: string): Rgb | undefined {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return undefined;
  const value = Number.parseInt(match[1], 16);
  return {
    r: ((value >> 16) & 0xff) / 255,
    g: ((value >> 8) & 0xff) / 255,
    b: (value & 0xff) / 255,
  };
}

function toHex({ r, g, b }: Rgb): string {
  const part = (value: number): string =>
    Math.round(Math.min(1, Math.max(0, value)) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${part(r)}${part(g)}${part(b)}`.toUpperCase();
}

function luminance({ r, g, b }: Rgb): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function saturation({ r, g, b }: Rgb): number {
  return Math.max(r, g, b) - Math.min(r, g, b);
}

function mix(from: Rgb, to: Rgb, amount: number): Rgb {
  return {
    r: from.r + (to.r - from.r) * amount,
    g: from.g + (to.g - from.g) * amount,
    b: from.b + (to.b - from.b) * amount,
  };
}

function scale(color: Rgb, factor: number): Rgb {
  return { r: color.r * factor, g: color.g * factor, b: color.b * factor };
}

const WHITE: Rgb = { r: 1, g: 1, b: 1 };
const BLACK: Rgb = { r: 0, g: 0, b: 0 };

/** 紙は必ずこの明るさ以上に。素材の白が紙に沈むのを防ぐ。 */
const PAPER_LUMINANCE = 0.94;
/** 墨は必ずこの明るさ以下に。本文の可読性は版面の前提。 */
const INK_LUMINANCE = 0.06;
/** 台紙は紙色のこの倍率まで落とす（1〜2段）。 */
const MAT_FACTOR = 0.88;
/** 台紙に混ぜる差し色の量。ブランドの色みを台紙に移す。 */
const MAT_TINT = 0.08;

/**
 * ブランドのパレットから版面色を導く。
 * パレットの並び順には依存しない（明度と彩度で役割を決める）ので、
 * 案件ごとに色数や順序が違っても同じ規則で決まる。
 */
export function deriveTheme(palette?: { hex: string }[]): RenderTheme {
  const colors = (palette ?? [])
    .map((entry) => parseHex(entry.hex))
    .filter((color): color is Rgb => color !== undefined);
  const source = colors.length > 0 ? colors : (FALLBACK.map(parseHex) as Rgb[]);

  const sorted = [...source].sort((a, b) => luminance(a) - luminance(b));
  const darkest = sorted[0];
  const lightest = sorted[sorted.length - 1];
  // 差し色は最も彩度の高い色。無彩色のパレットなら中間の明度の色を使う。
  const accentSource = [...source].sort((a, b) => saturation(b) - saturation(a))[0];

  const paperLum = luminance(lightest);
  const paper = mix(
    lightest,
    WHITE,
    paperLum >= PAPER_LUMINANCE ? 0 : (PAPER_LUMINANCE - paperLum) / (1 - paperLum),
  );

  const inkLum = luminance(darkest);
  const ink = mix(darkest, BLACK, inkLum <= INK_LUMINANCE ? 0 : 1 - INK_LUMINANCE / inkLum);

  // 差し色は紙の上で読めるところまで落とす（明るいパレットでも小見出しが飛ばない）。
  const accentLum = luminance(accentSource);
  const accent =
    accentLum > 0.62 ? mix(accentSource, BLACK, 1 - 0.62 / accentLum) : accentSource;

  return {
    paper: toHex(paper),
    ink: toHex(ink),
    accent: toHex(accent),
    mat: toHex(mix(scale(paper, MAT_FACTOR), accent, MAT_TINT)),
    matEdge: toHex(mix(mix(scale(paper, MAT_FACTOR), accent, MAT_TINT), ink, 0.22)),
    muted: toHex(mix(ink, paper, 0.55)),
  };
}

/** 16進を 0..1 の三値へ。レンダラが自分の色型へ渡すための最小の変換。 */
export function themeRgb(hex: string): { r: number; g: number; b: number } {
  return parseHex(hex) ?? { r: 0, g: 0, b: 0 };
}
