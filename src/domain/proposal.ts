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
  /**
   * 供給元を全点見せる枠か（ムードボード・競合・実績）。
   * true の枠で枠数を超えた素材は「登録したのに出ない」ことになるので知らせる。
   * 表紙のように供給元から1点を選ぶだけの枠は、超過が正常なので対象にしない。
   */
  exhaustive?: boolean;
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
        exhaustive: true,
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
    // ムードボードは素材の一覧そのものなので、枠は版面の面数で決める（3×2×2面＝12）。
    imageSlots: [
      {
        id: 'mood-tiles',
        label: 'タイル',
        source: 'moodboard',
        capacity: 12,
        exhaustive: true,
      },
    ],
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
  {
    id: 'lighting',
    ja: 'ライティングプラン',
    en: 'Lighting Plan',
    /*
     * ライティングは図（光源・レフ・フラッグの配置）で示すのが本筋だが、
     * 位置を持つデータが無い（生成側が持っているのは文章だけ）。図はデータモデルから
     * 起こす必要があるので、まずは**参考カット**の枠を置く。カットは既にあり、
     * 「この光をこう作る」を絵で示せる（第8章 8-10）。
     */
    imageSlots: [
      { id: 'lighting-refs', label: '参考カット', source: 'shots', capacity: 2, offset: 2 },
    ],
  },
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
        exhaustive: true,
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

/** スロットの供給元にある点数。枠より多ければ載らない素材があるということ（第8章 8-7）。 */
export function slotPoolSize(
  slot: ImageSlot,
  workspace: Workspace,
  portfolio: PortfolioWork[],
): number {
  switch (slot.source) {
    case 'logo':
      return workspace.logoAssetId ? 1 : 0;
    case 'moodboard':
      return workspace.moodboard.length;
    case 'shots':
      return workspace.shots.length;
    case 'competitors':
      return workspace.competitors.length;
    case 'portfolio':
      return portfolio.length;
  }
}

/**
 * 供給元から、このスロットの取り分を切り出す。
 *
 * 選択（`Workspace.picks`）があればその順に載せる。提案書ごとに見せる実績を変えるのは
 * 実務の前提なので、先頭固定にしない。選択が無ければ offset の位置から枠数ぶん取り、
 * 足りない場合だけ先頭へ回り込む（面が空になるより重複を採る）。
 */
function take<T extends { id: string }>(pool: T[], slot: ImageSlot, picks?: string[]): T[] {
  if (pool.length === 0) return [];

  if (picks && picks.length > 0) {
    const chosen = picks
      .map((id) => pool.find((item) => item.id === id))
      .filter((item): item is T => item !== undefined)
      .slice(0, slot.capacity);
    if (chosen.length > 0) return chosen;
  }

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
  const picks = workspace.picks?.[slot.id];

  switch (slot.source) {
    case 'logo': {
      // ロゴは1点だけ。未設定なら空（枠ごと出さない）。
      const logo = resolveAsset(assets, workspace.logoAssetId);
      return logo ? [withFocus({ key: `${slot.id}-logo`, caption: '', asset: logo })] : [];
    }
    case 'moodboard':
      return take(workspace.moodboard, slot, picks).map((tile) =>
        withFocus({
          key: `${slot.id}-${tile.id}`,
          caption: tile.caption,
          asset: resolveAsset(assets, tile.assetId),
          fallback: { from: tile.from, to: tile.to },
        }),
      );
    case 'shots':
      return take(workspace.shots, slot, picks).map((shot) =>
        withFocus({
          key: `${slot.id}-${shot.id}`,
          // キャプションは識別子だけにする。被写体・レンズ・構図は本文が持っており、
          // 枠の下に同じ文を並べると面が二重帳簿になる（第8章 8-7）。
          caption: `Cut ${shot.no}`,
          asset: resolveAsset(assets, shot.assetId),
        }),
      );
    case 'competitors':
      return take(workspace.competitors, slot, picks).map((competitor) =>
        withFocus({
          key: `${slot.id}-${competitor.id}`,
          caption: competitor.name,
          asset: resolveAsset(assets, competitor.assetId),
        }),
      );
    case 'portfolio':
      return take(portfolio, slot, picks).map((work) =>
        withFocus({
          key: `${slot.id}-${work.id}`,
          caption: work.title,
          asset: resolveAsset(assets, work.assetId),
          fallback: { from: work.from, to: work.to },
        }),
      );
  }
}
