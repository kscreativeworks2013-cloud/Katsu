/*
 * ビジュアル主導の版面レンダラ（第8章）。
 *
 * 第6章のレンダラ契約は変えない：入力は IR だけ、ネットワークを使わない、IR を書き換えない。
 * 変わるのは面の作り方で、1カラムの流し込みをやめ、画像を主役にした面付けを行う。
 * 版面の値は layout.ts の比率定義から展開する（判型を差し替えても版面定義は1つ）。
 * 色は IR の theme（ブランドのパレットからの導出）を使い、ここに定数を置かない。
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
import type { CropFocus } from '../../data/types';
import type { IRBlock, IRSection, ProposalIR } from '../ir';
import { wrapText } from './kinsoku';
import {
  A4_LANDSCAPE,
  ADOPTED_LAYOUT,
  MAX_MEASURE_CHARS,
  MIN_COLUMN_ITEMS,
  MIN_MEASURE_CHARS,
  bandCells,
  cellSize,
  gridCells,
  matPadding,
  pageMetrics,
  safeMargin,
  shotArea,
  shotOptions,
  slotWidthRatio,
  tileArea,
  tileOptions,
  toPoints,
  type LayoutSpec,
  type PageFormat,
  type Rect,
} from './layout';
import { splitRuns } from './textRuns';
import { irTexts, missingGlyphMessage, missingGlyphs, needsCjkFont } from './fontCoverage';
import { themeRgb } from './theme';
import { checklistSummary, warningSummary } from './types';

/**
 * 縦にはみ出した分を、どれだけ下側から切るか（0.5=中央基準、1.0=上端を全部残す）。
 * 人物は顔が上寄りにあるため、切るなら下から切る。切り出し位置の指定がある画像では、
 * この既定ではなく指定した点を枠の中心に置く（第8章 8-7）。
 */
const CROP_FROM_BOTTOM = 0.78;

/** タイルの境界線の太さ（pt）。素材が高明度でも枠の下端が消えないための最小限。 */
const TILE_EDGE_PT = 0.6;

/*
 * 版面そのものが持つ文字（第9章 工程00-b）。
 *
 * 章本文もキャプションも IR から来るが、出自ラベル・箇条書きの記号・表紙の日付行・
 * 注意書きの見出しはレンダラ側の文字である。ここが常に和文だと、英語版でも和文
 * フォントを埋め込まざるを得ない（「／」だけで 2.4MB を運ぶ）。言語で引き分ける。
 */
const CHROME = {
  ja: {
    origin: { upload: '持ち込み', external: '外部参照', ai: 'AI生成' } as Record<
      string,
      string
    >,
    noImage: '画像未登録',
    bullet: '・',
    caption: (label: string, origin: string) => `${label}（${origin}）`,
    selfPoint: (label: string) => `${label}（提案位置）`,
    subtitle: (brand: string, client: string) => `${brand}／${client}`,
    dateLine: (date: string, revision: string) => `提案日 ${date}／版 ${revision}`,
    notes: '出力時の注意',
    checklist: '提出前チェック',
  },
  en: {
    origin: { upload: 'Supplied', external: 'External', ai: 'AI-generated' } as Record<
      string,
      string
    >,
    noImage: 'No image',
    bullet: '- ',
    caption: (label: string, origin: string) => `${label} (${origin})`,
    selfPoint: (label: string) => `${label} (proposed)`,
    subtitle: (brand: string, client: string) => `${brand} / ${client}`,
    dateLine: (date: string, revision: string) => `Proposed ${date} / rev ${revision}`,
    notes: 'Production notes',
    checklist: 'Pre-submission checklist',
  },
} as const;

type Chrome = (typeof CHROME)['ja'];

/** 版面が持つ文字を、字形の突き合わせに渡せる形で並べる。 */
function chromeTexts(chrome: Chrome): string[] {
  return [
    ...Object.values(chrome.origin),
    chrome.noImage,
    chrome.bullet,
    chrome.caption('a', 'b'),
    chrome.selfPoint('a'),
    chrome.subtitle('a', 'b'),
    chrome.dateLine('a', 'b'),
    chrome.notes,
    chrome.checklist,
  ];
}

type ImageBlock = Extract<IRBlock, { type: 'image' }>;
type MapBlock = Extract<IRBlock, { type: 'map' }>;
type Color = ReturnType<typeof rgb>;

