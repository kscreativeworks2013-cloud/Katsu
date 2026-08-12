import { describe, expect, it } from 'vitest';
import { defaultSettings, seedPortfolio, seedProjects, seedWorkspaces } from '../data/fixtures';
import { generateProposalBody } from '../data/proposalBody';
import type { Asset, Workspace } from '../data/types';
import { markdownFileName, renderMarkdown } from './markdown';

const project = seedProjects[0];
const generatedAt = new Date('2026-08-12T09:30:00.000Z');

function workspaceWithBody(): Workspace {
  const base = seedWorkspaces[project.id];
  return {
    ...base,
    proposalBody: generateProposalBody(project, base, seedPortfolio, defaultSettings),
  };
}

function render(overrides: { assets?: Record<string, Asset>; lang?: 'ja' | 'en' } = {}) {
  return renderMarkdown({
    project,
    workspace: workspaceWithBody(),
    portfolio: seedPortfolio,
    assets: overrides.assets ?? {},
    settings: defaultSettings,
    lang: overrides.lang ?? 'ja',
    generatedAt,
  });
}

describe('renderMarkdown', () => {
  it('は案件名・章見出し・本文を書き出す', () => {
    const markdown = render();

    expect(markdown.startsWith(`# ${project.name}\n`)).toBe(true);
    expect(markdown).toContain('## ブランド分析');
    expect(markdown).toContain('## 見積もり');
    expect(markdown).toContain('合計：');
  });

  it('は生成日時を記載する', () => {
    expect(render()).toContain('2026-08-12 09:30 UTC 生成');
  });

  it('は英語版で英語の見出しを使う', () => {
    const markdown = render({ lang: 'en' });

    expect(markdown).toContain('## Brand Analysis');
    expect(markdown).toContain('## Budget');
    expect(markdown).not.toContain('## ブランド分析');
  });

  it('は未生成の章を書き出さない', () => {
    const markdown = renderMarkdown({
      project,
      // 本文が空なら、画像スロットを持たない章は出力に現れない。
      workspace: { ...seedWorkspaces[project.id], proposalBody: {} },
      portfolio: seedPortfolio,
      assets: {},
      settings: defaultSettings,
      lang: 'ja',
      generatedAt,
    });

    expect(markdown).not.toContain('## 見積もり');
  });

  it('は画像が未登録のスロットでも壊れず、参照だけを残す', () => {
    const markdown = render();

    expect(markdown).toContain('### タイル');
    expect(markdown).toContain('（画像未登録）');
  });

  it('はAI生成画像を含む場合にその旨を明記する', () => {
    const workspace = workspaceWithBody();
    const assets: Record<string, Asset> = {
      'ast-ai': {
        id: 'ast-ai',
        origin: 'ai',
        label: 'キービジュアル',
        source: 'quiet light, 100mm macro',
        runId: 'run-1',
        mimeType: 'image/png',
        createdAt: '2026-08-12T00:00:00.000Z',
      },
    };
    const markdown = renderMarkdown({
      project,
      workspace: {
        ...workspace,
        moodboard: workspace.moodboard.map((tile, index) =>
          index === 0 ? { ...tile, assetId: 'ast-ai' } : tile,
        ),
      },
      portfolio: seedPortfolio,
      assets,
      settings: defaultSettings,
      lang: 'ja',
      generatedAt,
    });

    expect(markdown).toContain('AI生成画像が含まれます');
    expect(markdown).toContain('出自：AI生成');
  });

  it('は3行以上の空行を作らない', () => {
    expect(render()).not.toMatch(/\n{3,}/);
  });
});

describe('markdownFileName', () => {
  it('はブランド名の空白を落とす', () => {
    expect(markdownFileName({ ...project, brand: 'MAISON LUMIÈRE' }, 'ja')).toBe(
      'MAISON_LUMIÈRE_Proposal_JA.md',
    );
  });
});
