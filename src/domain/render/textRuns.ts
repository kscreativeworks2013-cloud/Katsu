/*
 * 欧文と和文の描き分け（第8章）。
 *
 * 日本語フォント1本で ASCII だけの並びを描くと、整形（shaping）がラテン用の
 * 異体字を選び、その字形には cmap の逆引きが無いため ToUnicode に載らない。
 * 結果、PDF の見た目は数字でも、テキスト層ではグリフIDが Unicode として書かれ
 * 「Cut 1」が「Cut 䄄」になる。実測でこの経路だけが壊れる：
 *   ・「100mm」（ASCII だけの並び）→ 壊れる
 *   ・「朝の斜光 100mm」（和文を含む並び）→ 壊れない
 * 同じ字形はサブセット化でも壊れた glyf を生むため、原因は共通と見てよい。
 *
 * したがって ASCII の並びは欧文フォントで描く。和文フォントには和文だけを渡す。
 */

export interface TextRun {
  text: string;
  /** true なら欧文フォントで描く。 */
  latin: boolean;
}

const LATIN = /^[\x20-\x7e]+$/;

/**
 * ASCII の並びと、それ以外に分ける。
 * 記号（｜、〜、全角括弧）は和文側に残す。欧文フォントに無い字形だからである。
 */
export function splitRuns(text: string): TextRun[] {
  return text
    .split(/([\x20-\x7e]+)/)
    .filter((part) => part !== '')
    .map((part) => ({ text: part, latin: LATIN.test(part) }));
}
