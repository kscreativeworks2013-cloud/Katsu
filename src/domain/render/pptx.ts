/*
 * PowerPoint レンダラ（第6章 6-5、6-6）。
 * フォントは名前参照なので埋め込まない。画像は data URI のみ埋め込む。
 */

import PptxGenJS from 'pptxgenjs';
import type { IRSection, ProposalIR } from '../ir';
import { ADOPTED_LAYOUT, SCREEN_16_9, safeMargin } from './layout';
import { assertIrVersion, fileNameFor, isDraft, warningSummary, type Renderer } from './types';

/*
 * 版面定義（layout.ts）を PowerPoint 側でも参照する（第8章 8-2／8-4）。
 * pptxgenjs はインチで座標を取るため、比率をインチへ展開する。これで 16:9 は
 * A4横の版面からの派生になり、面付けを本格的に合わせる段でも定義は1つで済む。
 * 現時点で共有しているのは判型・安全マージン・文字サイズの段階まで。
 */
const PT_PER_INCH = 72;
const SLIDE_W = SCREEN_16_9.widthPt / PT_PER_INCH;
const SLIDE_H = SCREEN_16_9.heightPt / PT_PER_INCH;
const MARGIN = safeMargin(SCREEN_16_9);
/** 比率 → インチ。 */
const inchX = (ratio: number): number => ratio * SLIDE_W;
const inchY = (ratio: number): number => ratio * SLIDE_H;
/** 文字サイズ（ページ高さ比 → pt）。 */
const pt = (ratio: number): number => Math.round(ratio * SCREEN_16_9.heightPt);

const FONT_JA = 'Yu Gothic';

/**
 * 版面色は IR の theme（ブランドのパレットからの導出）から採る（第8章 8-7）。
 * PDF と同じ源から採ることで、テンプレートを差し替えたときに片方の形式だけが
 * 前の色のまま残ることがなくなる。pptxgenjs は「#」の無い16進を取る。
 */
type Ink = { ink: string; muted: string; accent: string; paper: string };
const inkOf = (ir: ProposalIR): Ink => ({
  ink: ir.theme.ink.replace('#', ''),
  muted: ir.theme.muted.replace('#', ''),
  accent: ir.theme.accent.replace('#', ''),
  paper: ir.theme.paper.replace('#', ''),
});

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

function addSectionSlide(pptx: PptxGenJS, section: IRSection, color: Ink): void {
  const slide = pptx.addSlide();
  slide.background = { color: color.paper };
  slide.addText(section.title, {
    x: inchX(MARGIN.x),
    y: inchY(MARGIN.y),
    w: inchX(1 - MARGIN.x * 2),
    h: 0.6,
    fontSize: pt(ADOPTED_LAYOUT.type.heading),
    fontFace: FONT_JA,
    color: color.ink,
  });

  const texts: string[] = [];
  const images = section.blocks.filter((block) => block.type === 'image');

  for (const block of section.blocks) {
    if (block.type === 'paragraph') texts.push(block.text);
    if (block.type === 'list') texts.push(...block.items.map((item) => `・${item}`));
  }

  if (texts.length > 0) {
    slide.addText(texts.join('\n'), {
      x: inchX(MARGIN.x),
      y: 1.2,
      w: images.length > 0 ? inchX(0.58) : inchX(1 - MARGIN.x * 2),
      h: 3.6,
      fontSize: pt(ADOPTED_LAYOUT.type.body),
      fontFace: FONT_JA,
      color: color.ink,
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
      x: inchX(MARGIN.x),
      y: 4.9,
      w: inchX(1 - MARGIN.x * 2),
      h: 0.4,
      fontSize: 9,
      fontFace: FONT_JA,
      color: color.muted,
    });
  }
}

export const pptxRenderer: Renderer = {
  format: 'pptx',
  irVersion: 1,
  async render(ir: ProposalIR) {
    assertIrVersion(pptxRenderer, ir);
    const ja = ir.lang === 'ja';

    const color = inkOf(ir);
    const pptx = new PptxGenJS();
    pptx.layout = 'LAYOUT_16x9';
    pptx.author = ir.project.brand;
    pptx.title = ir.project.name;

    const cover = pptx.addSlide();
    cover.background = { color: color.paper };
    cover.addText(ir.project.name, {
      x: 0.6,
      y: 1.8,
      w: 8.8,
      h: 1,
      fontSize: 32,
      fontFace: FONT_JA,
      color: color.ink,
    });
    cover.addText(
      ja
        ? `${ir.project.brand}／${ir.project.client}`
        : `${ir.project.brand} / ${ir.project.client}`,
      {
        x: inchX(MARGIN.x),
        y: 2.9,
        w: inchX(1 - MARGIN.x * 2),
        h: 0.5,
        fontSize: pt(ADOPTED_LAYOUT.type.heading * 0.8),
        fontFace: FONT_JA,
        color: color.accent,
      },
    );
    cover.addText(`${ir.builtAt.slice(0, 10)}　${ja ? '版' : 'revision'} ${ir.revision}`, {
      x: 0.6,
      y: 3.5,
      w: 8.8,
      h: 0.4,
      fontSize: 10,
      fontFace: FONT_JA,
      color: color.muted,
    });

    const warnings = warningSummary(ir);
    if (warnings.length > 0) {
      cover.addText([ja ? '出力時の注意' : 'Notes at export time', ...warnings].join('\n'), {
        x: inchX(MARGIN.x),
        y: 4.0,
        w: inchX(1 - MARGIN.x * 2),
        h: 1.0,
        fontSize: 9,
        fontFace: FONT_JA,
        color: color.muted,
      });
    }

    for (const section of ir.sections) {
      if (section.id === 'cover') continue;
      addSectionSlide(pptx, section, color);
    }

    const output = await pptx.write({ outputType: 'arraybuffer' });
    return {
      fileName: fileNameFor(ir, 'pptx', isDraft(ir)),
      mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      bytes: await toBytes(output),
    };
  },
};
