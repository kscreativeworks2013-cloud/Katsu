import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../test/render';

const PREVIEW = { name: '生成結果の差分プレビュー' } as const;
const STALE = { name: '内容が古い可能性のあるステップ' } as const;

describe('確認待ち（review）', () => {
  it('は差分プレビュー表示中のステップを「確認待ち」として表示する', async () => {
    const user = userEvent.setup();
    renderApp('/projects/prj-kohaku/brand');

    await user.click(screen.getByRole('button', { name: 'AIで解析する' }));
    await screen.findByRole('region', PREVIEW, { timeout: 3000 });

    const stepper = screen.getByRole('navigation', { name: '制作ステップ' });
    expect(
      within(stepper).getByRole('link', { name: /ブランド分析（確認待ち）/ }),
    ).toBeInTheDocument();
  });

  it('は別ステップの生成をブロックしない（Run の並走）', async () => {
    const user = userEvent.setup();
    renderApp('/projects/prj-kohaku/brand');

    await user.click(screen.getByRole('button', { name: 'AIで解析する' }));
    await screen.findByRole('region', PREVIEW, { timeout: 3000 });

    // ブランド分析が確認待ちのまま、競合分析画面の生成ボタンは押せる。
    const stepper = screen.getByRole('navigation', { name: '制作ステップ' });
    await user.click(within(stepper).getByRole('link', { name: /競合分析/ }));

    expect(screen.getByRole('button', { name: 'AIで分析' })).toBeEnabled();
  });
});

describe('差分プレビューの既定表示', () => {
  it('は再生成の結果が一致したとき「変更なし」だけを知らせて閉じる', async () => {
    const user = userEvent.setup();
    renderApp('/projects/prj-maison/brand');

    // 何も編集せず再解析：決定的な生成なので全フィールドが一致する。
    await user.click(screen.getByRole('button', { name: 'AIで再解析' }));
    const preview = await screen.findByRole('region', PREVIEW, { timeout: 3000 });

    expect(within(preview).getByText(/生成結果は現在の内容と一致しました/)).toBeInTheDocument();
    expect(
      within(preview).queryByRole('button', { name: '選択したフィールドを適用' }),
    ).not.toBeInTheDocument();

    await user.click(within(preview).getByRole('button', { name: '閉じる' }));
    expect(screen.queryByRole('region', PREVIEW)).not.toBeInTheDocument();

    // 値が変わっていないので、下流は stale にならない。
    expect(screen.queryByRole('region', STALE)).not.toBeInTheDocument();
  });

  it('は「変更なし」を折りたたみ、判断対象だけを見せる', async () => {
    const user = userEvent.setup();
    renderApp('/projects/prj-maison/brand');

    const worldview = screen.getByLabelText('ブランドの世界観');
    await user.clear(worldview);
    await user.type(worldview, '手で書いた世界観');

    await user.click(screen.getByRole('button', { name: 'AIで再解析' }));
    const preview = await screen.findByRole('region', PREVIEW, { timeout: 3000 });

    // 既定表示は保護1行のみ。変更なしは件数付きの折りたたみ。
    expect(within(preview).getByRole('row', { name: /ブランドの世界観/ })).toBeInTheDocument();
    expect(within(preview).queryByText('トーン＆マナー')).not.toBeInTheDocument();

    await user.click(within(preview).getByRole('button', { name: '変更なし6件を表示' }));
    expect(within(preview).getByText('トーン＆マナー')).toBeInTheDocument();

    // 保護のみ（上書き0件）なので、既定では適用対象が無い。
    expect(
      within(preview).getByRole('button', { name: '選択したフィールドを適用' }),
    ).toBeDisabled();
  });
});

describe('コレクションの差分表示', () => {
  it('は「中身を確認」でアイテム一覧を突き合わせられる', async () => {
    const user = userEvent.setup();
    renderApp('/projects/prj-kohaku/competitors');

    await user.click(screen.getByRole('button', { name: 'AIで分析' }));
    const preview = await screen.findByRole('region', PREVIEW, { timeout: 3000 });

    const buttons = within(preview).getAllByRole('button', { name: '中身を確認' });
    await user.click(buttons[0]);

    // 競合名がアイテム単位で見える（件数表示だけで判断させない）。
    expect(within(preview).getByText('Competitor A')).toBeInTheDocument();
    expect(within(preview).getByText('Competitor B')).toBeInTheDocument();
  });
});

describe('stale の確認済み', () => {
  it('は「確認済みにする」で警告が消え、上流が再変化したら戻る', async () => {
    const user = userEvent.setup();
    renderApp('/projects/prj-maison/brand');

    await user.type(screen.getByLabelText('トーン＆マナー'), '追記');
    const banner = screen.getByRole('region', STALE);
    const ackButtons = within(banner).getAllByRole('button', {
      name: '確認済みにする（再生成不要）',
    });

    // すべて確認済みにすると警告は消える。
    for (const button of ackButtons) {
      await user.click(button);
    }
    expect(screen.queryByRole('region', STALE)).not.toBeInTheDocument();

    // 上流がもう一度変化したら、確認済みは破棄され再び stale になる。
    await user.type(screen.getByLabelText('トーン＆マナー'), 'さらに追記');
    expect(screen.getByRole('region', STALE)).toBeInTheDocument();
  });
});
