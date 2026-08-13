/*
 * 提案書テンプレート（第5章 5-2）。
 * 章の並びと、各章の画像スロット（どこから画像を引くか・何枚入るか）を宣言する。
 * 章本文の生成はスロットに関知せず、スロットの解決はここで行う。
 * テンプレート差し替え（ブランドカラー適用等）はこの定義の差し替えとして実現する。
 */

import type { Asset, CropFocus, PortfolioWork, Workspace } from '../data/types';
import { resolveAsset } from './assets';

export type SlotSource = 'logo' | 'moodboard' | 'shots' | 'portfolio' | 'competitors';

export interface ImageSlot {
  id: string;
  label: string;
  source: SlotSource;
  /** スロットに入る最大枚数。shots のように可変のものは Infinity。 */
  capacity: number;
  /**
   * 同じ供給元（ムードボード）から引く複数スロットの取り出し位置（第8章 8-7）。
   * 表紙・ブランド分析・撮影コンセプトが同じ1枚を並べないよう、割当側でずらす。
   * 枚数が足りない場合は先頭へ回り込むため、重複は起こりうる（IR 側で検知する）。
   */
  offset?: number;
}

// 配置幅（mm）はここには置かない。版面定義から導出する（`slotWidthMm`／第8章 8-4）。
// 定数を並べると、版面を動かしたときに印刷解像度の判定だけが古いまま残る。

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
      {
        id: 'cover-logo',
        label: 'ブランドロゴ',
        source: 'logo',
        capacity: 1,
      },
      {
        id: 'cover-key',
        label: 'キービジュアル',
        source: 'moodboard',
        capacity: 1,
      },
    ],
  },
  {
    id: 'brand',
    ja: 'ブランド分析',
    en: 'Brand Analysis',
    imageSlots: [
      {
        id: 'brand-mood',
        label: 'ブランドイメージ',
        source: 'moodboard',
        capacity: 2,
        offset: 1,
      },
    ],
  },
  {
    id: 'competitors',
    ja: '競合分析',
    en: 'Competitive Landscape',
    imageSlots: [
      // 競合はビジュアルで比較する面にする。文章だけの面にしない（第8章 8-5）。
      {
        id: 'competitor-refs',
        label: '競合のビジュアル',
        source: 'competitors',
        capacity: 3,
      },
    ],
  },
  {
    id: 'concept',
    ja: '撮影コンセプト',
    en: 'Creative Concept',
    imageSlots: [
      {
        id: 'concept-key',
        label: 'キービジュアル',
        source: 'moodboard',
        capacity: 1,
        offset: 3,
      },
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
    imageSlots: [
      {
        id: 'works-grid',
        label: '選定作品',
        source: 'portfolio',
        capacity: 3,
      },
    ],
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
  /** 切り出し位置の指定（第8章 8-7）。無指定なら版面側の既定（上寄せ）で切る。 */
  focus?: CropFocus;
}

/**
 * 供給元から、このスロットの取り分を切り出す。
 * offset で開始位置をずらし、足りない場合だけ先頭へ回り込む（面が空になるより重複を採る）。
 */
function take<T>(pool: T[], slot: ImageSlot): T[] {
  if (pool.length === 0) return [];
  const count = Math.min(slot.capacity, pool.length);
  const start = (slot.offset ?? 0) % pool.length;
  return Array.from({ length: count }, (_, index) => pool[(start + index) % pool.length]);
}

/** スロットに入る画像を解決する。アセット未登録でも参照切れで壊れない（第5章 5-1）。 */
export function resolveSlot(
  slot: ImageSlot,
  workspace: Workspace,
  portfolio: PortfolioWork[],
  assets: Record<string, Asset>,
): ResolvedSlotImage[] {
  const withFocus = (image: ResolvedSlotImage): ResolvedSlotImage => ({
    ...image,
    focus: workspace.crops?.[image.key],
  });

  switch (slot.source) {
    case 'logo':
      // ロゴアセットの登録UIは実装前のため、常に空（プレースホルダ表示）になる。
      return [];
    case 'moodboard':
      return take(workspace.moodboard, slot).map((tile) =>
        withFocus({
          key: `${slot.id}-${tile.id}`,
          caption: tile.caption,
          asset: resolveAsset(assets, tile.assetId),
          fallback: { from: tile.from, to: tile.to },
        }),
      );
    case 'shots':
      return take(workspace.shots, slot).map((shot) =>
        withFocus({
          key: `${slot.id}-${shot.id}`,
          caption: `Cut ${shot.no}｜${shot.subject}`,
          asset: resolveAsset(assets, shot.assetId),
        }),
      );
    case 'competitors':
      return take(workspace.competitors, slot).map((competitor) =>
        withFocus({
          key: `${slot.id}-${competitor.id}`,
          caption: `${competitor.name}｜${competitor.visual}`,
          asset: resolveAsset(assets, competitor.assetId),
        }),
      );
    case 'portfolio':
      return take(portfolio, slot).map((work) =>
        withFocus({
          key: `${slot.id}-${work.id}`,
          caption: work.title,
          asset: resolveAsset(assets, work.assetId),
          fallback: { from: work.from, to: work.to },
        }),
      );
  }
}
