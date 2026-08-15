/*
 * IR 関連テストの共通土台。シード案件から章本文つきのワークスペースを組み立てる。
 */

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { defaultSettings, seedPortfolio, seedProjects, seedWorkspaces } from '../data/fixtures';
import { generateProposalBody } from '../data/proposalBody';
import type {
  Asset,
  AssetVariant,
  PortfolioWork,
  Project,
  Provenance,
  Workspace,
} from '../data/types';
import {
  createMemoryBinaryStore,
  variantKey,
  type AssetBinaryStore,
} from '../domain/assetStore';
import { buildProposalIR, type Lang, type ProposalIR } from '../domain/ir';

export const testProject: Project = seedProjects[0];

/** 1×1 の赤い PNG。画像埋め込みの経路を通すためだけの最小データ。 */
export const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

/** 実体つきのアセット。既定は原寸ありで、表紙以外のスロットなら解像度も足りる大きさ。 */
export function testAsset(
  id: string,
  {
    origin = 'upload' as Asset['origin'],
    width = 2000,
    height = 1500,
    variants,
  }: {
    origin?: Asset['origin'];
    width?: number;
    height?: number;
    /** 明示すると variants をそのまま使う（原寸なし・preview のみ等を作る）。 */
    variants?: AssetVariant[];
  } = {},
): Asset {
  return {
    id,
    origin,
    label: id,
    source: origin === 'external' ? 'https://example.com/a.jpg' : `${id}.png`,
    runId: null,
    mimeType: 'image/png',
    createdAt: '',
    variants: variants ?? [
      {
        kind: 'original',
        key: variantKey(id, 'original'),
        width,
        height,
        bytes: 1000,
        mimeType: 'image/png',
      },
    ],
  };
}

/** ムードボードの先頭タイルにアセットを結びつけたワークスペース。 */
export function workspaceWithAsset(assetId: string): Workspace {
  const base = workspaceWithBody();
  return {
    ...base,
    moodboard: base.moodboard.map((tile, index) => (index === 0 ? { ...tile, assetId } : tile)),
  };
}

/** 実体を積んだメモリストア。テストでは IndexedDB を使わない。 */
export function storeWith(entries: Record<string, Blob>): AssetBinaryStore {
  const store = createMemoryBinaryStore();
  for (const [key, blob] of Object.entries(entries)) void store.put(key, blob);
  return store;
}

export function workspaceWithBody(overrides: Partial<Workspace> = {}): Workspace {
  const base = seedWorkspaces[testProject.id];
  return {
    ...base,
    proposalBody: generateProposalBody(testProject, base, seedPortfolio, defaultSettings),
    ...overrides,
  };
}

export function buildTestIR({
  project = testProject,
  workspace = workspaceWithBody(),
  provenance = {} as Provenance,
  assets = {} as Record<string, Asset>,
  portfolio = seedPortfolio,
  lang = 'ja' as Lang,
  builtAt = new Date('2026-08-12T09:30:00.000Z'),
}: {
  project?: Project;
  workspace?: Workspace;
  provenance?: Provenance;
  assets?: Record<string, Asset>;
  portfolio?: PortfolioWork[];
  lang?: Lang;
  builtAt?: Date;
} = {}): ProposalIR {
  return buildProposalIR({
    project,
    workspace,
    provenance,
    portfolio,
    assets,
    lang,
    builtAt,
  });
}

/**
 * PDF レンダラ用のフォント実体。ブラウザではアセットとして取得するが、
 * テストではリポジトリのファイルを直接読む。
 * 本番と同じ**絞り込み済み**の実体を読むこと。元の全字形フォントで試すと、
 * 収録外の字を使っていても気づけない（第9章 工程00-b）。
 */
export function loadTestFont(): Uint8Array {
  const require = createRequire(import.meta.url);
  return new Uint8Array(readFileSync(require.resolve('../assets/fonts/NotoSansJP-jis.ttf')));
}
