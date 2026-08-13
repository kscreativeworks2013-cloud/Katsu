/*
 * 日本語の行分割（第8章）。
 *
 * 日本語は単語境界が無いので折り返しは文字単位になるが、そのまま切ると
 * 行頭に句読点や小書き仮名が来る（「肌の質感へ寄／っていく」）。提案書としては成立しない。
 * ここでは次の2つを行う。
 *   ・禁則処理：行頭・行末に置けない字を、直前の字ごと次行へ送る（追い出し）。
 *   ・語の保護：欧文の語は途中で折らない（「MAISON LUMIÈRE／ら／しさ」を出さない）。
 *
 * 幅の測定は呼び出し側から渡す。描画に使うのと同じ関数を渡すこと。測り方が違うと
 * 折り返し位置がずれる。
 */

/** 行頭に置かない字（行頭禁則）。小書き仮名・句読点・閉じ括弧・長音符・繰り返し記号。 */
const NO_LINE_START = new Set([
  ...'、。，．・：；？！‼⁉ー〜～ゝゞヽヾ々',
  ...'ぁぃぅぇぉっゃゅょゎゕゖァィゥェォッャュョヮヵヶ',
  ...'）］｝」』】〉》〕〗〙”’」｣)]}',
  ...'%％℃℉‰',
]);

/** 行末に置かない字（行末禁則）。開き括弧。 */
const NO_LINE_END = new Set([...'（［｛「『【〈《〔〖〘“‘｢([{']);

/** 語をまたいで繋がる記号（省略記号・ハイフン・アポストロフィ）。 */
const IN_WORD = /['’.\-/]/u;
/** 欧文の語とみなす字（和文は1字ずつ折れる）。 */
const LATIN_WORD = /[A-Za-z0-9À-ɏ]/u;

/** 文字列を折り返しの単位に分ける。 */
export function splitUnits(text: string): string[] {
  const chars = [...text];
  const units: string[] = [];
  let index = 0;

  while (index < chars.length) {
    if (!LATIN_WORD.test(chars[index])) {
      units.push(chars[index]);
      index += 1;
      continue;
    }
    // 欧文の語：語中の記号（LUMIÈRE's、100mm/85mm）まで含めて1単位にする。
    let end = index;
    while (end < chars.length) {
      if (LATIN_WORD.test(chars[end])) {
        end += 1;
        continue;
      }
      // 記号は、その次も語の字であるときだけ語の一部として飲み込む。
      if (
        IN_WORD.test(chars[end]) &&
        end + 1 < chars.length &&
        LATIN_WORD.test(chars[end + 1])
      ) {
        end += 1;
        continue;
      }
      break;
    }
    units.push(chars.slice(index, end).join(''));
    index = end;
  }

  return units;
}

/**
 * 行末に送り出す（追い出し）。行頭・行末の禁則が解けるまで、行末の単位を次行へ移す。
 * 行が空になるところまでは送らない（送れないときは禁則を諦める。破綻より1字の乱れを採る）。
 */
function pushOut(line: string[], carry: string[]): void {
  for (let guard = line.length; guard > 0 && line.length > 1; guard -= 1) {
    const head = carry[0] ?? '';
    const tail = line[line.length - 1];
    const startsBad = head !== '' && NO_LINE_START.has([...head][0]);
    const endsBad = NO_LINE_END.has([...tail][tail.length - 1]);
    if (!startsBad && !endsBad) return;
    carry.unshift(line.pop() as string);
  }
}

/**
 * 幅に収まるように折り返す。measure は描画と同じ幅計算を渡すこと。
 * 改行文字は段落の区切りとして扱う。
 */
export function wrapText(
  text: string,
  measure: (part: string) => number,
  width: number,
): string[] {
  const lines: string[] = [];

  for (const paragraph of text.split('\n')) {
    // 1単位で幅を超える語（長いURL等）は、そこだけ文字単位に落とす。
    const units = splitUnits(paragraph).flatMap((unit) =>
      measure(unit) > width && [...unit].length > 1 ? [...unit] : [unit],
    );

    let line: string[] = [];
    for (const unit of units) {
      if (line.length === 0) {
        line.push(unit);
        continue;
      }
      if (measure(line.join('') + unit) <= width) {
        line.push(unit);
        continue;
      }
      const carry = [unit];
      pushOut(line, carry);
      lines.push(line.join(''));
      line = carry;
    }
    lines.push(line.join(''));
  }

  return lines;
}
