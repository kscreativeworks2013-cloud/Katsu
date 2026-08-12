import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../test/render';

/*
 * 保存まわり（第6章 6-9、第7章 7-10／7-11）。
 * メタデータは localStorage、画像の実体は AssetBinaryStore。どちらの失敗も画面に出す。
 */

afterEach(() => {
  vi.restoreAllMocks();
});

/** 指定の語を含む保存だけを失敗させる。マウント時の保存は通し、編集後の保存で枯渇させる。 */
function failSetItemContaining(marker: string) {
  const original = Storage.prototype.setItem;
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
    this: Storage,
    key: string,
    value: string,
  ) {
    if (value.includes(marker)) throw new DOMException('quota', 'QuotaExceededError');
    original.call(this, key, value);
  });
}

describe('保存', () => {
  it('は保存できていないことを画面に出す', async () => {
    const user = userEvent.setup();
    failSetItemContaining('追記');
    renderApp('/projects/prj-maison/brand');

    await user.type(screen.getByLabelText('トーン＆マナー'), '追記');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/変更を保存できていません/);
  });

  it('は設定画面で使用量と永続化の状態を可視化する', async () => {
    renderApp('/settings');

    const card = screen
      .getByRole('heading', { name: '画像の保存容量' })
      .closest('section') as HTMLElement;

    expect(within(card).getByText(/0MB 使用/)).toBeInTheDocument();
    expect(within(card).getByText(/原寸あり 0件／表示用のみ 0件/)).toBeInTheDocument();
    // jsdom には navigator.storage が無いので「確認できません」側に落ちる。
    expect(await within(card).findByText(/保存の永続化：/)).toBeInTheDocument();
  });

  it('はこの環境で画像が永続化されないことを伝える', async () => {
    renderApp('/settings');

    // jsdom には IndexedDB が無く、メモリ実装に落ちる（リロードで消える）。
    expect(await screen.findByText(/登録した画像はリロードで失われます/)).toBeInTheDocument();
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
    // 参照は残るが、出力に使えないことを明示する。
    expect(screen.getAllByText('出力に使えません').length).toBeGreaterThan(0);
  });

  it('はファイル登録を主動線として示す', async () => {
    const user = userEvent.setup();
    renderApp('/portfolio');

    await user.click(screen.getAllByRole('button', { name: /に画像を登録/ })[0]);

    expect(screen.getByText(/CORS制限で取り込めないことが多く/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ファイルを選ぶ' })).toBeInTheDocument();
  });
});
