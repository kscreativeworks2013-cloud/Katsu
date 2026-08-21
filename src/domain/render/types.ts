/*
 * レンダラ契約（第6章 6-5）。
 * レンダラは IR 以外を読まず、ネットワークを使わず、IR を書き換えない。
 */

import type { ExportFormat } from '../../data/types';
import type { ProposalIR } from '../ir';
import { bodyCapacity } from './layout';

export interface RenderedFile {
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
}

export interface RenderOptions {
  /** PDF のように字形を自前で持つ必要がある形式へ渡すフォント実体。 */
  fontBytes?: Uint8Array;
}

export interface Renderer {
  format: ExportFormat;
  /** 対応する IR のスキーマ版。 */
  irVersion: number;
  render: (ir: ProposalIR, options?: RenderOptions) => Promise<RenderedFile>;
}

export function assertIrVersion(renderer: Renderer, ir: ProposalIR): void {
  if (ir.irVersion !== renderer.irVersion) {
    throw new Error(
      `${renderer.format} レンダラは IR v${renderer.irVersion} 用です（渡された IR は v${ir.irVersion}）`,
    );
  }
}

/**
 * 出力ファイル名。ブランド名の空白は落とし、版が追えるよう revision を付ける。
 * 原寸で解決できなかった出力には -draft を付ける（第7章 7-9）。同じ版・同じ形式で
 * 中身の違うファイルが同名で並ぶと、提出時に取り違えるため。
 */
export function fileNameFor(ir: ProposalIR, extension: string, draft = false): string {
  const brand = ir.project.brand.replace(/\s+/g, '_');
  const suffix = draft ? '-draft' : '';
  return `${brand}_Proposal_${ir.lang.toUpperCase()}_${ir.revision}${suffix}.${extension}`;
}

/**
 * 原寸で解決できなかった出力か（第7章 7-9）。
 * 判定は IR の警告だけから行う。レンダラは IR 以外を読まない。
 */
export function isDraft(ir: ProposalIR): boolean {
  return ir.warnings.some(
    (warning) => warning.kind === 'missing-binary' || warning.kind === 'preview-only',
  );
}

/*
 * 提出前チェックの文（第9章 工程00-b-2）。
 *
 * これはレンダラが組み立てる文で、IR には載っていない。`ir.lang` によらず和文だと、
 * 英語版が「見出しだけ英語で中身が和文」になり、英語版として評価できない。
 * 個々の警告文（`warning.message`）は IR 側が和文で持っており、そちらは別問題。
 */
const SUMMARY = {
  ja: {
    dropped: (title: string, pool: number, shown: number, slot: string) =>
      `${title}は${pool}件中${shown}件のみ掲載されます（「${slot}」の枠）。`,
    unnamed: (count: number) =>
      `説明文が未設定の画像が${count}件あります（枠の下は出自だけになります）。`,
    missing: (count: number, breakdown: string) =>
      `画像未登録が${count}件あります（${breakdown}）。登録した分だけ差し替わります。`,
    unchosen: (count: number, breakdown: string) =>
      `面を左右する枠が未選択のままです：${count}件（${breakdown}）。供給元の並び順で機械的に入っているので、提出前に選び直してください。`,
    dropped_body: (title: string, count: number) =>
      `${title}に書いた本文${count}行は、この面の版面に載りません。`,
    breakdown: (title: string, count: number) => `${title}${count}`,
    stale: (titles: string[]) =>
      `上流の変更が反映されていない章が${titles.length}件あります（${titles.join('、')}）。`,
    defaultAxes: (x: string, y: string) =>
      `ポジショニングマップの軸は既定のままです（${x}／${y}）。本文で別の軸を述べている場合は食い違って読めます。`,
    join: '、',
    outsideSection: '章外',
  },
  en: {
    dropped: (title: string, pool: number, shown: number, slot: string) =>
      `${title}: only ${shown} of ${pool} items are shown (slot "${slot}").`,
    unnamed: (count: number) =>
      `${count} image(s) have no caption; only the source label will appear beneath them.`,
    missing: (count: number, breakdown: string) =>
      `${count} image slot(s) are empty (${breakdown}). Each will fill in as images are registered.`,
    unchosen: (count: number, breakdown: string) =>
      `${count} slot(s) that carry a page have not been chosen (${breakdown}). They are filled in source order — pick them before you send this out.`,
    dropped_body: (title: string, count: number) =>
      `${count} line(s) of body text written for ${title} do not fit this page's layout.`,
    breakdown: (title: string, count: number) => `${title} ${count}`,
    stale: (titles: string[]) =>
      `${titles.length} chapter(s) have not picked up upstream changes (${titles.join(', ')}).`,
    defaultAxes: (x: string, y: string) =>
      `The positioning map still uses the default axes (${x} / ${y}). If the body text names different ones, the page contradicts itself.`,
    join: ', ',
    outsideSection: 'unassigned',
  },
} as const;

/**
 * 出力物に載せる警告の要約（第6章 6-4）。
 * 同じ画像が複数のスロットに出ると同文が並ぶため、重複は畳む。
 */
