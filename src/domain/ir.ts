/*
 * Proposal IR（第6章）。
 * 案件・ワークスペース・テンプレート・アセットから決定的に組み立てる中間表現で、
 * ここでは AI を一切呼ばない。すべての出力形式はこの IR だけを入力にする。
 */

import type {
  Asset,
  AssetOrigin,
  CropFocus,
  FieldOrigin,
  PortfolioWork,
  Project,
  Provenance,
  StepId,
  VariantKind,
  Workspace,
} from '../data/types';
import { effectivePpi, pickVariant, requiredPixels, resolveAsset } from './assets';
import { slotWidthMm } from './render/layout';
import { deriveTheme, type RenderTheme } from './render/theme';
import {
  PROPOSAL_TEMPLATE,
  resolveSlot,
  slotPoolSize,
  slotIsPrincipal,
  claimedItemIds,
} from './proposal';
import { metaFor } from './provenance';

export const IR_VERSION = 1;

export type Lang = 'ja' | 'en';

/** IR の image ブロックが指す実体（第7章 7-8）。実体そのものは解決フェーズで入る。 */
export interface IRImageVariant {
  kind: VariantKind;
  key: string;
  width: number;
  height: number;
  /**
   * 実体のバイト数。重複検知の指紋に使う（第9章 工程00-c）。
   * 同じ写真をムードボードと実績に別々に登録すると**別のアセットID**になるため、
   * ID の一致では気づけない。寸法とバイト数が完全に一致する2枚は同じ画像と見なす。
   */
  bytes: number;
}

export type IRBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'list'; items: string[] }
  | {
      /**
       * 位置関係の図（第8章 8-10）。競合分析のポジショニングマップ。
       * 座標は 0..1 で、意味づけ（軸の名前）は IR が持つ。レンダラは描き方だけを決める。
       */
      type: 'map';
      axes: { x: [string, string]; y: [string, string] };
      /**
       * 軸の名前が道具の既定のままか（第9章 工程R-8）。
       * 本文は手で書けるのに軸は生成物なので、手を入れるほど同じ面の中で食い違う。
       * 編集する導線を持つには `Workspace` に軸を持たせる必要があり、それは
       * スキーマ v4 になる。通しの凍結中は**既定のままであることを知らせる**に留める。
       */
      axesAreDefault?: boolean;
      points: { label: string; x: number; y: number; self?: boolean }[];
    }
  | {
      type: 'image';
      caption: string;
      slotId: string;
      slotLabel: string;
      /** このスロットの想定配置幅（mm）。解像度の判定根拠として出力側にも残す。 */
      printWidthMm: number;
      assetId?: string;
      assetOrigin?: AssetOrigin;
      /** 出力に使う実体の記述子。原寸が無ければ undefined。 */
      variant?: IRImageVariant;
      /**
       * 埋め込み可能な実体（data URI）。構築時は常に undefined で、
       * resolveProposalAssets が埋める。revision には含めない（第7章 7-9）。
       */
      data?: string;
      /** 外部URL参照のときの参照先。 */
      href?: string;
      /** アセットが無いときのプレースホルダ色。 */
      fallback?: { from: string; to: string };
      /** 切り出し位置の指定（第8章 8-7）。無指定ならレンダラの既定で切る。 */
      focus?: CropFocus;
    };

/** 章の出所。どの Run が書いた値から作られたかを後から言えるようにする（第6章 6-3）。 */
export interface IRSectionSource {
  stepId: StepId;
  fields: string[];
  runIds: string[];
  origins: FieldOrigin[];
  edited: boolean;
  stale: boolean;
  staleCause?: StepId;
  staleAcknowledgedAt?: string;
}

export interface IRSection {
  id: string;
  title: string;
  blocks: IRBlock[];
  source: IRSectionSource;
}

export type IRWarningKind =
  | 'stale'
  | 'acknowledged'
  | 'missing-section'
  | 'missing-image'
  | 'duplicate-image'
  | 'external-image'
  | 'low-resolution'
  | 'preview-only'
  | 'missing-binary';

/**
 * 解決フェーズで足される警告（第7章 7-11）。
 * 端末の保存状態に由来するもので、提案内容ではないため revision に含めない。
 */
const RESOLVE_WARNING_KINDS: IRWarningKind[] = ['missing-binary'];

