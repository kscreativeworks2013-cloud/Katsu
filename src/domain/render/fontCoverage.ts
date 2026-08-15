/*
 * 埋め込みフォントの字形の過不足（第9章 工程00-b）。
 *
 * 和文フォントは事前に JIS X 0208 中心へ絞ってある（tools/fonts/subset.py）。
 * 絞った以上、実案件の固有名詞に収録外の字（髙・﨑のような異体字、記号）が
 * 現れうる。pdf-lib は字形が無い文字を**黙って空白として描く**ので、出力側では
 * 気づけない。そこで出力の前に本文と突き合わせ、無い字は列挙して止める。
 *
 * 「フォントを読み込めなければ PDF を出さない」（第6章 6-6）と同じ扱いにする。
 * 文字化けした提案書をクライアントへ渡すより、出力を失敗させるほうがよい。
 */

import fontkit from '@pdf-lib/fontkit';
import type { ProposalIR } from '../ir';
import { splitRuns } from './textRuns';

/**
 * IR のうち、実際に紙へ乗る文字列。
 *
 * 画像の実体（data URI）と参照URLは描かれないので入れない。ここを総なめにすると
 * 数MBの base64 を1文字ずつ走査することになる。
 */
export function irTexts(ir: ProposalIR): string[] {
  const texts: string[] = [
    ir.project.name,
    ir.project.brand,
    ir.project.client,
    ir.project.proposalDate,
    ir.project.dueDate,
    ir.revision,
  ];

  for (const section of ir.sections) {
    texts.push(section.title);
    for (const block of section.blocks) {
      if (block.type === 'paragraph') texts.push(block.text);
      else if (block.type === 'list') texts.push(...block.items);
      else if (block.type === 'map') {
        texts.push(...block.axes.x, ...block.axes.y);
        for (const point of block.points) texts.push(point.label);
      } else {
        texts.push(block.caption, block.slotLabel);
      }
    }
  }

  for (const warning of ir.warnings) {
    texts.push(warning.message);
    if (warning.slot) texts.push(warning.slot);
  }
  for (const slot of ir.slots) texts.push(slot.slotLabel, slot.sectionTitle);

  return texts.filter((text) => text !== '');
}

/**
 * 和文フォントで描かれる文字だけを集める。
 *
 * 振り分けは描画と同じ `splitRuns` に任せる。ここで別の判定を書くと、
 * 「欧文フォントで描かれるのに和文フォントの収録を問う」ずれが生まれる。
 */
export function cjkCharacters(texts: string[]): Set<string> {
  const chars = new Set<string>();
  for (const text of texts) {
    for (const run of splitRuns(text)) {
      if (run.latin) continue;
      for (const char of run.text) chars.add(char);
    }
  }
  return chars;
}

/**
 * 和文フォントが要るか。
 *
 * 要件は「CJK が1文字も無ければ埋め込まない」だが、判定は**欧文フォントで描けるか**で
 * 行う。`KŌHAKU` の `Ō` は CJK ではないが標準14書体では符号化できず、和文フォントへ
 * 回る。CJK の有無で判定すると、この経路で字が消える。
 * 純粋な英語だけの提案書では結果は同じで、より安全な側に倒れる。
 */
export function needsCjkFont(texts: string[]): boolean {
  return cjkCharacters(texts).size > 0;
}

/** 和文フォントに字形が無い文字。空なら出力してよい。 */
export function missingGlyphs(texts: string[], fontBytes: Uint8Array): string[] {
  const font = fontkit.create(fontBytes as never) as {
    hasGlyphForCodePoint: (codePoint: number) => boolean;
  };

  const missing: string[] = [];
  for (const char of cjkCharacters(texts)) {
    const code = char.codePointAt(0);
    if (code === undefined) continue;
    if (!font.hasGlyphForCodePoint(code)) missing.push(char);
  }
  return missing.sort();
}

/** 止めるときの文言。どの字が無いかを言わないと直しようがない。 */
export function missingGlyphMessage(missing: string[]): string {
  const listed = missing.map(
    (char) =>
      `${char}（U+${(char.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0')}）`,
  );
  return `埋め込みフォントに次の文字の字形がないため PDF を生成できません：${listed.join('、')}。文字化けした成果物は出力しません。収録する字形集合は tools/fonts/subset.py にあります。`;
}
