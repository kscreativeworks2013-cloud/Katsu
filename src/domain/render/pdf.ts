/*
 * PDF レンダラ（第6章 6-5、6-6）。
 * PDF は字形を自前で持つ必要があるため、日本語フォントの埋め込みが必須。
 * フォントが渡されない場合は、文字化けした PDF を出さずにエラーにする。
 */

import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib';
import type { ProposalIR } from '../ir';
import { assertIrVersion, fileNameFor, isDraft, warningSummary, type Renderer } from './types';

const PAGE = { width: 595.28, height: 841.89 };
const MARGIN = 48;
const CONTENT_WIDTH = PAGE.width - MARGIN * 2;

const INK = rgb(0.07, 0.06, 0.05);
const MUTED = rgb(0.54, 0.51, 0.47);
const CHAMPAGNE = rgb(0.7, 0.58, 0.42);
const LINE = rgb(0.9, 0.88, 0.84);

const ORIGIN_LABEL: Record<string, string> = {
  upload: '持ち込み',
  external: '外部参照',
  ai: 'AI生成',
};

/**
 * 日本語は単語境界が無いので、文字単位で幅を測って折り返す。
 * 欧文が混ざっても字幅で判断するため、同じ処理で足りる。
 */
function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  let current = '';

  for (const char of text) {
    if (char === '\n') {
      lines.push(current);
      current = '';
      continue;
    }
    const candidate = current + char;
    if (font.widthOfTextAtSize(candidate, size) > width && current !== '') {
      lines.push(current);
      current = char;
    } else {
      current = candidate;
    }
  }
  if (current !== '') lines.push(current);
  return lines;
}

class Layout {
  private page: PDFPage;
  private y: number;

  constructor(
    private readonly doc: PDFDocument,
    private readonly font: PDFFont,
  ) {
    this.page = doc.addPage([PAGE.width, PAGE.height]);
    this.y = PAGE.height - MARGIN;
  }

  private ensure(height: number): void {
    if (this.y - height < MARGIN) {
      this.page = this.doc.addPage([PAGE.width, PAGE.height]);
      this.y = PAGE.height - MARGIN;
    }
  }

  gap(height: number): void {
    this.y -= height;
  }

  text(
    content: string,
    {
      size = 10,
      color = INK,
      indent = 0,
    }: { size?: number; color?: typeof INK; indent?: number } = {},
  ): void {
    const leading = size * 1.6;
    for (const line of wrap(content, this.font, size, CONTENT_WIDTH - indent)) {
      this.ensure(leading);
      this.y -= leading;
      this.page.drawText(line, {
        x: MARGIN + indent,
        y: this.y,
        size,
        font: this.font,
        color,
      });
    }
  }

  rule(): void {
    this.ensure(12);
    this.y -= 8;
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: PAGE.width - MARGIN, y: this.y },
      thickness: 0.5,
      color: LINE,
    });
    this.y -= 4;
  }

  image(image: PDFImage, caption: string): void {
    const width = Math.min(CONTENT_WIDTH, 320);
    const height = (image.height / image.width) * width;
    this.ensure(height + 20);
    this.y -= height;
    this.page.drawImage(image, { x: MARGIN, y: this.y, width, height });
    this.gap(4);
    this.text(caption, { size: 8, color: MUTED });
  }

  placeholder(caption: string): void {
    const width = Math.min(CONTENT_WIDTH, 320);
    const height = 90;
    this.ensure(height + 20);
    this.y -= height;
    this.page.drawRectangle({
      x: MARGIN,
      y: this.y,
      width,
      height,
      borderColor: LINE,
      borderWidth: 0.5,
    });
    this.gap(4);
    this.text(caption, { size: 8, color: MUTED });
  }
}

function decodeDataUri(dataUri: string): { mime: string; bytes: Uint8Array } | undefined {
  const match = /^data:([^;,]+);base64,(.*)$/s.exec(dataUri);
  if (!match) return undefined;
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1)
    bytes[index] = binary.charCodeAt(index);
  return { mime: match[1], bytes };
}

export const pdfRenderer: Renderer = {
  format: 'pdf',
  irVersion: 1,
  async render(ir: ProposalIR, options) {
    assertIrVersion(pdfRenderer, ir);
    if (!options?.fontBytes || options.fontBytes.length === 0) {
      throw new Error(
        '日本語フォントを読み込めないため PDF を生成できません。文字化けした成果物は出力しません。',
      );
    }

    const ja = ir.lang === 'ja';
    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);
    // 使用文字だけを埋め込む（第6章 6-6）。
    const font = await doc.embedFont(options.fontBytes, { subset: true });

    doc.setTitle(ir.project.name);
    doc.setSubject(`${ir.project.brand} / ${ir.project.client}`);
    doc.setProducer('Luxury Beauty Visual Proposal OS');
    doc.setCreationDate(new Date(ir.builtAt));

    const layout = new Layout(doc, font);

    layout.gap(120);
    layout.text(ir.project.name, { size: 22 });
    layout.gap(6);
    layout.text(
      ja
        ? `${ir.project.brand}／${ir.project.client}`
        : `${ir.project.brand} / ${ir.project.client}`,
      {
        size: 12,
        color: CHAMPAGNE,
      },
    );
    layout.gap(6);
    layout.text(
      ja
        ? `${ir.builtAt.slice(0, 10)} 生成／版 ${ir.revision}`
        : `Generated ${ir.builtAt.slice(0, 10)} / revision ${ir.revision}`,
      { size: 9, color: MUTED },
    );

    if (ir.sources.hasAiImage) {
      layout.gap(4);
      layout.text(
        ja
          ? '※ 本提案書にはAI生成画像が含まれます。各画像に出自を併記しています。'
          : 'Note: this proposal includes AI-generated images.',
        { size: 9, color: MUTED },
      );
    }

    const warnings = warningSummary(ir);
    if (warnings.length > 0) {
      layout.gap(10);
      layout.text(ja ? '出力時の注意' : 'Notes at export time', { size: 10, color: MUTED });
      for (const warning of warnings) layout.text(`・${warning}`, { size: 9, color: MUTED });
    }

    for (const section of ir.sections) {
      layout.gap(20);
      layout.text(section.title, { size: 16 });
      layout.rule();

      for (const block of section.blocks) {
        if (block.type === 'paragraph') {
          layout.gap(4);
          layout.text(block.text);
          continue;
        }
        if (block.type === 'list') {
          layout.gap(4);
          for (const item of block.items) layout.text(`・${item}`, { indent: 8 });
          continue;
        }

        const origin = block.assetOrigin
          ? ja
            ? ORIGIN_LABEL[block.assetOrigin]
            : block.assetOrigin
          : undefined;
        const caption = `${block.caption}${origin ? `（${origin}）` : ja ? '（画像未登録）' : ' (no image)'}`;
        const decoded = block.data ? decodeDataUri(block.data) : undefined;

        layout.gap(8);
        if (decoded) {
          try {
            const image = decoded.mime.includes('png')
              ? await doc.embedPng(decoded.bytes)
              : await doc.embedJpg(decoded.bytes);
            layout.image(image, caption);
            continue;
          } catch {
            // 埋め込めない画像でも文書は出す。プレースホルダに落とす。
          }
        }
        layout.placeholder(caption);
      }
    }

    return {
      fileName: fileNameFor(ir, 'pdf', isDraft(ir)),
      mimeType: 'application/pdf',
      bytes: await doc.save(),
    };
  },
};
