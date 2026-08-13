import { describe, expect, it } from 'vitest';
import type { Provenance } from '../data/types';
import {
  buildTestIR,
  testAsset,
  testProject,
  workspaceWithAsset,
  workspaceWithBody,
} from '../test/ir';
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

  it('はスロットごとの切り出し位置を画像ブロックに載せる', () => {
    const base = workspaceWithAsset('ast-1');
    const ir = buildTestIR({
      assets: { 'ast-1': testAsset('ast-1') },
      // 同じ画像でも枠の縦横比が違うので、指定はスロット単位で効く。
      workspace: { ...base, crops: { 'cover-key-mood-1': { x: 0.5, y: 0 } } },
    });
    const images = ir.sections
      .flatMap((section) => section.blocks)
      .filter((block) => block.type === 'image');

    expect(images.find((block) => block.slotId === 'cover-key')?.focus).toEqual({
      x: 0.5,
      y: 0,
    });
    expect(images.find((block) => block.slotId === 'mood-tiles')?.focus).toBeUndefined();
  });

  it('はブランドのパレットから版面色を導く', () => {
    const ir = buildTestIR();

    // 台紙は紙色より暗い。色そのものではなく関係を IR が持つ（第8章 8-7）。
    expect(ir.theme.mat).not.toBe(ir.theme.paper);
    expect(ir.theme.paper).toMatch(/^#[0-9A-F]{6}$/);
  });

  it('はAI生成画像を含むことを記録する', () => {
    const ir = buildTestIR({
      assets: { 'ast-ai': testAsset('ast-ai', { origin: 'ai' }) },
      workspace: workspaceWithAsset('ast-ai'),
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

  it('は枠に載り切らない素材の点数を知らせる', () => {
    // 登録したのに出力に出ない、を黙って起こさない（第8章 8-7）。
    const base = workspaceWithBody();
    const ir = buildTestIR({
      workspace: {
        ...base,
        // タイル枠は12。14点あれば2点は載らない。
        moodboard: [...base.moodboard, ...base.moodboard].slice(0, 14),
      },
    });
    const over = ir.warnings.find(
      (warning) => warning.kind === 'over-capacity' && warning.slot === 'タイル',
    );

    expect(over?.severity).toBe('info');
    expect(over?.message).toMatch(/14点のうち2点は出力に載りません/);
  });

  it('は枠に収まっている枠については知らせない', () => {
    // シードのタイルは8点で枠は12。全点載るので黙る。
    const warnings = buildTestIR().warnings.filter(
      (warning) => warning.kind === 'over-capacity',
    );

    expect(warnings.some((warning) => warning.slot === 'タイル')).toBe(false);
  });

  it('は供給元から選ぶだけの枠（表紙）では超過を数えない', () => {
    // 表紙のキービジュアルはムードボード8点から1点を選ぶ枠。7点余るのが正常。
    const warnings = buildTestIR().warnings.filter(
      (warning) => warning.kind === 'over-capacity',
    );

    expect(warnings.some((warning) => warning.slot === 'キービジュアル')).toBe(false);
  });

  it('は目立つスロットの重複を検知する（素材が足りず回り込んだとき）', () => {
    // タイルが1枚しか無ければ、表紙・ブランド分析・撮影コンセプトは同じ1枚に回り込む。
    const base = workspaceWithAsset('ast-1');
    const ir = buildTestIR({
      assets: { 'ast-1': testAsset('ast-1') },
      workspace: { ...base, moodboard: base.moodboard.slice(0, 1) },
    });
    const duplicate = ir.warnings.find((warning) => warning.kind === 'duplicate-image');

    expect(duplicate?.severity).toBe('info');
    expect(duplicate?.message).toMatch(/重複して使われています/);
  });

  it('は素材が足りていれば目立つスロットに同じ画像を置かない', () => {
    // ムードボードは8枚。表紙・ブランド分析・撮影コンセプトは別の枚に割り当たる。
    const assets = Object.fromEntries(
      [0, 1, 2, 3].map((index) => [`ast-${index}`, testAsset(`ast-${index}`)]),
    );
    const base = workspaceWithBody();
    const ir = buildTestIR({
      assets,
      workspace: {
        ...base,
        moodboard: base.moodboard.map((tile, index) => ({ ...tile, assetId: `ast-${index}` })),
      },
    });

    expect(ir.warnings.some((warning) => warning.kind === 'duplicate-image')).toBe(false);
  });

  it('は外部URL画像を埋め込まないことを知らせる', () => {
    const ir = buildTestIR({
      assets: { 'ast-ext': testAsset('ast-ext', { origin: 'external', variants: [] }) },
      workspace: workspaceWithAsset('ast-ext'),
    });

    expect(ir.warnings.some((warning) => warning.kind === 'external-image')).toBe(true);
  });
});

describe('外部URL画像の取り込み', () => {
  function irWithExternal(imported: boolean) {
    return buildTestIR({
      assets: {
        'ast-ext': testAsset('ast-ext', {
          origin: 'external',
          ...(imported ? {} : { variants: [] }),
        }),
      },
      workspace: workspaceWithAsset('ast-ext'),
    });
  }

  it('は取り込み済みなら出力用の実体を指し、警告しない', () => {
    const ir = irWithExternal(true);
    const image = ir.sections
      .flatMap((section) => section.blocks)
      .find((block) => block.type === 'image' && block.assetOrigin === 'external');

    expect(image).toMatchObject({
      href: 'https://example.com/a.jpg',
      variant: { kind: 'original', key: 'ast-ext:original' },
    });
    expect(ir.warnings.some((warning) => warning.kind === 'external-image')).toBe(false);
  });

  it('は取り込めていない場合だけ成果物に含まれないと知らせる', () => {
    const ir = irWithExternal(false);

    expect(ir.warnings.find((warning) => warning.kind === 'external-image')?.message).toMatch(
      /取り込めていないため/,
    );
  });
});

describe('画像の解像度と実体（第7章 7-2／7-6）', () => {
  it('は配置幅に対して画素が足りない画像を、必要px付きで警告する', () => {
    // 表紙キービジュアル（A4横で 297mm 全面）には 2339px 必要。1024px では届かない。
    const ir = buildTestIR({
      assets: { 'ast-small': testAsset('ast-small', { width: 1024, height: 768 }) },
      workspace: workspaceWithAsset('ast-small'),
    });

    const warning = ir.warnings.find((item) => item.kind === 'low-resolution');
    expect(warning?.severity).toBe('warn');
    expect(warning?.message).toMatch(/88ppi/);
    expect(warning?.message).toMatch(/2339px 必要/);
  });

  it('は原寸のない画像を「出力では欠ける」と警告する', () => {
    const previewOnly = testAsset('ast-prev', {
      variants: [
        {
          kind: 'preview',
          key: 'ast-prev:preview',
          width: 800,
          height: 600,
          bytes: 60_000,
          mimeType: 'image/jpeg',
        },
      ],
    });
    const ir = buildTestIR({
      assets: { 'ast-prev': previewOnly },
      workspace: workspaceWithAsset('ast-prev'),
    });

    const warning = ir.warnings.find((item) => item.kind === 'preview-only');
    expect(warning?.severity).toBe('warn');
    // 出力用の実体は指さない（preview を出力に使わない）。
    const image = ir.sections
      .flatMap((section) => section.blocks)
      .find((block) => block.type === 'image' && block.assetId === 'ast-prev');
    expect(image).toMatchObject({ variant: undefined });
  });

  it('は十分な解像度の画像には警告を出さない', () => {
    const ir = buildTestIR({
      assets: { 'ast-big': testAsset('ast-big', { width: 3000, height: 2000 }) },
      workspace: workspaceWithAsset('ast-big'),
    });

    expect(ir.warnings.some((item) => item.kind === 'low-resolution')).toBe(false);
    expect(ir.warnings.some((item) => item.kind === 'preview-only')).toBe(false);
  });
});