export interface IRWarning {
  kind: IRWarningKind;
  severity: 'warn' | 'info';
  /** 対象の章ID。全体に関わる場合は undefined。 */
  sectionId?: string;
  /**
   * 対象のスロット名（章の中のどの枠か）。件数をまとめるときの見出しに使う。
   * 章名だけだと「表紙1件」のように、画像の入っている面を疑わせる要約になる。
   */
  slot?: string;
  message: string;
}

/**
 * 枠の使われ方（第8章 8-7）。供給元に何件あり、実際に何件載ったかを IR が持つ。
 *
 * 警告として「超過しています」を積むだけだと、警告を積み忘れた経路（あるいは IR に
 * 渡す前に間引く経路）で、載らなかった事実が黙って消える。件数そのものを IR に
 * 持たせ、提出前チェックはこの差分から作る。
 */
export interface IRSlotUsage {
  slotId: string;
  slotLabel: string;
  sectionId: string;
  sectionTitle: string;
  /** 供給元にある項目数（IR が受け取った時点）。 */
  pool: number;
  /** 実際に枠へ載った数。 */
  shown: number;
  /**
   * 供給元を全点見せる枠か。表紙のように1点を選ぶ枠は、余りが出るのが正常なので
   * 差分を「載らなかった」とは数えない（数えると正常な構成で常時警告が出る）。
   */
  exhaustive: boolean;
  /** 説明文が付いていない枠の数（キャプション未設定）。 */
  unnamed: number;
  /**
   * 道具が勝手に絞る枠か（第9章 工程R-1・N-7）。
   * 供給元の一部だけが載り、どれが載るかを道具が決めている枠。判定は `slotIsPrincipal`。
   */
  principal: boolean;
  /**
   * 利用者が中身を選んだか。false なら供給元から機械的に取った既定のまま。
   * 主要枠でこれが false のときは、提出前チェックに件数を出す。
   */
  chosen: boolean;
}

export interface ProposalIR {
  irVersion: number;
  revision: string;
  builtAt: string;
  lang: Lang;
  project: {
    id: string;
    name: string;
    brand: string;
    client: string;
    proposalDate: string;
    dueDate: string;
  };
  sections: IRSection[];
  warnings: IRWarning[];
  /** 枠ごとの供給元件数と掲載件数（第8章 8-7）。提出前チェックの根拠。 */
  slots: IRSlotUsage[];
  /** 版面色。ブランドのパレットから導出する（第8章 8-7）。出力形式によらず同じ値を使う。 */
  theme: RenderTheme;
  sources: {
    /** IR 全体が参照した生成ライン。 */
    runIds: string[];
    /** 手動編集を含む章があるか。 */
    hasEdited: boolean;
    /** AI生成画像を含むか（出力物への明記に使う）。 */
    hasAiImage: boolean;
  };
}

export interface BuildIRInput {
  project: Project;
  workspace: Workspace;
  provenance: Provenance;
  portfolio: PortfolioWork[];
  assets: Record<string, Asset>;
  lang: Lang;
  builtAt: Date;
}

/** 章IDから、その章の本文を出力しているステップ。警告と出所の紐付けに使う。 */
const SECTION_STEP: Record<string, StepId> = {
  cover: 'proposal',
  brand: 'brand',
  competitors: 'competitors',
  concept: 'concepts',
  moodboard: 'moodboard',
  shots: 'shots',
  lighting: 'proposal',
  works: 'proposal',
  staff: 'proposal',
  schedule: 'proposal',
  budget: 'proposal',
  risk: 'proposal',
};

/** 本文の行を段落と箇条書きに振り分ける。「・」で始まる連続行は1つのリストにまとめる。 */
function toBlocks(lines: string[]): IRBlock[] {
  const blocks: IRBlock[] = [];
  let bullets: string[] = [];

  const flush = () => {
    if (bullets.length > 0) {
      blocks.push({ type: 'list', items: bullets });
      bullets = [];
    }
  };

  for (const line of lines) {
    const text = line.trim();
    if (text === '') continue;
    if (text.startsWith('・')) {
      bullets.push(text.slice(1));
      continue;
    }
    flush();
    blocks.push({ type: 'paragraph', text });
  }
  flush();
  return blocks;
}

