/*
 * UI層のビューモデル。第2章の入力フォーマットと第3章の各画面が必要とする形だけを定義する。
 * 永続化を伴う正式なデータモデルは次フェーズ（データモデル設計）で別途定義し、
 * ここはその移行までの暫定型として扱う。
 */

/** 案件内ワークフローの8ステップ（第3章 ワークフローステッパー）。 */
export type StepId =
  | 'brand'
  | 'competitors'
  | 'concepts'
  | 'moodboard'
  | 'shots'
  | 'prompts'
  | 'proposal'
  | 'export';

export type StepStatus = 'todo' | 'in_progress' | 'done';

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
  steps: Record<StepId, StepStatus>;
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
  /** 手動で編集された項目。再生成時の上書き確認に使う。 */
  editedFields: string[];
}

export interface Competitor {
  id: string;
  name: string;
  position: string;
  visual: string;
  tone: string;
  strength: string;
  weakness: string;
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
  adopted: boolean;
}

export type MoodCategory = 'light' | 'texture' | 'color' | 'composition';

export interface MoodTile {
  id: string;
  category: MoodCategory;
  caption: string;
  source: string;
  from: string;
  to: string;
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
}

export interface ExportRecord {
  id: string;
  fileName: string;
  format: ExportFormat;
  language: Language;
  createdAt: string;
}

/** 案件ごとの生成物。未生成の項目は undefined／空配列で「空状態」を表す。 */
export interface Workspace {
  brand?: BrandAnalysis;
  competitors: Competitor[];
  differentiators: Differentiator[];
  concepts: Concept[];
  moodboard: MoodTile[];
  shots: Shot[];
  prompts: Partial<Record<PromptTarget, string>>;
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
