import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../test/render';

const PREVIEW = { name: '生成結果の差分プレビュー' } as const;

async function generateProposal(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: '提案書を生成' }));
  const preview = await screen.findByRole('region', PREVIEW, { timeout: 3000 });
  await user.click(within(preview).getByRole('button', { name: '選択したフィールドを適用' }));
}

describe('提案書プレビュー', () => {
  it('は未生成のとき章ごとにプレースホルダを出す', () => {
    renderApp('/projects/prj-maison/proposal');

    expect(screen.getAllByText('この章はまだ生成されていません。').length).toBeGreaterThan(0);
  });

  it('は生成した章本文を差分プレビュー経由で適用する', async () => {
    const user = userEvent.setup();
    renderApp('/projects/prj-maison/proposal');

    await generateProposal(user);

    // 見積もり章は設定画面の単価から組み立てられる。
    expect(screen.getByText(/合計：¥/)).toBeInTheDocument();
    expect(screen.queryByText('この章はまだ生成されていません。')).not.toBeInTheDocument();
  });

  it('は章単位の手動編集を再生成から保護する', async () => {
    const user = userEvent.setup();
    renderApp('/projects/prj-maison/proposal');

    await generateProposal(user);

    const risk = document.querySelector('#page-risk') as HTMLElement;
    await user.click(within(risk).getByRole('button', { name: 'この章を編集' }));
    const textarea = within(risk).getByLabelText('本文（日本語）');
    await user.clear(textarea);
    await user.type(textarea, '手で書いたリスク管理');

    expect(within(risk).getByText('手動編集済み（再生成から保護）')).toBeInTheDocument();

    // 再生成しても、保護された章は既定では上書きされない。
    await user.click(screen.getByRole('button', { name: '提案書を生成' }));
    const preview = await screen.findByRole('region', PREVIEW, { timeout: 3000 });
    const row = within(preview).getByRole('row', { name: /提案書：リスク管理/ });
    expect(within(row).getByRole('checkbox')).not.toBeChecked();
  });

  it('は英語版を同じ構成データから出す', async () => {
    const user = userEvent.setup();
    renderApp('/projects/prj-maison/proposal');

    await generateProposal(user);
    await user.click(screen.getByRole('tab', { name: 'English' }));

    expect(screen.getByRole('heading', { name: 'Budget' })).toBeInTheDocument();
    expect(screen.getByText(/Total: ¥/)).toBeInTheDocument();
  });
});
