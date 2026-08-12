import { afterEach, describe, expect, it, vi } from 'vitest';
import { importImageFromUrl } from './importImage';

// 取り込みは原寸のまま行う（縮小は preview の仕事。第7章 7-6）。
// 取り込めない場合に理由を返すことが、登録画面での明示の前提になる（第6章 6-8）。

afterEach(() => {
  vi.restoreAllMocks();
});

function mockFetch(response: Partial<Response> | Error) {
  const fetchMock = vi.spyOn(globalThis, 'fetch');
  if (response instanceof Error) {
    fetchMock.mockRejectedValue(response);
  } else {
    fetchMock.mockResolvedValue(response as Response);
  }
  return fetchMock;
}

describe('importImageFromUrl', () => {
  it('は取得した画像を原寸のまま返す', async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/png' });
    mockFetch({ ok: true, blob: () => Promise.resolve(blob) });

    const outcome = await importImageFromUrl('https://example.com/a.png');

    expect(outcome.image?.blob.size).toBe(4);
    expect(outcome.image?.mimeType).toBe('image/png');
    expect(outcome.reason).toBeUndefined();
  });

  it('はCORSやネットワークの失敗を理由として返す', async () => {
    mockFetch(new TypeError('Failed to fetch'));

    const outcome = await importImageFromUrl('https://example.com/a.png');

    expect(outcome.image).toBeUndefined();
    expect(outcome.reason).toMatch(/CORS/);
  });

  it('はHTTPエラーを理由として返す', async () => {
    mockFetch({ ok: false, status: 404, blob: () => Promise.resolve(new Blob()) });

    expect((await importImageFromUrl('https://example.com/a.png')).reason).toMatch(/404/);
  });

  it('は画像でない応答を拒む', async () => {
    const blob = new Blob(['<html>'], { type: 'text/html' });
    mockFetch({ ok: true, blob: () => Promise.resolve(blob) });

    expect((await importImageFromUrl('https://example.com/a.html')).reason).toMatch(
      /画像ではありません/,
    );
  });

  it('は大きい画像も縮めずに取り込む（縮小は preview 側の仕事）', async () => {
    const blob = new Blob([new Uint8Array(200_000)], { type: 'image/png' });
    mockFetch({ ok: true, blob: () => Promise.resolve(blob) });

    const outcome = await importImageFromUrl('https://example.com/big.png');

    expect(outcome.image?.blob.size).toBe(200_000);
  });
});
