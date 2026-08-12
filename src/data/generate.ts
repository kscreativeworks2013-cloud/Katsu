/*
 * 生成物の組み立て。第2章のAIワークフロー各ステップに対応する関数を並べている。
 * 案件の入力値から決定的に組み立てる（同じ入力なら常に同じ結果）ため、
 * 実モデル接続後もテストダブル（src/engine/mockEngine.ts）の中身として恒久的に使う。
 * 第4章 4-6 のとおり、このファイルは削除しない。
 */

import { adoptedConcept } from '../domain/steps';
import type {
  BrandAnalysis,
  Competitor,
  Concept,
  Differentiator,
  MoodTile,
  Project,
  PromptTarget,
  Provenance,
  Shot,
  Workspace,
} from './types';

const FALLBACK_PALETTE = ['#12100E', '#F3ECE2', '#B3936A', '#7C6A58'];

function paletteOf(project: Project): string[] {
  return project.creative.palette.length > 0 ? project.creative.palette : FALLBACK_PALETTE;
}

/** ステップ3：ブランドの世界観・トーン・ターゲット・ビジュアルコードを抽出する。 */
export function generateBrand(project: Project): BrandAnalysis {
  const palette = paletteOf(project);
  const names = ['ベース', 'アクセント', 'ハイライト', 'シャドウ', 'サブ', 'サブ2'];
  return {
    worldview:
      project.creative.worldview ||
      `${project.brand}が持つ静けさと余白を軸に、${project.genre}の質感を主役に据えた世界観。`,
    tone: `抑制的で品位のあるトーン。装飾を足さず、光と質感の階調で${project.brand}らしさを語る。`,
    target: project.targetCustomer || '都市部在住・30〜45歳・本質志向の顧客層',
    visualCodes: [
      project.creative.lighting || '面光源による柔らかい階調',
      project.creative.composition || '中央配置と広い余白',
      project.creative.texture || 'マットな肌質と微細なハイライト',
      `${project.genre}特有のディテール描写`,
    ],
    keywords:
      project.keywords.length > 0 ? project.keywords : ['静謐', '余白', '透明感', '品位'],
    palette: palette.map((hex, index) => ({ name: names[index] ?? `カラー${index + 1}`, hex })),
    constraints:
      project.ngNotes.length > 0
        ? project.ngNotes
        : ['過度なレタッチによる質感の消失', 'ブランドカラー以外の強い色の使用'],
  };
}

/** ステップ4：競合ブランドの分析と差別化ポイントの整理。 */
export function generateCompetitors(project: Project): {
  competitors: Competitor[];
  differentiators: Differentiator[];
} {
  const names =
    project.competitorNames.length > 0
      ? project.competitorNames
      : ['Competitor A', 'Competitor B', 'Competitor C'];

  const profiles = [
    {
      position: 'クラシックな正統派',
      visual: 'centered still life、硬めの陰影',
      tone: '権威と伝統',
      strength: '認知度と一貫性',
      weakness: '新規顧客への訴求力',
      x: 0.2,
      y: 0.35,
    },
    {
      position: 'モダンミニマル',
      visual: 'フラットな面光源、無彩色背景',
      tone: '知的で軽い',
      strength: 'SNSでの拡散力',
      weakness: '高価格帯での説得力',
      x: 0.72,
      y: 0.25,
    },
    {
      position: 'ドラマティック',
      visual: '強いスポットと深い影',
      tone: '官能的',
      strength: '記憶に残る画作り',
      weakness: '商品ディテールの視認性',
      x: 0.6,
      y: 0.82,
    },
  ];

  const competitors = names.slice(0, 3).map((name, index) => ({
    id: `cmp-${index + 1}`,
    name,
    ...profiles[index % profiles.length],
  }));

  const differentiators: Differentiator[] = [
    {
      id: 'dif-1',
      text: `質感の解像度で差をつける（${project.creative.texture || 'マットな肌質'}）`,
      adopted: true,
    },
    { id: 'dif-2', text: '装飾を足さず、光の階調だけで高級感を作る', adopted: true },
    { id: 'dif-3', text: `${project.genre}の使用シーンを生活文脈に置く`, adopted: false },
  ];

  return { competitors, differentiators };
}

