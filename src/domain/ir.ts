/*
 * Proposal IR（第6章）。
 * 案件・ワークスペース・テンプレート・アセットから決定的に組み立てる中間表現で、
 * ここでは AI を一切呼ばない。すべての出力形式はこの IR だけを入力にする。
 */

import type {
  Asset,
  AssetOrigin,
  FieldOrigin,
  PortfolioWork,
  Project,
  Provenance,
  StepId,
  VariantKind,
  Workspace,
} from '../data/types';
import { effectivePpi, pickVariant, requiredPixels, resolveAsset } from './assets';
import { PROPOSAL_TEMPLATE, resolveSlot } from './proposal';
import { metaFor } from './provenance';

export const IR_VERSION = 1;

export type Lang = 'ja' | 'en';

/** IR の image ブロックが指す実体（第7章 7-8）。実体そのものは解決フェーズで入る。 */
export interface IRImageVariant {
  kind: VariantKind;
  key: string;
  width: number;
  height: number;
}

export type IRBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'list'; items: string[] }
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
  message: string;
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

function imageBlocks(sectionId: string, input: BuildIRInput, warnings: IRWarning[]): IRBlock[] {
  const section = PROPOSAL_TEMPLATE.find((item) => item.id === sectionId);
  if (!section) return [];

  const blocks: IRBlock[] = [];
  for (const slot of section.imageSlots) {
    const images = resolveSlot(slot, input.workspace, input.portfolio, input.assets);
    if (images.length === 0) {
      warnings.push({
        kind: 'missing-image',
        severity: 'info',
        sectionId,
        message: `${section.ja}の「${slot.label}」に画像が登録されていません。`,
      });
      continue;
    }

    for (const image of images) {
      const asset = image.asset ?? resolveAsset(input.assets, undefined);
      const isExternal = asset?.origin === 'external';
      const original = pickVariant(asset, 'output');

      // 取り込み済み（実体を持つ）外部画像は埋め込めるので警告しない（第6章 6-8）。
      if (isExternal && asset?.variants.length === 0) {
        warnings.push({
          kind: 'external-image',
          severity: 'info',
          sectionId,
          message: `${image.caption} は取り込めていないため、PDF・PowerPoint には含まれません。`,
        });
      }

      // 原寸が無い＝出力に使えない。preview があってもそれは画面用（第7章 7-6）。
      if (asset && !original && asset.variants.length > 0) {
        warnings.push({
          kind: 'preview-only',
          severity: 'warn',
          sectionId,
          message: `${image.caption} は表示用の縮小版しかないため、出力では画像が欠けます。原寸を登録し直してください。`,
        });
      }

      // 原寸はあるが、このスロットの配置幅に対して足りない（第7章 7-2／7-3）。
      const needed = requiredPixels(slot.printWidthMm);
      if (original && original.width > 0 && original.width < needed) {
        warnings.push({
          kind: 'low-resolution',
          severity: 'warn',
          sectionId,
          message: `${image.caption}（${slot.label}）は印刷解像度が不足しています：${effectivePpi(original.width, slot.printWidthMm)}ppi（配置幅${slot.printWidthMm}mm には ${needed}px 必要、実際は ${original.width}px）。`,
        });
      }

      blocks.push({
        type: 'image',
        caption: image.caption,
        slotId: slot.id,
        slotLabel: slot.label,
        printWidthMm: slot.printWidthMm,
        assetId: asset?.id,
        assetOrigin: asset?.origin,
        variant: original && {
          kind: original.kind,
          key: original.key,
          width: original.width,
          height: original.height,
        },
        href: isExternal ? asset?.source : undefined,
        fallback: image.fallback,
      });
    }
  }
  return blocks;
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

  for (const template of PROPOSAL_TEMPLATE) {
    const body = input.workspace.proposalBody?.[template.id];
    const images = imageBlocks(template.id, input, warnings);
    const lines = body ? (input.lang === 'ja' ? body.ja : body.en) : [];
    const blocks = [...toBlocks(lines), ...images];

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
