/*
 * ビューモデルと、第4章のデータモデル（provenance／Run／StepRecord）。
 * 生成物は「値」と「その値がどこから来たか」を分けて持つ。上書き可否と差分提示は
 * すべて provenance を根拠に決まる（第4章 4-1、4-3）。
 */

import type { StepStatus as StepStatusValue } from '../domain/steps';

/** 案件内ワークフローのステップ。第4章 4-8 のとおり、この構成は暫定で変更を許容する。 */
export type StepId =
  | 'brand'
  | 'competitors'
  | 'concepts'
  | 'moodboard'
  | 'shots'
  | 'prompts'
  | 'proposal'
  | 'export';

// ステップの状態語彙はステップ定義と同じ場所（domain/steps.ts）が持つ。
// ここでは StepRecord のために取り込み、既存の参照のために再エクスポートする。
export type { StepStatus } from '../domain/steps';

/** フィールドの出自。第4章 4-1。 */
export type FieldOrigin = 'generated' | 'edited' | 'empty';

export interface FieldMeta {
  origin: FieldOrigin;
  /** そのフィールドを書いた生成ラインID。手動編集時は編集直前の runId を保持する。 */
  runId: string | null;
  updatedAt: string;
}

/** フィールドパス（例 'brand.tone'、'shots.list'）をキーにしたメタデータ。 */
export type Provenance = Record<string, FieldMeta>;

export type RunStatus = 'running' | 'applied' | 'discarded' | 'failed';

export interface Run {
  id: string;
  projectId: string;
  stepId: StepId;
  startedAt: string;
  finishedAt: string | null;
  status: RunStatus;
  /** 生成に使った入力の要約。上流変更の検知に使う。 */
  inputsHash: string;
  /** 使用したエンジン識別子（実モデル／テストダブル）。 */
  engine: string;
  /** 適用したフィールドパス。applied のときのみ。 */
  appliedFields?: string[];
}

export interface StepRecord {
  status: StepStatusValue;
  lastRunId: string | null;
  /** 上流の再生成により内容が古い可能性がある状態。データは無効化しない（第4章 4-4）。 */
  stale: boolean;
  staleSince?: string;
  staleCause?: StepId;
  /** 「確認したが再生成不要」の記録。次に上流が変化したら破棄され、再び stale に戻る。 */
  staleAcknowledgedAt?: string;
  staleAcknowledgedCause?: StepId;
}

/** 画像アセットの出自（第5章 5-1）。AI生成か持ち込みかはアセット自身が持つ。 */
export type AssetOrigin = 'upload' | 'external' | 'ai';

/** 実体の種類（第7章 7-5）。original が主で、preview はそこから作る派生物。 */
export type VariantKind = 'original' | 'preview';

/**
 * 実体の記述子。実体そのもの（Blob）は AssetBinaryStore にあり、
 * localStorage にはこの記述子だけが載る（第7章 7-4）。
 */
export interface AssetVariant {
  kind: VariantKind;
  /** AssetBinaryStore のキー。 */
  key: string;
  width: number;
  height: number;
  bytes: number;
  mimeType: string;
}

export interface Asset {
  id: string;
  origin: AssetOrigin;
  label: string;
  /** upload はファイル名、external は URL、ai は生成条件の要約。 */
  source: string;
  /** ai 生成のとき、そのアセットを作った生成ライン。 */
  runId: string | null;
  mimeType: string;
  createdAt: string;
  /**
   * 実体の記述子（第7章 7-4）。original・preview はそれぞれ0個または1個。
   * 記述子があるのに実体が取れない場合は消失（第7章 7-11）として扱う。
   */
  variants: AssetVariant[];
}

export type ProjectStatus = 'draft' | 'in_progress' | 'review' | 'delivered';

export type Language = 'ja' | 'en' | 'both';

export type ExportFormat = 'pdf' | 'pptx' | 'docx' | 'md';

/** 第2章「対応AI」。モデル名ではなく用途としてのAI種別を持ち、実モデルは設定画面で割り当てる。 */
export type PromptTarget = 'chatgpt' | 'claude' | 'gemini' | 'imagefx' | 'midjourney' | 'flux';

export interface Creative {
  worldview: string;
  palette: string[];
  lighting: string;
  lens: string;
  composition: string;
  staging: string;
  texture: string;
  retouch: string;
}

export interface Production {
  shootDays: number;
  location: string;
  models: number;
  hairMakeup: string;
  stylist: string;
  gear: string;
  delivery: string;
}

