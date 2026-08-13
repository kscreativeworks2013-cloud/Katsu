/*
 * ビジュアル主導の版面レンダラ（第8章）。
 *
 * 第6章のレンダラ契約は変えない：入力は IR だけ、ネットワークを使わない、IR を書き換えない。
 * 変わるのは面の作り方で、1カラムの流し込みをやめ、画像を主役にした面付けを行う。
 * 版面の値は layout.ts の比率定義から展開する（判型を差し替えても版面定義は1つ）。
 */

import fontkit from '@pdf-lib/fontkit';
import {
  PDFDocument,
  clip,
  endPath,
  popGraphicsState,
  pushGraphicsState,
  rectangle,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from 'pdf-lib';
import type { IRBlock, IRSection, ProposalIR } from '../ir';
import { A4_LANDSCAPE, toPoints, type LayoutVariant, type PageFormat, type Rect } from './layout';

const INK = rgb(0.07, 0.06, 0.05);
const MUTED = rgb(0.54, 0.51, 0.47);
const CHAMPAGNE = rgb(0.7, 0.58, 0.42);
const PAPER = rgb(0.98, 0.97, 0.95);
const REVERSE = rgb(1, 1, 1);

const ORIGIN_LABEL: Record<string, string> = {
  upload: '持ち込み',
  external: '外部参照',
  ai: 'AI生成',
};

type ImageBlock = Extract<IRBlock, { type: 'image' }>;

/** 流し込みの1項目。見出しも本文も同じ流れに載せる。 */
interface FlowEntry {
  text: string;
  size?: number;
  color?: ReturnType<typeof rgb>;
  leading?: number;
  /** 直前に空ける高さ（ページ高さ比）。 */
  gapBefore?: number;
  /** 見出しか。段末に見出しだけが残らないようにする。 */
  heading?: boolean;
}

/** 日本語は単語境界が無いので、文字単位で幅を測って折り返す。 */
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

function decodeDataUri(dataUri: string): { mime: string; bytes: Uint8Array } | undefined {
  const match = /^data:([^;,]+);base64,(.*)$/s.exec(dataUri);
  if (!match) return undefined;
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1)
    bytes[index] = binary.charCodeAt(index);
  return { mime: match[1], bytes };
}

/** 本文行の集合。段組みへ流し込むために、章の本文を行単位に均す。 */
function textLines(section: IRSection): string[] {
  return section.blocks.flatMap((block) => {
    if (block.type === 'paragraph') return [block.text];
    if (block.type === 'list') return block.items.map((item) => `・${item}`);
    return [];
  });
}

function imageBlocks(section: IRSection): ImageBlock[] {
  return section.blocks.filter((block): block is ImageBlock => block.type === 'image');
}

/** 版面を実寸に展開して描くための道具。座標変換と切り抜きをここに閉じる。 */
class Sheet {
  readonly page: PDFPage;

  constructor(
    doc: PDFDocument,
    private readonly font: PDFFont,
    private readonly format: PageFormat,
    private readonly variant: LayoutVariant,
  ) {
    this.page = doc.addPage([format.widthPt, format.heightPt]);
    this.page.drawRectangle({
      x: 0,
      y: 0,
      width: format.widthPt,
      height: format.heightPt,
      color: PAPER,
    });
  }

  size(kind: keyof LayoutVariant['type']): number {
    return this.variant.type[kind] * this.format.heightPt;
  }

  fill(rect: Rect, color = PAPER): void {
    this.page.drawRectangle({ ...toPoints(rect, this.format), color });
  }

  /**
   * 枠いっぱいに画像を敷く（はみ出す側は切り落とす）。
   * pdf-lib に切り抜きは無いので、クリップ矩形を積んでから拡大した画像を描く。
   */
  cover(rect: Rect, image: PDFImage): void {
    const box = toPoints(rect, this.format);
    const scale = Math.max(box.width / image.width, box.height / image.height);
    const width = image.width * scale;
    const height = image.height * scale;

    this.page.pushOperators(
      pushGraphicsState(),
      rectangle(box.x, box.y, box.width, box.height),
      clip(),
      endPath(),
    );
    this.page.drawImage(image, {
      x: box.x + (box.width - width) / 2,
      y: box.y + (box.height - height) / 2,
      width,
      height,
    });
    this.page.pushOperators(popGraphicsState());
  }

  /** 画像が無いスロットの受け皿。面付けを崩さないよう、同じ枠を淡色で置く。 */
  placeholder(rect: Rect): void {
    const box = toPoints(rect, this.format);
    this.page.drawRectangle({ ...box, color: rgb(0.91, 0.89, 0.86) });
  }

