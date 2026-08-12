/*
 * 外部URL画像のローカル取り込み（第6章 6-8）。
 * 取り込めた画像は成果物に埋め込める。取り込めない場合は理由を返し、
 * 登録画面がその場で伝える（画面に見えている画像が黙って成果物から消えないようにする）。
 */

import { THUMBNAIL_LIMIT_BYTES } from '../domain/assets';

export interface ImportedImage {
  dataUri: string;
  mimeType: string;
}

export interface ImportOutcome {
  image?: ImportedImage;
  /** 取り込めなかった理由。利用者にそのまま見せる文言。 */
  reason?: string;
}

function blobToDataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () =>
      typeof reader.result === 'string'
        ? resolve(reader.result)
        : reject(new Error('画像を読み取れませんでした')),
    );
    reader.addEventListener('error', () => reject(new Error('画像を読み取れませんでした')));
    reader.readAsDataURL(blob);
  });
}

/**
 * 上限に収まるまで縮小する。原寸のまま保存できるのはサーバー側永続化フェーズ以降なので、
 * ここでは提案書プレビュー用の縮小版だけを作る。
 */
async function downscaleToFit(blob: Blob, limitBytes: number): Promise<string | undefined> {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') {
    return undefined;
  }

  try {
    const bitmap = await createImageBitmap(blob);
    for (const maxEdge of [1600, 1200, 800, 480]) {
      const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext('2d');
      if (!context) return undefined;
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const dataUri = canvas.toDataURL('image/jpeg', 0.82);
      if (dataUri.length <= limitBytes) return dataUri;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/** 外部URLの画像を取得し、埋め込める形（data URI）にして返す。 */
export async function importImageFromUrl(
  url: string,
  limitBytes: number = THUMBNAIL_LIMIT_BYTES,
): Promise<ImportOutcome> {
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

  const direct = await blobToDataUri(blob).catch(() => undefined);
  if (direct && direct.length <= limitBytes) {
    return { image: { dataUri: direct, mimeType: blob.type || 'image/*' } };
  }

  const reduced = await downscaleToFit(blob, limitBytes);
  if (reduced) return { image: { dataUri: reduced, mimeType: 'image/jpeg' } };

  return { reason: '画像が大きく、この環境では縮小できませんでした' };
}
