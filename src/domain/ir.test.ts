import { describe, expect, it } from 'vitest';
import type { Asset, Provenance } from '../data/types';
import { buildTestIR, TINY_PNG, testProject, workspaceWithBody } from '../test/ir';
import { blockingWarnings, computeRevision, IR_VERSION } from './ir';

// Pattern: unit tests. IR は全出力形式の唯一の入力なので、ここで形を固める。

describe('buildProposalIR', () => {
  it('は章を段落と箇条書きのブロックに分解する', () => {
    const ir = buildTestIR();
    const moodboard = ir.sections.find((section) => section.id === 'moodboard');

    expect(ir.irVersion).toBe(IR_VERSION);
    // ムードボードの本文は「・」始まりなので、1つのリストにまとまる。
    expect(moodboard?.blocks.some((block) => block.type === 'list')).toBe(true);
    expect(ir.sections.find((section) => section.id === 'brand')?.blocks[0]).toMatchObject({
      type: 'paragraph',
    });
  });

  it('は言語ごとに別のIRを作る', () => {
    const ja = buildTestIR({ lang: 'ja' });
    const en = buildTestIR({ lang: 'en' });

    expect(ja.sections.find((s) => s.id === 'budget')?.title).toBe('見積もり');
    expect(en.sections.find((s) => s.id === 'budget')?.title).toBe('Budget');
    expect(ja.revision).not.toBe(en.revision);
  });

  it('は章ごとに生成元Runとprovenanceを持つ', () => {
    const provenance: Provenance = {
      'proposal.body.brand': { origin: 'generated', runId: 'run-42', updatedAt: '' },
      'proposal.body.risk': { origin: 'edited', runId: 'run-42', updatedAt: '' },
    };
    const ir = buildTestIR({ provenance });

    const brand = ir.sections.find((section) => section.id === 'brand');
    expect(brand?.source.runIds).toEqual(['run-42']);
    expect(brand?.source.origins).toEqual(['generated']);
    expect(brand?.source.edited).toBe(false);

    expect(ir.sections.find((section) => section.id === 'risk')?.source.edited).toBe(true);
    expect(ir.sources.runIds).toEqual(['run-42']);
    expect(ir.sources.hasEdited).toBe(true);
  });

  it('はAI生成画像を含むことを記録する', () => {
    const assets: Record<string, Asset> = {
      'ast-ai': {
        id: 'ast-ai',
        origin: 'ai',
        label: 'キービジュアル',
        source: 'quiet light',
        runId: 'run-9',
        mimeType: 'image/png',
        createdAt: '',
        thumbnail: TINY_PNG,
      },
    };
    const base = workspaceWithBody();
    const ir = buildTestIR({
      assets,
      workspace: {
        ...base,
        moodboard: base.moodboard.map((tile, index) =>
          index === 0 ? { ...tile, assetId: 'ast-ai' } : tile,
        ),
      },
    });

    expect(ir.sources.hasAiImage).toBe(true);
  });
});

describe('revision', () => {
  it('は同じ内容なら同じ値になる（builtAt は含めない）', () => {
    const first = buildTestIR({ builtAt: new Date('2026-01-01T00:00:00.000Z') });
    const second = buildTestIR({ builtAt: new Date('2026-12-31T23:59:59.000Z') });

    expect(first.revision).toBe(second.revision);
  });

  it('は内容が変われば変わる', () => {
    const base = workspaceWithBody();
    const changed = buildTestIR({
      workspace: {
        ...base,
        proposalBody: {
          ...base.proposalBody,
          risk: { ja: ['書き換えたリスク'], en: ['rewritten'] },
        },
      },
    });

    expect(changed.revision).not.toBe(buildTestIR().revision);
  });

  it('は revision 自身と builtAt を除いた内容から決まる', () => {
    const ir = buildTestIR();
    const { revision, builtAt, ...rest } = ir;

    expect(builtAt).toBeTruthy();
    expect(computeRevision(rest)).toBe(revision);
  });
});

