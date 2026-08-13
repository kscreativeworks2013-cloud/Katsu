import { describe, expect, it } from 'vitest';
import { seedPortfolio } from '../data/fixtures';
import { workspaceWithBody } from '../test/ir';
import { PROPOSAL_TEMPLATE, resolveSlot } from './proposal';

/*
 * 枠に載せる項目の選択（第8章 8-7）。
 * 実績は6件あって枠は3つ。どの3件を見せるかは提案書ごとに変わるので、先頭固定にしない。
 */

const works = PROPOSAL_TEMPLATE.find((section) => section.id === 'works')!.imageSlots[0];

describe('resolveSlot の選択', () => {
  it('は既定では供給元の先頭から枠数ぶんを載せる', () => {
    const images = resolveSlot(works, workspaceWithBody(), seedPortfolio, {});

    expect(images.map((image) => image.caption)).toEqual(
      seedPortfolio.slice(0, 3).map((work) => work.title),
    );
  });

  it('は選択があればその順で載せる', () => {
    const picked = [seedPortfolio[4].id, seedPortfolio[1].id];
    const images = resolveSlot(
      works,
      { ...workspaceWithBody(), picks: { 'works-grid': picked } },
      seedPortfolio,
      {},
    );

    expect(images.map((image) => image.caption)).toEqual([
      seedPortfolio[4].title,
      seedPortfolio[1].title,
    ]);
  });

  it('は枠数を超える選択を切り詰め、消えた項目は無視する', () => {
    const picked = [...seedPortfolio.map((work) => work.id), 'work-does-not-exist'];
    const images = resolveSlot(
      works,
      { ...workspaceWithBody(), picks: { 'works-grid': picked } },
      seedPortfolio,
      {},
    );

    expect(images).toHaveLength(works.capacity);
  });
});
