/*
 * PDF からのテキスト抽出（テスト用）。
 * 出力物の検証は「開けるか」ではなく「読めるか」で行う。見た目が正しくても
 * テキスト層が壊れている PDF は、検索も引用もできず、実測でも実際に壊れていた。
 */

import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';

export async function extractPdfText(bytes: Uint8Array): Promise<string> {
  // pdfjs は渡したバッファを破棄するので複製して渡す。
  const task = getDocument({ data: Uint8Array.from(bytes), useSystemFonts: false });
  const doc = await task.promise;

  const pages: string[] = [];
  for (let index = 1; index <= doc.numPages; index += 1) {
    const page = await doc.getPage(index);
    const content = await page.getTextContent();
    pages.push(
      content.items
        .map((item) => ('str' in item ? (item as TextItem).str : ''))
        .join('')
        .trim(),
    );
  }
  await task.destroy();
  return pages.join('\n');
}
