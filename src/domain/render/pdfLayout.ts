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
  StandardFonts,
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
import {
  A4_LANDSCAPE,
  ADOPTED_LAYOUT,
  safeMargin,
  sectionMode,
  toPoints,
  type LayoutSpec,
  type PageFormat,
  type Rect,
} from './layout';
import { splitRuns } from './textRuns';
import { warningSummary } from './types';

const INK = rgb(0.07, 0.06, 0.05);
const MUTED = rgb(0.54, 0.51, 0.47);
const CHAMPAGNE = rgb(0.7, 0.58, 0.42);
const PAPER = rgb(0.98, 0.97, 0.95);

/**
 * 縦にはみ出した分を、どれだけ下側から切るか（0.5=中央基準、1.0=上端を全部残す）。
 * 人物は顔が上寄りにあるため、切るなら下から切る。
 */
const CROP_FROM_BOTTOM = 0.78;

/** タイルが横に伸びすぎると人物写真が帯になる。1枠の縦横比の上限。 */
const MAX_CELL_ASPECT = 1.5;

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

/** 和文と欧文の2本組。ASCII は欧文側で描く（textRuns.ts に理由）。 */
export interface FontPair {
  cjk: PDFFont;
  latin: PDFFont;
}

function fontFor(fonts: FontPair, latin: boolean): PDFFont {
  return latin ? fonts.latin : fonts.cjk;
}

/** 実際に描くのと同じ分割で幅を測る。measure と描画がずれると折り返しが崩れる。 */
function measure(text: string, fonts: FontPair, size: number): number {
  return splitRuns(text).reduce(
    (sum, run) => sum + fontFor(fonts, run.latin).widthOfTextAtSize(run.text, size),
    0,
  );
}