/**
 * 競合のポジショニングマップ（第8章 8-10）。
 *
 * 自社の位置はデータに無いので、**競合から最も遠い点**を提案位置として置く。
 * 「空いている場所」を示すのが差別化の議論の出発点であり、根拠のある置き方はこれしかない。
 */
function positioningMap(input: BuildIRInput): IRBlock | undefined {
  const competitors = input.workspace.competitors;
  if (competitors.length === 0) return undefined;

  let best = { x: 0.5, y: 0.5, distance: -1 };
  for (let ix = 1; ix <= 9; ix += 1) {
    for (let iy = 1; iy <= 9; iy += 1) {
      const x = ix / 10;
      const y = iy / 10;
      const distance = Math.min(
        ...competitors.map((item) => Math.hypot(item.x - x, item.y - y)),
      );
      if (distance > best.distance) best = { x, y, distance };
    }
  }

  return {
    type: 'map',
    axes: { x: ['クラシック', 'モダン'], y: ['ミニマル', 'ドラマティック'] },
    // 編集する導線がまだ無いので、常に既定である（工程R-8）。
    axesAreDefault: true,
    points: [
      ...competitors.map((item) => ({ label: item.name, x: item.x, y: item.y })),
      { label: input.project.brand, x: best.x, y: best.y, self: true },
    ],
  };
}

function imageBlocks(
  sectionId: string,
  input: BuildIRInput,
  warnings: IRWarning[],
  usage: IRSlotUsage[],
): IRBlock[] {
  const section = PROPOSAL_TEMPLATE.find((item) => item.id === sectionId);
  if (!section) return [];

  const blocks: IRBlock[] = [];
  for (const slot of section.imageSlots) {
    // 枠名は提出前チェックの文にそのまま入る。英語版で日英が混ざらないよう引き分ける
    // （第9章 工程00-b-2）。警告文そのものは和文で組むので slot.label を使う。
    const slotName = input.lang === 'ja' ? slot.label : slot.labelEn;
    const images = resolveSlot(
      slot,
      input.workspace,
      input.portfolio,
      input.assets,
      claimedItemIds(input.workspace),
    );
    if (images.length === 0) {
      warnings.push({
        kind: 'missing-image',
        severity: 'info',
        sectionId,
        slot: slotName,
        message: `${section.ja}の「${slot.label}」に画像が登録されていません。`,
      });
      continue;
    }

    // 供給元の件数と、実際に載った件数を残す。差分の言い方は出力側が決める。
    usage.push({
      slotId: slot.id,
      slotLabel: slotName,
      sectionId,
      sectionTitle: input.lang === 'ja' ? section.ja : section.en,
      pool: slotPoolSize(slot, input.workspace, input.portfolio),
      shown: images.length,
      exhaustive: slot.exhaustive === true,
      principal: slotIsPrincipal(slot),
      // 選択があるかどうかだけを見る。中身の妥当性は利用者にしか判断できない。
      chosen: (input.workspace.picks?.[slot.id]?.length ?? 0) > 0,
      // ロゴはキャプションを描かない枠なので、説明文の有無を数えない。
      unnamed:
        slot.source === 'logo'
          ? 0
          : images.filter((image) => image.caption.trim() === '').length,
    });

    for (const image of images) {
      const asset = image.asset ?? resolveAsset(input.assets, undefined);
      const isExternal = asset?.origin === 'external';
      const original = pickVariant(asset, 'output');

      // 枠は解決できたが中身が無い（プレースホルダで出る）。出力は壊れないので info だが、
      // 何枚が未登録のまま出たかは提出前に見えている必要がある（第8章 8-7）。
      if (!asset) {
        warnings.push({
          kind: 'missing-image',
          severity: 'info',
          sectionId,
          slot: slotName,
          message: `${section.ja}の「${image.caption}」に画像が登録されていません。`,
        });
      }

      // 取り込み済み（実体を持つ）外部画像は埋め込めるので警告しない（第6章 6-8）。
      if (isExternal && asset?.variants.length === 0) {
        warnings.push({
          kind: 'external-image',
          severity: 'info',
          sectionId,
          slot: slotName,
          message: `${image.caption} は取り込めていないため、PDF・PowerPoint には含まれません。`,
        });
      }

      // 原寸が無い＝出力に使えない。preview があってもそれは画面用（第7章 7-6）。
      if (asset && !original && asset.variants.length > 0) {
        warnings.push({
          kind: 'preview-only',
          severity: 'warn',
          sectionId,
          slot: slotName,
          message: `${image.caption} は表示用の縮小版しかないため、出力では画像が欠けます。原寸を登録し直してください。`,
        });
      }

      // 原寸はあるが、このスロットの配置幅に対して足りない（第7章 7-2／7-3）。
      // 配置幅は版面定義から導く（第8章 8-4）。定数を手で並べると版面と判定がずれる。
      // 配置幅はその面の実際の面付けから決まる。枠の数が変われば幅も変わる（第8章 8-4）。
      const printWidthMm = slotWidthMm(slot.id, images.length);
      const needed = requiredPixels(printWidthMm);
      if (original && original.width > 0 && original.width < needed) {
        // どの面の話かは章名で言う。スロット名（キービジュアル）だけだと、
        // 同じ名前の枠を持つ表紙を疑わせる。
        warnings.push({
          kind: 'low-resolution',
          severity: 'warn',
          sectionId,
          slot: slotName,
          message: `${image.caption}（${section.ja}）は印刷解像度が不足しています：${effectivePpi(original.width, printWidthMm)}ppi（配置幅${printWidthMm}mm には ${needed}px 必要、実際は ${original.width}px）。`,
        });
      }

      blocks.push({
        type: 'image',
        caption: image.caption,
        slotId: slot.id,
        slotLabel: slotName,
        printWidthMm,
        assetId: asset?.id,
        assetOrigin: asset?.origin,
        variant: original && {
          kind: original.kind,
          key: original.key,
          width: original.width,
          height: original.height,
          bytes: original.bytes,
        },
        href: isExternal ? asset?.source : undefined,
        fallback: image.fallback,
        focus: image.focus,
      });
    }
  }
  return blocks;
}

