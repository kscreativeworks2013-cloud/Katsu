/*
 * Markdown レンダラ（第6章 6-5）。IR だけを入力にする。
 * 3形式のうち唯一、字形も配置も持たないため、全章・全文が出ているかの基準として使う。
 */

import type { ProposalIR } from '../ir';
import { assertIrVersion, fileNameFor, isDraft, warningSummary, type Renderer } from './types';

function stamp(ir: ProposalIR): string {
  const iso = ir.builtAt;
  const day = iso.slice(0, 10);
  const time = iso.slice(11, 16);
  return ir.lang === 'ja'
    ? `${day} ${time} UTC 生成／版 ${ir.revision}`
    : `Generated ${day} ${time} UTC / revision ${ir.revision}`;
}

function imageLine(
  caption: string,
  href: string | undefined,
  origin: string | undefined,
  ja: boolean,
): string {
  if (!origin) return ja ? `- ${caption}（画像未登録）` : `- ${caption} (no image)`;
  const note = ja ? `出自：${origin}` : `Source: ${origin}`;
  return href ? `![${caption}](${href}) — ${note}` : `- ${caption} — ${note}`;
}

const ORIGIN_LABEL: Record<string, string> = {
  upload: '持ち込み',
  external: '外部参照',
  ai: 'AI生成',
};

export const markdownRenderer: Renderer = {
  format: 'md',
  irVersion: 1,
  async render(ir) {
    assertIrVersion(markdownRenderer, ir);
    const ja = ir.lang === 'ja';
    const lines: string[] = [`# ${ir.project.name}`, ''];

    lines.push(
      ja
        ? `${ir.project.brand}／${ir.project.client}`
        : `${ir.project.brand} / ${ir.project.client}`,
    );
    lines.push('', stamp(ir));

    if (ir.sources.hasAiImage) {
      lines.push(
        '',
        ja
          ? '※ 本提案書にはAI生成画像が含まれます。各画像に出自を併記しています。'
          : 'Note: this proposal includes AI-generated images. Each image is labelled with its origin.',
      );
    }

    const warnings = warningSummary(ir);
    if (warnings.length > 0) {
      lines.push('', ja ? '> 出力時の注意' : '> Notes at export time');
      for (const warning of warnings) lines.push(`> - ${warning}`);
    }

    for (const section of ir.sections) {
      lines.push('', `## ${section.title}`, '');
      for (const block of section.blocks) {
        if (block.type === 'paragraph') {
          lines.push(block.text, '');
        } else if (block.type === 'list') {
          for (const item of block.items) lines.push(`- ${item}`);
          lines.push('');
        } else {
          lines.push(
            imageLine(
              block.caption,
              block.href,
              block.assetOrigin
                ? ja
                  ? ORIGIN_LABEL[block.assetOrigin]
                  : block.assetOrigin
                : undefined,
              ja,
            ),
          );
          lines.push('');
        }
      }
    }

    const text = `${lines
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trimEnd()}\n`;
    return {
      fileName: fileNameFor(ir, 'md', isDraft(ir)),
      mimeType: 'text/markdown',
      bytes: new TextEncoder().encode(text),
    };
  },
};

/** テストと目視確認のために文字列としても取り出せるようにしておく。 */
export async function renderMarkdownText(ir: ProposalIR): Promise<string> {
  const file = await markdownRenderer.render(ir);
  return new TextDecoder().decode(file.bytes);
}
