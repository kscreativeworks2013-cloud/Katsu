import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../test/render';
import { STORAGE_WARN_BYTES, storageIsTight, storageReadout } from '../domain/assets';

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

  /*
   * 保存先そのものに触れない環境（プライベートモード等）。
   * failed だけを見ていると、1文字も保存されていないのに画面は無言だった
   * （第9章 工程N-1）。
   */
  it('は保存先に触れない環境でも黙らない', async () => {
    const user = userEvent.setup();
    // プライベートモードでは localStorage への**アクセス自体**が投げる。
    // setItem を潰すだけでは failed 側に落ちるので、プロパティを潰す。
    const original = Object.getOwnPropertyDescriptor(window, 'localStorage');
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('denied', 'SecurityError');
      },
    });
    try {
      renderApp('/projects/prj-maison/brand');
      await user.type(screen.getByLabelText('トーン＆マナー'), '追記');

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(/この環境ではブラウザに保存できません/);
    } finally {
      if (original) Object.defineProperty(window, 'localStorage', original);
    }
  });

  it('は設定画面で使用量と永続化の状態を可視化する', async () => {
    renderApp('/settings');

    const card = screen
      .getByRole('heading', { name: '画像の保存容量' })
      .closest('section') as HTMLElement;

    // 容量の問い合わせは非同期。返るまでは「確認しています」で、
    // 3状態を混ぜない（第9章 工程N-2）。
    expect(within(card).getByText(/使用量を確認しています/)).toBeInTheDocument();

    // jsdom には navigator.storage が無いので quota が取れず、使用率は出せない。
    expect(await within(card).findByText(/0MB 使用/)).toBeInTheDocument();
    expect(within(card).getByText(/利用可能量を取得できない/)).toBeInTheDocument();
    expect(within(card).getByText(/原寸あり 0件／表示用のみ 0件/)).toBeInTheDocument();
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

/*
 * 上限接近と保存不能（第6章 6-9／第9章 工程N-1）。
 *
 * 6-9 で挙げた4点のうち、80%の警告帯だけは実装もテストも無いまま第7章の移行を
 * 通過していた（他の3点は storageLimits.test.tsx が押さえていたので残っていた）。
 * 落ちたことに気づけなかったのは、その1点にだけ対応するテストが無かったからである。
 * ここで塞ぐ。
 */
describe('保存領域の逼迫', () => {
  it('は割合が閾値を越えたら逼迫と判定する', () => {
    expect(
      storageIsTight({
        bytes: 81,
        quotaBytes: 100,
        originalCount: 0,
        previewOnlyCount: 0,
        referenceOnlyCount: 0,
        missingCount: 0,
      }),
    ).toBe(true);
  });

  it('は quota が取れなくても絶対量で判定する（Safari 対策）', () => {
    // 割合だけで見ていると、quota を返さない環境では永久に発火しない。
    expect(
      storageIsTight({
        bytes: STORAGE_WARN_BYTES,
        quotaBytes: undefined,
        originalCount: 0,
        previewOnlyCount: 0,
        referenceOnlyCount: 0,
        missingCount: 0,
      }),
    ).toBe(true);
  });

  it('は余裕があれば発火しない', () => {
    expect(
      storageIsTight({
        bytes: 5_670_182,
        quotaBytes: 1_108_311_253,
        originalCount: 0,
        previewOnlyCount: 0,
        referenceOnlyCount: 0,
        missingCount: 0,
      }),
    ).toBe(false);
  });

  it('は3つの表示状態を混ぜない', () => {
    const usage = {
      bytes: 100,
      quotaBytes: undefined,
      originalCount: 0,
      previewOnlyCount: 0,
      referenceOnlyCount: 0,
      missingCount: 0,
    };
    expect(storageReadout(usage, false).kind).toBe('checking');
    expect(storageReadout(usage, true).kind).toBe('unknown');
    expect(storageReadout({ ...usage, quotaBytes: 1000 }, true)).toMatchObject({
      kind: 'known',
      percent: 10,
    });
  });
});