export interface Project {
  id: string;
  name: string;
  client: string;
  brand: string;
  genre: string;
  purposes: string[];
  proposalDate: string;
  dueDate: string;
  budget: number;
  language: Language;
  status: ProjectStatus;
  brandUrl: string;
  brandConcept: string;
  targetCustomer: string;
  competitorNames: string[];
  productName: string;
  keywords: string[];
  mustCuts: string[];
  ngNotes: string[];
  references: string[];
  creative: Creative;
  production: Production;
  outputs: string[];
  steps: Record<StepId, StepRecord>;
  updatedAt: string;
}

export interface BrandAnalysis {
  worldview: string;
  tone: string;
  target: string;
  visualCodes: string[];
  keywords: string[];
  palette: { name: string; hex: string }[];
  constraints: string[];
}

export interface Competitor {
  id: string;
  name: string;
  position: string;
  visual: string;
  tone: string;
  strength: string;
  weakness: string;
  /** 競合のビジュアル参照。未登録なら比較面ではプレースホルダになる（第8章 8-5）。 */
  assetId?: string | null;
  /** ポジショニングマップ座標。0=クラシック/ミニマル、1=モダン/ドラマティック。 */
  x: number;
  y: number;
}

export interface Differentiator {
  id: string;
  text: string;
  adopted: boolean;
}

export interface Concept {
  id: string;
  title: string;
  aim: string;
  story: string;
  direction: string;
  keywords: string[];
  cutCount: number;
}

export type MoodCategory = 'light' | 'texture' | 'color' | 'composition';

export interface MoodTile {
  id: string;
  category: MoodCategory;
  caption: string;
  source: string;
  from: string;
  to: string;
  /** 参照するアセット。未設定・解決不能時はグラデーションで代替する。 */
  assetId?: string | null;
}

export interface Shot {
  id: string;
  no: number;
  subject: string;
  description: string;
  lens: string;
  lighting: string;
  composition: string;
  volume: string;
  priority: 'must' | 'want' | 'option';
  note: string;
  /** 絵コンテのフレーム画像。未設定時はフレーム図で代替する。 */
  assetId?: string | null;
}

/** 章本文。日英を同一の構成データから導出する（第5章 5-2）。 */
export interface ProposalBody {
  ja: string[];
  en: string[];
}

export interface ExportRecord {
  id: string;
  fileName: string;
  format: ExportFormat;
  language: Language;
  createdAt: string;
  /** 出力元の Proposal IR の版（第6章 6-3）。どの版を出したかを後から照合できる。 */
  irRevision?: string;
  /** 実ファイルを書き出せたか。未対応形式は履歴のみ。 */
  rendered?: boolean;
  /**
   * 画像の解決状態（第7章 7-9）。revision は内容の版であって解決状態を含まないため、
   * 「同じ版でも中身の違うファイル」を見分けるにはこちらを見る。
   */
  assetResolution?: AssetResolution;
}

/** 出力時に各画像がどの実体で解決されたか（第7章 7-9）。 */
export interface AssetResolution {
  original: number;
  previewFallback: number;
  missing: number;
}

/**
 * 案件ごとの生成物。未生成の項目は undefined／空配列で「空状態」を表す。
 * adoptedConceptId は生成物ではなく利用者の選択なので、コンセプト再生成では保護対象にしない。
 */
export interface Workspace {
  brand?: BrandAnalysis;
  competitors: Competitor[];
  differentiators: Differentiator[];
  concepts: Concept[];
  adoptedConceptId: string | null;
  moodboard: MoodTile[];
  shots: Shot[];
  prompts: Partial<Record<PromptTarget, string>>;
  /**
   * 章IDをキーにした提案書本文。生成物なので provenance の管理下に置き、
   * 章単位で手動編集・保護できる。旧スキーマの保存状態には無いため任意。
   */
  proposalBody?: Partial<Record<string, ProposalBody>>;
  exports: ExportRecord[];
}

export interface PortfolioWork {
  id: string;
  title: string;
  client: string;
  genre: string;
  year: number;
  tags: string[];
  from: string;
  to: string;
  /** 作品画像のアセット。未設定時はグラデーションで代替する。 */
  assetId?: string | null;
}

/** モデル名を固定しないための用途別の割り当て（第3章 3-13）。 */
export interface ModelAssignment {
  id: string;
  alias: string;
  purpose: string;
  model: string;
}

export interface Settings {
  models: ModelAssignment[];
  defaultLanguage: Language;
  company: string;
  owner: string;
  contact: string;
  rates: { dayRate: number; gear: number; studio: number; retouch: number };
}
