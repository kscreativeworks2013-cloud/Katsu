/*
 * PDF からのテキスト抽出（テスト用）。
 * 出力物の検証は「開けるか」ではなく「読めるか」で行う。見た目が正しくても
 * テキスト層が壊れている PDF は、検索も引用もできず、実測でも実際に壊れていた。
 */

import { inflateSync } from 'node:zlib';
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

/** 描かれた文字の位置（pt、左下原点）。安全マージンの検証に使う。 */
export interface PlacedText {
  page: number;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  pageWidth: number;
  pageHeight: number;
}

export async function extractPdfTextItems(bytes: Uint8Array): Promise<PlacedText[]> {
  const task = getDocument({ data: Uint8Array.from(bytes), useSystemFonts: false });
  const doc = await task.promise;

  const placed: PlacedText[] = [];
  for (let index = 1; index <= doc.numPages; index += 1) {
    const page = await doc.getPage(index);
    const view = page.getViewport({ scale: 1 });
    for (const item of (await page.getTextContent()).items) {
      if (!('str' in item)) continue;
      const text = item as TextItem;
      if (text.str.trim() === '') continue;
      placed.push({
        page: index,
        text: text.str,
        // transform は [a, b, c, d, e, f]。e,f がベースラインの原点。
        x: text.transform[4],
        y: text.transform[5],
        width: text.width,
        height: text.height,
        pageWidth: view.width,
        pageHeight: view.height,
      });
    }
  }
  await task.destroy();
  return placed;
}

/**
 * 実際に置いた枠の矩形（pt、左下原点）。
 *
 * レンダラは画像を枠いっぱいに拡大してからクリップ矩形で切るので、
 * 「置いた幅」はクリップ矩形そのものである。内容ストリームを展開して `re W n` を読む。
 */
export function extractFrameRects(
  bytes: Uint8Array,
): { page: number; x: number; y: number; width: number; height: number }[] {
  const raw = Buffer.from(bytes);
  const rects: { page: number; x: number; y: number; width: number; height: number }[] = [];
  const marker = Buffer.from('stream');
  const end = Buffer.from('endstream');

  let page = 0;
  let cursor = 0;
  for (;;) {
    const start = raw.indexOf(marker, cursor);
    if (start < 0) break;
    const stop = raw.indexOf(end, start);
    if (stop < 0) break;
    cursor = stop + end.length;

    // stream キーワードの直後の改行を飛ばす。
    let from = start + marker.length;
    while (raw[from] === 0x0d || raw[from] === 0x0a) from += 1;

    let content: string;
    try {
      content = inflateSync(raw.subarray(from, stop)).toString('latin1');
    } catch {
      content = raw.subarray(from, stop).toString('latin1');
    }
    // 内容ストリームだけを見る（画像・フォントは対象外）。
    if (!content.startsWith('q\n')) continue;

    page += 1;
    for (const match of content.matchAll(
      /(-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) re\s+W\s+n/g,
    )) {
      rects.push({
        page,
        x: Number(match[1]),
        y: Number(match[2]),
        width: Number(match[3]),
        height: Number(match[4]),
      });
    }
  }
  return rects;
}
