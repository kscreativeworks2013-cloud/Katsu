/*
 * 提案書の章本文の組み立て（第5章 5-2）。
 * 日本語と英語を同一の構成データから導出し、言語別に別の構成を持たない。
 * 決定的に組み立てるため、テストダブル（mockEngine）の中身としてそのまま使える。
 */

import { formatDate, formatYen } from '../lib/projects';
import { PROPOSAL_TEMPLATE } from '../domain/proposal';
import { adoptedConcept } from '../domain/steps';
import type { PortfolioWork, Project, ProposalBody, Settings, Workspace } from './types';

/** 見積もりは設定画面の単価から組み立てる。 */
export function estimate(project: Project, workspace: Workspace, settings: Settings): number {
  const { rates } = settings;
  return (
    rates.dayRate * project.production.shootDays +
    rates.gear +
    rates.studio * project.production.shootDays +
    rates.retouch * Math.max(workspace.shots.length, 1)
  );
}

function bodyFor(
  id: string,
  project: Project,
  workspace: Workspace,
  portfolio: PortfolioWork[],
  settings: Settings,
): ProposalBody | undefined {
  const concept = adoptedConcept(workspace);

  switch (id) {
    case 'cover':
      return {
        ja: [
          project.name,
          `${project.brand}／${project.client}`,
          `提案日 ${formatDate(project.proposalDate)}　納期 ${formatDate(project.dueDate)}`,
        ],
        en: [
          project.name,
          `${project.brand} / ${project.client}`,
          `Proposal ${formatDate(project.proposalDate)} / Due ${formatDate(project.dueDate)}`,
        ],
      };
    case 'brand': {
      const brand = workspace.brand;
      if (!brand) return undefined;
      return {
        ja: [brand.worldview, brand.tone, `ターゲット：${brand.target}`],
        en: [`Worldview: ${brand.worldview}`, `Tone: ${brand.tone}`, `Target: ${brand.target}`],
      };
    }
    case 'competitors': {
      if (workspace.competitors.length === 0) return undefined;
      const adopted = workspace.differentiators.filter((item) => item.adopted);
      return {
        ja: [
          ...workspace.competitors.map(
            (competitor) => `${competitor.name}：${competitor.position}／${competitor.visual}`,
          ),
          `差別化：${adopted.map((item) => item.text).join('、')}`,
        ],
        en: [
          ...workspace.competitors.map(
            (competitor) => `${competitor.name}: ${competitor.position} / ${competitor.visual}`,
          ),
          `Differentiation: ${adopted.map((item) => item.text).join(' / ')}`,
        ],
      };
    }
    case 'concept': {
      if (!concept) return undefined;
      const lines = [concept.title, concept.aim, concept.story, concept.direction];
      return { ja: lines, en: lines };
    }
    case 'moodboard': {
      if (workspace.moodboard.length === 0) return undefined;
      const lines = workspace.moodboard.slice(0, 6).map((tile) => `・${tile.caption}`);
      return { ja: lines, en: lines };
    }
    case 'shots': {
      if (workspace.shots.length === 0) return undefined;
      const lines = workspace.shots.map(
        (shot) => `Cut ${shot.no}｜${shot.subject}／${shot.lens}／${shot.composition}`,
      );
      return { ja: lines, en: lines };
    }
    case 'lighting':
      return {
        ja: [
          project.creative.lighting || '面光源＋レフ1枚',
          project.creative.lens || '100mm macro',
          project.creative.retouch || '質感を残すレタッチ',
        ],
        en: [
          project.creative.lighting || 'Soft key light with a reflector',
          project.creative.lens || '100mm macro',
          project.creative.retouch || 'Texture-preserving retouch',
        ],
      };
    case 'works': {
      if (portfolio.length === 0) return undefined;
      const works = portfolio.slice(0, 3);
      return {
        ja: works.map((work) => `${work.title}（${work.client}／${work.year}）`),
        en: works.map((work) => `${work.title} — ${work.client}, ${work.year}`),
      };
    }
    case 'staff':
      return {
        ja: [
          `モデル ${project.production.models}名`,
          `ヘアメイク：${project.production.hairMakeup || '未定'}`,
          `スタイリスト：${project.production.stylist || '未定'}`,
        ],
        en: [
          `Models: ${project.production.models}`,
          `Hair & make-up: ${project.production.hairMakeup || 'TBD'}`,
          `Stylist: ${project.production.stylist || 'TBD'}`,
        ],
      };
    case 'schedule':
      return {
        ja: [
          `撮影日数 ${project.production.shootDays}日`,
          `ロケーション：${project.production.location || '未定'}`,
          `納品：${formatDate(project.dueDate)}／${project.production.delivery || '未定'}`,
        ],
        en: [
          `Shoot days: ${project.production.shootDays}`,
          `Location: ${project.production.location || 'TBD'}`,
          `Delivery: ${formatDate(project.dueDate)} / ${project.production.delivery || 'TBD'}`,
        ],
      };
    case 'budget': {
      const { rates } = settings;
      const shooting = rates.dayRate * project.production.shootDays;
      const gear = rates.gear + rates.studio * project.production.shootDays;
      const retouch = rates.retouch * Math.max(workspace.shots.length, 1);
      const total = estimate(project, workspace, settings);
      return {
        ja: [
          `撮影費：${formatYen(shooting)}`,
          `機材・スタジオ：${formatYen(gear)}`,
          `レタッチ：${formatYen(retouch)}`,
          `合計：${formatYen(total)}（税別）`,
        ],
        en: [
          `Shooting: ${formatYen(shooting)}`,
          `Gear & studio: ${formatYen(gear)}`,
          `Retouch: ${formatYen(retouch)}`,
          `Total: ${formatYen(total)} (excl. tax)`,
        ],
      };
    }
    case 'risk':
      return {
        ja: [
          '天候によるロケ変更：スタジオを予備日として確保',
          'モデル・スタッフの体調不良：代替候補を事前提示',
          `NG事項：${project.ngNotes.join('、') || '指定なし'}`,
        ],
        en: [
          'Weather: studio held as a fallback',
          'Talent illness: alternates proposed in advance',
          `Restrictions: ${project.ngNotes.join(' / ') || 'none'}`,
        ],
      };
    default:
      return undefined;
  }
}

/**
 * 生成できた章だけを返す。上流が未生成の章（ブランド分析・競合分析など）は
 * 含めず、プレビュー側でプレースホルダと生成導線を出す。
 */
export function generateProposalBody(
  project: Project,
  workspace: Workspace,
  portfolio: PortfolioWork[],
  settings: Settings,
): Record<string, ProposalBody> {
  const result: Record<string, ProposalBody> = {};
  for (const section of PROPOSAL_TEMPLATE) {
    const body = bodyFor(section.id, project, workspace, portfolio, settings);
    if (body) result[section.id] = body;
  }
  return result;
}
