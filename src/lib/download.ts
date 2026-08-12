/** ブラウザにテキストファイルを保存させる。DOM に依存する処理はここだけに閉じる。 */
export function downloadTextFile(fileName: string, content: string, mimeType: string): void {
  // jsdom には createObjectURL が無い。テスト環境では保存をスキップする。
  if (typeof URL.createObjectURL !== 'function') return;

  const url = URL.createObjectURL(new Blob([content], { type: `${mimeType};charset=utf-8` }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
