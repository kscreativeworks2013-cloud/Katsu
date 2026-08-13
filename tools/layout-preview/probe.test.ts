import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { loadTestFont } from '../../src/test/ir';

const CASES = [
  'Cut 1｜商品単体（正面）',
  '100mm',
  '朝の斜光 100mm',
  'ホリデーコレクション 2026 キービジュアル',
  '合計：¥1,235,000（税別）',
  'MAISON LUMIÈRE／株式会社メゾン・ルミエール',
];

/** ASCII の並びと、それ以外に分ける。 */
function runs(text: string): { text: string; latin: boolean }[] {
  return text
    .split(/([\x20-\x7e]+)/)
    .filter(Boolean)
    .map((part) => ({ text: part, latin: /^[\x20-\x7e]+$/.test(part) }));
}

async function build(subset: boolean) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const cjk = await doc.embedFont(Uint8Array.from(loadTestFont()), { subset });
  const latin = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([600, 400]);
  CASES.forEach((text, index) => {
    const y = 360 - index * 40;
    let x = 20;
    for (const run of runs(text)) {
      const font = run.latin ? latin : cjk;
      page.drawText(run.text, { x, y, size: 14, font });
      x += font.widthOfTextAtSize(run.text, 14);
    }
  });
  return doc.save();
}

describe('ラテンを別フォントで描く', () => {
  it('を条件別に書き出す', async () => {
    writeFileSync('dist/layout-preview/q-subset.pdf', await build(true));
    writeFileSync('dist/layout-preview/q-full.pdf', await build(false));
    expect(1).toBe(1);
  });
});
