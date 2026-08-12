/*
 * 外部URL画像のローカル取り込み（第6章 6-8、第7章 7-6）。
 * 取り込めた画像は原寸として保存し、成果物に埋め込める。取り込めない場合は理由を返し、
 * 登録画面がその場で伝える（画面に見えている画像が黙って成果物から消えないようにする）。
 *
 * ブラウザからの直接フェッチは CORS で失敗するのが通常であり、成功率は環境依存のまま。
 * サーバー側プロキシ経由での取得は API・サーバー永続化フェーズの要件（第6章 6-8）。
 */

import { readOriginal, type ImageBinary } from './imageProcessing';

export interface ImportOutcome {
  image?: ImageBinary;
  /** 取り込めなかった理由。利用者にそのまま見せる文言。 */
  reason?: string;
}

/** 外部URLの画像を取得し、原寸のまま返す（縮小は preview 側の仕事）。 */
export async function importImageFromUrl(url: string): Promise<ImportOutcome> {
  let blob: Blob;
  try {
    const response = await fetch(url, { mode: 'cors' });
    if (!response.ok) {
      return { reason: `取得できませんでした（HTTP ${response.status}）` };
    }
    blob = await response.blob();
  } catch {
    return { reason: 'ネットワークまたはCORSの制限で取得できませんでした' };
  }

  if (blob.type && !blob.type.startsWith('image/')) {
    return { reason: `画像ではありません（${blob.type}）` };
  }

  return { image: await readOriginal(blob) };
}
