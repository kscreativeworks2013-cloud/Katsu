import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../test/render';

// Pattern: component tests. Query by accessible role and label, drive the UI
// with `userEvent`, and assert what the user would see.
describe('案件一覧', () => {
  it('はシードされた案件をすべて表示する', () => {
    renderApp('/projects');

    expect(screen.getByRole('heading', { name: '案件 3件' })).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'フレグランス新香調 ローンチ広告' }),
    ).toBeInTheDocument();
  });

  it('は検索語でブランドを絞り込む', async () => {
    const user = userEvent.setup();
    renderApp('/projects');

    await user.type(screen.getByLabelText('検索'), 'AURELIA');

    expect(screen.getByRole('heading', { name: '案件 1件' })).toBeInTheDocument();
    expect(screen.queryByText('MAISON LUMIÈRE')).not.toBeInTheDocument();
  });

  it('はステータスで絞り込む', async () => {
    const user = userEvent.setup();
    renderApp('/projects');

    await user.selectOptions(screen.getByLabelText('ステータス'), '下書き');

    expect(screen.getByRole('heading', { name: '案件 1件' })).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'リップ新色 SNSキャンペーン' }),
    ).toBeInTheDocument();
  });

  it('は該当0件のとき条件をリセットできる', async () => {
    const user = userEvent.setup();
    renderApp('/projects');

    await user.type(screen.getByLabelText('検索'), '該当しない語');
    expect(screen.getByText('該当する案件がありません')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '条件をリセット' }));

    expect(screen.getByRole('heading', { name: '案件 3件' })).toBeInTheDocument();
  });

  it('は日英の提案書と出力への導線を持つ', () => {
    renderApp('/projects');

    expect(screen.getAllByRole('link', { name: '日本語提案書' })).toHaveLength(3);
    expect(screen.getAllByRole('link', { name: 'English Proposal' })).toHaveLength(3);
    expect(screen.getAllByRole('link', { name: 'PDF／PowerPoint出力' })).toHaveLength(3);
  });
});
