import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../test/render';

describe('新しい案件作成', () => {
  it('は必須3項目が未入力なら作成せずエラーを出す', async () => {
    const user = userEvent.setup();
    renderApp('/projects/new');

    await user.click(screen.getByRole('button', { name: '案件を作成してブランド分析へ' }));

    expect(screen.getByRole('alert')).toHaveTextContent(
      '案件名、クライアント名、ブランド名を入力してください。',
    );
    // 最初の未入力項目へフォーカスが移る。
    expect(screen.getByLabelText(/案件名/)).toHaveFocus();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('新しい案件を作成');
  });

  it('は必須3項目だけで案件を作成し、ブランド分析へ遷移する', async () => {
    const user = userEvent.setup();
    renderApp('/projects/new');

    await user.type(screen.getByLabelText(/案件名/), '春の新色キャンペーン');
    await user.type(screen.getByLabelText(/クライアント名/), 'テスト株式会社');
    await user.type(screen.getByLabelText(/ブランド名/), 'TEST BRAND');
    await user.click(screen.getByRole('button', { name: '案件を作成してブランド分析へ' }));

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('ブランド分析');
    // サイドバーに選択中案件として出る。
    expect(screen.getByText('春の新色キャンペーン')).toBeInTheDocument();
  });

  it('は作成した案件が一覧にも並ぶ', async () => {
    const user = userEvent.setup();
    renderApp('/projects/new');

    await user.type(screen.getByLabelText(/案件名/), '春の新色キャンペーン');
    await user.type(screen.getByLabelText(/クライアント名/), 'テスト株式会社');
    await user.type(screen.getByLabelText(/ブランド名/), 'TEST BRAND');
    await user.click(screen.getByRole('button', { name: '案件を作成してブランド分析へ' }));

    await user.click(screen.getAllByRole('link', { name: '案件一覧' })[0]);

    expect(screen.getByRole('heading', { name: '案件 4件' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '春の新色キャンペーン' })).toBeInTheDocument();
  });
});
