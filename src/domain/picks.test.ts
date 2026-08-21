import { describe, expect, it } from 'vitest';
import { seedPortfolio } from '../data/fixtures';
import { workspaceWithBody } from '../test/ir';
import { slotWidthMm } from './render/layout';
import {
  PROPOSAL_TEMPLATE,
  claimedItemIds,
  resolveSlot,
  slotHasChoice,
  slotIsPrincipal,
} from './proposal';

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

/*
 * 枠の性質は列挙せず導出する（第9章 工程N-7）。
 * 列挙していたときは `shot-frames` に主要枠の印が付いていたが、枠数が無制限なので
 * 選ぶものが無く、提出前チェックが「選べ」と言い続ける矛盾になっていた。
 */
describe('枠の性質', () => {
  const bySlot = new Map(
    PROPOSAL_TEMPLATE.flatMap((section) => section.imageSlots.map((slot) => [slot.id, slot])),
  );

  it('は供給元を全点見せる枠を主要枠にしない', () => {
    for (const id of ['mood-tiles', 'competitor-refs', 'works-grid']) {
      expect(slotIsPrincipal(bySlot.get(id)!)).toBe(false);
    }
  });

  it('は枠数が無制限の枠を主要枠にしない（選ぶものが無い）', () => {
    expect(slotIsPrincipal(bySlot.get('shot-frames')!)).toBe(false);
  });

  it('は供給元の一部だけを載せる枠を主要枠にする', () => {
    for (const id of ['cover-key', 'brand-mood', 'concept-key', 'lighting-refs']) {
      expect(slotIsPrincipal(bySlot.get(id)!)).toBe(true);
    }
  });

  it('は選ぶ余地の有無を枠数と供給元の数だけで決める', () => {
    const logo = bySlot.get('cover-logo')!;
    expect(slotHasChoice(logo, 1)).toBe(false);
    expect(slotHasChoice(bySlot.get('cover-key')!, 10)).toBe(true);
    expect(slotHasChoice(bySlot.get('shot-frames')!, 99)).toBe(false);
  });
});

/*
 * 既定割当は、他の枠が明示的に選んだ画像を避ける（第9章 工程N-3）。
 * 実測：表紙を選び直したら、offset で決まるブランド分析に同じ写真が入った。
 */
describe('既定割当と明示選択', () => {
  const pool = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

  it('は選ばれた項目を避けて次を取る', () => {
    const workspace = { ...workspaceWithBody(), picks: { 'cover-key': ['b'] } };
    expect(claimedItemIds(workspace)).toEqual(new Set(['b']));
  });

  it('は避けきれない場合も枠を空にしない', () => {
    // 供給元3件すべてが他所で選ばれていても、枠は埋まる。
    const claimed = new Set(pool.map((item) => item.id));
    const workspace = {
      ...workspaceWithBody(),
      moodboard: pool.map((item, index) => ({
        ...workspaceWithBody().moodboard[0],
        id: item.id,
        assetId: `ast-${index}`,
      })),
      picks: {},
    };
    const images = resolveSlot(
      { id: 'brand-mood', label: '枠', labelEn: 'Slot', source: 'moodboard', capacity: 2 },
      workspace,
      [],
      {},
      claimed,
    );
    expect(images).toHaveLength(2);
  });
});

/*
 * 枠一覧と、枠ごとに何かする処理の突き合わせ（第9章 工程N-9）。
 *
 * `slotWidthRatio` は枠種を列挙する唯一の場所として残っている（枠ごとに面付けが
 * 違うという事実そのものなので導出できない）。列挙が残る以上、**枠を足したときに
 * 気づける仕掛け**が要る。ここが「全枠に値がある」ことと「既定で画像帯に落ちた枠が
 * 本当に帯でよいか」を、一覧の側から確かめる。
 */
describe('枠一覧と配置幅', () => {
  const slots = PROPOSAL_TEMPLATE.flatMap((section) => section.imageSlots);

  it('は全ての枠に配置幅を返す', () => {
    for (const slot of slots) {
      const width = slotWidthMm(slot.id, Number.isFinite(slot.capacity) ? slot.capacity : 6);
      expect(width, slot.id).toBeGreaterThan(0);
      expect(width, slot.id).toBeLessThanOrEqual(297);
    }
  });

  it('は全面配置の枠を判型いっぱいに置く', () => {
    for (const id of ['cover-key', 'concept-key']) {
      expect(slotWidthMm(id, 1)).toBe(297);
    }
  });

  /*
   * 既定（画像帯）に落ちている枠の一覧を固定する。
   * 枠を足すと黙ってここへ入るので、増えたら**帯でよいかを確かめてから**この配列を更新する。
   */
  it('は既定の画像帯に落ちる枠を明示する', () => {
    const banded = slots
      .filter((slot) => {
        const width = slotWidthMm(slot.id, 3);
        return width !== 297 && slot.id !== 'cover-logo' && !SIZED_BY_GRID.includes(slot.id);
      })
      .map((slot) => slot.id);

    expect(banded).toEqual(['brand-mood', 'competitor-refs', 'lighting-refs', 'works-grid']);
  });
});

/** 格子から寸法が決まる枠（帯ではない）。 */
const SIZED_BY_GRID = ['mood-tiles', 'shot-frames'];

/*
 * ロゴ枠の性質（第9章 工程N-8）。
 * 供給元が1点しかない枠で、他の枠と同じ扱いにすると意味が壊れる。
 */
describe('ロゴ枠', () => {
  const logo = PROPOSAL_TEMPLATE.flatMap((section) => section.imageSlots).find(
    (slot) => slot.id === 'cover-logo',
  )!;

  it('は供給元を全点見せる枠ではない（1点しか無い）', () => {
    expect(logo.exhaustive).toBeUndefined();
  });

  it('は選ぶ余地が無い（供給元1点・枠1つ）', () => {
    expect(slotHasChoice(logo, 1)).toBe(false);
    expect(slotHasChoice(logo, 0)).toBe(false);
  });

  /*
   * 導出上は「道具が絞る枠」に当たるが、供給元が枠数を超えないので
   * 未選択としては数えない（数えると、選びようのない枠を常に指摘し続ける）。
   */
  it('は主要枠に当たるが、選ぶ余地が無いので未選択とは数えない', () => {
    expect(slotIsPrincipal(logo)).toBe(true);
    expect(slotHasChoice(logo, 1)).toBe(false);
  });

  it('は説明文を持たない枠として扱う（キャプションを描かない）', () => {
    expect(logo.source).toBe('logo');
  });
});
