import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../test/render';

const PREVIEW = { name: '生成結果の差分プレビュー' } as const;

describe('ブランド分析', () => {
  it('は未解析の案件で空状態と解析導線を出す', () => {
    renderApp('/projects/prj-kohaku/brand');

    expect(screen.getByText('まだ解析していません')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'AIで解析する' })).toBeInTheDocument();
  });

  it('は生成結果を適用するまで書き込まない', async () => {
    const user = userEvent.setup();
    renderApp('/projects/prj-kohaku/brand');

    await user.click(screen.getByRole('button', { name: 'AIで解析する' }));
    expect(screen.getByText('生成中です')).toBeInTheDocument();

    // 差分プレビューが出た時点では、まだ抽出結果は表示されない。
    const preview = await screen.findByRole('region', PREVIEW, { timeout: 3000 });
    expect(screen.queryByLabelText('ブランドの世界観')).not.toBeInTheDocument();

    await user.click(within(preview).getByRole('button', { name: '選択したフィールドを適用' }));

    expect(screen.getByLabelText('ブランドの世界観')).toBeInTheDocument();
    const stepper = screen.getByRole('navigation', { name: '制作ステップ' });
    expect(
      within(stepper).getByRole('link', { name: /ブランド分析（完了）/ }),
    ).toBeInTheDocument();
  });

  it('は破棄すると何も書き込まない', async () => {
    const user = userEvent.setup();
    renderApp('/projects/prj-kohaku/brand');

    await user.click(screen.getByRole('button', { name: 'AIで解析する' }));
    const preview = await screen.findByRole('region', PREVIEW, { timeout: 3000 });
    await user.click(within(preview).getByRole('button', { name: '破棄' }));

    expect(screen.getByText('まだ解析していません')).toBeInTheDocument();
    const stepper = screen.getByRole('navigation', { name: '制作ステップ' });
    expect(
      within(stepper).getByRole('link', { name: /ブランド分析（未着手）/ }),
    ).toBeInTheDocument();
  });

  it('は手動編集したフィールドを再生成から保護する', async () => {
    const user = userEvent.setup();
    renderApp('/projects/prj-maison/brand');

    const worldview = screen.getByLabelText('ブランドの世界観');
    await user.clear(worldview);
    await user.type(worldview, '手で書いた世界観');
    expect(screen.getAllByText('手動編集済み（再生成から保護）').length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: 'AIで再解析' }));
    const preview = await screen.findByRole('region', PREVIEW, { timeout: 3000 });

    // 保護されたフィールドは既定で選択されない。
    const row = within(preview).getByRole('row', { name: /ブランドの世界観/ });
    expect(within(row).getByRole('checkbox')).not.toBeChecked();

    await user.click(within(preview).getByRole('button', { name: '選択したフィールドを適用' }));

    expect(screen.getByLabelText('ブランドの世界観')).toHaveValue('手で書いた世界観');
  });

  it('は保護されたフィールドを明示的に選べば上書きする', async () => {
    const user = userEvent.setup();
    renderApp('/projects/prj-maison/brand');

    const worldview = screen.getByLabelText('ブランドの世界観');
    await user.clear(worldview);
    await user.type(worldview, '手で書いた世界観');

    await user.click(screen.getByRole('button', { name: 'AIで再解析' }));
    const preview = await screen.findByRole('region', PREVIEW, { timeout: 3000 });
    const row = within(preview).getByRole('row', { name: /ブランドの世界観/ });

    await user.click(within(row).getByRole('checkbox'));
    await user.click(within(preview).getByRole('button', { name: '選択したフィールドを適用' }));

    expect(screen.getByLabelText('ブランドの世界観')).not.toHaveValue('手で書いた世界観');
  });

  it('は上流の手動編集で下流ステップを stale にする', async () => {
    const user = userEvent.setup();
    renderApp('/projects/prj-maison/brand');

    expect(
      screen.queryByRole('region', { name: '内容が古い可能性のあるステップ' }),
    ).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('トーン＆マナー'), '追記');

    const banner = screen.getByRole('region', { name: '内容が古い可能性のあるステップ' });
    expect(within(banner).getByText(/競合分析/)).toBeInTheDocument();
    expect(within(banner).getByText(/コンセプト/)).toBeInTheDocument();
  });

  it('は解析済みの案件で抽出結果とパレットを表示する', () => {
    renderApp('/projects/prj-maison/brand');

    expect(screen.getByLabelText('トーン＆マナー')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'ブランドカラーパレット' })).toBeInTheDocument();
    expect(screen.getByText(/#B3936A/)).toBeInTheDocument();
  });
});
