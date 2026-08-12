/*
 * 提案書の Markdown 出力（第5章 5-3）。
 * 章立て・本文・画像スロットを1つのテキストに書き出す。実ファイルとして出せる唯一の形式で、
 * 他形式へ広げる前に「全章・全文が崩れなく出る」ことをここで保証する。
 */

import type { Asset, PortfolioWork, Project, Settings, Workspace } from '../data/types';
import { ASSET_ORIGIN_LABEL } from './assets';
import { PROPOSAL_TEMPLATE, resolveSlot } from './proposal';

export type Lang = 'ja' | 'en';

export interface MarkdownContext {
  project: Project;
  workspace: Workspace;
  portfolio: PortfolioWork[];
  assets: Record<string, Asset>;
  settings: Settings;
  lang: Lang;
  /** 生成日時。テストから固定できるよう引数で受け取る。 */
  generatedAt: Date;
}

function formatStamp(date: Date, lang: Lang): string {
  const iso = date.toISOString();
  const day = iso.slice(0, 10);
  const time = iso.slice(11, 16);
  return lang === 'ja' ? `${day} ${time} UTC 生成` : `Generated ${day} ${time} UTC`;
}

/**
 * 画像は Markdown の画像記法で書き出す。実体URLを持たないアセットや未登録スロットは
 * 参照だけを残し、出力が壊れないようにする（第5章 5-1 の参照解決と同じ方針）。
 */
function imageLine(caption: string, asset: Asset | undefined, lang: Lang): string {
  if (!asset) {
    return lang === 'ja' ? `- ${caption}（画像未登録）` : `- ${caption} (no image)`;
  }
  const origin = ASSET_ORIGIN_LABEL[asset.origin];
  const target = asset.origin === 'external' ? asset.source : '';
  const note = lang === 'ja' ? `出自：${origin}` : `Source: ${asset.origin}`;
  return target
    ? `![${caption}](${target}) — ${note}`
    : `- ${caption} — ${note}（${asset.source}）`;
}

export function renderMarkdown(context: MarkdownContext): string {
  const { project, workspace, portfolio, assets, lang } = context;
  const ja = lang === 'ja';
  const lines: string[] = [];

  lines.push(`# ${project.name}`);
  lines.push('');
  lines.push(
    ja ? `${project.brand}／${project.client}` : `${project.brand} / ${project.client}`,
  );
  lines.push('');
  lines.push(formatStamp(context.generatedAt, lang));

  // AI生成画像を含む場合はその旨を明記する（第5章 5-3）。
  const usesAiImage = Object.values(assets).some((asset) => asset.origin === 'ai');
  if (usesAiImage) {
    lines.push('');
    lines.push(
      ja
        ? '※ 本提案書にはAI生成画像が含まれます。各画像に出自を併記しています。'
        : 'Note: this proposal includes AI-generated images. Each image is labelled with its origin.',
    );
  }

  for (const section of PROPOSAL_TEMPLATE) {
    const body = workspace.proposalBody?.[section.id];
    const slots = section.imageSlots.map((slot) => ({
      slot,
      images: resolveSlot(slot, workspace, portfolio, assets),
    }));
    const hasImages = slots.some(({ images }) => images.length > 0);
    if (!body && !hasImages) continue;

    lines.push('');
    lines.push(`## ${ja ? section.ja : section.en}`);

    if (body) {
      lines.push('');
      for (const line of ja ? body.ja : body.en) {
        lines.push(line);
        lines.push('');
      }
    }

    for (const { slot, images } of slots) {
      if (images.length === 0) continue;
      lines.push(`### ${slot.label}`);
      lines.push('');
      for (const image of images) {
        lines.push(imageLine(image.caption, image.asset, lang));
      }
      lines.push('');
    }
  }

  // 末尾の余分な空行を落として1つの改行で終える。
  return `${lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd()}\n`;
}

/** 出力ファイル名。ブランド名の空白は落とす。 */
export function markdownFileName(project: Project, lang: Lang): string {
  return `${project.brand.replace(/\s+/g, '_')}_Proposal_${lang.toUpperCase()}.md`;
}
