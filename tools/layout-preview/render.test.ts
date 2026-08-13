import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  defaultSettings,
  seedPortfolio,
  seedProjects,
  seedWorkspaces,
} from '../../src/data/fixtures';
import { generateProposalBody } from '../../src/data/proposalBody';
import type { Asset, Workspace } from '../../src/data/types';
import { buildProposalIR, type ProposalIR } from '../../src/domain/ir';
import { ADOPTED_LAYOUT } from '../../src/domain/render/layout';
import { renderLayoutPdf } from '../../src/domain/render/pdfLayout';
import { loadTestFont } from '../../src/test/ir';

/*
 * 版面案3本を、同じ案件データから PDF に書き出す（第8章 (b)）。
 * 入力はモックエンジンの決定的な出力なので、版面だけが違う3本になる。
 *
 *   npx vitest run --config tools/layout-preview/vitest.config.ts
 *   → dist/layout-preview/*.pdf
 */

const OUT_DIR = 'dist/layout-preview';

function crc32(bytes: Uint8Array): number {
  let crc = ~0;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const body = new Uint8Array([...new TextEncoder().encode(type), ...data]);
  const out = new Uint8Array(body.length + 8);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(body, 4);
  view.setUint32(out.length - 4, crc32(body));
  return out;
}

/**
 * 写真の代わりに置くグラデーション。実写ではないが、面のどこを画像が占めるかは判定できる。
 * 版面の比較に必要なのは被写体ではなく、面積・トーン・並びの関係である。
 */
function gradientPng(
  width: number,
  height: number,
  from: [number, number, number],
  to: [number, number, number],
): string {
  const raw = new Uint8Array(height * (width * 3 + 1));
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < width; x += 1) {
      const t = (x / width) * 0.6 + (y / height) * 0.4;
      raw.set(
        [
          Math.round(from[0] + (to[0] - from[0]) * t),
          Math.round(from[1] + (to[1] - from[1]) * t),
          Math.round(from[2] + (to[2] - from[2]) * t),
        ],
        row + 1 + x * 3,
      );
    }
  }

  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  ihdr.set([8, 2, 0, 0, 0], 8);

  const png = new Uint8Array([
    ...[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    ...chunk('IHDR', ihdr),
    ...chunk('IDAT', new Uint8Array(deflateSync(Buffer.from(raw)))),
    ...chunk('IEND', new Uint8Array()),
  ]);
  return `data:image/png;base64,${Buffer.from(png).toString('base64')}`;
}

/**
 * 実写素材（あれば）。dist/layout-preview/photos/ に置いたファイルを名前順に使う。
 * 版面の最終判断は実写でしか下せないため、素材がある場合はそちらを優先する。
 */
function photos(): { name: string; dataUri: string; width: number; height: number }[] {
  const dir = `${OUT_DIR}/photos`;
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith('.jpg'))
    .sort()
    .map((name) => {
      const bytes = readFileSync(`${dir}/${name}`);
      // JPEG の SOF マーカーから寸法を読む（解像度警告の判定に実寸が要る）。
      let width = 0;
      let height = 0;
      for (let i = 2; i + 9 < bytes.length;) {
        if (bytes[i] !== 0xff) {
          i += 1;
          continue;
        }
        const marker = bytes[i + 1];
        const length = bytes.readUInt16BE(i + 2);
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
          height = bytes.readUInt16BE(i + 5);
          width = bytes.readUInt16BE(i + 7);
          break;
        }
        i += 2 + length;
      }
      return {
        name,
        dataUri: `data:image/jpeg;base64,${bytes.toString('base64')}`,
        width,
        height,
      };
    });
}

/** ブランドのトーンに寄せた見本。タイルごとに少しずつ振って、並べたときの差が見えるようにする。 */
const TONES: [number, number, number][][] = [
  [
    [236, 226, 212],
    [176, 146, 110],
  ],
  [
    [62, 56, 50],
    [148, 126, 104],
  ],
  [
    [214, 198, 186],
    [120, 92, 74],
  ],
  [
    [240, 236, 228],
    [198, 170, 132],
  ],
  [
    [92, 78, 70],
    [212, 188, 160],
  ],
  [
    [224, 210, 190],
    [96, 78, 62],
  ],
];

/**
 * 全スロットにアセットを結びつけた案件データ。版面の比較には画像が要る。
 * fill を渡すと、素材を複製してムードボード・ショットリストをその枚数まで埋める
 * （再配分ロジックを 3+3 と 3+2 の両方で確かめるため）。
 */