export function warningSummary(ir: ProposalIR): string[] {
  const warn = ir.warnings.filter((warning) => warning.severity === 'warn');

  /*
   * stale は1行にまとめる（第9章 工程R-6）。
   *
   * 章ごとに1行ずつ並べると、本文を手で入れた直後は下流が一斉に stale になって
   * 面が列挙で埋まる。実測：8行並び、**148ppi の警告がその2行目に埋もれた**。
   * 個々に正しくても、読まれなければ警告として機能しない。
   */
  const stale = warn.filter((warning) => warning.kind === 'stale');
  const rest = [...new Set(warn.filter((w) => w.kind !== 'stale').map((w) => w.message))];

  if (stale.length === 0) return rest;

  const titles = new Map(ir.sections.map((section) => [section.id, section.title]));
  const named = [
    ...new Set(
      stale.map((warning) => titles.get(warning.sectionId ?? '') ?? warning.sectionId ?? ''),
    ),
  ].filter((title) => title !== '');

  // 重大度の高いものを先に置く。解像度不足は「このまま出すと壊れている」側で、
  // stale は「内容が古いかもしれない」側である。
  return [...rest, SUMMARY[ir.lang === 'en' ? 'en' : 'ja'].stale(named)];
}

/**
 * 提出前チェック（第6章 6-4、第8章 8-7）。
 *
 * info 級の警告は出力を壊さない。壊さないから warn にはしないが、
 * 「画像未登録が6件のまま出した」ことは提出前に見えていなければならない。
 * 個票は画面に出ているので、成果物には**件数**を残す（面を注意書きで埋めない）。
 */
export function checklistSummary(ir: ProposalIR): string[] {
  const say = SUMMARY[ir.lang] ?? SUMMARY.ja;
  const info = ir.warnings.filter((warning) => warning.severity === 'info');
  const titles = new Map(ir.sections.map((section) => [section.id, section.title]));

  /*
   * 載らなかった件数は IR が持つ枠の使われ方から作る（第8章 8-7）。
   * 警告として積む形だと、積み忘れた経路で「登録したのに出ない」が黙って通る。
   * 件数そのものを持たせておけば、差がある限り必ずここに出る。
   */
  const dropped = ir.slots
    .filter((slot) => slot.exhaustive && slot.pool > slot.shown)
    .map((slot) => say.dropped(slot.sectionTitle, slot.pool, slot.shown, slot.slotLabel));
  const unnamed = ir.slots.reduce((sum, slot) => sum + slot.unnamed, 0);
  const naming = unnamed > 0 ? [say.unnamed(unnamed)] : [];

  /*
   * 面を左右する枠が選ばれないまま出ていないか（第9章 工程R-1）。
   * 既定は供給元の並び順なので、放っておくと「たまたま先頭にあった写真」が表紙になる。
   * 実測：本文が暗部と半逆光を述べている案件で、表紙にハイキーの着物が入った。
   */
  // 選ぶ余地があった枠だけを数える（第9章 工程N-7）。
  // 供給元が枠数以下なら選びようがないので、未選択と呼ばない（ロゴがこれ）。
  const unchosen = ir.slots.filter(
    (slot) => slot.principal && !slot.chosen && slot.shown > 0 && slot.pool > slot.shown,
  );
  const choosing =
    unchosen.length > 0
      ? [
          say.unchosen(
            unchosen.length,
            unchosen.map((slot) => `${slot.sectionTitle}／${slot.slotLabel}`).join(say.join),
          ),
        ]
      : [];

  /*
   * 書いたのに載らない本文（第9章 工程R-3）。
   * 版面が受け取る行数は `bodyCapacity` が持ち、レンダラもこれを見て切る。
   * ここで別の数え方をすると「知らせたのに載っていた／載らなかったのに黙っていた」が起きる。
   */
  const droppedBody = ir.sections.flatMap((section) => {
    const lines = section.blocks.reduce(
      (sum, block) =>
        sum + (block.type === 'paragraph' ? 1 : block.type === 'list' ? block.items.length : 0),
      0,
    );
    const hasImages = section.blocks.some(
      (block) => block.type === 'image' && block.assetId !== undefined,
    );
    const over = lines - bodyCapacity(section.id, hasImages);
    return over > 0 ? [say.dropped_body(section.title, over)] : [];
  });

  /*
   * 軸が既定のまま（第9章 工程R-8）。
   * 本文は手で書けるのに軸は生成物なので、同じ面の中で食い違う。
   * 編集の導線はスキーマ v4 が要るため、いまは既定であることを言うに留める。
   */
  const defaultAxes = ir.sections
    .flatMap((section) => section.blocks)
    .filter((block) => block.type === 'map' && block.axesAreDefault === true)
    .map((block) => {
      const map = block as Extract<typeof block, { type: 'map' }>;
      return say.defaultAxes(map.axes.x.join('⇄'), map.axes.y.join('⇄'));
    });

  const missing = info.filter((warning) => warning.kind === 'missing-image');
  // 内訳は枠の名前でまとめる。章名でまとめると、画像の入っている面（表紙）に
  // 未登録があるように読めてしまう（実体はロゴ枠）。
  const perSection = new Map<string, number>();
  for (const warning of missing) {
    const key =
      warning.slot ??
      titles.get(warning.sectionId ?? '') ??
      warning.sectionId ??
      say.outsideSection;
    perSection.set(key, (perSection.get(key) ?? 0) + 1);
  }

  const lines = [
    ...new Set(info.filter((w) => w.kind !== 'missing-image').map((w) => w.message)),
    ...droppedBody,
    ...defaultAxes,
    ...choosing,
    ...dropped,
    ...naming,
  ];
  if (missing.length === 0) return lines;

  const breakdown = [...perSection.entries()]
    .map(([title, count]) => say.breakdown(title, count))
    .join(say.join);
  return [say.missing(missing.length, breakdown), ...lines];
}