/**
 * 同じ1枚が2度出てはいけない枠（第8章 8-7）。
 *
 * ・表紙・ブランド分析・撮影コンセプト：提案の顔になる面。同じ画像が並ぶと手抜きに見える。
 * ・ショットリスト：カットごとに別の絵であることが枠の前提。同じ絵が2カットに出ると、
 *   併記した仕様（レンズ・構図）と絵が食い違う。**同じ枠の中での重複も数える。**
 *
 * **ムードボードだけは対象外。** ムードボードは素材の一覧であり、表紙やコンセプトに
 * 使った1枚がそこにも出るのは重複ではなく参照元の提示である。これを数えると
 * 正常な構成で常時警告が出て、本当の重複が埋もれる。
 */
/*
 * 重複検知の対象（第8章 8-7、第9章 工程00-c）。
 *
 * 同じ素材が並ぶと目につく枠。ここに2度出たら知らせる。
 * ムードボードは**素材の一覧そのもの**なので対象に入れない——表紙やコンセプトに
 * 選んだ1枚がムードボードにも並ぶのは、参照元を示しているだけで重複ではない。
 */
const PROMINENT_SLOTS = [
  'cover-key',
  'brand-mood',
  'concept-key',
  'shot-frames',
  // 実績を含める（第9章 工程00-c）。実績は「自分の仕事」であって参照元ではないので、
  // ムードボードと同じ写真が出るなら、参考画像を自作として見せていることになる。
  'works-grid',
  // 競合も含める（第9章 工程N-7）。同じ写真が2社を代表しているなら、それは誤りである。
  'competitor-refs',
];
/*
 * `lighting-refs` は意図的に外す。供給元がショットリストと同じで offset 違いなので、
 * 絵コンテと重なるのが**設計**である（第8章 8-10）。ここを対象に入れると常時発火する。
 */

/*
 * ムードボードの枠（第9章 工程00-c）。
 *
 * 対象に入れないのは「素材の一覧そのものであり、選んだ1枚がそこにも並ぶのは
 * 参照元の提示だから」である。この理屈が成り立つのは**ムードボードから引いている枠**
 * （表紙・ブランド分析・撮影コンセプト）に対してだけで、実績（供給元はポートフォリオ）や
 * ショットリスト（供給元は絵コンテ）には成り立たない。
 *
 * その線引きは枠ごとの列挙ではなく**供給元の比較**で行う（下の2つ目の見方）。
 * 列挙で持つと、枠が増えたときに片方だけ更新される。
 */
