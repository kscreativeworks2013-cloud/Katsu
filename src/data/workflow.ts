import type {
  ExportFormat,
  Language,
  ProjectStatus,
  PromptTarget,
  StepId,
  StepStatus,
} from './types';

/** 第3章 ワークフローステッパーの8ステップ。並び順がそのまま画面順。 */
export const WORKFLOW_STEPS: { id: StepId; label: string; segment: string }[] = [
  { id: 'brand', label: 'ブランド分析', segment: 'brand' },
  { id: 'competitors', label: '競合分析', segment: 'competitors' },
  { id: 'concepts', label: 'コンセプト', segment: 'concepts' },
  { id: 'moodboard', label: 'ムードボード', segment: 'moodboard' },
  { id: 'shots', label: 'ショットリスト／絵コンテ', segment: 'shots' },
  { id: 'prompts', label: 'AIプロンプト', segment: 'prompts' },
  { id: 'proposal', label: '提案書プレビュー', segment: 'proposal' },
  { id: 'export', label: '出力', segment: 'export' },
];

export const STEP_STATUS_LABEL: Record<StepStatus, string> = {
  todo: '未着手',
  in_progress: '進行中',
  done: '完了',
};

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

/** 提案書の章立て（第3章 3-10）。 */
export const PROPOSAL_SECTIONS: { id: string; ja: string; en: string }[] = [
  { id: 'cover', ja: '表紙', en: 'Cover' },
  { id: 'brand', ja: 'ブランド分析', en: 'Brand Analysis' },
  { id: 'competitors', ja: '競合分析', en: 'Competitive Landscape' },
  { id: 'concept', ja: '撮影コンセプト', en: 'Creative Concept' },
  { id: 'moodboard', ja: 'ムードボード', en: 'Mood Board' },
  { id: 'shots', ja: 'ショットリスト', en: 'Shot List' },
  { id: 'lighting', ja: 'ライティングプラン', en: 'Lighting Plan' },
  { id: 'staff', ja: 'スタッフ構成', en: 'Crew' },
  { id: 'schedule', ja: 'スケジュール', en: 'Schedule' },
  { id: 'budget', ja: '見積もり', en: 'Budget' },
  { id: 'risk', ja: 'リスク管理', en: 'Risk Management' },
];

export const MOOD_CATEGORY_LABEL = {
  light: '光',
  texture: '質感',
  color: '色',
  composition: '構図',
} as const;
