import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { defaultSettings, seedPortfolio, seedProjects, seedWorkspaces } from '../../src/data/fixtures';
import { generateProposalBody } from '../../src/data/proposalBody';
import type { Asset, Workspace } from '../../src/data/types';
import { buildProposalIR, type ProposalIR } from '../../src/domain/ir';
import { LAYOUT_VARIANTS } from '../../src/domain/render/layout';
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
function gradientPng(width: number, height: number, from: [number, number, number], to: [number, number, number]): string {
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

/** ブランドのトーンに寄せた見本。タイルごとに少しずつ振って、並べたときの差が見えるようにする。 */
const TONES: [number, number, number][][] = [
  [[236, 226, 212], [176, 146, 110]],
  [[62, 56, 50], [148, 126, 104]],
  [[214, 198, 186], [120, 92, 74]],
  [[240, 236, 228], [198, 170, 132]],
  [[92, 78, 70], [212, 188, 160]],
  [[224, 210, 190], [96, 78, 62]],
];

/** 全スロットにアセットを結びつけた案件データ。版面の比較には画像が要る。 */
function projectWithImages(): { workspace: Workspace; assets: Record<string, Asset> } {
  const project = seedProjects[0];
  const base = seedWorkspaces[project.id];
  const assets: Record<string, Asset> = {};

  const make = (id: string, index: number, width: number, height: number): string => {
    const [from, to] = TONES[index % TONES.length];
    assets[id] = {
      id,
      origin: index % 5 === 0 ? 'ai' : 'upload',
      label: id,
      source: `${id}.png`,
      runId: null,
      mimeType: 'image/png',
      createdAt: '2026-08-01T00:00:00.000Z',
      variants: [
        {
          kind: 'original',
          key: `${id}:original`,
          width,
          height,
          bytes: 1_000_000,
          mimeType: 'image/png',
        },
      ],
    };
    return gradientPng(width, height, from, to);
  };

  // data URI は解決フェーズが埋めるものなので、ここでは IR に直接差し込む（下の inject）。
  const data: Record<string, string> = {};
  const workspace: Workspace = {
    ...base,
    proposalBody: generateProposalBody(project, base, seedPortfolio, defaultSettings),
    moodboard: base.moodboard.map((tile, index) => {
      const id = `ast-mood-${index}`;
      data[id] = make(id, index, 640, 420);
      return { ...tile, assetId: id };
    }),
    shots: base.shots.map((shot, index) => {
      const id = `ast-shot-${index}`;
      data[id] = make(id, index + 2, 640, 420);
      return { ...shot, assetId: id };
    }),
  };

  Object.assign(imageData, data);
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

describe('版面案の書き出し', () => {
  it('は同じ案件データから3本の PDF を出す', async () => {
    const project = seedProjects[0];
    const { workspace, assets } = projectWithImages();
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
    for (const variant of LAYOUT_VARIANTS) {
      const bytes = await renderLayoutPdf(ir, { variant, fontBytes });
      const path = `${OUT_DIR}/${variant.id}.pdf`;
      writeFileSync(path, bytes);
      expect(bytes.length).toBeGreaterThan(5000);
      console.log(`${variant.label}: ${path}（${Math.round(bytes.length / 1000)}KB）`);
    }
  });
});
