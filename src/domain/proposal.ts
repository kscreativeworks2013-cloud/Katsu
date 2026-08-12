/*
 * 提案書テンプレート（第5章 5-2）。
 * 章の並びと、各章の画像スロット（どこから画像を引くか・何枚入るか）を宣言する。
 * 章本文の生成はスロットに関知せず、スロットの解決はここで行う。
 * テンプレート差し替え（ブランドカラー適用等）はこの定義の差し替えとして実現する。
 */

import type { Asset, PortfolioWork, Workspace } from '../data/types';
import { resolveAsset } from './assets';

export type SlotSource = 'logo' | 'moodboard' | 'shots' | 'portfolio';

export interface ImageSlot {
  id: string;
  label: string;
  source: SlotSource;
  /** スロットに入る最大枚数。shots のように可変のものは Infinity。 */
  capacity: number;
}

export interface ProposalSection {
  id: string;
  ja: string;
  en: string;
  imageSlots: ImageSlot[];
}

export const PROPOSAL_TEMPLATE: ProposalSection[] = [
  {
    id: 'cover',
    ja: '表紙',
    en: 'Cover',
    imageSlots: [
      { id: 'cover-logo', label: 'ブランドロゴ', source: 'logo', capacity: 1 },
      { id: 'cover-key', label: 'キービジュアル', source: 'moodboard', capacity: 1 },
    ],
  },
  {
    id: 'brand',
    ja: 'ブランド分析',
    en: 'Brand Analysis',
    imageSlots: [
      { id: 'brand-mood', label: 'ブランドイメージ', source: 'moodboard', capacity: 2 },
    ],
  },
  { id: 'competitors', ja: '競合分析', en: 'Competitive Landscape', imageSlots: [] },
  {
    id: 'concept',
    ja: '撮影コンセプト',
    en: 'Creative Concept',
    imageSlots: [
      { id: 'concept-key', label: 'キービジュアル', source: 'moodboard', capacity: 1 },
    ],
  },
  {
    id: 'moodboard',
    ja: 'ムードボード',
    en: 'Mood Board',
    imageSlots: [{ id: 'mood-tiles', label: 'タイル', source: 'moodboard', capacity: 8 }],
  },
  {
    id: 'shots',
    ja: 'ショットリスト',
    en: 'Shot List',
    imageSlots: [
      {
        id: 'shot-frames',
        label: '絵コンテ',
        source: 'shots',
        capacity: Number.POSITIVE_INFINITY,
      },
    ],
  },
  { id: 'lighting', ja: 'ライティングプラン', en: 'Lighting Plan', imageSlots: [] },
  {
    id: 'works',
    ja: '実績',
    en: 'Selected Works',
    imageSlots: [{ id: 'works-grid', label: '選定作品', source: 'portfolio', capacity: 3 }],
  },
  { id: 'staff', ja: 'スタッフ構成', en: 'Crew', imageSlots: [] },
  { id: 'schedule', ja: 'スケジュール', en: 'Schedule', imageSlots: [] },
  { id: 'budget', ja: '見積もり', en: 'Budget', imageSlots: [] },
  { id: 'risk', ja: 'リスク管理', en: 'Risk Management', imageSlots: [] },
];

export interface ResolvedSlotImage {
  key: string;
  caption: string;
  /** 解決できたアセット。無ければ fallback のグラデーションで描く。 */
  asset?: Asset;
  fallback?: { from: string; to: string };
}

/** スロットに入る画像を解決する。アセット未登録でも参照切れで壊れない（第5章 5-1）。 */
export function resolveSlot(
  slot: ImageSlot,
  workspace: Workspace,
  portfolio: PortfolioWork[],
  assets: Record<string, Asset>,
): ResolvedSlotImage[] {
  switch (slot.source) {
    case 'logo':
      // ロゴアセットの登録UIは実装前のため、常に空（プレースホルダ表示）になる。
      return [];
    case 'moodboard':
      return workspace.moodboard.slice(0, slot.capacity).map((tile) => ({
        key: `${slot.id}-${tile.id}`,
        caption: tile.caption,
        asset: resolveAsset(assets, tile.assetId),
        fallback: { from: tile.from, to: tile.to },
      }));
    case 'shots':
      return workspace.shots.slice(0, slot.capacity).map((shot) => ({
        key: `${slot.id}-${shot.id}`,
        caption: `Cut ${shot.no}｜${shot.subject}`,
        asset: resolveAsset(assets, shot.assetId),
      }));
    case 'portfolio':
      return portfolio.slice(0, slot.capacity).map((work) => ({
        key: `${slot.id}-${work.id}`,
        caption: work.title,
        asset: resolveAsset(assets, work.assetId),
        fallback: { from: work.from, to: work.to },
      }));
  }
}
