import { describe, expect, it } from 'vitest';
import {
  A4_LANDSCAPE,
  ADOPTED_LAYOUT,
  cellSize,
  gridCells,
  gridColumns,
  shotArea,
  shotOptions,
  slotWidthMm,
  tileArea,
  tileOptions,
} from './layout';

/*
 * 枠の格子（第8章 8-6）。
 * 実測で出た破綻は3つ。
 *   1) 半端な行が中央寄せになり、上段と下段で左端も幅も違った
 *   2) 4枚の面が 3+1 になり、台紙の右三分の二が空いた
 *   3) 同じ章なのに面によってタイル寸法が変わった（1面目83mm・2面目106mm）
 */

const tiles = tileOptions();
const area = tileArea();

describe('gridColumns', () => {
  it('は段数を増やさずに行の欠けが最も少ない列数を選ぶ', () => {
    expect(gridColumns(6, 3)).toBe(3); // 3+3
    expect(gridColumns(5, 3)).toBe(3); // 3+2
    expect(gridColumns(4, 3)).toBe(2); // 2+2（3+1にしない）
    expect(gridColumns(2, 3)).toBe(2);
    expect(gridColumns(6, 4)).toBe(3); // 4+2ではなく3+3
  });
});

describe('cellSize', () => {
  it('は面の枚数が減っても寸法を変えない（章で1つの寸法）', () => {
    const full = cellSize(10, area, tiles);
    // 10点なら1面目が6枚。2面目に4枚しか残らなくても寸法は同じ。
    expect(cellSize(6, area, tiles).w).toBeCloseTo(full.w, 10);
    expect(cellSize(6, area, tiles).h).toBeCloseTo(full.h, 10);
  });

  it('は枠を横に伸ばしすぎない（縦位置の人物が帯にならない上限）', () => {
    const cell = cellSize(2, area, tiles);
    const art = cell.h - tiles.captionRatio;
    const aspect = (cell.w * A4_LANDSCAPE.widthPt) / (art * A4_LANDSCAPE.heightPt);

    expect(aspect).toBeLessThanOrEqual(tiles.maxAspect + 1e-9);
  });
});

describe('gridCells', () => {
  it('は6枚を3+3で組み、全枠を同じ大きさにする', () => {
    const cells = gridCells(6, area, cellSize(6, area, tiles), tiles);

    expect(new Set(cells.map((cell) => cell.w)).size).toBe(1);
    expect(new Set(cells.map((cell) => cell.y)).size).toBe(2);
  });

  /*
   * 欠けた行は中央に寄せる（第9章 工程R-7）。
   * 左詰めのままだと最終行の右が空き、面が左に偏って見える。
   * 台紙は列数ぶんの幅で引くので、行だけを中に寄せれば重心が戻る。
   */
  it('は5枚（3+2）の最終行を中央へ寄せる', () => {
    const cells = gridCells(5, area, cellSize(5, area, tiles), tiles);
    const top = cells.slice(0, 3);
    const bottom = cells.slice(3);

    const leftGap = bottom[0].x - area.x;
    const rightGap = top[2].x + top[2].w - (bottom[1].x + bottom[1].w);
    expect(leftGap).toBeCloseTo(rightGap, 6);

    // 枠寸法は動かさない。中央寄せは位置だけの操作である。
    expect(new Set(cells.map((cell) => cell.w)).size).toBe(1);
  });

  it('は行が埋まっていれば左端を版面に合わせる', () => {
    const cells = gridCells(6, area, cellSize(6, area, tiles), tiles);

    expect(cells[0].x).toBe(area.x);
    expect(cells[3].x).toBe(area.x);
  });

  it('は同じ行の枠の下端を揃える', () => {
    for (const count of [4, 5, 6]) {
      const cells = gridCells(count, area, cellSize(count, area, tiles), tiles);
      const bottoms = new Set(cells.map((cell) => Number((cell.y + cell.h).toFixed(6))));

      expect(bottoms.size).toBe(Math.ceil(count / gridColumns(count, tiles.cols)));
    }
  });
});

describe('slotWidthMm', () => {
  it('はその面の面付けから配置幅を出す（枠種ごとの固定値ではない）', () => {
    // 実績・ブランドイメージは同じ「画像帯」だが、並ぶ枚数で幅が変わる。
    expect(slotWidthMm('works-grid', 3)).toBe(97);
    expect(slotWidthMm('brand-mood', 2)).toBe(147);
    expect(slotWidthMm('competitor-refs', 3)).toBe(97);
    // 全面ブリードは判型そのもの。
    expect(slotWidthMm('cover-key', 1)).toBe(297);
    expect(slotWidthMm('concept-key', 1)).toBe(297);
  });

  it('はムードボードとショットリストを実際の列数から出す', () => {
    // タイルは10点なら3列（1面目の並び）で決まる。
    expect(slotWidthMm('mood-tiles', 10)).toBe(83);
    // 4点しか無ければ2列になり、枠は広くなる。
    expect(slotWidthMm('mood-tiles', 4)).toBeGreaterThan(83);
    // 6カットは3+3。4分割固定ではない。
    expect(slotWidthMm('shot-frames', 6)).toBe(
      Math.round(cellSize(6, shotArea(6), shotOptions()).w * A4_LANDSCAPE.widthMm),
    );
    expect(slotWidthMm('shot-frames', 6)).toBeGreaterThan(slotWidthMm('shot-frames', 8));
  });

  it('は版面を動かせば一緒に動く（テンプレート側に定数を置かない）', () => {
    const narrow = { ...ADOPTED_LAYOUT, moodboard: { cols: 4, rows: 2, gap: 0.01 } };

    expect(slotWidthMm('mood-tiles', 10, narrow)).toBeLessThan(slotWidthMm('mood-tiles', 10));
  });
});
