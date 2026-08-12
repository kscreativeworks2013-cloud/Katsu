import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../test/render';

/** jsdom ではフォントアセットを取得できないので、PDF を外して他形式を確認する。 */
async function selectFormats(user: ReturnType<typeof userEvent.setup>, formats: string[]) {
  for (const label of ['PDF', 'PowerPoint', 'Word', 'Markdown']) {
    const checkbox = screen.getByRole('checkbox', { name: new RegExp(label) });
    const shouldCheck = formats.includes(label);
    if ((checkbox as HTMLInputElement).checked !== shouldCheck) await user.click(checkbox);
  }
}

describe('出力', () => {
  it('は形式と言語の組み合わせを版つきで履歴に残す', async () => {
    const user = userEvent.setup();
    renderApp('/projects/prj-maison/proposal');

    // 章本文を生成してから出力する（IR は生成済みの本文だけを載せる）。
    await user.click(screen.getByRole('button', { name: '提案書を生成' }));
    const preview = await screen.findByRole('region', {
      name: '生成結果の差分プレビュー',
    });
    await user.click(within(preview).getByRole('button', { name: '選択したフィールドを適用' }));

    const stepper = screen.getByRole('navigation', { name: '制作ステップ' });
    await user.click(within(stepper).getByRole('link', { name: /STEP 8 出力/ }));

    await selectFormats(user, ['PowerPoint', 'Markdown']);
    await user.click(screen.getByRole('button', { name: '出力を実行' }));

    const history = await screen.findByRole('table', undefined, { timeout: 20_000 });
    // 見出し行 + 2形式 × 2言語
    expect(within(history).getAllByRole('row')).toHaveLength(5);
    // 版は日英で別、形式が違えば同じ版になる。
    const revisions = new Set(
      within(history)
        .getAllByRole('row')
        .slice(1)
        .map((row) => within(row).getAllByRole('cell')[3].textContent),
    );
    expect(revisions.size).toBe(2);
  }, 40_000);

  it('は未対応形式を履歴だけに残す', async () => {
    const user = userEvent.setup();
    renderApp('/projects/prj-maison/export');

    await selectFormats(user, ['Word']);
    await user.click(screen.getByRole('button', { name: '出力を実行' }));
    await user.click(await screen.findByRole('button', { name: 'このまま出力する' }));

    const history = await screen.findByRole('table', undefined, { timeout: 20_000 });
    expect(within(history).getAllByText(/Word（未生成）/).length).toBe(2);
  }, 40_000);

  it('は警告があるとき確認を挟み、ブロックはしない', async () => {
    const user = userEvent.setup();
    renderApp('/projects/prj-maison/export');

    await selectFormats(user, ['Markdown']);
    await user.click(screen.getByRole('button', { name: '出力を実行' }));

    // 章本文が未生成なので、未生成の章が警告として出る。
    expect(screen.getByRole('heading', { name: 'このまま出力しますか' })).toBeInTheDocument();
    expect(screen.getByText(/表紙が未生成です。/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'このまま出力する' }));

    const history = await screen.findByRole('table', undefined, { timeout: 20_000 });
    expect(within(history).getAllByRole('row').length).toBeGreaterThan(1);
  }, 40_000);

  it('はフォントを読めない環境で PDF を出さずに失敗を伝える', async () => {
    const user = userEvent.setup();
    renderApp('/projects/prj-maison/export');

    await selectFormats(user, ['PDF']);
    await user.click(screen.getByRole('button', { name: '出力を実行' }));
    await user.click(await screen.findByRole('button', { name: 'このまま出力する' }));

    const alert = await screen.findByRole('alert', undefined, { timeout: 20_000 });
    expect(alert).toHaveTextContent(/日本語フォントを読み込めないため PDF を生成できません/);
    expect(screen.getByText('まだ出力していません')).toBeInTheDocument();
  }, 40_000);
});