const MOODBOARD_SLOT = 'mood-tiles';

/** 枠の供給元。重複が「参照元の提示」で説明できるかの判定に使う。 */
const SLOT_SOURCE = new Map(
  PROPOSAL_TEMPLATE.flatMap((section) =>
    section.imageSlots.map((slot) => [slot.id, slot.source] as const),
  ),
);

interface Place {
  where: string;
  slotId: string;
  assetId: string;
  /** 実体の指紋（寸法とバイト数）。未解決なら undefined。 */
  print?: string;
}

/** 画像が出た場所を集める。ムードボードも含めて集め、数えるかどうかは後で決める。 */
function imagePlaces(sections: IRSection[]): Place[] {
  const places: Place[] = [];
  for (const section of sections) {
    for (const block of section.blocks) {
      if (block.type !== 'image' || !block.assetId) continue;
      if (!PROMINENT_SLOTS.includes(block.slotId) && block.slotId !== MOODBOARD_SLOT) continue;
      places.push({
        // 「どこに出たか」は章名とキャプションで言う（スロットIDは読み手の語彙ではない）。
        where: `${section.title}${block.caption ? `／${block.caption}` : ''}`,
        slotId: block.slotId,
        assetId: block.assetId,
        print: block.variant
          ? `${block.variant.width}x${block.variant.height}:${block.variant.bytes}`
          : undefined,
      });
    }
  }
  return places;
}

function groupBy<T>(items: T[], key: (item: T) => string | undefined): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const id = key(item);
    if (id === undefined) continue;
    groups.set(id, [...(groups.get(id) ?? []), item]);
  }
  return groups;
}

function duplicateMessage(places: Place[]): IRWarning {
  const where = places.map((place) => place.where);
  return {
    kind: 'duplicate-image',
    severity: 'info',
    message: `同じ画像が${where.length}か所に使われています：${where.join('、')}。`,
  };
}

/*
 * 同じ画像が目立つ枠に並んでいないか（第8章 8-7、第9章 工程00-c）。
 *
 * 2つの見方で拾う。
 *
 * 1. **同じアセット**が複数の枠に出ている。ムードボードは数えない（参照元の提示）。
 * 2. **別のアセットだが中身が同じ**ものが、供給元の違う枠に出ている。同じ写真を
 *    ムードボードと実績に別々に登録するとアセットIDは別になるので、1では気づけない
 *    （実測：`06-mood-ring.jpg` と `12-work-ring.jpg` は SHA-256 が一致するが別ID）。
 *    供給元が同じなら中身の一致は 1 が拾うので、ここは供給元をまたぐ場合に限る。
 *    そうしないと、寸法とバイト数がたまたま揃った別々の写真で誤検知する。
 */
function duplicateWarnings(sections: IRSection[]): IRWarning[] {
  const places = imagePlaces(sections);
  const warnings: IRWarning[] = [];
  const reported = new Set<string>();

  for (const [assetId, found] of groupBy(places, (place) => place.assetId)) {
    const counted = found.filter((place) => PROMINENT_SLOTS.includes(place.slotId));
    if (counted.length < 2) continue;
    warnings.push(duplicateMessage(counted));
    reported.add(assetId);
  }

  for (const found of groupBy(places, (place) => place.print).values()) {
    const sources = new Set(found.map((place) => SLOT_SOURCE.get(place.slotId)));
    const assetIds = new Set(found.map((place) => place.assetId));
    // 供給元をまたぎ、かつ別々のアセットとして登録されているものだけ。
    if (sources.size < 2 || assetIds.size < 2) continue;
    if ([...assetIds].some((id) => reported.has(id))) continue;
    warnings.push(duplicateMessage(found));
  }

  return warnings;
}

function sourceFor(sectionId: string, input: BuildIRInput): IRSectionSource {
  const stepId = SECTION_STEP[sectionId] ?? 'proposal';
  const record = input.project.steps[stepId];
  const fields = [`proposal.body.${sectionId}`];
  const metas = fields.map((path) => metaFor(input.provenance, path));

  return {
    stepId,
    fields,
    runIds: [...new Set(metas.map((meta) => meta.runId).filter((id): id is string => !!id))],
    origins: metas.map((meta) => meta.origin),
    edited: metas.some((meta) => meta.origin === 'edited'),
    stale: record.stale,
    staleCause: record.staleCause,
    staleAcknowledgedAt: record.staleAcknowledgedAt,
  };
}

