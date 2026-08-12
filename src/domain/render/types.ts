/*
 * レンダラ契約（第6章 6-5）。
 * レンダラは IR 以外を読まず、ネットワークを使わず、IR を書き換えない。
 */

import type { ExportFormat } from '../../data/types';
import type { ProposalIR } from '../ir';

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

/** 出力ファイル名。ブランド名の空白は落とし、版が追えるよう revision を付ける。 */
export function fileNameFor(ir: ProposalIR, extension: string): string {
  const brand = ir.project.brand.replace(/\s+/g, '_');
  return `${brand}_Proposal_${ir.lang.toUpperCase()}_${ir.revision}.${extension}`;
}

/** 出力物の冒頭に載せる警告の要約（第6章 6-4）。 */
export function warningSummary(ir: ProposalIR): string[] {
  return ir.warnings
    .filter((warning) => warning.severity === 'warn')
    .map((warning) => warning.message);
}