/** ステップ5：撮影コンセプトを3案生成する。採用は利用者が選ぶ。 */
export function generateConcepts(project: Project): Concept[] {
  const base = project.creative.worldview || `${project.brand}の静けさ`;
  return [
    {
      id: 'cpt-1',
      title: 'Quiet Light',
      aim: `${project.brand}の${project.genre}を、光の階調だけで語る。`,
      story: `朝の斜光が差す室内。${project.productName || '商品'}に触れる手元から始まり、肌の質感へ寄っていく。`,
      direction: '面光源＋レフ1枚。無彩色背景に暖色の反射を1点だけ置く。',
      keywords: ['静謐', '斜光', '余白'],
      cutCount: 12,
    },
    {
      id: 'cpt-2',
      title: 'Second Skin',
      aim: '肌と製品の境界を消し、質感の連続として見せる。',
      story: `${base}を近接描写で捉え、粒子とハイライトの粗密でリズムを作る。`,
      direction: 'マクロ中心。ハイライトは硬め、シャドウは持ち上げてマットに。',
      keywords: ['質感', 'マクロ', '透明感'],
      cutCount: 14,
    },
    {
      id: 'cpt-3',
      title: 'Still Ceremony',
      aim: '使用行為を儀式として様式化し、ブランドの品位を可視化する。',
      story: '静物と所作を交互に配置し、1枚ごとに時間が進むシークエンスにする。',
      direction: '固定カメラ、シンメトリー構図。色数を3色に絞る。',
      keywords: ['儀式', '様式', 'シンメトリー'],
      cutCount: 10,
    },
  ];
}

/** ステップ6：ムードボード構成案（光・質感・色・構図の4章立て）。 */
export function generateMoodboard(project: Project): MoodTile[] {
  const palette = paletteOf(project);
  const pick = (index: number) => palette[index % palette.length];
  const rows: { category: MoodTile['category']; caption: string; source: string }[] = [
    { category: 'light', caption: '朝の斜光／窓越しの拡散光', source: 'AI生成' },
    { category: 'light', caption: '面光源＋黒フラッグの引き締め', source: 'ライティング参考' },
    { category: 'texture', caption: 'マットな肌と微細なハイライト', source: 'AI生成' },
    { category: 'texture', caption: 'ガラスと液体の透過', source: '過去作品' },
    {
      category: 'color',
      caption: `ブランドカラー ${pick(2)} を差し色に`,
      source: 'ブランドガイドライン',
    },
    { category: 'color', caption: '無彩色ベース＋暖色1点', source: 'AI生成' },
    { category: 'composition', caption: '中央配置＋広い余白', source: 'AI生成' },
    { category: 'composition', caption: '手元のクローズアップ', source: '過去作品' },
  ];
  return rows.map((row, index) => ({
    id: `mood-${index + 1}`,
    ...row,
    from: pick(index),
    to: pick(index + 2),
  }));
}

/** ステップ7・8：ショットリストと絵コンテの元になるカット一覧。 */
export function generateShots(project: Project): Shot[] {
  const must =
    project.mustCuts.length > 0 ? project.mustCuts : ['商品単体', 'モデル使用シーン'];
  const generated: Shot[] = must.map((cut, index) => ({
    id: `shot-${index + 1}`,
    no: index + 1,
    subject: cut,
    description: `${cut}を主役に、${project.creative.lighting || '面光源'}で質感を出す。`,
    lens: index % 2 === 0 ? '100mm macro' : '85mm',
    lighting: project.creative.lighting || '面光源＋レフ',
    composition: project.creative.composition || '中央配置／余白多め',
    volume: '3〜5枚',
    priority: 'must',
    note: '必須カット',
  }));

  const extras: Omit<Shot, 'id' | 'no'>[] = [
    {
      subject: 'テクスチャー',
      description: 'クリームの伸び／粒子のマクロ描写。',
      lens: '100mm macro',
      lighting: 'サイド光＋黒フラッグ',
      composition: '画面いっぱいの寄り',
      volume: '4枚',
      priority: 'want',
      note: 'SNS縦位置も同時に押さえる',
    },
    {
      subject: '手元の所作',
      description: '製品に触れる手のカット。時間の経過を示す。',
      lens: '50mm',
      lighting: '窓光のみ',
      composition: '対角線構図',
      volume: '3枚',
      priority: 'want',
      note: '',
    },
    {
      subject: 'イメージカット',
      description: '世界観提示用の引き。OOH想定で横位置。',
      lens: '35mm',
      lighting: '自然光',
      composition: '余白多め／左寄せ',
      volume: '2枚',
      priority: 'option',
      note: 'コピー配置の余白を確保',
    },
  ];

  return [
    ...generated,
    ...extras.map((shot, index) => ({
      ...shot,
      id: `shot-${generated.length + index + 1}`,
      no: generated.length + index + 1,
    })),
  ];
}

