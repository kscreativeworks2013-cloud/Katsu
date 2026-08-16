import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { missingGlyphs } from '../domain/render/fontCoverage';

/*
 * コミット済みの和文フォントの素性（第9章 工程00-b-1）。
 *
 * 絞り込みはビルド時に行わず、生成物をリポジトリへ置いている（生成に Python と
 * fontTools が要り、それをビルドの必須条件にしたくないため）。その代わり
 * 「置いてある実体が本当に subset.py の出力か」を照合できるようにする。
 *
 * ここで捕まえるのは **実体側の事故**：手で置き換わった、壊れた、部分的に
 * コミットされた、npm の版が上がって元フォントが変わった。Python は要らない。
 *
 * 捕まえられないのは **定義側の事故**：subset.py の字形集合を編集したのに
 * 再生成を忘れた場合。この場合はマニフェストも実体も古いまま整合してしまう。
 * そちらは `npm run fonts:check`（Python 必要・CI で任意実行）が集合を
 * 再計算して検出する。役割を分けてあるので、両方を回して初めて完全になる。
 */

const require = createRequire(import.meta.url);
const FONT = new Uint8Array(
  readFileSync(require.resolve('../assets/fonts/NotoSansJP-jis.ttf')),
);
const MANIFEST = JSON.parse(
  readFileSync(require.resolve('../assets/fonts/NotoSansJP-jis.json'), 'utf8'),
) as {
  sourceSha256: string;
  codePointCount: number;
  codePointsSha256: string;
  outputBytes: number;
  outputSha256: string;
  extraChars: string;
};

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

describe('コミット済みの和文フォント', () => {
  it('はマニフェストに記録された実体と一致する', () => {
    expect(sha256(FONT)).toBe(MANIFEST.outputSha256);
    expect(FONT.byteLength).toBe(MANIFEST.outputBytes);
  });

  it('は元のフォントが npm 側で差し替わっていないことを示す', () => {
    const upstream = new Uint8Array(
      readFileSync(
        require.resolve('@expo-google-fonts/noto-sans-jp/400Regular/NotoSansJP_400Regular.ttf'),
      ),
    );
    expect(sha256(upstream)).toBe(MANIFEST.sourceSha256);
  });

  /** マニフェストが「入れた」と言っている人名の異体字が、実体にも入っていること。 */
  it('は個別に追加した字を実際に収録している', () => {
    expect(missingGlyphs([MANIFEST.extraChars], FONT)).toEqual([]);
  });

  it('は絞り込みの効果を保っている（元の半分以下）', () => {
    // 元は 5,472,784 バイト。ここが増えていたら絞り込みが緩んでいる。
    expect(MANIFEST.outputBytes).toBeLessThan(2_800_000);
    expect(MANIFEST.codePointCount).toBeGreaterThan(9_000);
  });
});
