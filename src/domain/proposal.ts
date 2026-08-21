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
  /**
   * 英語版の枠名（第9章 工程00-b-2）。提出前チェックの文に枠名が入るため、
   * ここが和文のままだと英語版の注意書きが日英混在になる。
   */
  labelEn: string;
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

/**
 * 「道具が勝手に絞る枠」か（第9章 工程R-1・N-7）。
 *
 * 供給元を全点見せる枠（`exhaustive`）でも、枠数が無制限の枠でもないもの。
 * つまり**供給元の一部だけが載り、どれが載るかを道具が決めている**枠である。
 * ここに何が入るかで提案書の印象が決まるのに、既定では offset で機械的に取っている。
 * 実測：本文が「暗部を残す・半逆光・無彩色」と述べている案件で、表紙にハイキーの
 * 着物、コンセプトに黄色いサングラスの人物が入った。
 *
 * **枠ごとに列挙しない。** 列挙すると、枠を足したときに片方だけ更新される
 * （実測：`shot-frames` に印を付けていたが、枠数が無制限なので選ぶものが無く、
 * 提出前チェックが「選べ」と言い続ける矛盾になっていた）。
 */
export function slotIsPrincipal(slot: ImageSlot): boolean {
  return slot.exhaustive !== true && Number.isFinite(slot.capacity);
}

/**
 * 供給元が枠数を超えていて、利用者が選ぶ余地があるか（第9章 工程N-7）。
 * 画面のピッカーの表示条件と、提出前チェックの「未選択」判定は**同じこれ**を見る。
 * 別々に書くと、片方だけが出る（実測：絵コンテは「選べ」と言われるのに画面に出なかった）。
 */
export function slotHasChoice(slot: ImageSlot, pool: number): boolean {
  return pool > slot.capacity;
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
      {
        id: 'cover-logo',
        label: 'ブランドロゴ',
        labelEn: 'Brand logo',
        source: 'logo',
        capacity: 1,
      },
      {
        id: 'cover-key',
        label: 'キービジュアル',
        labelEn: 'Key visual',
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
        labelEn: 'Brand imagery',
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
        labelEn: 'Competitor visuals',
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
        labelEn: 'Key visual',
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
        labelEn: 'Tiles',
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
        labelEn: 'Storyboard',
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
      {
        id: 'lighting-refs',
        label: '参考カット',
        labelEn: 'Reference frames',
        source: 'shots',
        capacity: 2,
        offset: 2,
      },
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
        labelEn: 'Selected works',
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
  /**
   * 供給元が申告している出典（第9章 工程N-11）。ムードボードのタイルなら
   * 「AI生成」「過去作品」など、生成ステップが書いた文言。
   * 実際に登録されたアセットの出自と食い違っていたら、説明文も生成時のまま
   * 取り残されている可能性が高い。
   */
  declaredSource?: string;
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
function take<T extends { id: string }>(
  pool: T[],
  slot: ImageSlot,
  picks?: string[],
  /**
   * 他の枠が**明示的に選んだ**項目（第9章 工程N-3）。
   * 既定割当はこれを避けて次を取る。実測：表紙を選び直したら、offset で決まる
   * ブランド分析に同じ写真が入り、重複検知が発火した。利用者が選んだものを
   * 道具が横から使うのは筋が悪い。
   */
  claimed?: ReadonlySet<string>,
): T[] {
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
  // 選ばれていないものを優先して拾う。尽きたら避けずに埋める——枠を空にするより、
  // 重複して出して提出前チェックで知らせるほうがよい（第8章 8-7 と同じ判断）。
  const order = Array.from(
    { length: pool.length },
    (_, index) => pool[(start + index) % pool.length],
  );
  const free = claimed ? order.filter((item) => !claimed.has(item.id)) : order;
  const picked = [...free, ...order.filter((item) => !free.includes(item))];
  return picked.slice(0, count);
}

/** スロットに入る画像を解決する。アセット未登録でも参照切れで壊れない（第5章 5-1）。 */
export function resolveSlot(
  slot: ImageSlot,
  workspace: Workspace,
  portfolio: PortfolioWork[],
  assets: Record<string, Asset>,
  /** 他の枠が明示的に選んだ項目。既定割当はこれを避ける（第9章 工程N-3）。 */
  claimed: ReadonlySet<string> = new Set(),
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
      return take(workspace.moodboard, slot, picks, claimed).map((tile) =>
        withFocus({
          key: `${slot.id}-${tile.id}`,
          caption: tile.caption,
          asset: resolveAsset(assets, tile.assetId),
          fallback: { from: tile.from, to: tile.to },
        }),
      );
    case 'shots':
      return take(workspace.shots, slot, picks, claimed).map((shot) =>
        withFocus({
          key: `${slot.id}-${shot.id}`,
          // キャプションは識別子だけにする。被写体・レンズ・構図は本文が持っており、
          // 枠の下に同じ文を並べると面が二重帳簿になる（第8章 8-7）。
          caption: `Cut ${shot.no}`,
          asset: resolveAsset(assets, shot.assetId),
        }),
      );
    case 'competitors':
      return take(workspace.competitors, slot, picks, claimed).map((competitor) =>
        withFocus({
          key: `${slot.id}-${competitor.id}`,
          caption: competitor.name,
          asset: resolveAsset(assets, competitor.assetId),
        }),
      );
    case 'portfolio':
      return take(portfolio, slot, picks, claimed).map((work) =>
        withFocus({
          key: `${slot.id}-${work.id}`,
          caption: work.title,
          asset: resolveAsset(assets, work.assetId),
          fallback: { from: work.from, to: work.to },
        }),
      );
  }
}

/**
 * 明示的に選ばれた項目のID（第9章 工程N-3）。
 *
 * 既定割当がこれを避けるための材料。**選択（`picks`）だけを集める**——既定で入った
 * ものまで避けると、供給元が少ないときに枠が空く。
 */
export function claimedItemIds(workspace: Workspace): Set<string> {
  return new Set(Object.values(workspace.picks ?? {}).flat());
}
