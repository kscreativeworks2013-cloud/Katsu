import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../test/render';

describe('ブランド分析', () => {
  it('は未解析の案件で空状態と解析導線を出す', () => {
    renderApp('/projects/prj-kohaku/brand');

    expect(screen.getByText('まだ解析していません')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'AIで解析する' })).toBeInTheDocument();
  });

  it('は解析するとステップが完了になり、結果を手動編集できる', async () => {
    const user = userEvent.setup();
    renderApp('/projects/prj-kohaku/brand');

    await user.click(screen.getByRole('button', { name: 'AIで解析する' }));

    // 生成中はスケルトンを出す。
    expect(screen.getByText('生成中です')).toBeInTheDocument();

    const worldview = await screen.findByLabelText('ブランドの世界観', undefined, {
      timeout: 3000,
    });
    const stepper = screen.getByRole('navigation', { name: '制作ステップ' });
    expect(
      within(stepper).getByRole('link', { name: /ブランド分析（完了）/ }),
    ).toBeInTheDocument();

    await user.clear(worldview);
    await user.type(worldview, '書き換えた世界観');

    expect(screen.getByText('手動更新：worldview')).toBeInTheDocument();
  });

  it('は解析済みの案件で抽出結果とパレットを表示する', () => {
    renderApp('/projects/prj-maison/brand');

    expect(screen.getByLabelText('トーン＆マナー')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'ブランドカラーパレット' })).toBeInTheDocument();
    expect(screen.getByText(/#B3936A/)).toBeInTheDocument();
  });
});