describe('警告', () => {
  it('は stale な章を warn として挙げる', () => {
    const staleProject = {
      ...testProject,
      steps: {
        ...testProject.steps,
        brand: { ...testProject.steps.brand, stale: true, staleCause: 'brand' as const },
      },
    };
    const ir = buildTestIR({ project: staleProject });
    const stale = ir.warnings.filter((warning) => warning.kind === 'stale');

    expect(stale.length).toBeGreaterThan(0);
    expect(blockingWarnings(ir)).toEqual(expect.arrayContaining(stale));
    expect(ir.sections.find((section) => section.id === 'brand')?.source.stale).toBe(true);
  });

  it('は確認済みの据え置きを info として挙げる', () => {
    const acknowledged = {
      ...testProject,
      steps: {
        ...testProject.steps,
        brand: {
          ...testProject.steps.brand,
          stale: false,
          staleAcknowledgedAt: '2026-08-12T00:00:00.000Z',
        },
      },
    };
    const ir = buildTestIR({ project: acknowledged });
    const info = ir.warnings.find((warning) => warning.kind === 'acknowledged');

    expect(info?.severity).toBe('info');
    expect(blockingWarnings(ir)).not.toContain(info);
  });

  it('は未生成の章と画像未登録を分けて挙げる', () => {
    const ir = buildTestIR({ workspace: { ...workspaceWithBody(), proposalBody: {} } });

    expect(ir.warnings.some((warning) => warning.kind === 'missing-section')).toBe(true);
    expect(ir.warnings.filter((warning) => warning.kind === 'missing-image')[0]?.severity).toBe(
      'info',
    );
  });

  it('は外部URL画像を埋め込まないことを知らせる', () => {
    const assets: Record<string, Asset> = {
      'ast-ext': {
        id: 'ast-ext',
        origin: 'external',
        label: '参考画像',
        source: 'https://example.com/a.jpg',
        runId: null,
        mimeType: 'image/jpeg',
        createdAt: '',
      },
    };
    const base = workspaceWithBody();
    const ir = buildTestIR({
      assets,
      workspace: {
        ...base,
        moodboard: base.moodboard.map((tile, index) =>
          index === 0 ? { ...tile, assetId: 'ast-ext' } : tile,
        ),
      },
    });

    expect(ir.warnings.some((warning) => warning.kind === 'external-image')).toBe(true);
  });
});

describe('外部URL画像の取り込み', () => {
  const external = (thumbnail?: string): Record<string, Asset> => ({
    'ast-ext': {
      id: 'ast-ext',
      origin: 'external',
      label: '参考画像',
      source: 'https://example.com/a.jpg',
      runId: null,
      mimeType: 'image/jpeg',
      createdAt: '',
      ...(thumbnail ? { thumbnail } : {}),
    },
  });

  function irWithExternal(thumbnail?: string) {
    const base = workspaceWithBody();
    return buildTestIR({
      assets: external(thumbnail),
      workspace: {
        ...base,
        moodboard: base.moodboard.map((tile, index) =>
          index === 0 ? { ...tile, assetId: 'ast-ext' } : tile,
        ),
      },
    });
  }

  it('は取り込み済みなら埋め込める実体を持ち、警告しない', () => {
    const ir = irWithExternal(TINY_PNG);
    const image = ir.sections
      .flatMap((section) => section.blocks)
      .find((block) => block.type === 'image' && block.assetOrigin === 'external');

    expect(image).toMatchObject({ data: TINY_PNG, href: 'https://example.com/a.jpg' });
    expect(ir.warnings.some((warning) => warning.kind === 'external-image')).toBe(false);
  });

  it('は取り込めていない場合だけ成果物に含まれないと知らせる', () => {
    const ir = irWithExternal();

    expect(ir.warnings.find((warning) => warning.kind === 'external-image')?.message).toMatch(
      /取り込めていないため/,
    );
  });
});
