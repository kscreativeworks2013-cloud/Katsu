/*
 * レンダラの登録（第6章 6-5）。
 * PDF と PowerPoint の実装は重いので、出力を実行するまで読み込まない。
 * 形式を増やすときは、ここに1件足すだけで済む。
 */

import type { ExportFormat } from '../../data/types';
import type { Renderer } from './types';

/** 実ファイルを書き出せる形式。UI の表示判定にはこれを使う（同期）。 */
export const SUPPORTED_FORMATS: ExportFormat[] = ['md', 'pdf', 'pptx'];

export function isSupportedFormat(format: ExportFormat): boolean {
  return SUPPORTED_FORMATS.includes(format);
}

/** 実際に描画するときだけレンダラを読み込む。未対応形式は undefined。 */
export async function loadRenderer(format: ExportFormat): Promise<Renderer | undefined> {
  switch (format) {
    case 'md':
      return (await import('./markdown')).markdownRenderer;
    case 'pdf':
      return (await import('./pdf')).pdfRenderer;
    case 'pptx':
      return (await import('./pptx')).pptxRenderer;
    // Word は未対応（第6章 6-5）。レンダラを足せば同じ経路に乗る。
    default:
      return undefined;
  }
}

export type { RenderedFile, Renderer, RenderOptions } from './types';
