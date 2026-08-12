/*
 * PowerPoint レンダラ（第6章 6-5、6-6）。
 * フォントは名前参照なので埋め込まない。画像は data URI のみ埋め込む。
 */

import PptxGenJS from 'pptxgenjs';
import type { IRSection, ProposalIR } from '../ir';
import { assertIrVersion, fileNameFor, warningSummary, type Renderer } from './types';

const FONT_JA = 'Yu Gothic';
const INK = '12100E';
const MUTED = '8A8279';
const CHAMPAGNE = 'B3936A';

/** pptxgenjs は data URI の "data:" を含まない形を期待する。 */
function toPptxData(dataUri: string): string {
  return dataUri.startsWith('data:') ? dataUri.slice('data:'.length) : dataUri;
}

async function toBytes(output: unknown): Promise<Uint8Array> {
  if (output instanceof Uint8Array) return output;
  if (output instanceof ArrayBuffer) return new Uint8Array(output);
  if (typeof Blob !== 'undefined' && output instanceof Blob) {
    return new Uint8Array(await output.arrayBuffer());
  }
  throw new Error('PowerPoint の生成結果を解釈できませんでした');
}

function addSectionSlide(pptx: PptxGenJS, section: IRSection): void {
  const slide = pptx.addSlide();
  slide.addText(section.title, {
    x: 0.6,
    y: 0.4,
    w: 8.8,
    h: 0.6,
    fontSize: 24,
    fontFace: FONT_JA,
    color: INK,
  });

  const texts: string[] = [];
  const images = section.blocks.filter((block) => block.type === 'image');

  for (const block of section.blocks) {
    if (block.type === 'paragraph') texts.push(block.text);
    if (block.type === 'list') texts.push(...block.items.map((item) => `・${item}`));
  }

  if (texts.length > 0) {
    slide.addText(texts.join('\n'), {
      x: 0.6,
      y: 1.2,
      w: images.length > 0 ? 5.2 : 8.8,
      h: 3.6,
      fontSize: 12,
      fontFace: FONT_JA,
      color: INK,
      lineSpacingMultiple: 1.3,
      valign: 'top',
    });
  }

  // 埋め込めるのは data URI を持つ画像だけ。外部URLはキャプションのみ残す（第6章 6-6）。
  const embeddable = images.filter((block) => block.type === 'image' && block.data);
  embeddable.slice(0, 3).forEach((block, index) => {
    if (block.type !== 'image' || !block.data) return;
    slide.addImage({
      data: toPptxData(block.data),
      x: 6.1,
      y: 1.2 + index * 1.35,
      w: 3.3,
      h: 1.2,
      sizing: { type: 'cover', w: 3.3, h: 1.2 },
    });
  });

  const captions = images.map((block) =>
    block.type === 'image' ? `${block.caption}${block.href ? '（外部参照）' : ''}` : '',
  );
  if (captions.length > 0) {
    slide.addText(captions.join(' ／ '), {
      x: 0.6,
      y: 4.9,
      w: 8.8,
      h: 0.4,
      fontSize: 9,
      fontFace: FONT_JA,
      color: MUTED,
    });
  }
}

export const pptxRenderer: Renderer = {
  format: 'pptx',
  irVersion: 1,
  async render(ir: ProposalIR) {
    assertIrVersion(pptxRenderer, ir);
    const ja = ir.lang === 'ja';

    const pptx = new PptxGenJS();
    pptx.layout = 'LAYOUT_16x9';
    pptx.author = ir.project.brand;
    pptx.title = ir.project.name;

    const cover = pptx.addSlide();
    cover.addText(ir.project.name, {
      x: 0.6,
      y: 1.8,
      w: 8.8,
      h: 1,
      fontSize: 32,
      fontFace: FONT_JA,
      color: INK,
    });
    cover.addText(
      ja
        ? `${ir.project.brand}／${ir.project.client}`
        : `${ir.project.brand} / ${ir.project.client}`,
      { x: 0.6, y: 2.9, w: 8.8, h: 0.5, fontSize: 14, fontFace: FONT_JA, color: CHAMPAGNE },
    );
    cover.addText(`${ir.builtAt.slice(0, 10)}　${ja ? '版' : 'revision'} ${ir.revision}`, {
      x: 0.6,
      y: 3.5,
      w: 8.8,
      h: 0.4,
      fontSize: 10,
      fontFace: FONT_JA,
      color: MUTED,
    });

    const warnings = warningSummary(ir);
    if (warnings.length > 0) {
      cover.addText([ja ? '出力時の注意' : 'Notes at export time', ...warnings].join('\n'), {
        x: 0.6,
        y: 4.0,
        w: 8.8,
        h: 1.0,
        fontSize: 9,
        fontFace: FONT_JA,
        color: MUTED,
      });
    }

    for (const section of ir.sections) {
      if (section.id === 'cover') continue;
      addSectionSlide(pptx, section);
    }

    const output = await pptx.write({ outputType: 'arraybuffer' });
    return {
      fileName: fileNameFor(ir, 'pptx'),
      mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      bytes: await toBytes(output),
    };
  },
};
