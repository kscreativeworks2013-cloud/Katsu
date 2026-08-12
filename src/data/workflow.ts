import type { ExportFormat, Language, ProjectStatus, PromptTarget } from './types';

// ステップ定義（順序・依存・出力フィールド）と状態語彙は src/domain/steps.ts にある。
// この module は案件・出力まわりの表示用ラベルと選択肢だけを持つ。

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  draft: '下書き',
  in_progress: '進行中',
  review: '確認待ち',
  delivered: '納品済み',
};

export const LANGUAGE_LABEL: Record<Language, string> = {
  ja: '日本語',
  en: '英語',
  both: '日本語＋英語',
};

export const EXPORT_FORMAT_LABEL: Record<ExportFormat, string> = {
  pdf: 'PDF',
  pptx: 'PowerPoint',
  docx: 'Word',
  md: 'Markdown',
};

/** 画面にモデル名を固定しないため、ここではAI種別のみを持つ（実モデルは設定画面で割り当て）。 */
export const PROMPT_TARGETS: { id: PromptTarget; label: string; kind: 'text' | 'image' }[] = [
  { id: 'chatgpt', label: 'ChatGPT', kind: 'text' },
  { id: 'claude', label: 'Claude', kind: 'text' },
  { id: 'gemini', label: 'Gemini系', kind: 'text' },
  { id: 'imagefx', label: 'ImageFX', kind: 'image' },
  { id: 'midjourney', label: 'Midjourney', kind: 'image' },
  { id: 'flux', label: 'Flux', kind: 'image' },
];

export const GENRES = [
  'ビューティー',
  'スキンケア',
  'メイク',
  'フレグランス',
  'ファッション',
  'ジュエリー',
] as const;

export const PURPOSES = ['広告', 'SNS', 'EC', '雑誌', 'OOH', 'Web', '動画'] as const;

/** 第2章「生成オプション」。新規案件では主要項目を既定でオンにする。 */
export const OUTPUT_OPTIONS = [
  'ブランド分析',
  '競合分析',
  'コンセプト',
  'ムードボード',
  'ショットリスト',
  '絵コンテ',
  'ライティングプラン',
  'スケジュール',
  '見積もり',
  '日本語提案書',
  '英語Proposal',
  'PDF',
  'PowerPoint',
  'Word',
  'Markdown',
] as const;

export const DEFAULT_OUTPUTS: string[] = [
  'ブランド分析',
  '競合分析',
  'コンセプト',
  'ムードボード',
  'ショットリスト',
  '日本語提案書',
  '英語Proposal',
  'PDF',
  'PowerPoint',
];

export const MOOD_CATEGORY_LABEL = {
  light: '光',
  texture: '質感',
  color: '色',
  composition: '構図',
} as const;
