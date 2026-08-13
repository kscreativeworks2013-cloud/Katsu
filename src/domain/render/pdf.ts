/*
 * PDF レンダラ（第6章 6-5、第8章）。
 *
 * 面付けは版面定義（layout.ts）と版面レンダラ（pdfLayout.ts）が持つ。
 * ここはレンダラ契約への口だけを担う：IR 以外を読まず、ネットワークを使わず、
 * IR を書き換えない。1カラム流し込みだった旧実装は第8章で置き換えた。
 * サブセット化も旧実装と一緒に消えている（壊れた glyf を吐くため。第8章 8-5）。
 */

import type { ProposalIR } from '../ir';
import { renderLayoutPdf } from './pdfLayout';
import { assertIrVersion, fileNameFor, isDraft, type Renderer } from './types';

export const pdfRenderer: Renderer = {
  format: 'pdf',
  irVersion: 1,
  async render(ir: ProposalIR, options) {
    assertIrVersion(pdfRenderer, ir);
    if (!options?.fontBytes || options.fontBytes.length === 0) {
      throw new Error(
        '日本語フォントを読み込めないため PDF を生成できません。文字化けした成果物は出力しません。',
      );
    }

    return {
      fileName: fileNameFor(ir, 'pdf', isDraft(ir)),
      mimeType: 'application/pdf',
      bytes: await renderLayoutPdf(ir, { fontBytes: options.fontBytes }),
    };
  },
};
