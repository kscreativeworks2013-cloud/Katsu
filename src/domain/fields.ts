/*
 * フィールドパスと Workspace の対応表（第4章 4-2）。
 * ステップが書き込めるのはここに列挙されたパスだけで、生成・上書き・保護の判定は
 * すべてパス単位で行う。コレクションはコレクション全体で1フィールドとして扱う。
 */

import type { ProposalBody, Workspace } from '../data/types';
import { PROPOSAL_TEMPLATE } from './proposal';

export interface FieldAccessor {
  path: string;
  label: string;
  get: (workspace: Workspace) => unknown;
  set: (workspace: Workspace, value: unknown) => Workspace;
}

function field<T>(
  path: string,
  label: string,
  get: (workspace: Workspace) => T,
  set: (workspace: Workspace, value: T) => Workspace,
): FieldAccessor {
  return { path, label, get, set: (workspace, value) => set(workspace, value as T) };
}

const brandField = <K extends keyof NonNullable<Workspace['brand']>>(
  key: K,
  label: string,
): FieldAccessor =>
  field(
    `brand.${key}`,
    label,
    (workspace) => workspace.brand?.[key],
    (workspace, value) => ({
      ...workspace,
      brand: { ...(workspace.brand ?? EMPTY_BRAND), [key]: value },
    }),
  );

const EMPTY_BRAND: NonNullable<Workspace['brand']> = {
  worldview: '',
  tone: '',
  target: '',
  visualCodes: [],
  keywords: [],
  palette: [],
  constraints: [],
};

const ACCESSORS: FieldAccessor[] = [
  brandField('worldview', 'ブランドの世界観'),
  brandField('tone', 'トーン＆マナー'),
  brandField('target', 'ターゲット顧客'),
  brandField('visualCodes', 'ビジュアルコード'),
  brandField('keywords', 'キーワード'),
  brandField('palette', 'ブランドカラーパレット'),
  brandField('constraints', '表現上の制約／NG事項'),

  field(
    'competitors.list',
    '競合ブランド',
    (workspace) => workspace.competitors,
    (workspace, value) => ({ ...workspace, competitors: value }),
  ),
  field(
    'competitors.differentiators',
    '差別化ポイント',
    (workspace) => workspace.differentiators,
    (workspace, value) => ({ ...workspace, differentiators: value }),
  ),
  field(
    'concepts.list',
    '撮影コンセプト',
    (workspace) => workspace.concepts,
    (workspace, value) => ({ ...workspace, concepts: value }),
  ),
  field(
    'moodboard.tiles',
    'ムードボード',
    (workspace) => workspace.moodboard,
    (workspace, value) => ({ ...workspace, moodboard: value }),
  ),
  field(
    'shots.list',
    'ショットリスト',
    (workspace) => workspace.shots,
    (workspace, value) => ({ ...workspace, shots: value }),
  ),

  // 章本文は章ごとに1フィールド。章単位で手動編集・保護できるようにする（第5章 5-2）。
  ...PROPOSAL_TEMPLATE.map((section) =>
    field(
      `proposal.body.${section.id}`,
      `提案書：${section.ja}`,
      (workspace: Workspace) => workspace.proposalBody?.[section.id],
      (workspace: Workspace, value: ProposalBody | undefined) => ({
        ...workspace,
        proposalBody: { ...workspace.proposalBody, [section.id]: value },
      }),
    ),
  ),

  ...(['chatgpt', 'claude', 'gemini', 'imagefx', 'midjourney', 'flux'] as const).map((target) =>
    field(
      `prompts.${target}`,
      `プロンプト（${target}）`,
      (workspace: Workspace) => workspace.prompts[target],
      (workspace: Workspace, value: string | undefined) => ({
        ...workspace,
        prompts: { ...workspace.prompts, [target]: value },
      }),
    ),
  ),
];

export const FIELDS: Record<string, FieldAccessor> = Object.fromEntries(
  ACCESSORS.map((accessor) => [accessor.path, accessor]),
);

export function readField(workspace: Workspace, path: string): unknown {
  return FIELDS[path]?.get(workspace);
}

export function writeField(workspace: Workspace, path: string, value: unknown): Workspace {
  const accessor = FIELDS[path];
  if (!accessor) throw new Error(`未定義のフィールドパス: ${path}`);
  return accessor.set(workspace, value);
}

export function fieldLabel(path: string): string {
  return FIELDS[path]?.label ?? path;
}

/** 値の同一判定。生成物は JSON で表せる形しか持たないため、これで十分。 */
export function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

/** 未生成とみなせる値か（空配列・空文字・undefined）。 */
export function isEmptyValue(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  return false;
}