function projectWithImages(fill?: { tiles: number; cuts: number }): {
  workspace: Workspace;
  assets: Record<string, Asset>;
} {
  const project = seedProjects[0];
  const base = seedWorkspaces[project.id];
  const assets: Record<string, Asset> = {};
  const real = photos();

  const register = (
    id: string,
    index: number,
    size: { width: number; height: number },
    dataUri: string,
    origin: Asset['origin'] = 'upload',
  ): void => {
    assets[id] = {
      id,
      origin,
      label: id,
      source: `${id}.jpg`,
      runId: null,
      mimeType: 'image/jpeg',
      createdAt: '2026-08-01T00:00:00.000Z',
      variants: [
        {
          kind: 'original',
          key: `${id}:original`,
          width: size.width,
          height: size.height,
          bytes: dataUri.length,
          mimeType: 'image/jpeg',
        },
      ],
    };
    imageData[id] = dataUri;
    void index;
  };

  if (real.length > 0) {
    // 実写がある場合：ファイル名に shot を含むものはショットリスト、それ以外は
    // ムードボード（先頭は表紙のキービジュアルにもなる）。素材の無いタイルは落とす。
    const forShots = real.filter((photo) => photo.name.includes('shot'));
    const forMood = real.filter((photo) => !photo.name.includes('shot'));
    /** 枚数を指定数まで複製で埋める（既存アセットの複製で再配分を確かめる）。 */
    const pad = <T>(list: T[], count?: number): T[] =>
      count === undefined || list.length === 0
        ? list
        : Array.from({ length: count }, (_, index) => list[index % list.length]);

    const moodboard = pad(forMood, fill?.tiles).map((photo, index) => {
      const id = `ast-mood-${index}`;
      register(id, index, photo, photo.dataUri);
      return {
        ...base.moodboard[index % base.moodboard.length],
        id: `mood-${index}`,
        assetId: id,
      };
    });
    const shots = pad(forShots, fill?.cuts).map((photo, index) => {
      const id = `ast-shot-${index}`;
      register(id, index, photo, photo.dataUri);
      return { ...base.shots[index % base.shots.length], id: `shot-${index}`, assetId: id };
    });

    return {
      workspace: {
        ...base,
        proposalBody: generateProposalBody(project, base, seedPortfolio, defaultSettings),
        moodboard,
        shots,
        // 表紙は 3:2 の横位置を帯へ流すため、既定の上寄せでも帽子の天面が切れる。
        // スロット単位の切り出し指定（第8章 8-7）で上端を残す。
        crops: { 'cover-key-mood-0': { x: 0.5, y: 0 } },
      },
      assets,
    };
  }

  const make = (id: string, index: number, width: number, height: number): string => {
    const [from, to] = TONES[index % TONES.length];
    const dataUri = gradientPng(width, height, from, to);
    register(id, index, { width, height }, dataUri, index % 5 === 0 ? 'ai' : 'upload');
    return dataUri;
  };

  const workspace: Workspace = {
    ...base,
    proposalBody: generateProposalBody(project, base, seedPortfolio, defaultSettings),
    moodboard: base.moodboard.map((tile, index) => {
      const id = `ast-mood-${index}`;
      make(id, index, 640, 420);
      return { ...tile, assetId: id };
    }),
    shots: base.shots.map((shot, index) => {
      const id = `ast-shot-${index}`;
      make(id, index + 2, 640, 420);
      return { ...shot, assetId: id };
    }),
  };

  return { workspace, assets };
}

const imageData: Record<string, string> = {};

/** 解決フェーズの代わり。ストアを使わず、比較用の見本画像を IR に入れる。 */
function inject(ir: ProposalIR): ProposalIR {
  return {
    ...ir,
    sections: ir.sections.map((section) => ({
      ...section,
      blocks: section.blocks.map((block) =>
        block.type === 'image' && block.assetId && imageData[block.assetId]
          ? { ...block, data: imageData[block.assetId] }
          : block,
      ),
    })),
  };
}

async function write(name: string, fill?: { tiles: number; cuts: number }): Promise<void> {
  const project = seedProjects[0];
  const { workspace, assets } = projectWithImages(fill);
  const fontBytes = loadTestFont();

  const ir = inject(
    buildProposalIR({
      project,
      workspace,
      provenance: {},
      portfolio: seedPortfolio,
      assets,
      lang: 'ja',
      builtAt: new Date('2026-08-13T00:00:00.000Z'),
    }),
  );

  mkdirSync(OUT_DIR, { recursive: true });
  const bytes = await renderLayoutPdf(ir, { fontBytes });
  const path = `${OUT_DIR}/${name}.pdf`;
  writeFileSync(path, bytes);
  expect(bytes.length).toBeGreaterThan(5000);
  console.log(`${ADOPTED_LAYOUT.label}: ${path}（${Math.round(bytes.length / 1000)}KB）`);
}

describe('版面案の書き出し', () => {
  it('は採用版面の PDF を書き出す', async () => {
    await write(ADOPTED_LAYOUT.id);
  });

  // 素材の複製で満量（タイル6枚＝3+3、カット6本＝4+2ページ）にした状態。
  // 半端な行の再配分が左端と列グリッドを保つかを、実寸で確かめるための書き出し。
  it('は素材を複製した満量の PDF も書き出す', async () => {
    await write(`${ADOPTED_LAYOUT.id}-full`, { tiles: 6, cuts: 6 });
  });
});
