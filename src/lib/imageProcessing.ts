/*
 * 原寸の受け入れと preview の生成（第7章 7-6）。
 *
 * preview は原寸から決定的な規則で作る：長辺 PREVIEW_MAX_EDGE、JPEG 品質 PREVIEW_QUALITY。
 * 規則を固定するのは、同じ原寸から常に同じ preview が得られるようにするため。
 * preview は画面表示専用で、出力には使わない。
 */

/** preview の長辺（px）。画面の最大表示（約400px）× Retina 2倍で足りる。 */
export const PREVIEW_MAX_EDGE = 800;

/** preview の JPEG 品質。 */
export const PREVIEW_QUALITY = 0.8;

export interface ImageBinary {
  blob: Blob;
  width: number;
  height: number;
  mimeType: string;
}

/** 画像処理（createImageBitmap／canvas）が使える環境か。 */
export function canProcessImages(): boolean {
  return typeof createImageBitmap === 'function' && typeof document !== 'undefined';
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
}

/** Blob の寸法を測る。測れない環境では undefined（寸法不明として扱う）。 */
export async function measureImage(
  blob: Blob,
): Promise<{ width: number; height: number } | undefined> {
  if (typeof createImageBitmap !== 'function') return undefined;
  try {
    const bitmap = await createImageBitmap(blob);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close?.();
    return size;
  } catch {
    return undefined;
  }
}

/** 原寸として受け入れる。縮小はしない（縮小するなら preview 側の仕事）。 */
export async function readOriginal(file: Blob, mimeType?: string): Promise<ImageBinary> {
  const size = await measureImage(file);
  return {
    blob: file,
    width: size?.width ?? 0,
    height: size?.height ?? 0,
    mimeType: mimeType || file.type || 'image/*',
  };
}

/**
 * 原寸から preview を作る。
 * 画像処理が使えない環境（テスト等）では undefined を返し、原寸だけを保持する。
 */
export async function makePreview(original: Blob): Promise<ImageBinary | undefined> {
  if (!canProcessImages()) return undefined;

  try {
    const bitmap = await createImageBitmap(original);
    const scale = Math.min(1, PREVIEW_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) return undefined;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();

    const blob = await toBlob(canvas, PREVIEW_QUALITY);
    if (!blob) return undefined;
    return { blob, width: canvas.width, height: canvas.height, mimeType: 'image/jpeg' };
  } catch {
    return undefined;
  }
}

/** Blob を data URI にする。出力（レンダラ）へ渡すのはこの形（第6章 6-6）。 */
export function blobToDataUri(blob: Blob): Promise<string> {
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

/** data URI を Blob に戻す。移行（v3）と外部URL取り込みで使う。 */
export function dataUriToBlob(dataUri: string): Blob | undefined {
  const match = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(dataUri);
  if (!match) return undefined;
  const [, mimeType, base64, payload] = match;
  try {
    if (!base64) return new Blob([decodeURIComponent(payload)], { type: mimeType });
    const binary = atob(payload);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return new Blob([bytes], { type: mimeType });
  } catch {
    return undefined;
  }
}