/** 日本語は単語境界が無いので、文字単位で幅を測って折り返す。 */
function wrap(text: string, fonts: FontPair, size: number, width: number): string[] {
  const lines: string[] = [];
  let current = '';

  for (const char of text) {
    if (char === '\n') {
      lines.push(current);
      current = '';
      continue;
    }
    const candidate = current + char;
    if (measure(candidate, fonts, size) > width && current !== '') {
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
    private readonly fonts: FontPair,
    private readonly format: PageFormat,
    private readonly spec: LayoutSpec,
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

  size(kind: keyof LayoutSpec['type']): number {
    return this.spec.type[kind] * this.format.heightPt;
  }

  fill(rect: Rect, color = PAPER): void {
    this.page.drawRectangle({ ...toPoints(rect, this.format), color });
  }

  /**
   * 枠いっぱいに画像を敷く（はみ出す側は切り落とす）。
   * pdf-lib に切り抜きは無いので、クリップ矩形を積んでから拡大した画像を描く。
   *
   * 縦にはみ出すときは**上寄せで残す**。人物写真は顔が画面の上寄りにあり、
   * 中央基準で切ると頭が落ちる（実写で表紙・タイル・ストリップの全てで再現した）。
   */
  cover(rect: Rect, image: PDFImage): void {
    const box = toPoints(rect, this.format);
    const scale = Math.max(box.width / image.width, box.height / image.height);
    const width = image.width * scale;
    const height = image.height * scale;
    const overflow = height - box.height;

    this.page.pushOperators(
      pushGraphicsState(),
      rectangle(box.x, box.y, box.width, box.height),
      clip(),
      endPath(),
    );
    this.page.drawImage(image, {
      x: box.x + (box.width - width) / 2,
      y: box.y - overflow * CROP_FROM_BOTTOM,
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
      const wrapped = wrap(entry.text, this.fonts, size, box.width);
      const needed = before + step * wrapped.length;

      // 見出しだけが段の末尾に残るのを避ける（次の1行ぶんも入るか見る）。
      const orphan = entry.heading ? step : 0;
      if (y - needed - orphan < box.y) return entries.slice(index);

      y -= before;
      for (const line of wrapped) {
        y -= size;
        this.draw(line, box.x, y, size, entry.color ?? INK);
        y -= step - size;
      }
      y -= step * 0.3;
    }
    return [];
  }

  /** 描かずに、その枠へ入り切るかだけを見る（段に何章詰められるかの判定に使う）。 */
  overflow(entries: FlowEntry[], rect: Rect): boolean {
    const box = toPoints(rect, this.format);
    let y = box.y + box.height;

    for (const entry of entries) {
      const size = entry.size ?? this.size('body');
      const step = size * (entry.leading ?? 1.7);
      const lines = wrap(entry.text, this.fonts, size, box.width).length;
      y -= (entry.gapBefore ?? 0) * this.format.heightPt + step * lines + step * 0.3;
      if (y < box.y) return true;
    }
    return false;
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
    while (current > size * 0.5 && measure(content, this.fonts, current) > limit) {
      current -= size * 0.04;
    }
    return current;
  }

  /** 1行だけ置く（見出し・キャプション）。折り返しは行わない。 */
  line(
    content: string,
    at: { x: number; y: number },
    {
      size = this.size('caption'),
      color = INK,
    }: { size?: number; color?: ReturnType<typeof rgb> } = {},
  ): void {
    this.draw(
      content,
      at.x * this.format.widthPt,
      this.format.heightPt - at.y * this.format.heightPt,
      size,
      color,
    );
  }

  /**
   * 1行を描く。ASCII の並びは欧文フォント、それ以外は和文フォントに渡す。
   * 分けないと数字のテキスト層が壊れる（textRuns.ts に理由）。
   */
  private draw(
    content: string,
    x: number,
    y: number,
    size: number,
    color: ReturnType<typeof rgb>,
  ): void {
    let cursor = x;
    for (const run of splitRuns(content)) {
      const font = fontFor(this.fonts, run.latin);
      this.page.drawText(run.text, { x: cursor, y, size, font, color });
      cursor += font.widthOfTextAtSize(run.text, size);
    }
  }

  /**
   * 枠幅に収まるところまで詰める（入り切らなければ末尾を「…」にする）。
   * キャプションが隣の枠へはみ出して重なるのを防ぐ。
   */
  clip(content: string, widthRatio: number): string {
    const limit = widthRatio * this.format.widthPt;
    const size = this.size('caption');
    if (measure(content, this.fonts, size) <= limit) return content;

    let text = content;
    while (text.length > 1 && measure(`${text}…`, this.fonts, size) > limit) {
      text = text.slice(0, -1);
    }
    return `${text}…`;
  }

  /** 画像の上に文字を置くための暗幕。写真の明暗に関わらず可読性を保つ。 */
  scrim(rect: Rect): void {
    this.page.drawRectangle({ ...toPoints(rect, this.format), color: INK, opacity: 0.42 });
  }
}

export interface LayoutRenderOptions {
  spec?: LayoutSpec;
  format?: PageFormat;
  fontBytes: Uint8Array;
}

/**
 * IR から版面つきの PDF を作る（第8章 8-5）。AI は呼ばず、IR 以外も読まない。
 *
 * 面の作り方は章のモードで決まる。
 * ・visual（表紙・ブランド分析・競合分析・コンセプト・ムードボード）：画像が面を支配する。
 *   ただし見出し・キャプション・出自表示は落とさない。どの面かを読み手が判別できることは
 *   装飾ではなく機能である。
 * ・dense（ショットリスト以降）：2段組の密度でまとめる。章ごとに見出し領域を持ち、
 *   前の章の本文と地続きにならないようにする。
 */
export async function renderLayoutPdf(
  ir: ProposalIR,
  { spec = ADOPTED_LAYOUT, format = A4_LANDSCAPE, fontBytes }: LayoutRenderOptions,
): Promise<Uint8Array> {
  if (!fontBytes || fontBytes.length === 0) {
    throw new Error(
      '日本語フォントを読み込めないため PDF を生成できません。文字化けした成果物は出力しません。',
    );
  }

  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  /*
   * 和文はサブセット化せずに埋め込む（第8章）。pdf-lib のサブセット書き出しは
   * 壊れた glyf を吐き、実測で 47 字中 38 字の輪郭が失われた（画面では文字が消える）。
   * 出力側からは検知できないため、全字形を埋め込む（1本あたり約3MB増）。
   * 事前サブセット化した軽量フォントの用意は backlog。
   *
   * 欧文（ASCII）は標準フォントで描く。和文フォントに ASCII だけの並びを渡すと
   * テキスト層が壊れるため（textRuns.ts に詳細）。
   */
  const fonts: FontPair = {
    cjk: await doc.embedFont(Uint8Array.from(fontBytes)),
    latin: await doc.embedFont(StandardFonts.Helvetica),
  };
  doc.setTitle(ir.project.name);
  doc.setSubject(`${ir.project.brand} / ${ir.project.client}`);
  doc.setProducer('Luxury Beauty Visual Proposal OS');

  const margin = safeMargin(format);
  const sheet = () => new Sheet(doc, fonts, format, spec);
  const headingSize = spec.type.heading * format.heightPt;
  const captionRatio = spec.type.caption * 1.9;

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

  /** キャプションは必ず出自つきで出す（第5章 5-1：説明責任）。 */
  const caption = (block: ImageBlock): string => {
    const origin = block.assetOrigin ? ORIGIN_LABEL[block.assetOrigin] : '画像未登録';
    return `${block.caption}（${origin}）`;
  };

  /** 枠に画像かプレースホルダを置き、下にキャプションを添える。 */
  async function place(page: Sheet, rect: Rect, block: ImageBlock): Promise<void> {
    const art: Rect = { ...rect, h: rect.h - captionRatio };
    const image = await imageFor(block);
    if (image) page.cover(art, image);
    else page.placeholder(art);
    // キャプションは枠の下に置き、次の枠と重ならない高さを確保しておく。
    page.line(
      page.clip(caption(block), rect.w),
      { x: rect.x, y: art.y + art.h + captionRatio * 0.72 },
      { color: MUTED },
    );
  }

  // ── 表紙（C 案：画像＋クリーム地。暗幕は使わない） ──────────────
  const cover = ir.sections.find((section) => section.id === 'cover');
  const coverImages = cover ? imageBlocks(cover) : [];
  const keyVisual = coverImages.find((block) => block.slotId === 'cover-key') ?? coverImages[0];
  const keyImage = keyVisual ? await imageFor(keyVisual) : undefined;

  const first = sheet();
  const art: Rect = { x: 0, y: 0, w: 1, h: 0.66 };
  if (keyImage) first.cover(art, keyImage);
  else first.placeholder(art);
  first.line(
    ir.project.name,
    { x: margin.x, y: 0.79 },
    { size: first.fit(ir.project.name, 1 - margin.x * 2, first.size('title')) },
  );
  first.line(
    `${ir.project.brand}／${ir.project.client}`,
    { x: margin.x, y: 0.86 },
    { size: first.size('heading'), color: CHAMPAGNE },
  );
  first.line(
    `${ir.project.proposalDate}／版 ${ir.revision}`,
    { x: margin.x, y: 0.92 },
    { color: MUTED },
  );

  // ── 各章 ─────────────────────────────────────────────
  const denseQueue: { title: string; lines: string[] }[] = [];

  const flushDense = () => {
    // dense のテキスト章は段に詰める。章ごとに見出しを持たせて地続きを避けつつ、
    // 短い章が続くときは同じ段に続けて入れ、面の下半分が白く残るのを防ぐ。
    while (denseQueue.length > 0) {
      const page = sheet();
      const top = margin.y + 0.02;
      const height = 1 - top - margin.y;
      const colW = (1 - margin.x * 2 - spec.dense.gap) / spec.dense.columns;

      for (let column = 0; column < spec.dense.columns && denseQueue.length > 0; column += 1) {
        const rect: Rect = {
          x: margin.x + column * (colW + spec.dense.gap),
          y: top,
          w: colW,
          h: height,
        };

        // 段に入るだけ章を積む。1章目が入り切らなければ「（続き）」で次の段へ送る。
        let entries: FlowEntry[] = [];
        let taken = 0;
        while (denseQueue.length > 0) {
          const next = denseQueue[0];
          const candidate: FlowEntry[] = [
            ...entries,
            {
              text: next.title,
              size: headingSize,
              heading: true,
              gapBefore: taken === 0 ? 0 : 0.035,
            },
            ...next.lines.map((text) => ({ text })),
          ];
          if (taken > 0 && page.overflow(candidate, rect)) break;
          entries = candidate;
          denseQueue.shift();
          taken += 1;
        }

        const rest = page.flow(entries, rect);
        if (rest.length > 0) {
          const title = rest[0]?.heading
            ? rest[0].text
            : `${entries.find((entry) => entry.heading)?.text ?? ''}（続き）`;
          denseQueue.unshift({
            title,
            lines: rest.filter((entry) => !entry.heading).map((entry) => entry.text),
          });
        }
      }
    }
  };

  for (const section of ir.sections) {
    if (section.id === 'cover') continue;

    const images = imageBlocks(section);
    const lines = textLines(section);
    const mode = sectionMode(section.id);

    if (section.id === 'moodboard') {
      flushDense();
      await renderTiles(section.title, images);
      continue;
    }
    if (section.id === 'shots') {
      flushDense();
      await renderShots(section.title, images, lines);
      continue;
    }
    if (mode === 'visual') {
      flushDense();
      await renderVisual(section.title, images, lines);
      continue;
    }
    if (images.length > 0) {
      flushDense();
      await renderVisual(section.title, images, lines);
      continue;
    }
    denseQueue.push({ title: section.title, lines });
  }
  flushDense();

  // 出力物にも警告を残す（第6章 6-4、第7章 7-8）。画面で確認しただけでは、
  // 手元に落ちた PDF がどの状態で出たのか後から分からない。
  const notes = warningSummary(ir);
  if (notes.length > 0) {
    const page = sheet();
    page.line(
      '出力時の注意',
      { x: margin.x, y: margin.y + spec.type.heading },
      { size: page.size('heading') },
    );
    page.flow(
      notes.map((note) => ({ text: `・${note}`, color: MUTED })),
      {
        x: margin.x,
        y: margin.y + spec.type.heading + 0.03,
        w: 1 - margin.x * 2,
        h: 1 - margin.y * 2,
      },
    );
  }

  /**
   * 画像が主役の面。帯の高さは本文量で決める（本文が少ない面ほど画像が伸びる）。
   * これで「下半分が白いだけ」の面が出なくなる。
   */
  async function renderVisual(
    title: string,
    blocks: ImageBlock[],
    lines: string[],
  ): Promise<void> {
    const page = sheet();
    const shown = blocks.slice(0, 3);
    // 本文1行あたり 0.032 を目安に、帯を上限から削る。
    const band = Math.max(
      spec.band.min,
      Math.min(spec.band.max, spec.band.max - lines.length * 0.032),
    );

    const gap = 0.008;
    const cellW = shown.length > 0 ? (1 - gap * (shown.length - 1)) / shown.length : 1;
    for (let index = 0; index < shown.length; index += 1) {
      const cell: Rect = { x: index * (cellW + gap), y: 0, w: cellW, h: band };
      const image = await imageFor(shown[index]);
      if (image) page.cover(cell, image);
      else page.placeholder(cell);
      page.line(
        page.clip(caption(shown[index]), cellW - 0.01),
        { x: index * (cellW + gap) + 0.006, y: band + captionRatio * 0.72 },
        { color: MUTED },
      );
    }

    const top = band + captionRatio + 0.02;
    page.line(
      title,
      { x: margin.x, y: top + spec.type.heading },
      { size: page.size('heading') },
    );

    const bodyTop = top + spec.type.heading + 0.03;
    const colW = (1 - margin.x * 2 - spec.dense.gap) / 2;
    // 画像面でも行長は抑える。読ませる面ではなく、見せる面である。
    let rest = page.text(lines, {
      x: margin.x,
      y: bodyTop,
      w: colW,
      h: 1 - bodyTop - margin.y,
    });
    rest = page.text(rest, {
      x: margin.x + colW + spec.dense.gap,
      y: bodyTop,
      w: colW,
      h: 1 - bodyTop - margin.y,
    });
    // 溢れた分は dense の流れへ送る（画像面を本文で押し広げない）。
    if (rest.length > 0) denseQueue.push({ title: `${title}（続き）`, lines: rest });
  }

  /**
   * タイル面（ムードボード）。最終ページは残数に応じて列数を組み直し、
   * 「2枚だけの面」を作らない。
   */
  async function renderTiles(title: string, blocks: ImageBlock[]): Promise<void> {
    const { cols, rows, gap } = spec.moodboard;
    const perPage = cols * rows;

    for (let start = 0; start < blocks.length; start += perPage) {
      const page = sheet();
      const head = margin.y + spec.type.heading + 0.03;
      page.line(
        title,
        { x: margin.x, y: margin.y + spec.type.heading },
        { size: page.size('heading') },
      );

      const area: Rect = { x: margin.x, y: head, w: 1 - margin.x * 2, h: 1 - head - margin.y };
      const onPage = Math.min(perPage, blocks.length - start);
      // 残数で列と行を組み直す（例：残り2枚なら1行2列の大判にする）。
      const usedCols = Math.min(cols, onPage);
      const usedRows = Math.ceil(onPage / usedCols);
      const cellH = (area.h - gap * (usedRows - 1)) / usedRows;

      for (let index = 0; index < onPage; index += 1) {
        const row = Math.floor(index / usedCols);
        const col = index - row * usedCols;
        // その行の枚数で幅を決める。半端な行も行幅いっぱいに伸ばし、空セルを残さない。
        const inRow = Math.min(usedCols, onPage - row * usedCols);
        // その行の枚数で幅を決める。ただし伸ばしすぎない：横長になりすぎた枠に
        // 縦位置の人物写真を入れると顔が入らず帯になる（実写で確認）。
        const stretched = (area.w - gap * (inRow - 1)) / inRow;
        const cellW = Math.min(
          stretched,
          ((cellH - captionRatio) * MAX_CELL_ASPECT * format.heightPt) / format.widthPt,
        );
        // 伸ばさなかったぶんは行ごと中央に寄せ、片側だけ空くのを避ける。
        const offset = (area.w - (cellW * inRow + gap * (inRow - 1))) / 2;
        await place(
          page,
          {
            x: area.x + offset + col * (cellW + gap),
            y: area.y + row * (cellH + gap),
            w: cellW,
            h: cellH,
          },
          blocks[start + index],
        );
      }
    }
  }

  /**
   * ショットリスト（A のフィルムストリップ＋カット別仕様）。
   * 仕様テキストを落とすと実務で使えないので、帯の下に2段組で必ず併記する。
   */
  async function renderShots(
    title: string,
    blocks: ImageBlock[],
    lines: string[],
  ): Promise<void> {
    const { perPage, strip } = spec.shots;
    let rest = lines;

    for (let start = 0; start < blocks.length; start += perPage) {
      const page = sheet();
      const head = margin.y + spec.type.heading;
      page.line(title, { x: margin.x, y: head }, { size: page.size('heading') });

      const top = head + 0.03;
      const onPage = Math.min(perPage, blocks.length - start);
      const gap = 0.006;
      // 枠の幅は常に perPage 分割。カットが少ない面でも枠を広げない
      // （横に伸ばすと縦位置のカットが帯になり、絵コンテとして読めなくなる）。
      const cellW = (1 - margin.x * 2 - gap * (perPage - 1)) / perPage;

      for (let index = 0; index < onPage; index += 1) {
        await place(
          page,
          {
            x: margin.x + index * (cellW + gap),
            y: top,
            w: cellW,
            h: strip,
          },
          blocks[start + index],
        );
      }

      const bodyTop = top + strip + 0.02;
      const colW = (1 - margin.x * 2 - spec.dense.gap) / 2;
      rest = page.text(rest, {
        x: margin.x,
        y: bodyTop,
        w: colW,
        h: 1 - bodyTop - margin.y,
      });
      rest = page.text(rest, {
        x: margin.x + colW + spec.dense.gap,
        y: bodyTop,
        w: colW,
        h: 1 - bodyTop - margin.y,
      });
    }

    if (rest.length > 0) denseQueue.push({ title: `${title}（続き）`, lines: rest });
  }

  return doc.save();
}
