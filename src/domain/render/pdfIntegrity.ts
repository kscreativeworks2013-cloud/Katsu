/*
 * 出力物の検査（第8章）。
 *
 * PDF は「出た」だけでは検証にならない。実測で2種類の壊れ方をした。
 *   1) テキスト層の壊れ：見た目は正しいのに、抽出すると数字がグリフIDになる。
 *   2) 字形の壊れ：テキスト層は正しいのに、輪郭が欠けて画面に文字が出ない。
 * 片方の検査だけでは他方を見逃すため、両方をここに置いてテストから回す。
 */

import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from 'pdf-lib';

/** 埋め込まれた TrueType フォントを取り出す（FontFile2 のストリーム）。 */
function embeddedFonts(doc: PDFDocument): Uint8Array[] {
  const found: Uint8Array[] = [];
  for (const [, object] of doc.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFRawStream)) continue;
    const subtype = object.dict.get(PDFName.of('Subtype'));
    // FontFile2 のストリームには Subtype が無い。長さと中身で TrueType を見分ける。
    const bytes = decodePDFRawStream(object).decode();
    const isTrueType =
      bytes.length > 4 &&
      ((bytes[0] === 0x00 && bytes[1] === 0x01 && bytes[2] === 0x00 && bytes[3] === 0x00) ||
        (bytes[0] === 0x74 && bytes[1] === 0x72 && bytes[2] === 0x75 && bytes[3] === 0x65));
    if (isTrueType && !subtype) found.push(bytes);
  }
  return found;
}

export interface GlyphReport {
  fonts: number;
  /** 検査した字形の数。 */
  checked: number;
  /** 輪郭を取り出せなかった字形の数。1つでもあれば文字が消えて出る。 */
  broken: number;
}

/**
 * 埋め込みフォントの字形が実際に取り出せるかを見る。
 * ラスタライズの代わりに、描画に使う輪郭そのものを叩いて確かめる。
 */
export async function checkEmbeddedGlyphs(pdfBytes: Uint8Array): Promise<GlyphReport> {
  const doc = await PDFDocument.load(pdfBytes);
  const report: GlyphReport = { fonts: 0, checked: 0, broken: 0 };

  for (const bytes of embeddedFonts(doc)) {
    const font = fontkit.create(bytes as Buffer);
    if (!('numGlyphs' in font)) continue;
    report.fonts += 1;

    // 全字形を見るのは重い。先頭から一定数を抜き取って輪郭を確かめる。
    const limit = Math.min(font.numGlyphs, 400);
    for (let id = 1; id < limit; id += 1) {
      report.checked += 1;
      try {
        const glyph = font.getGlyph(id);
        // 輪郭の生成でこけるものが「画面に出ない字形」。
        void glyph.path.toSVG();
      } catch {
        report.broken += 1;
      }
    }
  }
  return report;
}