  /**
   * 枠内に流し込み、入り切らなかった項目を返す。段組みとページ送りはこの戻り値で回す。
   * 見出しと本文を同じ流れで扱うので、テキストだけの章を続けて詰められる。
   */
  flow(entries: FlowEntry[], rect: Rect): FlowEntry[] {
    const box = toPoints(rect, this.format);
    let y = box.y + box.height;

    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      const size = entry.size ?? this.size('body');
      const step = size * (entry.leading ?? 1.7);
      const before = (entry.gapBefore ?? 0) * this.format.heightPt;
      const wrapped = wrap(entry.text, this.font, size, box.width);
      const needed = before + step * wrapped.length;

      // 見出しだけが段の末尾に残るのを避ける（次の1行ぶんも入るか見る）。
      const orphan = entry.heading ? step : 0;
      if (y - needed - orphan < box.y) return entries.slice(index);

      y -= before;
      for (const line of wrapped) {
        y -= size;
        this.page.drawText(line, {
          x: box.x,
          y,
          size,
          font: this.font,
          color: entry.color ?? INK,
        });
        y -= step - size;
      }
      y -= step * 0.3;
    }
    return [];
  }

  /** 本文だけの流し込み（画像面の説明文など）。 */
  text(lines: string[], rect: Rect): string[] {
    const rest = this.flow(
      lines.map((text) => ({ text })),
      rect,
    );
    return rest.map((entry) => entry.text);
  }

  /** 与えた幅（比率）に収まる文字サイズ。表紙のタイトルが版面からはみ出すのを防ぐ。 */
  fit(content: string, widthRatio: number, size: number): number {
    const limit = widthRatio * this.format.widthPt;
    let current = size;
    while (current > size * 0.5 && this.font.widthOfTextAtSize(content, current) > limit) {
      current -= size * 0.04;
    }
    return current;
  }

  /** 1行だけ置く（見出し・キャプション）。折り返しは行わない。 */
  line(
    content: string,
    at: { x: number; y: number },
    { size = this.size('caption'), color = INK }: { size?: number; color?: ReturnType<typeof rgb> } = {},
  ): void {
    this.page.drawText(content, {
      x: at.x * this.format.widthPt,
      y: this.format.heightPt - at.y * this.format.heightPt,
      size,
      font: this.font,
      color,
    });
  }

  /** 画像の上に文字を置くための暗幕。写真の明暗に関わらず可読性を保つ。 */
  scrim(rect: Rect): void {
    this.page.drawRectangle({ ...toPoints(rect, this.format), color: INK, opacity: 0.42 });
  }
}

export interface LayoutRenderOptions {
  variant: LayoutVariant;
  format?: PageFormat;
  fontBytes: Uint8Array;
}

