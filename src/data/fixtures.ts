/*
 * UIフェーズのシードデータ。永続化層が入るまでの表示用サンプルで、
 * 実データはデータモデル設計フェーズで置き換える。
 */

import { emptyWorkspace, fullWorkspace } from './generate';
import type { PortfolioWork, Project, Settings, StepId, StepStatus, Workspace } from './types';

/** 納期が常に「近い将来」に見えるよう、起動時の日付からの相対で組み立てる。 */
function isoInDays(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function steps(done: StepId[], inProgress: StepId[] = []): Record<StepId, StepStatus> {
  const all: StepId[] = [
    'brand',
    'competitors',
    'concepts',
    'moodboard',
    'shots',
    'prompts',
    'proposal',
    'export',
  ];
  return Object.fromEntries(
    all.map((id) => [
      id,
      done.includes(id) ? 'done' : inProgress.includes(id) ? 'in_progress' : 'todo',
    ]),
  ) as Record<StepId, StepStatus>;
}

const maison: Project = {
  id: 'prj-maison',
  name: 'ホリデーコレクション 2026 キービジュアル',
  client: '株式会社メゾン・ルミエール',
  brand: 'MAISON LUMIÈRE',
  genre: 'スキンケア',
  purposes: ['広告', 'SNS', 'OOH'],
  proposalDate: isoInDays(-6),
  dueDate: isoInDays(5),
  budget: 4_800_000,
  language: 'both',
  status: 'in_progress',
  brandUrl: 'https://example.com/maison-lumiere',
  brandConcept: '光をまとう肌。過剰を削ぎ、素材の質で語る。',
  targetCustomer: '都市部在住・35〜48歳・自分の判断で選ぶ層',
  competitorNames: ['LA SÉRÉNITÉ', 'ATELIER NOIR', 'KŌHAKU'],
  productName: 'セラム オールージュ',
  keywords: ['静謐', '透明感', '余白', '斜光'],
  mustCuts: ['商品単体（正面）', 'モデル使用シーン', 'テクスチャー寄り'],
  ngNotes: ['過度なレタッチによる質感の消失', '寒色系の強い色被り'],
  references: ['ブランドガイドライン2026.pdf', 'ロゴ_AI入稿.ai', '前季ビジュアル一式'],
  creative: {
    worldview: '朝の斜光が差す静かな室内。時間が止まったような気配。',
    palette: ['#12100E', '#F3ECE2', '#B3936A', '#8A6A4F'],
    lighting: '面光源＋レフ1枚、黒フラッグで締める',
    lens: '100mm macro / 85mm',
    composition: '中央配置、余白は画面の1/3',
    staging: '所作は最小限、静物と交互に配置',
    texture: 'マットな肌質と微細なハイライト',
    retouch: '毛穴と産毛は残す。色被りのみ補正。',
  },
  production: {
    shootDays: 2,
    location: '都内スタジオ（自然光）＋ロケ1日',
    models: 1,
    hairMakeup: 'ナチュラル／艶感重視',
    stylist: '衣装2型＋小物',
    gear: '中判デジタル、三脚固定、定常光',
    delivery: 'RAW＋レタッチ済みTIFF、SNS用リサイズ',
  },
  outputs: [
    'ブランド分析',
    '競合分析',
    'コンセプト',
    'ムードボード',
    'ショットリスト',
    '日本語提案書',
    '英語Proposal',
    'PDF',
    'PowerPoint',
  ],
  steps: steps(['brand', 'competitors', 'concepts', 'moodboard'], ['shots']),
  updatedAt: isoInDays(-1),
};

const aurelia: Project = {
  id: 'prj-aurelia',
  name: 'フレグランス新香調 ローンチ広告',
  client: 'AURELIA JAPAN 株式会社',
  brand: 'AURELIA',
  genre: 'フレグランス',
  purposes: ['広告', '雑誌', 'Web'],
  proposalDate: isoInDays(-20),
  dueDate: isoInDays(19),
  budget: 7_200_000,
  language: 'both',
  status: 'review',
  brandUrl: 'https://example.com/aurelia',
  brandConcept: '夜気をまとう香り。輪郭より気配を描く。',
  targetCustomer: '28〜40歳・都市生活者・自分のための贅沢',
  competitorNames: ['NOIR ET OR', 'VERRE', 'SAKURA ATELIER'],
  productName: 'オード パルファン ニュイ',
  keywords: ['夜気', '硝子', '反射', '官能'],
  mustCuts: ['ボトル単体', '香りの気配を示すイメージ'],
  ngNotes: ['人物の顔の全面露出', 'アルコール表現の直接描写'],
  references: ['ブランドブック.pdf', '香調資料'],
  creative: {
    worldview: '夜の水面。硝子と液体の反射だけで語る。',
    palette: ['#0B0D12', '#E8E2D9', '#7E8FA6', '#C0A15E'],
    lighting: 'スポット＋鏡面反射、深いシャドウ',
    lens: '120mm macro',
    composition: '対角線構図、被写体は画面の1/4',
    staging: '静物中心、手元のみ人物',
    texture: '硝子の透過と結露',
    retouch: '反射のコントロールのみ。合成は最小限。',
  },
  production: {
    shootDays: 1,
    location: '都内スタジオ（暗転可）',
    models: 1,
    hairMakeup: '手元のみ／ネイル指定あり',
    stylist: '小物・什器のみ',
    gear: '中判デジタル、ストロボ、反射制御用什器',
    delivery: 'レタッチ済みTIFF、雑誌入稿用CMYK',
  },
  outputs: [
    'ブランド分析',
    '競合分析',
    'コンセプト',
    'ムードボード',
    'ショットリスト',
    '見積もり',
    '日本語提案書',
    '英語Proposal',
    'PDF',
  ],
  steps: steps(
    ['brand', 'competitors', 'concepts', 'moodboard', 'shots', 'prompts'],
    ['proposal'],
  ),
  updatedAt: isoInDays(-3),
};

const kohaku: Project = {
  id: 'prj-kohaku',
  name: 'リップ新色 SNSキャンペーン',
  client: '琥珀化粧品株式会社',
  brand: 'KŌHAKU',
  genre: 'メイク',
  purposes: ['SNS', 'EC'],
  proposalDate: isoInDays(-1),
  dueDate: isoInDays(32),
  budget: 1_900_000,
  language: 'ja',
  status: 'draft',
  brandUrl: '',
  brandConcept: '',
  targetCustomer: '',
  competitorNames: [],
  productName: 'リップ グレイズ 新3色',
  keywords: ['発色', '艶'],
  mustCuts: [],
  ngNotes: [],
  references: [],
  creative: {
    worldview: '',
    palette: [],
    lighting: '',
    lens: '',
    composition: '',
    staging: '',
    texture: '',
    retouch: '',
  },
  production: {
    shootDays: 1,
    location: '',
    models: 2,
    hairMakeup: '',
    stylist: '',
    gear: '',
    delivery: '',
  },
  outputs: ['ブランド分析', 'コンセプト', 'ショットリスト', '日本語提案書', 'PDF'],
  steps: steps([]),
  updatedAt: isoInDays(-1),
};

export const seedProjects: Project[] = [maison, aurelia, kohaku];

export const seedWorkspaces: Record<string, Workspace> = {
  [maison.id]: fullWorkspace(maison, 0),
  [aurelia.id]: {
    ...fullWorkspace(aurelia, 1),
    exports: [
      {
        id: 'exp-1',
        fileName: 'AURELIA_Proposal_JA.pdf',
        format: 'pdf',
        language: 'ja',
        createdAt: isoInDays(-3),
      },
      {
        id: 'exp-2',
        fileName: 'AURELIA_Proposal_EN.pptx',
        format: 'pptx',
        language: 'en',
        createdAt: isoInDays(-3),
      },
    ],
  },
  [kohaku.id]: emptyWorkspace(),
};

export const seedPortfolio: PortfolioWork[] = [
  {
    id: 'wrk-1',
    title: 'Morning Silk',
    client: 'MAISON LUMIÈRE',
    genre: 'スキンケア',
    year: 2025,
    tags: ['斜光', '静物', 'マクロ'],
    from: '#E8DFD2',
    to: '#B3936A',
  },
  {
    id: 'wrk-2',
    title: 'Nuit Blanche',
    client: 'AURELIA',
    genre: 'フレグランス',
    year: 2025,
    tags: ['硝子', '反射', '暗転'],
    from: '#1B1F27',
    to: '#7E8FA6',
  },
  {
    id: 'wrk-3',
    title: 'Bare Pigment',
    client: 'KŌHAKU',
    genre: 'メイク',
    year: 2024,
    tags: ['発色', 'クローズアップ'],
    from: '#C6786F',
    to: '#F0DED4',
  },
  {
    id: 'wrk-4',
    title: 'Atelier Hands',
    client: 'VERRE',
    genre: 'ジュエリー',
    year: 2024,
    tags: ['手元', '所作', '自然光'],
    from: '#D8D2C6',
    to: '#8A8279',
  },
  {
    id: 'wrk-5',
    title: 'Second Skin',
    client: 'LA SÉRÉNITÉ',
    genre: 'スキンケア',
    year: 2023,
    tags: ['質感', 'マクロ', 'マット'],
    from: '#EFE7DC',
    to: '#C9AE8C',
  },
  {
    id: 'wrk-6',
    title: 'Winter Editorial',
    client: 'ATELIER NOIR',
    genre: 'ファッション',
    year: 2023,
    tags: ['ロケ', '曇天', '引き'],
    from: '#B9BDC0',
    to: '#5F6469',
  },
];

/**
 * 既定の設定。モデル名は「別名 → モデル」の割り当てとして持ち、
 * 画面やコードには固定しない（第3章 3-13）。
 */
export const defaultSettings: Settings = {
  models: [
    {
      id: 'mdl-1',
      alias: 'text-primary',
      purpose: '文章生成（提案書・分析）',
      model: 'claude-opus-5',
    },
    { id: 'mdl-2', alias: 'text-fast', purpose: '要約・下書き', model: 'claude-haiku-4-5' },
    {
      id: 'mdl-3',
      alias: 'image-primary',
      purpose: '画像生成（ムードボード）',
      model: 'imagefx-latest',
    },
    { id: 'mdl-4', alias: 'translate', purpose: '日英翻訳', model: 'gpt-5.1' },
  ],
  defaultLanguage: 'both',
  company: 'KS Creative Works',
  owner: '写真家／クリエイティブディレクター',
  contact: 'studio@example.com',
  rates: { dayRate: 350_000, gear: 120_000, studio: 180_000, retouch: 25_000 },
};