/** revision の入力。組み立て途中の IR も、解決後の IR も渡せる。 */
type RevisionInput = Omit<ProposalIR, 'revision' | 'builtAt'> & Partial<ProposalIR>;

/**
 * revision の算出対象から、解決状態を取り除く（第7章 7-9）。
 * 埋め込んだ実体（data）と、解決フェーズが足した警告は「提案内容」ではない。
 * これを除いておくことで、解決の前後で revision が変わらない。
 */
function forRevision(ir: RevisionInput) {
  // 組み立て済みの IR をそのまま渡せるように、版と構築時刻はここで落とす。
  const content = { ...ir };
  delete content.revision;
  delete content.builtAt;
  return {
    ...content,
    sections: ir.sections.map((section) => ({
      ...section,
      blocks: section.blocks.map((block) =>
        block.type === 'image' && block.data ? { ...block, data: undefined } : block,
      ),
    })),
    warnings: ir.warnings.filter((warning) => !RESOLVE_WARNING_KINDS.includes(warning.kind)),
  };
}

/**
 * 内容から決定的に算出する版ID（第6章 6-3）。
 * builtAt と解決状態は含めないので、同じ内容なら何度組み立てても同じ revision になる。
 */
export function computeRevision(ir: RevisionInput): string {
  const json = JSON.stringify(forRevision(ir));
  let hash = 0x811c9dc5;
  for (let index = 0; index < json.length; index += 1) {
    hash ^= json.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/** IR を組み立てる。AI は呼ばない（第6章 6-1）。 */
export function buildProposalIR(input: BuildIRInput): ProposalIR {
  const warnings: IRWarning[] = [];
  const sections: IRSection[] = [];
  const slots: IRSlotUsage[] = [];

  for (const template of PROPOSAL_TEMPLATE) {
    const body = input.workspace.proposalBody?.[template.id];
    const images = imageBlocks(template.id, input, warnings, slots);
    const lines = body ? (input.lang === 'ja' ? body.ja : body.en) : [];
    const map = template.id === 'competitors' ? positioningMap(input) : undefined;
    const blocks = [...toBlocks(lines), ...(map ? [map] : []), ...images];

    if (!body) {
      warnings.push({
        kind: 'missing-section',
        severity: 'warn',
        sectionId: template.id,
        message: `${template.ja}が未生成です。`,
      });
    }
    if (blocks.length === 0) continue;

    const source = sourceFor(template.id, input);
    if (source.stale) {
      warnings.push({
        kind: 'stale',
        severity: 'warn',
        sectionId: template.id,
        message: `${template.ja}は上流の変更が反映されていません。`,
      });
    } else if (source.staleAcknowledgedAt) {
      warnings.push({
        kind: 'acknowledged',
        severity: 'info',
        sectionId: template.id,
        message: `${template.ja}は「確認済み（再生成不要）」として据え置かれています。`,
      });
    }

    sections.push({
      id: template.id,
      title: input.lang === 'ja' ? template.ja : template.en,
      blocks,
      source,
    });
  }

  warnings.push(...duplicateWarnings(sections));

  const runIds = [...new Set(sections.flatMap((section) => section.source.runIds))];
  const withoutRevision = {
    irVersion: IR_VERSION,
    lang: input.lang,
    project: {
      id: input.project.id,
      name: input.project.name,
      brand: input.project.brand,
      client: input.project.client,
      proposalDate: input.project.proposalDate,
      dueDate: input.project.dueDate,
    },
    sections,
    warnings,
    slots,
    theme: deriveTheme(input.workspace.brand?.palette),
    sources: {
      runIds,
      hasEdited: sections.some((section) => section.source.edited),
      hasAiImage: sections.some((section) =>
        section.blocks.some((block) => block.type === 'image' && block.assetOrigin === 'ai'),
      ),
    },
  };

  return {
    ...withoutRevision,
    revision: computeRevision(withoutRevision),
    builtAt: input.builtAt.toISOString(),
  };
}

/** 出力前に人の判断が要る警告だけを取り出す。 */
export function blockingWarnings(ir: ProposalIR): IRWarning[] {
  return ir.warnings.filter((warning) => warning.severity === 'warn');
}
