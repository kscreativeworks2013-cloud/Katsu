/*
 * IR 関連テストの共通土台。シード案件から章本文つきのワークスペースを組み立てる。
 */

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { defaultSettings, seedPortfolio, seedProjects, seedWorkspaces } from '../data/fixtures';
import { generateProposalBody } from '../data/proposalBody';
import type { Asset, Project, Provenance, Workspace } from '../data/types';
import { buildProposalIR, type Lang, type ProposalIR } from '../domain/ir';

export const testProject: Project = seedProjects[0];

/** 1×1 の赤い PNG。画像埋め込みの経路を通すためだけの最小データ。 */
export const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

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
  lang = 'ja' as Lang,
  builtAt = new Date('2026-08-12T09:30:00.000Z'),
}: {
  project?: Project;
  workspace?: Workspace;
  provenance?: Provenance;
  assets?: Record<string, Asset>;
  lang?: Lang;
  builtAt?: Date;
} = {}): ProposalIR {
  return buildProposalIR({
    project,
    workspace,
    provenance,
    portfolio: seedPortfolio,
    assets,
    lang,
    builtAt,
  });
}

/**
 * PDF レンダラ用のフォント実体。ブラウザではアセットとして取得するが、
 * テストでは node_modules から直接読む。
 */
export function loadTestFont(): Uint8Array {
  const require = createRequire(import.meta.url);
  const path =
    require.resolve('@expo-google-fonts/noto-sans-jp/400Regular/NotoSansJP_400Regular.ttf');
  return new Uint8Array(readFileSync(path));
}
