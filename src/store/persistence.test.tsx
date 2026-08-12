import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../test/render';
import { loadState } from './persistence';

// リロードをまたいで手動編集と provenance が残ることは、競合解決の前提条件（第4章 4-7）。
describe('永続化', () => {
  it('は手動編集をリロード後も保持する', async () => {
    const user = userEvent.setup();
    const first = renderApp('/projects/prj-maison/brand');

    await user.clear(screen.getByLabelText('ブランドの世界観'));
    await user.type(screen.getByLabelText('ブランドの世界観'), '保存される世界観');
    first.unmount();

    renderApp('/projects/prj-maison/brand');

    expect(screen.getByLabelText('ブランドの世界観')).toHaveValue('保存される世界観');
    expect(screen.getAllByText('手動編集済み（再生成から保護）').length).toBeGreaterThan(0);
  });

  it('は新規案件をリロード後も保持する', async () => {
    const user = userEvent.setup();
    const first = renderApp('/projects/new');

    await user.type(screen.getByLabelText(/案件名/), '保存される案件');
    await user.type(screen.getByLabelText(/クライアント名/), 'テスト株式会社');
    await user.type(screen.getByLabelText(/ブランド名/), 'TEST BRAND');
    await user.click(screen.getByRole('button', { name: '案件を作成してブランド分析へ' }));
    first.unmount();

    renderApp('/projects');

    expect(screen.getByRole('link', { name: '保存される案件' })).toBeInTheDocument();
  });

  it('は provenance をスキーマバージョン付きで保存する', async () => {
    const user = userEvent.setup();
    renderApp('/projects/prj-maison/brand');

    await user.type(screen.getByLabelText('トーン＆マナー'), '追記');

    const saved = loadState();
    expect(saved?.state.version).toBe(3);
    expect(saved?.state.provenance['prj-maison']['brand.tone'].origin).toBe('edited');
  });
});

// (D) 確認済みの判断は表示上のフラグではなく、リロードをまたいで残る記録であること。
describe('stale の確認済みの永続化', () => {
  it('は「確認済み」の判断をリロード後も保持する', async () => {
    const user = userEvent.setup();
    const first = renderApp('/projects/prj-maison/brand');

    await user.type(screen.getByLabelText('トーン＆マナー'), '追記');
    const banner = screen.getByRole('region', { name: '内容が古い可能性のあるステップ' });
    for (const button of within(banner).getAllByRole('button', {
      name: '確認済みにする（再生成不要）',
    })) {
      await user.click(button);
    }

    const saved = loadState();
    const competitors = saved?.state.projects.find((item) => item.id === 'prj-maison')?.steps
      .competitors;
    expect(competitors?.stale).toBe(false);
    expect(competitors?.staleAcknowledgedAt).toBeTruthy();
    expect(competitors?.staleAcknowledgedCause).toBe('brand');

    first.unmount();
    renderApp('/projects/prj-maison/brand');

    expect(
      screen.queryByRole('region', { name: '内容が古い可能性のあるステップ' }),
    ).not.toBeInTheDocument();
  });
});
