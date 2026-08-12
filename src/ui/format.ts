/** 表示用の整形ヘルパー。値の中身ではなく「どう見せるか」だけを扱う。 */

/** 差分プレビューの値表示。コレクションは件数、テキストは先頭のみを出す。 */
export function summarizeValue(value: unknown): string {
  if (value === undefined || value === null) return '（未生成）';
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return '（空）';
    return trimmed.length > 60 ? `${trimmed.slice(0, 60)}…` : trimmed;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return '（0件）';
    if (value.every((item) => typeof item === 'string')) {
      const joined = value.join('、');
      return joined.length > 60 ? `${joined.slice(0, 60)}…` : joined;
    }
    return `${value.length}件`;
  }
  return JSON.stringify(value).slice(0, 60);
}
