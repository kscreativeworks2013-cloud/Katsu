import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  defaultSettings,
  seedPortfolio,
  seedProjects,
  seedWorkspaces,
} from '../../src/data/fixtures';
import { generateProposalBody } from '../../src/data/proposalBody';
import type { Asset } from '../../src/data/types';
import { blockingWarnings, buildProposalIR } from '../../src/domain/ir';
import { renderLayoutPdf } from '../../src/domain/render/pdfLayout';
import { extractPdfText } from '../../src/test/pdfText';
import { loadTestFont } from '../../src/test/ir';

/*
 * 低解像度素材を表紙スロットに置いたときの警告（第7章 7-2／7-3）。
 * 1320×671 は絵コンテ（75mm）では足りるが、表紙全面（297mm）では足りない。
 */

describe('low-resolution 警告', () => {
  it('は不足するスロットだけを、必要px付きで挙げる', () => {
    const project = seedProjects[0];
    const base = seedWorkspaces[project.id];
    const bytes = readFileSync('dist/layout-preview/photos/05-shot-wide.jpg');

    const assets: Record<string, Asset> = {
      'ast-low': {
        id: 'ast-low',
        origin: 'upload',
        label: '低解像度素材',
        source: 'low.jpg',
        runId: null,
        mimeType: 'image/jpeg',
        createdAt: '',
        variants: [
          {
            kind: 'original',
            key: 'ast-low:original',
            width: 1320,
            height: 671,
            bytes: bytes.length,
            mimeType: 'image/jpeg',
          },
        ],
      },
    };

    const ir = buildProposalIR({
      project,
      workspace: {
        ...base,
        proposalBody: generateProposalBody(project, base, seedPortfolio, defaultSettings),
        // 表紙のキービジュアルはムードボード先頭タイルから引かれる。
        moodboard: base.moodboard.map((tile, index) =>
          index === 0 ? { ...tile, assetId: 'ast-low' } : { ...tile, assetId: null },
        ),
      },
      provenance: {},
      portfolio: seedPortfolio,
      assets,
      lang: 'ja',
      builtAt: new Date('2026-08-13T00:00:00.000Z'),
    });

    const low = ir.warnings.filter((warning) => warning.kind === 'low-resolution');
    for (const warning of low) console.log(warning.message);
    console.log('出力前に確認を挟む警告：', blockingWarnings(ir).length, '件');

    expect(low.length).toBeGreaterThan(0);
    expect(low[0].message).toMatch(/113ppi/);
    expect(low[0].message).toMatch(/2339px 必要/);
  });

  it('は成果物にも残る（画面で見ただけでは後から分からない）', async () => {
    const project = seedProjects[0];
    const base = seedWorkspaces[project.id];
    const assets: Record<string, Asset> = {
      'ast-low': {
        id: 'ast-low',
        origin: 'upload',
        label: '低解像度素材',
        source: 'low.jpg',
        runId: null,
        mimeType: 'image/jpeg',
        createdAt: '',
        variants: [
          {
            kind: 'original',
            key: 'ast-low:original',
            width: 1320,
            height: 671,
            bytes: 80_000,
            mimeType: 'image/jpeg',
          },
        ],
      },
    };
    const ir = buildProposalIR({
      project,
      workspace: {
        ...base,
        proposalBody: generateProposalBody(project, base, seedPortfolio, defaultSettings),
        moodboard: base.moodboard.map((tile, index) =>
          index === 0 ? { ...tile, assetId: 'ast-low' } : { ...tile, assetId: null },
        ),
      },
      provenance: {},
      portfolio: seedPortfolio,
      assets,
      lang: 'ja',
      builtAt: new Date('2026-08-13T00:00:00.000Z'),
    });

    const text = await extractPdfText(await renderLayoutPdf(ir, { fontBytes: loadTestFont() }));

    expect(text).toContain('出力時の注意');
    expect(text).toMatch(/印刷解像度が不足/);
  }, 60_000);
});