/** 版面色。IR の theme（ブランドのパレットからの導出）を pdf-lib の色型に写したもの。 */
interface Palette {
  paper: Color;
  ink: Color;
  accent: Color;
  mat: Color;
  matEdge: Color;
  muted: Color;
}

function paletteOf(ir: ProposalIR): Palette {
  const at = (hex: string): Color => {
    const { r, g, b } = themeRgb(hex);
    return rgb(r, g, b);
  };
  return {
    paper: at(ir.theme.paper),
    ink: at(ir.theme.ink),
    accent: at(ir.theme.accent),
    mat: at(ir.theme.mat),
    matEdge: at(ir.theme.matEdge),
    muted: at(ir.theme.muted),
  };
}

/** 流し込みの1項目。見出しも本文も同じ流れに載せる。 */
interface FlowEntry {
  text: string;
  size?: number;
  color?: Color;
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
function textLines(section: IRSection, chrome: Chrome): string[] {
  return section.blocks.flatMap((block) => {
    if (block.type === 'paragraph') return [block.text];
    if (block.type === 'list') return block.items.map((item) => `${chrome.bullet}${item}`);
    return [];
  });
}

function imageBlocks(section: IRSection): ImageBlock[] {
  return section.blocks.filter((block): block is ImageBlock => block.type === 'image');
}

function mapBlock(section: IRSection): MapBlock | undefined {
  return section.blocks.find((block): block is MapBlock => block.type === 'map');
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * 段の釣り合い（第8章 8-6）。1段目だけが埋まって右半分が白く残るのを防ぐ。
 * 量が揃うところで項目を段へ配る。項目の途中では割らない（段をまたぐ段落を作らない）。
 * 割り切れないときは前の段を厚くする（読み始めの段が短いほうが不自然に見える）。
 */
function distribute<T>(items: T[], weight: (item: T) => number, columns: number): T[][] {
  const total = items.reduce((sum, item) => sum + weight(item), 0);
  const target = total / columns;
  const groups: T[][] = Array.from({ length: columns }, () => []);
  let column = 0;
  let filled = 0;

  for (const item of items) {
    const size = weight(item);
    // 半分を越えた時点で次の段へ送る（項目の重心で判断する）。
    if (column < columns - 1 && filled + size / 2 > target * (column + 1)) column += 1;
    groups[column].push(item);
    filled += size;
  }
  return groups;
}

/** 本文の段割り（段ごとの項目と、段の幅）。 */
interface ColumnPlan {
  groups: FlowEntry[][];
  colW: number;
}

/** 版面を実寸に展開して描くための道具。座標変換と切り抜きをここに閉じる。 */
class Sheet {
  readonly page: PDFPage;

  constructor(
    doc: PDFDocument,
    private readonly fonts: FontPair,
    private readonly format: PageFormat,
    private readonly spec: LayoutSpec,
    private readonly palette: Palette,
  ) {
    this.page = doc.addPage([format.widthPt, format.heightPt]);
    this.page.drawRectangle({
      x: 0,
      y: 0,
      width: format.widthPt,
      height: format.heightPt,
      color: palette.paper,
    });
  }

  size(kind: keyof LayoutSpec['type']): number {
    return this.spec.type[kind] * this.format.heightPt;
  }

  fill(rect: Rect, color: Color): void {
    this.page.drawRectangle({ ...toPoints(rect, this.format), color });
  }

  /** 枠線だけを描く（塗りは持たない）。タイルの下端を素材によらず成立させる。 */
  frame(rect: Rect, color: Color): void {
    this.page.drawRectangle({
      ...toPoints(rect, this.format),
      borderColor: color,
      borderWidth: TILE_EDGE_PT,
    });
  }

  /**
   * 枠いっぱいに画像を敷く（はみ出す側は切り落とす）。
   * pdf-lib に切り抜きは無いので、クリップ矩形を積んでから拡大した画像を描く。
   *
   * 既定は**上寄せで残す**。人物写真は顔が画面の上寄りにあり、中央基準で切ると頭が落ちる
   * （実写で表紙・タイル・ストリップの全てで再現した）。focus の指定があるときは、
   * その点（画像内の相対位置）が枠の中心に来るように寄せる。余る側だけが動くので、
   * どんな値を指定しても枠に隙間はできない。
   */
  cover(rect: Rect, image: PDFImage, focus?: CropFocus): void {
    const box = toPoints(rect, this.format);
    const scale = Math.max(box.width / image.width, box.height / image.height);
    const width = image.width * scale;
    const height = image.height * scale;
    const overflowX = width - box.width;
    const overflowY = height - box.height;

    const fromTop = focus
      ? clamp(focus.y * height - box.height / 2, 0, overflowY)
      : overflowY * (1 - CROP_FROM_BOTTOM);
    const fromLeft = focus
      ? clamp(focus.x * width - box.width / 2, 0, overflowX)
      : overflowX / 2;

    this.page.pushOperators(
      pushGraphicsState(),
      rectangle(box.x, box.y, box.width, box.height),
      clip(),
      endPath(),
    );
    this.page.drawImage(image, {
      x: box.x - fromLeft,
      y: box.y - (overflowY - fromTop),
      width,
      height,
    });
    this.page.pushOperators(popGraphicsState());
  }

  /** 直線を1本引く（図の軸）。 */
  rule(from: { x: number; y: number }, to: { x: number; y: number }, color: Color): void {
    this.page.drawLine({
      start: { x: from.x * this.format.widthPt, y: (1 - from.y) * this.format.heightPt },
      end: { x: to.x * this.format.widthPt, y: (1 - to.y) * this.format.heightPt },
      thickness: 0.6,
      color,
    });
  }

  /** 点を1つ打つ（図の位置）。 */
  dot(at: { x: number; y: number }, radius: number, color: Color): void {
    this.page.drawCircle({
      x: at.x * this.format.widthPt,
      y: (1 - at.y) * this.format.heightPt,
      size: radius * this.format.widthPt,
      color,
    });
  }

  /**
   * 枠の中に画像を収める（切らない）。ロゴのように形が意味を持つ画像に使う。
   * 余った側は空ける。左下を基準に置き、版面の基準線から浮かせない。
   */
  contain(rect: Rect, image: PDFImage): void {
    const box = toPoints(rect, this.format);
    const scale = Math.min(box.width / image.width, box.height / image.height);
    this.page.drawImage(image, {
      x: box.x,
      y: box.y,
      width: image.width * scale,
      height: image.height * scale,
    });
  }

  /** 画像が無いスロットの受け皿。面付けを崩さないよう、同じ枠を淡色で置く。 */
  placeholder(rect: Rect): void {
    this.fill(rect, this.palette.mat);
  }

  /** 1項目を流したときの行数。段の釣り合いと帯の高さの決定に使う。 */
  lines(entry: FlowEntry, widthRatio: number): number {
    const size = entry.size ?? this.size('body');
    return this.wrap(entry.text, size, widthRatio * this.format.widthPt).length;
  }

  /** 項目を流すのに要る高さ（ページ高さ比）。面の下が白く残らないよう帯の高さを決める。 */
  height(entries: FlowEntry[], widthRatio: number): number {
    const total = entries.reduce((sum, entry) => {
      const size = entry.size ?? this.size('body');
      const step = size * (entry.leading ?? 1.7);
      return (
        sum +
        (entry.gapBefore ?? 0) * this.format.heightPt +
        step * this.lines(entry, widthRatio) +
        step * 0.3
      );
    }, 0);
    return total / this.format.heightPt;
  }

  private wrap(text: string, size: number, width: number): string[] {
    return wrapText(text, (part) => measure(part, this.fonts, size), width);
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
      const wrapped = this.wrap(entry.text, size, box.width);
      const needed = before + step * wrapped.length;

      // 見出しだけが段の末尾に残るのを避ける（次の1行ぶんも入るか見る）。
      const orphan = entry.heading ? step : 0;
      if (y - needed - orphan < box.y) return entries.slice(index);

      y -= before;
      for (const line of wrapped) {
        y -= size;
        this.draw(line, box.x, y, size, entry.color ?? this.palette.ink);
        y -= step - size;
      }
      y -= step * 0.3;
    }
    return [];
  }

  /** 描かずに、その枠へ入り切るかだけを見る（段に何章詰められるかの判定に使う）。 */
  overflow(entries: FlowEntry[], rect: Rect): boolean {
    return this.height(entries, rect.w) > rect.h;
  }

  /**
   * 本文の段割り（第8章 8-6）。
   *
   * 2段に釣り合わせるのは、どの段も最小行数を満たせるときだけ。満たせない章を割ると、
   * 片方に1行だけ浮いて断片に見える。その場合は1段で組み、測度は最大字数で頭打ちにする
   * （面の幅いっぱいに広げると、今度は行が追えなくなる）。
   */
  private plan(lines: string[], widthRatio: number, gap: number): ColumnPlan {
    const entries = lines.map((text) => ({ text }) satisfies FlowEntry);
    const colW = (widthRatio - gap) / 2;
    const groups = distribute(entries, (entry) => this.lines(entry, colW), 2);
    const measure = (colW * this.format.widthPt) / this.size('body');
    const enough =
      measure >= MIN_MEASURE_CHARS && groups.every((group) => group.length >= MIN_COLUMN_ITEMS);
    if (enough) return { groups, colW };

    return {
      groups: [entries],
      colW: Math.min(widthRatio, (MAX_MEASURE_CHARS * this.size('body')) / this.format.widthPt),
    };
  }

  /** 本文を流し、入り切らなかった行を返す。段からの溢れは次の段へ送る。 */
  columns(lines: string[], rect: Rect, gap: number): string[] {
    const { groups, colW } = this.plan(lines, rect.w, gap);

    let carry: FlowEntry[] = [];
    for (let column = 0; column < groups.length; column += 1) {
      carry = this.flow([...carry, ...groups[column]], {
        ...rect,
        x: rect.x + column * (colW + gap),
        w: colW,
      });
    }
    return carry.map((entry) => entry.text);
  }

  /** 段に割ったときに要る高さ（最も高い段）。画像帯の高さを決めるのに使う。 */
  columnHeight(lines: string[], widthRatio: number, gap: number): number {
    const { groups, colW } = this.plan(lines, widthRatio, gap);
    return Math.max(...groups.map((group) => this.height(group, colW)), 0);
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
      color = this.palette.ink,
    }: { size?: number; color?: Color } = {},
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
  private draw(content: string, x: number, y: number, size: number, color: Color): void {
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

  /*
   * 字形の過不足を、1ページも描く前に確かめる（第9章 工程00-b）。
   * 和文フォントは事前に絞ってあるので、実案件の固有名詞に収録外の字が現れうる。
   * pdf-lib は字形の無い文字を黙って空白にするため、ここで止めないと出力側で
   * 気づけない。フォントを読み込めないときと同じ扱いにする（第6章 6-6）。
   */
  // 版面が持つ文字（出自ラベル・箇条書き記号・日付行）も突き合わせの対象に含める。
  // IR だけを見ると、レンダラ側の「／」で和文フォントが要ることを見落とす。
  const chrome = CHROME[ir.lang] ?? CHROME.ja;
  // 注意書きと提出前チェックの文はレンダラ側で組み立てるので、IR には載っていない。
  // ここで先に作って突き合わせに含めないと、和文フォントの要否を読み違える。
  const notes = warningSummary(ir);
  const checklist = checklistSummary(ir);
  const texts = [...irTexts(ir), ...chromeTexts(chrome), ...notes, ...checklist];
  const missing = missingGlyphs(texts, Uint8Array.from(fontBytes));
  if (missing.length > 0) throw new Error(missingGlyphMessage(missing));

  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  /*
   * 和文は**実行時には**サブセット化しない（第8章）。pdf-lib の実行時サブセット化は
   * 壊れた glyf を吐き、実測で 47 字中 38 字の輪郭が失われた（画面では文字が消える）。
   * 絞り込みはビルド前に一度だけ行い（tools/fonts/subset.py）、ここではそれを
   * そのまま埋め込む。
   *
   * 和文フォントを1文字も使わない面付け（英文だけの提案書）では埋め込まない。
   * 判定は IR から決まるので、同じ IR からは必ず同じファイルが出る。
   *
   * 欧文（ASCII）は標準フォントで描く。和文フォントに ASCII だけの並びを渡すと
   * テキスト層が壊れるため（textRuns.ts に詳細）。
   */
  const latin = await doc.embedFont(StandardFonts.Helvetica);
  const fonts: FontPair = {
    cjk: needsCjkFont(texts) ? await doc.embedFont(Uint8Array.from(fontBytes)) : latin,
    latin,
  };
  doc.setTitle(ir.project.name);
  doc.setSubject(`${ir.project.brand} / ${ir.project.client}`);
  doc.setProducer('Luxury Beauty Visual Proposal OS');
  // 日時は組み立て時刻（IR）を使う。出力時刻を入れると、同じ IR から出したファイルが
  // 毎回違うバイト列になり、「同じ版のはずのファイル」を突き合わせられなくなる。
  const builtAt = new Date(ir.builtAt);
  doc.setCreationDate(builtAt);
  doc.setModificationDate(builtAt);

  const palette = paletteOf(ir);
  const margin = safeMargin(format);
  const sheet = () => new Sheet(doc, fonts, format, spec, palette);
  const headingSize = spec.type.heading * format.heightPt;
  // 面の寸法は版面定義から取る。ここに数値を置くと、配置幅の申告とずれる（第8章 8-4）。
  const { captionRatio, afterHeading, headTop } = pageMetrics(spec, format);

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

  /**
   * キャプションは必ず出自つきで出す（第5章 5-1：説明責任）。
   * 説明文が無い枠では出自だけを出す。素材のファイル名で埋めると、内部の名前が
   * 納品物に載る（実測：08-mood-high がそのまま出た）。未設定は提出前チェックで数える。
   */
  const caption = (block: ImageBlock): string => {
    const origin = block.assetOrigin ? chrome.origin[block.assetOrigin] : chrome.noImage;
    const label = block.caption.trim();
    return label === '' ? origin : chrome.caption(label, origin);
  };

  /** 枠に画像かプレースホルダを置き、下にキャプションを添える。 */
  async function place(
    page: Sheet,
    rect: Rect,
    block: ImageBlock,
    options: { edge?: boolean } = {},
  ): Promise<void> {
    const art: Rect = { ...rect, h: rect.h - captionRatio };
    const image = await imageFor(block);
    if (image) page.cover(art, image, block.focus);
    else page.placeholder(art);
    // 素材が高明度だと台紙と地続きに見え、下端が揃っていないように読める。
    // 枠線は素材によらず一律に引く（素材ごとに処理を変えない）。
    if (options.edge) page.frame(art, palette.matEdge);
    // キャプションは枠の下に置き、次の枠と重ならない高さを確保しておく。
    // 枠が断ち落としでも、読ませる要素は安全マージンの内側へ寄せ直す。
    const capX = clamp(rect.x, margin.x, 1 - margin.x);
    page.line(
      page.clip(caption(block), Math.min(rect.x + rect.w, 1 - margin.x) - capX),
      { x: capX, y: art.y + art.h + captionRatio * 0.72 },
      { color: palette.muted },
    );
  }

  // ── 表紙（C 案：画像＋クリーム地。暗幕は使わない） ──────────────
  const cover = ir.sections.find((section) => section.id === 'cover');
  const coverImages = cover ? imageBlocks(cover) : [];
  const keyVisual = coverImages.find((block) => block.slotId === 'cover-key') ?? coverImages[0];
  const keyImage = keyVisual ? await imageFor(keyVisual) : undefined;

  const first = sheet();
  const art: Rect = { x: 0, y: 0, w: 1, h: 0.66 };
  if (keyImage) first.cover(art, keyImage, keyVisual?.focus);
  else first.placeholder(art);

  // ロゴは画像帯とタイトルの間に置く。切らずに収め、タイトルの字面に触れない高さに収める。
  const logoBlock = coverImages.find((block) => block.slotId === 'cover-logo');
  const logoImage = logoBlock ? await imageFor(logoBlock) : undefined;
  if (logoImage) {
    first.contain(
      { x: margin.x, y: 0.672, w: slotWidthRatio('cover-logo'), h: 0.045 },
      logoImage,
    );
  }

  first.line(
    ir.project.name,
    { x: margin.x, y: 0.79 },
    { size: first.fit(ir.project.name, 1 - margin.x * 2, first.size('title')) },
  );
  first.line(
    chrome.subtitle(ir.project.brand, ir.project.client),
    { x: margin.x, y: 0.86 },
    { size: first.size('heading'), color: palette.accent },
  );
  // 日付は案件データの提案日であって、この PDF を作った日ではない（第8章 8-7）。
  first.line(
    chrome.dateLine(ir.project.proposalDate, ir.revision),
    { x: margin.x, y: 0.92 },
    { color: palette.muted },
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

      /*
       * dense 面は**章の単位で段へ配る**（第8章 8-6）。
       * 1段目を満たしてから2段目という順送りだと、4章あっても左段に3章・右段に1章となり
       * 右下が大きく空く（実測）。逆に量だけで割ると、見出しが1段目の末尾に残って
       * 本文だけが2段目に移る。割るのは章の境目に限り、量で釣り合わせる。
       */
      const chunkOf = (item: { title: string; lines: string[] }): FlowEntry[] => [
        { text: item.title, size: headingSize, heading: true },
        ...item.lines.map((text) => ({ text })),
      ];

      // この面に載せる章を、段の総量まで取る（1章目は入り切らなくても必ず取る）。
      const taken: { title: string; lines: string[] }[] = [];
      let filled = 0;
      while (denseQueue.length > 0) {
        const next = denseQueue[0];
        const cost = page.height(chunkOf(next), colW) + (taken.length === 0 ? 0 : 0.035);
        if (taken.length > 0 && filled + cost > height * spec.dense.columns) break;
        taken.push(next);
        denseQueue.shift();
        filled += cost;
      }

      // 章が1つだけの面は、本文と同じ段割りの規則に任せる（項目が少なければ1段）。
      // 章を段へ配る規則をそのまま当てると、1章しか無い面で右段が丸ごと空く。
      if (taken.length === 1) {
        const only = taken[0];
        page.line(only.title, { x: margin.x, y: headTop }, { size: page.size('heading') });
        const bodyTop = headTop + afterHeading;
        const rest = page.columns(
          only.lines,
          { x: margin.x, y: bodyTop, w: 1 - margin.x * 2, h: 1 - bodyTop - margin.y },
          spec.dense.gap,
        );
        if (rest.length > 0)
          denseQueue.unshift({ title: `${only.title}（続き）`, lines: rest });
        continue;
      }

      const groups = distribute(
        taken,
        (item) => page.height(chunkOf(item), colW),
        spec.dense.columns,
      );

      let carry: FlowEntry[] = [];
      for (let column = 0; column < spec.dense.columns; column += 1) {
        const rect: Rect = {
          x: margin.x + column * (colW + spec.dense.gap),
          y: top,
          w: colW,
          h: height,
        };
        const entries = [
          ...carry,
          ...groups[column].flatMap((item, index) =>
            chunkOf(item).map((entry, position) =>
              position === 0 && (index > 0 || carry.length > 0)
                ? { ...entry, gapBefore: 0.035 }
                : entry,
            ),
          ),
        ];
        carry = page.flow(entries, rect);

        // 最終段から溢れた分は章ごとに組み直して次の面へ返す。
        if (column === spec.dense.columns - 1 && carry.length > 0) {
          const back: { title: string; lines: string[] }[] = [];
          for (const entry of carry) {
            if (entry.heading) {
              back.push({ title: entry.text, lines: [] });
              continue;
            }
            if (back.length === 0) {
              const drawn = entries.slice(0, entries.length - carry.length);
              const heading = [...drawn].reverse().find((item) => item.heading)?.text ?? '';
              back.push({ title: `${heading}（続き）`, lines: [] });
            }
            back[back.length - 1].lines.push(entry.text);
          }
          denseQueue.unshift(...back);
        }
      }
    }
  };

  for (const section of ir.sections) {
    if (section.id === 'cover') continue;

    const images = imageBlocks(section);
    const lines = textLines(section, chrome);
    /*
     * 枠が全て未登録の章は、画像の面として組まない（第8章 8-7）。
     * プレースホルダだけの帯が面の7割を占め、下が白く空く面になる。
     * 未登録の枠を出さない扱いはロゴ（供給元が空なら枠ごと出さない）と同じで、
     * 「枠はあるが中身が無い」ときだけ版面が変わるのは不統一だった。
     */
    const shown = images.filter((block) => block.assetId);
    const map = mapBlock(section);

    // 位置関係の図を持つ章は、図を主にした面で組む（競合分析）。
    if (map) {
      flushDense();
      await renderMap(section.title, map, lines, shown);
      continue;
    }
    if (shown.length > 0 && section.id === 'moodboard') {
      flushDense();
      await renderTiles(section.title, shown);
      continue;
    }
    if (shown.length > 0 && section.id === 'shots') {
      flushDense();
      await renderShots(section.title, shown, lines);
      continue;
    }
    if (shown.length > 0) {
      flushDense();
      await renderVisual(section.title, shown, lines);
      continue;
    }
    denseQueue.push({ title: section.title, lines });
  }
  flushDense();

  // 出力物にも警告を残す（第6章 6-4、第7章 7-8）。画面で確認しただけでは、
  // 手元に落ちた PDF がどの状態で出たのか後から分からない。
  // warn は「このまま出すと壊れている」、info は提出前に見ておく件数（第8章 8-7）。
  if (notes.length > 0 || checklist.length > 0) {
    const page = sheet();
    let top = margin.y;
    const write = (title: string, items: string[]): void => {
      if (items.length === 0) return;
      page.line(
        title,
        { x: margin.x, y: top + spec.type.heading * 1.2 },
        { size: page.size('heading') },
      );
      const rect: Rect = {
        x: margin.x,
        y: top + spec.type.heading * 1.2 + afterHeading,
        w: 1 - margin.x * 2,
        h: 1 - top - margin.y,
      };
      const entries = items.map((item) => ({
        text: `${chrome.bullet}${item}`,
        color: palette.muted,
      }));
      page.flow(entries, rect);
      top = rect.y + page.height(entries, rect.w) + 0.03;
    };
    write(chrome.notes, notes);
    write(chrome.checklist, checklist);
  }

  /**
   * 画像が主役の面。帯の高さは本文の実測から決める（本文が少ない面ほど画像が伸びる）。
   * 本文は2段に釣り合わせるので、面の右半分も下部も白いまま残らない。
   */
  async function renderVisual(
    title: string,
    blocks: ImageBlock[],
    lines: string[],
  ): Promise<void> {
    const page = sheet();
    const shown = blocks.slice(0, 3);
    const bodyW = 1 - margin.x * 2;

    // 本文を2段に割ったときの高さから帯を決める。上限・下限は版面定義に従う。
    const bodyH = page.columnHeight(lines, bodyW, spec.dense.gap);
    const band = clamp(
      1 - margin.y - bodyH - spec.type.heading - afterHeading - captionRatio - 0.02,
      spec.band.min,
      spec.band.max,
    );

    const cells = bandCells(shown.length, band, spec, format);
    for (let index = 0; index < shown.length; index += 1) {
      const cell = cells[index];
      const image = await imageFor(shown[index]);
      if (image) page.cover(cell, image, shown[index].focus);
      else page.placeholder(cell);
      // 画像は裁ち落としてよいが、読ませる要素は安全マージンの内側に入れる。
      // キャプションは枠に寄せつつ、面の端に近い枠では版面の内側へ寄せ直す。
      const capX = clamp(cell.x + 0.006, margin.x, 1 - margin.x);
      page.line(
        page.clip(caption(shown[index]), Math.min(cell.x + cell.w, 1 - margin.x) - capX),
        { x: capX, y: band + captionRatio * 0.72 },
        { color: palette.muted },
      );
    }

    const top = band + captionRatio + 0.02;
    page.line(
      title,
      { x: margin.x, y: top + spec.type.heading },
      { size: page.size('heading') },
    );

    const bodyTop = top + spec.type.heading + afterHeading;
    const rest = page.columns(
      lines,
      { x: margin.x, y: bodyTop, w: bodyW, h: 1 - bodyTop - margin.y },
      spec.dense.gap,
    );
    // 溢れた分は dense の流れへ送る（画像面を本文で押し広げない）。
    if (rest.length > 0) denseQueue.push({ title: `${title}（続き）`, lines: rest });
  }

  /**
   * ポジショニングマップの面（第8章 8-10）。
   * 競合分析は「どこが空いているか」を見る章なので、位置関係を図で示し、
   * 本文はその補助として右に置く。テキストだけの面にしない。
   */
  async function renderMap(
    title: string,
    map: MapBlock,
    lines: string[],
    blocks: ImageBlock[],
  ): Promise<void> {
    const page = sheet();
    page.line(title, { x: margin.x, y: headTop }, { size: page.size('heading') });

    const top = headTop + afterHeading;
    // 参照画像があれば面の下に並べる。図の面だからと落とすと、登録した画像が黙って消える。
    const strip = blocks.length > 0 ? 0.26 : 0;
    const bottom = 1 - margin.y - strip;
    // 図は左 54%。右は本文（測度は1段の上限に収まる）。
    const plot: Rect = {
      x: margin.x + 0.03,
      y: top + 0.04,
      w: 0.54 - margin.x - 0.06,
      h: bottom - top - 0.1,
    };

    // 軸（中央の十字）と、四隅の意味づけ。
    const midX = plot.x + plot.w / 2;
    const midY = plot.y + plot.h / 2;
    page.rule({ x: plot.x, y: midY }, { x: plot.x + plot.w, y: midY }, palette.matEdge);
    page.rule({ x: midX, y: plot.y }, { x: midX, y: plot.y + plot.h }, palette.matEdge);
    // 軸の名前は軸の端に置く（四隅に集めると隣の軸のラベルと重なる）。
    page.line(map.axes.x[0], { x: plot.x, y: midY - 0.012 }, { color: palette.muted });
    page.line(
      map.axes.x[1],
      { x: plot.x + plot.w - 0.05, y: midY - 0.012 },
      { color: palette.muted },
    );
    page.line(map.axes.y[0], { x: midX + 0.008, y: plot.y - 0.008 }, { color: palette.muted });
    page.line(
      map.axes.y[1],
      { x: midX + 0.008, y: plot.y + plot.h + 0.022 },
      { color: palette.muted },
    );

    for (const point of map.points) {
      const at = { x: plot.x + point.x * plot.w, y: plot.y + point.y * plot.h };
      page.dot(at, point.self ? 0.006 : 0.004, point.self ? palette.accent : palette.ink);
      page.line(
        point.self ? chrome.selfPoint(point.label) : point.label,
        { x: at.x + 0.01, y: at.y + 0.004 },
        { size: page.size('caption'), color: point.self ? palette.accent : palette.ink },
      );
    }

    const rest = page.columns(
      lines,
      { x: 0.58, y: top, w: 1 - 0.58 - margin.x, h: bottom - top },
      spec.dense.gap,
    );
    if (rest.length > 0) denseQueue.push({ title: `${title}（続き）`, lines: rest });

    if (blocks.length > 0) {
      const cells = bandCells(blocks.length, strip - 0.02, spec, format);
      for (let index = 0; index < blocks.length; index += 1) {
        await place(page, { ...cells[index], y: bottom + 0.02 }, blocks[index]);
      }
    }
  }

  /**
   * タイル面（ムードボード）。最終ページは残数に応じて列数を組み直すが、
   * 左端と列グリッドは面の中で一定に保つ（第8章 8-6）。
   */
  async function renderTiles(title: string, blocks: ImageBlock[]): Promise<void> {
    const options = tileOptions(spec, format);
    const area = tileArea(spec, format);
    const pad = matPadding(format);
    const perPage = options.cols * options.rows;
    // 枠寸法は章全体で1つ。面ごとに残数から出すと、同じ枠が面によって大きさを変える。
    const cell = cellSize(blocks.length, area, options);

    for (let start = 0; start < blocks.length; start += perPage) {
      const page = sheet();
      const onPage = Math.min(perPage, blocks.length - start);
      const cells = gridCells(onPage, area, cell, options);

      // 台紙はタイル群の実寸に合わせる（残数の少ない面で右側が大きく空かない）。
      // 台紙は見出しより先に置く（後から敷くと見出しに重なる）。
      const right = Math.max(...cells.map((rect) => rect.x + rect.w));
      const bottom = Math.max(...cells.map((rect) => rect.y + rect.h));
      page.fill(
        {
          x: area.x - pad.x,
          y: area.y - pad.y,
          w: right - area.x + pad.x * 2,
          h: bottom - area.y + pad.y * 2,
        },
        palette.mat,
      );
      page.line(title, { x: margin.x, y: headTop }, { size: page.size('heading') });

      for (let index = 0; index < onPage; index += 1) {
        await place(page, cells[index], blocks[start + index], { edge: true });
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
    // 絵コンテもタイル面と同じ格子の規則で並べる（6カットは3+3で欠けが出ない）。
    const options = shotOptions(spec, format);
    const area = shotArea(blocks.length, spec, format);
    const cell = cellSize(blocks.length, area, options);
    const bodyW = 1 - margin.x * 2;
    const onePage = options.cols * options.rows;
    let rest = lines;

    for (let start = 0; start < blocks.length; start += onePage) {
      const page = sheet();
      page.line(title, { x: margin.x, y: headTop }, { size: page.size('heading') });

      const onPage = Math.min(onePage, blocks.length - start);
      const cells = gridCells(onPage, area, cell, options);
      for (let index = 0; index < onPage; index += 1) {
        await place(page, cells[index], blocks[start + index]);
      }

      const bodyTop = Math.max(...cells.map((rect) => rect.y + rect.h)) + 0.02;
      rest = page.columns(
        rest,
        { x: margin.x, y: bodyTop, w: bodyW, h: 1 - bodyTop - margin.y },
        spec.dense.gap,
      );
    }

    if (rest.length > 0) denseQueue.push({ title: `${title}（続き）`, lines: rest });
  }

  return doc.save();
}
