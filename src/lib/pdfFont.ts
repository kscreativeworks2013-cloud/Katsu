/*
 * PDF 用の日本語フォントの読み込み（第6章 6-6）。
 * 初期表示に載せないよう、PDF 出力のときだけ取得して以後キャッシュする。
 *
 * 読むのは事前に絞った軽量版（第9章 工程00-b）。元の Noto Sans JP は全字形で
 * 5.2MB あり、埋め込むと PDF の3割をフォントが占める。絞り込みは
 * tools/fonts/subset.py が行い、生成物をリポジトリに置いている（`npm run fonts:subset`）。
 * 実行時には絞らない——pdf-lib のサブセット書き出しは壊れた glyf を吐くため。
 * 収録外の字は出力の前に検知して止める（domain/render/fontCoverage.ts）。
 */

import fontUrl from '../assets/fonts/NotoSansJP-jis.ttf?url';

let cached: Uint8Array | undefined;

/** フォント実体を取得する。取得できない場合は例外を投げ、文字化けした PDF を出さない。 */
export async function loadJapaneseFont(): Promise<Uint8Array> {
  if (cached) return cached;

  try {
    const response = await fetch(fontUrl);
    if (!response.ok) throw new Error(String(response.status));
    cached = new Uint8Array(await response.arrayBuffer());
    return cached;
  } catch (cause) {
    // 取得できない環境では PDF を出さない。文字化けした成果物より失敗を選ぶ（第6章 6-6）。
    throw new Error(
      `日本語フォントを読み込めないため PDF を生成できません（${cause instanceof Error ? cause.message : '取得失敗'}）`,
      { cause },
    );
  }
}