/** ステップ11：AI別にプロンプトを最適化する。文章系と画像系で構造を変える。 */
export function generatePrompt(
  project: Project,
  workspace: Workspace,
  target: PromptTarget,
  shot?: Shot,
): string {
  const concept = adoptedConcept(workspace) ?? workspace.concepts[0];
  const palette = paletteOf(project).join(', ');
  const subject = shot?.subject ?? project.productName ?? project.genre;
  const lighting = shot?.lighting ?? project.creative.lighting ?? 'soft diffused light';
  const lens = shot?.lens ?? project.creative.lens ?? '100mm macro';
  const composition =
    shot?.composition ?? project.creative.composition ?? 'centered, generous negative space';
  const mood = concept?.title ?? project.creative.worldview ?? 'quiet luxury';

  const visual = [
    `luxury ${project.genre} advertising photograph of ${subject}`,
    `for ${project.brand}`,
    `mood: ${mood}`,
    `lighting: ${lighting}`,
    `lens: ${lens}`,
    `composition: ${composition}`,
    `texture: ${project.creative.texture || 'matte skin, fine highlights'}`,
    `color palette: ${palette}`,
    'editorial finish, no heavy retouching, high dynamic range in the shadows',
  ].join(', ');

  switch (target) {
    case 'chatgpt':
      return [
        '# Role',
        `You are the creative director for a ${project.genre} campaign by ${project.brand}.`,
        '',
        '# Context',
        `- Client: ${project.client}`,
        `- Concept: ${concept?.title ?? '-'} / ${concept?.aim ?? '-'}`,
        `- Visual codes: ${workspace.brand?.visualCodes.join(' / ') ?? '-'}`,
        `- Constraints: ${workspace.brand?.constraints.join(' / ') ?? '-'}`,
        '',
        '# Task',
        `Write the art direction note for cut ${shot?.no ?? 1} (${subject}).`,
        'Cover: intent, framing, lighting diagram in words, styling, retouching policy.',
        '',
        '# Output',
        'Japanese, 300-400 characters, no bullet lists.',
      ].join('\n');
    case 'claude':
      return [
        '<context>',
        `  <brand>${project.brand}</brand>`,
        `  <client>${project.client}</client>`,
        `  <concept>${concept?.title ?? '-'}: ${concept?.story ?? '-'}</concept>`,
        `  <visual_codes>${workspace.brand?.visualCodes.join(', ') ?? '-'}</visual_codes>`,
        `  <ng>${project.ngNotes.join(', ') || 'none'}</ng>`,
        '</context>',
        '',
        '<task>',
        `  カット${shot?.no ?? 1}「${subject}」のアートディレクション指示を書く。`,
        '  ライティング、レンズ、構図、スタイリング、レタッチ方針を含める。',
        '</task>',
        '',
        '<output_format>日本語／300〜400字／散文</output_format>',
      ].join('\n');
    case 'gemini':
      return [
        `目的: ${project.brand}の${project.genre}広告カット「${subject}」の演出指示を作る。`,
        `コンセプト: ${concept?.title ?? '-'}（${concept?.direction ?? '-'}）`,
        `条件: ${lighting} / ${lens} / ${composition}`,
        `禁止: ${project.ngNotes.join('、') || 'なし'}`,
        '出力: 日本語の散文で300〜400字。撮影当日に読める具体性で書く。',
      ].join('\n');
    case 'imagefx':
      return `${visual}. Photorealistic, shot on medium format, no text, no logo.`;
    case 'midjourney':
      return `${visual} --ar 4:5 --style raw --stylize 150 --no text, watermark, logo`;
    case 'flux':
      return `${visual}. Ultra detailed skin texture, natural color grading, 8k, no text overlay.`;
  }
}

/** 案件作成直後の空のワークスペース。 */
export function emptyWorkspace(): Workspace {
  return {
    competitors: [],
    differentiators: [],
    concepts: [],
    adoptedConceptId: null,
    moodboard: [],
    shots: [],
    prompts: {},
    proposalBody: {},
    exports: [],
  };
}

/**
 * 生成済みの案件（シードデータ）用に、全ステップ分をまとめて組み立てる。
 * シードも実行時の生成と同じく provenance を持つ。持たないと、シード案件に対する
 * 再生成が「未生成からの生成」と区別できなくなる。
 */
export function fullWorkspace(
  project: Project,
  adoptedConceptIndex = 0,
  runId = `run-seed-${project.id}`,
  at = new Date().toISOString(),
): { workspace: Workspace; provenance: Provenance } {
  const { competitors, differentiators } = generateCompetitors(project);
  const concepts = generateConcepts(project);
  const brand = generateBrand(project);
  const moodboard = generateMoodboard(project);
  const shots = generateShots(project);

  const workspace: Workspace = {
    brand,
    competitors,
    differentiators,
    concepts,
    adoptedConceptId: concepts[adoptedConceptIndex]?.id ?? null,
    moodboard,
    shots,
    prompts: {},
    proposalBody: {},
    exports: [],
  };

  const generatedPaths = [
    'brand.worldview',
    'brand.tone',
    'brand.target',
    'brand.visualCodes',
    'brand.keywords',
    'brand.palette',
    'brand.constraints',
    'competitors.list',
    'competitors.differentiators',
    'concepts.list',
    'moodboard.tiles',
    'shots.list',
  ];

  return {
    workspace,
    provenance: Object.fromEntries(
      generatedPaths.map((path) => [
        path,
        { origin: 'generated' as const, runId, updatedAt: at },
      ]),
    ),
  };
}
