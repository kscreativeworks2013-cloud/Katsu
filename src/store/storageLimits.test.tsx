import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../test/render';

/*
 * 保存容量まわり（第6章 6-9）。
 * 画像はリロードで消えると復元できないため、退避・失敗・上限接近を必ず画面へ出す。
 */

afterEach(() => {
  vi.restoreAllMocks();
});

/** 指定の語を含む保存だけを失敗させる。マウント時の保存は通し、編集後の保存で枯渇させる。 */
function failSetItemContaining(marker: string, { alwaysFail = false } = {}) {
  const original = Storage.prototype.setItem;
  let failed = false;
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
    this: Storage,
    key: string,
    value: string,
  ) {
    const matches = value.includes(marker);
    if (matches && (alwaysFail || !failed)) {
      failed = true;
      throw new DOMException('quota', 'QuotaExceededError');
    }
    original.call(this, key, value);
  });
}

describe('保存容量', () => {
  it('は退避したことを画面に出す（黙って落とさない）', async () => {
    const user = userEvent.setup();
    // 編集後の最初の書き込みだけ失敗させ、サムネイル退避後の再試行は通す。
    failSetItemContaining('追記');
    renderApp('/projects/prj-maison/brand');

    await user.type(screen.getByLabelText('トーン＆マナー'), '追記');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/画像の保存を解除しました/);
  });

  it('は保存できていないことを画面に出す', async () => {
    const user = userEvent.setup();
    failSetItemContaining('追記', { alwaysFail: true });
    renderApp('/projects/prj-maison/brand');

    await user.type(screen.getByLabelText('トーン＆マナー'), '追記');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/変更を保存できていません/);
  });

  it('は設定画面で使用量を可視化する', () => {
    renderApp('/settings');

    const card = screen
      .getByRole('heading', { name: '画像の保存容量' })
      .closest('section') as HTMLElement;

    expect(within(card).getByText(/0KB \/ 2,000KB（0% 使用）/)).toBeInTheDocument();
    expect(within(card).getByText(/保存済み 0件／参照のみ 0件/)).toBeInTheDocument();
  });
});

describe('外部URLの取り込み', () => {
  it('は取り込めない理由をその場で伝える', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    renderApp('/portfolio');

    await user.click(screen.getAllByRole('button', { name: /に画像を登録/ })[0]);
    await user.type(screen.getByLabelText('画像URL（任意）'), 'https://example.com/a.jpg');
    await user.click(screen.getByRole('button', { name: 'URLから取り込む' }));

    expect(await screen.findByText(/画像を取り込めませんでした/)).toBeInTheDocument();
    // 参照は残るが、成果物に含まれないことを明示する。
    expect(screen.getAllByText('成果物に含まれません').length).toBeGreaterThan(0);
  });

  it('はファイル登録を主動線として示す', async () => {
    const user = userEvent.setup();
    renderApp('/portfolio');

    await user.click(screen.getAllByRole('button', { name: /に画像を登録/ })[0]);

    expect(screen.getByText(/CORS制限で取り込めないことが多く/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ファイルを選ぶ' })).toBeInTheDocument();
  });
});
