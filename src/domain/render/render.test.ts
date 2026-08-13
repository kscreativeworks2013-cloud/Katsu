import { describe, expect, it } from 'vitest';
import { resolveProposalAssets } from '../resolveAssets';
import { dataUriToBlob } from '../../lib/imageProcessing';
import {
  buildTestIR,
  loadTestFont,
  storeWith,
  testAsset,
  TINY_PNG,
  workspaceWithAsset,
} from '../../test/ir';
import { markdownRenderer, renderMarkdownText } from './markdown';
import { pdfRenderer } from './pdf';
import { pptxRenderer } from './pptx';
import { isSupportedFormat, loadRenderer } from './index';

/** 実体を解決した IR。レンダラが受け取るのは常にこの形（第7章 7-8）。 */
async function withImage(): Promise<ReturnType<typeof buildTestIR>> {
  const assets = { 'ast-1': testAsset('ast-1', { width: 3000, height: 2000 }) };
  const ir = buildTestIR({ assets, workspace: workspaceWithAsset('ast-1') });
  const store = storeWith({ 'ast-1:original': dataUriToBlob(TINY_PNG)! });
  return (await resolveProposalAssets(ir, store, assets)).ir;
}

describe('レンダラ契約', () => {
  it('は対応していない IR 版を拒否する', async () => {
    const ir = { ...buildTestIR(), irVersion: 99 };

    await expect(markdownRenderer.render(ir)).rejects.toThrow(/IR v1/);
  });

  it('はファイル名に言語と版を含める', async () => {
    const ir = buildTestIR();
    const file = await markdownRenderer.render(ir);

    expect(file.fileName).toBe(`MAISON_LUMIÈRE_Proposal_JA_${ir.revision}.md`);
  });

  it('は Word を未対応として扱う', async () => {
    expect(isSupportedFormat('docx')).toBe(false);
    expect(isSupportedFormat('pdf')).toBe(true);
    await expect(loadRenderer('docx')).resolves.toBeUndefined();
    await expect(loadRenderer('pptx')).resolves.toBeDefined();
  });
});

describe('Markdown レンダラ', () => {
  it('は章見出しと本文を書き出し、版を刻む', async () => {
    const ir = buildTestIR();
    const text = await renderMarkdownText(ir);

    expect(text.startsWith('# ホリデーコレクション 2026 キービジュアル\n')).toBe(true);
    expect(text).toContain('## ブランド分析');
    expect(text).toContain(`版 ${ir.revision}`);
    expect(text).not.toMatch(/\n{3,}/);
  });

  it('は画像を出自つきで書き出す', async () => {
    const text = await renderMarkdownText(await withImage());

    expect(text).toContain('出自：持ち込み');
  });
});

describe('PowerPoint レンダラ', () => {
  it('は開ける PPTX（ZIP）を返す', async () => {
    const ir = buildTestIR();
    const file = await pptxRenderer.render(ir);

    // PPTX は ZIP。先頭の magic number を確認する。
    expect(file.bytes.length).toBeGreaterThan(1000);
    expect([file.bytes[0], file.bytes[1]]).toEqual([0x50, 0x4b]);
    expect(file.mimeType).toContain('presentationml');
    expect(file.fileName.endsWith('.pptx')).toBe(true);
  }, 30_000);

  it('は画像つきでも生成できる', async () => {
    const file = await pptxRenderer.render(await withImage());

    expect(file.bytes.length).toBeGreaterThan(1000);
  }, 30_000);
});

describe('PDF レンダラ', () => {
  it('はフォントが無いとき文字化けした PDF を出さずに失敗する', async () => {
    await expect(pdfRenderer.render(buildTestIR())).rejects.toThrow(/日本語フォント/);
  });

  it('は日本語を埋め込んだ PDF を返す', async () => {
    const ir = buildTestIR();
    const file = await pdfRenderer.render(ir, { fontBytes: loadTestFont() });
    const head = new TextDecoder().decode(file.bytes.slice(0, 8));

    expect(head.startsWith('%PDF-')).toBe(true);
    expect(file.bytes.length).toBeGreaterThan(5000);
    expect(file.fileName).toBe(`MAISON_LUMIÈRE_Proposal_JA_${ir.revision}.pdf`);
    // 和文フォントは全字形を埋め込む（サブセット化は壊れた glyf を吐く。第8章 8-5）。
    // そのぶん1本あたり約3MB増える。上限はフォント実体（5.4MB）＋本文の範囲に置く。
    expect(file.bytes.length).toBeLessThan(8_000_000);
  }, 60_000);

  it('は画像を埋め込める', async () => {
    const file = await pdfRenderer.render(await withImage(), { fontBytes: loadTestFont() });

    expect(new TextDecoder().decode(file.bytes.slice(0, 8)).startsWith('%PDF-')).toBe(true);
  }, 60_000);
});
