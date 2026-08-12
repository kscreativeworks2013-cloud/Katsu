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
  Workspace,
} from '../data/types';
import { resolveAsset } from './assets';
import { PROPOSAL_TEMPLATE, resolveSlot } from './proposal';
import { metaFor } from './provenance';

export const IR_VERSION = 1;

export type Lang = 'ja' | 'en';

export type IRBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'list'; items: string[] }
  | {
      type: 'image';
      caption: string;
      slotLabel: string;
      assetId?: string;
      assetOrigin?: AssetOrigin;
      /** 埋め込み可能な実体（data URI）。外部URL参照のときは undefined。 */
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
  'stale' | 'acknowledged' | 'missing-section' | 'missing-image' | 'external-image';

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
      // 取り込み済み（実体を持つ）外部画像は埋め込めるので警告しない（第6章 6-8）。
      if (isExternal && !asset?.thumbnail) {
        warnings.push({
          kind: 'external-image',
          severity: 'info',
          sectionId,
          message: `${image.caption} は取り込めていないため、PDF・PowerPoint には含まれません。`,
        });
      }
      blocks.push({
        type: 'image',
        caption: image.caption,
        slotLabel: slot.label,
        assetId: asset?.id,
        assetOrigin: asset?.origin,
        // 埋め込めるのは data URI として保持している実体だけ（第6章 6-6）。
        data: asset?.thumbnail,
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

/**
 * 内容から決定的に算出する版ID（第6章 6-3）。
 * builtAt は含めないので、同じ内容なら何度組み立てても同じ revision になる。
 */
export function computeRevision(ir: Omit<ProposalIR, 'revision' | 'builtAt'>): string {
  const json = JSON.stringify(ir);
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