/** IR から版面つきの PDF を作る。AI は呼ばず、IR 以外も読まない。 */
export async function renderLayoutPdf(
  ir: ProposalIR,
  { variant, format = A4_LANDSCAPE, fontBytes }: LayoutRenderOptions,
): Promise<Uint8Array> {
  if (!fontBytes || fontBytes.length === 0) {
    throw new Error(
      '日本語フォントを読み込めないため PDF を生成できません。文字化けした成果物は出力しません。',
    );
  }

  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  /*
   * サブセット化はしない（第8章）。pdf-lib のサブセット書き出しは字形の集合によって
   * 壊れた glyf を吐くことがあり、実測では3本のうち2本で 200 字以上が欠けた。
   * 出力側で検知できず、文字化けした提案書がそのままクライアントへ渡る事故になるため、
   * 全字形を埋め込む（1本あたり約3MB増）。事前サブセット化した軽量フォントの用意は backlog。
   */
  const font = await doc.embedFont(Uint8Array.from(fontBytes));
  doc.setTitle(ir.project.name);
  doc.setSubject(`${ir.project.brand} / ${ir.project.client}`);
  doc.setProducer('Luxury Beauty Visual Proposal OS');

  // 同じアセットが複数の面に出るので、埋め込みは1回にまとめる。
  const embedded = new Map<string, PDFImage | undefined>();
  const imageFor = async (block: ImageBlock): Promise<PDFImage | undefined> => {
    if (!block.data) return undefined;
    const key = block.assetId ?? block.data.slice(0, 64);
    if (embedded.has(key)) return embedded.get(key);

    const decoded = decodeDataUri(block.data);
    let image: PDFImage | undefined;
    try {
      if (decoded) {
        image = decoded.mime.includes('png')
          ? await doc.embedPng(decoded.bytes)
          : await doc.embedJpg(decoded.bytes);
      }
    } catch {
      // 埋め込めない画像があっても文書は出す。その面はプレースホルダになる。
      image = undefined;
    }
    embedded.set(key, image);
    return image;
  };

  const m = variant.margin;
  const sheet = () => new Sheet(doc, font, format, variant);
  const headingSize = variant.type.heading * format.heightPt;
  const caption = (block: ImageBlock): string => {
    const origin = block.assetOrigin ? ORIGIN_LABEL[block.assetOrigin] : undefined;
    return origin ? `${block.caption}（${origin}）` : block.caption;
  };

  // ── 表紙 ─────────────────────────────────────────────
  const cover = ir.sections.find((section) => section.id === 'cover');
  const coverImages = cover ? imageBlocks(cover) : [];
  const keyVisual = coverImages.find((block) => block.slotId === 'cover-key') ?? coverImages[0];
  const keyImage = keyVisual ? await imageFor(keyVisual) : undefined;

  const first = sheet();
  if (variant.cover === 'stack') {
    const art: Rect = { x: 0, y: 0, w: 1, h: 0.66 };
    if (keyImage) first.cover(art, keyImage);
    else first.placeholder(art);
    first.line(
      ir.project.name,
      { x: m, y: 0.78 },
      { size: first.fit(ir.project.name, 1 - m * 2, first.size('title')) },
    );
    first.line(
      `${ir.project.brand}／${ir.project.client}`,
      { x: m, y: 0.85 },
      { size: first.size('heading'), color: CHAMPAGNE },
    );
    first.line(
      `${ir.project.proposalDate}／版 ${ir.revision}`,
      { x: m, y: 0.9 },
      { color: MUTED },
    );
  } else {
    const art: Rect = { x: 0, y: 0, w: 1, h: 1 };
    if (keyImage) first.cover(art, keyImage);
    else first.placeholder(art);
    first.scrim({ x: 0, y: 0.62, w: 1, h: 0.38 });
    first.line(
      ir.project.name,
      { x: m, y: 0.78 },
      {
        size: first.fit(ir.project.name, 1 - m * 2, first.size('title')),
        color: REVERSE,
      },
    );
    first.line(
      `${ir.project.brand}／${ir.project.client}`,
      { x: m, y: 0.86 },
      { size: first.size('heading'), color: REVERSE },
    );
    first.line(
      `${ir.project.proposalDate}／版 ${ir.revision}`,
      { x: m, y: 0.92 },
      { color: REVERSE },
    );
  }

  // ── 各章 ─────────────────────────────────────────────
  // 画像を持たない章は1章1面にすると白いだけの面が並ぶ。まとめて流し込み、
  // 画像のある章が来たところで区切る（面の主役は常に画像側に置く）。
  let queued: FlowEntry[] = [];
  const enqueue = (section: IRSection, lines: string[]) => {
    queued.push({
      text: section.title,
      size: headingSize,
      heading: true,
      gapBefore: queued.length === 0 ? 0 : 0.045,
    });
    queued.push(...lines.map((text) => ({ text })));
  };
  const flushQueue = () => {
    while (queued.length > 0) queued = renderFlowPage(queued);
  };

  for (const section of ir.sections) {
    if (section.id === 'cover') continue;

    const images = imageBlocks(section);
    const lines = textLines(section);

    if (images.length === 0) {
      enqueue(section, lines);
      continue;
    }

    flushQueue();
    if (section.id === 'moodboard') {
      await renderGrid(section.title, images);
      continue;
    }
    if (section.id === 'shots') {
      if (variant.shots === 'filmstrip') await renderFilmstrip(section.title, images, lines);
      else await renderGrid(section.title, images);
      continue;
    }
    await renderTextPage(section.title, images, lines);
  }
  flushQueue();

  /** テキストだけの面。段組みに流し、入り切らなかった分を返す。 */
  function renderFlowPage(entries: FlowEntry[]): FlowEntry[] {
    const page = sheet();
    const top = 0.1;
    const height = 1 - top - m;

    if (variant.textPage.columns === 2) {
      const colGap = 0.03;
      const colW = (1 - m * 2 - colGap) / 2;
      const rest = page.flow(entries, { x: m, y: top, w: colW, h: height });
      return page.flow(rest, { x: m + colW + colGap, y: top, w: colW, h: height });
    }
    // 1カラムでも全幅には流さない。行長を抑え、右側は画像のための余白として残す。
    return page.flow(entries, { x: m, y: top, w: (1 - m * 2) * 0.62, h: height });
  }

  /** タイル状に並べる面。ムードボードとショットリスト（grid）が使う。 */
  async function renderGrid(title: string, blocks: ImageBlock[]): Promise<void> {
    const { cols, rows, gap, bleed, captions } = variant.moodboard;
    const perPage = cols * rows;

    for (let start = 0; start < blocks.length; start += perPage) {
      const page = sheet();
      const head = bleed ? 0 : 0.14;
      if (!bleed) {
        page.line(title, { x: m, y: 0.085 }, { size: page.size('heading') });
      }

      const area: Rect = bleed
        ? { x: 0, y: 0, w: 1, h: 1 }
        : { x: m, y: head, w: 1 - m * 2, h: 1 - head - m };
      const onPage = Math.min(perPage, blocks.length - start);
      // 最終ページで枚数が足りないときは行数を詰め、面が空白で終わらないようにする。
      const usedRows = Math.min(rows, Math.ceil(onPage / cols));
      const cellW = (area.w - gap * (cols - 1)) / cols;
      const cellH = (area.h - gap * (usedRows - 1)) / usedRows;

      for (let index = 0; index < perPage; index += 1) {
        const block = blocks[start + index];
        if (!block) break;
        const col = index % cols;
        const row = Math.floor(index / cols);
        const cell: Rect = {
          x: area.x + col * (cellW + gap),
          y: area.y + row * (cellH + gap),
          w: cellW,
          h: captions ? cellH * 0.86 : cellH,
        };

        const image = await imageFor(block);
        if (image) page.cover(cell, image);
        else page.placeholder(cell);
        if (captions) {
          page.line(caption(block), { x: cell.x, y: cell.y + cellH - 0.012 }, { color: MUTED });
        }
      }
    }
  }

  /** 横一列のフィルムストリップ。カットの流れを見せ、仕様は下に従属させる。 */
  async function renderFilmstrip(
    title: string,
    blocks: ImageBlock[],
    lines: string[],
  ): Promise<void> {
    const perPage = 4;
    let rest = lines;

    for (let start = 0; start < blocks.length; start += perPage) {
      const page = sheet();
      page.line(title, { x: m, y: 0.085 }, { size: page.size('heading') });

      const strip: Rect = { x: 0, y: 0.16, w: 1, h: 0.44 };
      const gap = 0.006;
      const cellW = (strip.w - gap * (perPage - 1)) / perPage;

      for (let index = 0; index < perPage; index += 1) {
        const block = blocks[start + index];
        if (!block) break;
        const cell: Rect = {
          x: strip.x + index * (cellW + gap),
          y: strip.y,
          w: cellW,
          h: strip.h,
        };
        const image = await imageFor(block);
        if (image) page.cover(cell, image);
        else page.placeholder(cell);
        page.line(caption(block), { x: cell.x + 0.008, y: strip.y + strip.h + 0.035 }, {
          color: MUTED,
        });
      }

      rest = page.text(rest, { x: m, y: 0.68, w: 1 - m * 2, h: 0.26 });
    }

    // 本文が余ったら、画像の無い面で続ける（テキストが画像を押し出さない）。
    while (rest.length > 0) {
      const page = sheet();
      rest = page.text(rest, { x: m, y: 0.16, w: 1 - m * 2, h: 0.74 });
    }
  }

  /** テキスト章の面。先頭に画像帯を置き、本文はその下に従属させる。 */
  async function renderTextPage(
    title: string,
    blocks: ImageBlock[],
    lines: string[],
  ): Promise<void> {
    const band = blocks.length > 0 ? variant.textPage.band : 0;
    let rest = lines;
    let firstPage = true;

    do {
      const page = sheet();
      const top = firstPage && band > 0 ? band : 0.12;

      if (firstPage && band > 0) {
        // 帯は最大2枚まで。3枚以上ある章はタイル面（grid）が受け持つ。
        const shown = blocks.slice(0, 2);
        const gap = 0.008;
        const cellW = (1 - gap * (shown.length - 1)) / shown.length;
        for (let index = 0; index < shown.length; index += 1) {
          const cell: Rect = { x: index * (cellW + gap), y: 0, w: cellW, h: band };
          const image = await imageFor(shown[index]);
          if (image) page.cover(cell, image);
          else page.placeholder(cell);
        }
      }

      page.line(title, { x: m, y: top + 0.075 }, { size: page.size('heading') });

      const bodyTop = top + 0.11;
      const bodyHeight = 1 - bodyTop - m;
      if (variant.textPage.columns === 2) {
        const colGap = 0.03;
        const colW = (1 - m * 2 - colGap) / 2;
        rest = page.text(rest, { x: m, y: bodyTop, w: colW, h: bodyHeight });
        rest = page.text(rest, { x: m + colW + colGap, y: bodyTop, w: colW, h: bodyHeight });
      } else {
        // 1カラムでも版面全幅には流さない。行長を抑え、右側を画像の呼吸に残す。
        rest = page.text(rest, { x: m, y: bodyTop, w: (1 - m * 2) * 0.62, h: bodyHeight });
      }
      firstPage = false;
    } while (rest.length > 0);
  }

  return doc.save();
}
