/*
 * 欧文と和文の描き分け（第8章）。
 *
 * 日本語フォント1本で ASCII だけの並びを描くと、整形（shaping）がラテン用の
 * 異体字を選び、その字形には cmap の逆引きが無いため ToUnicode に載らない。
 * 結果、PDF の見た目は数字でも、テキスト層ではグリフIDが Unicode として書かれ
 * 「Cut 1」が「Cut 䄄」になる。実測でこの経路だけが壊れる：
 *   ・「100mm」（ASCII だけの並び）→ 壊れる
 *   ・「朝の斜光 100mm」（和文を含む並び）→ 壊れない
 *   ・「KŌHAKU」（非ASCIIを含む並び）→ 壊れない
 * 同じ字形はサブセット化でも壊れた glyf を生むため、原因は共通と見てよい。
 *
 * したがって ASCII だけの並びは必ず欧文フォントで描く。
 *
 * ただし欧文フォント（標準14書体）は WinAnsi でしか符号化できず、「KŌHAKU」の Ō で
 * 例外を投げる。語の途中でフォントが変わると字面が揃わないので、**分割は語を単位**にし、
 * 語に符号化できない字が1つでもあれば語ごと和文フォントへ渡す。その語は非ASCIIを
 * 含むためテキスト層は壊れない（上の実測）。
 */

export interface TextRun {
  text: string;
  /** true なら欧文フォントで描く。 */
  latin: boolean;
}

/** WinAnsi が持つ 0x80–0x9F の割り当て。ここに無い字は欧文フォントで描けない。 */
const WIN_ANSI_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';

/** 標準14書体（WinAnsi）で符号化できる字か。できない字を渡すと pdf-lib が投げる。 */
function encodable(char: string): boolean {
  const code = char.codePointAt(0) ?? 0;
  if (code >= 0x20 && code <= 0x7e) return true;
  if (code >= 0xa0 && code <= 0xff) return true;
  return WIN_ANSI_EXTRA.includes(char);
}

/** 語（文字・数字の連なり）を1単位として扱う。語中でフォントを切り替えないため。 */
const WORD_CHAR = /[\p{L}\p{N}\p{M}]/u;

/**
 * 欧文フォントで描く並びと、和文フォントで描く並びに分ける。
 * 和文側の並びには必ず非ASCIIの字が含まれる（ASCII だけの並びを和文へ渡さない）。
 */
export function splitRuns(text: string): TextRun[] {
  const runs: TextRun[] = [];
  const chars = [...text];
  let index = 0;

  const append = (part: string, latin: boolean): void => {
    const last = runs[runs.length - 1];
    if (last && last.latin === latin) last.text += part;
    else runs.push({ text: part, latin });
  };

  while (index < chars.length) {
    const char = chars[index];
    if (!WORD_CHAR.test(char)) {
      append(char, encodable(char));
      index += 1;
      continue;
    }

    let end = index;
    while (end < chars.length && WORD_CHAR.test(chars[end])) end += 1;
    const word = chars.slice(index, end).join('');
    append(word, [...word].every(encodable));
    index = end;
  }

  return runs;
}
