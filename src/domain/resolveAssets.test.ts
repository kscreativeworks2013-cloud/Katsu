import { describe, expect, it } from 'vitest';
import type { Asset } from '../data/types';
import { dataUriToBlob } from '../lib/imageProcessing';
import { buildTestIR, storeWith, testAsset, TINY_PNG, workspaceWithAsset } from '../test/ir';
import { computeRevision } from './ir';
import { fileNameFor, isDraft } from './render/types';
import { isDegraded, resolveProposalAssets } from './resolveAssets';

/*
 * 解決フェーズ（第7章 7-8／7-9）。
 * 実体は IR の外から入るが、版（revision）は解決の有無で変わらない。
 */

const blob = () => dataUriToBlob(TINY_PNG)!;

function irFor(assets: Record<string, Asset>, assetId: string) {
  return buildTestIR({ assets, workspace: workspaceWithAsset(assetId) });
}

describe('resolveProposalAssets', () => {
  it('は原寸の実体を image ブロックへ埋める', async () => {
    const assets = { 'ast-1': testAsset('ast-1', { width: 3000, height: 2000 }) };
    const store = storeWith({ 'ast-1:original': blob() });

    const outcome = await resolveProposalAssets(irFor(assets, 'ast-1'), store, assets);
    const image = outcome.ir.sections
      .flatMap((section) => section.blocks)
      .find((block) => block.type === 'image' && block.assetId === 'ast-1');

    expect(image).toMatchObject({ data: TINY_PNG });
    expect(outcome.resolution.original).toBeGreaterThan(0);
    expect(outcome.resolution.missing).toBe(0);
    expect(isDegraded(outcome.resolution)).toBe(false);
  });

  it('は解決しても revision を変えない（実体は内容ではない）', async () => {
    const assets = { 'ast-1': testAsset('ast-1', { width: 3000, height: 2000 }) };
    const built = irFor(assets, 'ast-1');
    const store = storeWith({ 'ast-1:original': blob() });

    const outcome = await resolveProposalAssets(built, store, assets);

    expect(outcome.ir.revision).toBe(built.revision);
    // 埋めた実体を除いた内容から算出し直しても同じ版になる。
    expect(computeRevision(outcome.ir)).toBe(built.revision);
  });

  it('は実体が失われている場合に警告し、消失として数える（第7章 7-11）', async () => {
    const assets = { 'ast-1': testAsset('ast-1', { width: 3000, height: 2000 }) };
    // 記述子はあるが、ストアには実体が無い＝消失。
    const outcome = await resolveProposalAssets(irFor(assets, 'ast-1'), storeWith({}), assets);

    expect(outcome.resolution.missing).toBeGreaterThan(0);
    expect(outcome.missingAssetIds).toContain('ast-1');
    expect(outcome.ir.warnings.some((warning) => warning.kind === 'missing-binary')).toBe(true);
    // 黙って落とさない：出力物のファイル名にも劣化が出る。
    expect(isDraft(outcome.ir)).toBe(true);
    expect(fileNameFor(outcome.ir, 'pdf', isDraft(outcome.ir))).toMatch(/-draft\.pdf$/);
  });

  it('は原寸が取れないとき preview へ落とし、劣化として数える', async () => {
    const assets = {
      'ast-1': testAsset('ast-1', {
        variants: [
          {
            kind: 'original',
            key: 'ast-1:original',
            width: 3000,
            height: 2000,
            bytes: 1000,
            mimeType: 'image/png',
          },
          {
            kind: 'preview',
            key: 'ast-1:preview',
            width: 800,
            height: 533,
            bytes: 100,
            mimeType: 'image/jpeg',
          },
        ],
      }),
    };
    // 原寸だけが消えている状態。
    const store = storeWith({ 'ast-1:preview': blob() });

    const outcome = await resolveProposalAssets(irFor(assets, 'ast-1'), store, assets);

    expect(outcome.resolution.previewFallback).toBeGreaterThan(0);
    expect(outcome.resolution.missing).toBe(0);
    expect(isDegraded(outcome.resolution)).toBe(true);
    expect(
      outcome.ir.warnings.find((warning) => warning.kind === 'missing-binary')?.message,
    ).toMatch(/縮小版で出力します/);
  });

  it('は画像を持たない案件では劣化扱いにしない', async () => {
    const outcome = await resolveProposalAssets(buildTestIR(), storeWith({}), {});

    expect(isDegraded(outcome.resolution)).toBe(false);
    expect(fileNameFor(outcome.ir, 'md', isDraft(outcome.ir))).not.toMatch(/-draft/);
  });
});
