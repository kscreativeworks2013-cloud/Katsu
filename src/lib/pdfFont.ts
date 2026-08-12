/*
 * PDF 用の日本語フォントの読み込み（第6章 6-6）。
 * 初期表示に載せないよう、PDF 出力のときだけ取得して以後キャッシュする。
 */

import fontUrl from '@expo-google-fonts/noto-sans-jp/400Regular/NotoSansJP_400Regular.ttf?url';

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
