import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../test/render';

describe('出力', () => {
  it('は選んだ形式と言語の組み合わせを履歴に残す', async () => {
    const user = userEvent.setup();
    renderApp('/projects/prj-kohaku/export');

    // 既定は PDF＋PowerPoint、言語は日英両方。Markdown も足して3形式×2言語にする。
    await user.click(screen.getByRole('checkbox', { name: /Markdown/ }));
    await user.click(screen.getByRole('button', { name: '出力を実行' }));

    const history = await screen.findByRole('table', undefined, { timeout: 3000 });
    const rows = within(history).getAllByRole('row');
    // 見出し行 + 3形式 × 2言語
    expect(rows).toHaveLength(7);
    expect(within(history).getByText('KŌHAKU_Proposal_JA.md')).toBeInTheDocument();
  });

  it('は古い章があるとき確認を挟み、ブロックはしない', async () => {
    const user = userEvent.setup();
    renderApp('/projects/prj-maison/brand');

    // 上流を編集して下流を stale にしてから出力画面へ移動する。
    await user.type(screen.getByLabelText('トーン＆マナー'), '追記');
    const stepper = screen.getByRole('navigation', { name: '制作ステップ' });
    await user.click(within(stepper).getByRole('link', { name: /STEP 8 出力/ }));

    await user.click(screen.getByRole('button', { name: '出力を実行' }));

    expect(
      screen.getByRole('heading', { name: '古い内容のまま出力しますか' }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'このまま出力する' }));

    const history = await screen.findByRole('table', undefined, { timeout: 3000 });
    expect(within(history).getAllByRole('row').length).toBeGreaterThan(1);
  });
});
