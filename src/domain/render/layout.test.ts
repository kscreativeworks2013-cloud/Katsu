import { describe, expect, it } from 'vitest';
import { A4_LANDSCAPE, ADOPTED_LAYOUT, slotWidthMm, tileGrid, type Rect } from './layout';

/*
 * タイル面の格子（第8章 8-6）。
 * 実測で出た破綻は「上段は左端から幅385px、下段は中央寄せで幅515px」だった。
 * 残数の再配分で列グリッドと左端が動くと、同じ面の中で版面が2つになる。
 */

const AREA: Rect = { x: 0.05, y: 0.15, w: 0.9, h: 0.75 };
const options = {
  cols: ADOPTED_LAYOUT.moodboard.cols,
  gap: ADOPTED_LAYOUT.moodboard.gap,
  maxAspect: 1.5,
  captionRatio: ADOPTED_LAYOUT.type.caption * 1.9,
  format: A4_LANDSCAPE,
};

/** 同じ行に並ぶ枠。 */
const row = (cells: Rect[], index: number): Rect[] =>
  cells.filter((cell) => cell.y === cells[index * options.cols]?.y);

describe('tileGrid', () => {
  it('は6枚を3+3で組み、全枠を同じ大きさにする', () => {
    const cells = tileGrid(6, AREA, options);

    expect(cells).toHaveLength(6);
    expect(new Set(cells.map((cell) => cell.w)).size).toBe(1);
    expect(new Set(cells.map((cell) => cell.h)).size).toBe(1);
    expect(new Set(cells.map((cell) => cell.y)).size).toBe(2);
  });

  it('は5枚（3+2）でも左端と列グリッドを保つ', () => {
    const cells = tileGrid(5, AREA, options);
    const top = row(cells, 0);
    const bottom = row(cells, 1);

    expect(top).toHaveLength(3);
    expect(bottom).toHaveLength(2);
    // 下段は中央に寄らない。左端も列の位置も上段と同じ。
    expect(bottom[0].x).toBe(AREA.x);
    expect(bottom.map((cell) => cell.x)).toEqual(top.slice(0, 2).map((cell) => cell.x));
    expect(new Set(cells.map((cell) => cell.w)).size).toBe(1);
  });

  it('は同じ行の枠の下端を揃える', () => {
    for (const count of [5, 6]) {
      const cells = tileGrid(count, AREA, options);
      const bottoms = new Set(cells.map((cell) => Number((cell.y + cell.h).toFixed(6))));

      // 段数ぶんの下端しか存在しない（枠ごとに高さが違わない）。
      expect(bottoms.size).toBe(Math.ceil(count / options.cols));
    }
  });

  it('は枚数が列数を下回る面では列数を組み直す', () => {
    const cells = tileGrid(2, AREA, options);

    expect(new Set(cells.map((cell) => cell.y)).size).toBe(1);
    expect(cells[0].x).toBe(AREA.x);
  });

  it('は枠を横に伸ばしすぎない（縦位置の人物が帯にならない上限）', () => {
    const cells = tileGrid(2, AREA, options);
    const art = cells[0].h - options.captionRatio;
    const aspect = (cells[0].w * A4_LANDSCAPE.widthPt) / (art * A4_LANDSCAPE.heightPt);

    expect(aspect).toBeLessThanOrEqual(options.maxAspect + 1e-9);
    // 伸ばさなかったぶんは右に残す（左端を動かさない）。
    expect(cells[0].x).toBe(AREA.x);
  });

  it('は面積を版面から導く（配置幅の判定根拠と同じ源）', () => {
    // タイルの配置幅は版面定義から出る。テンプレート側に mm の定数は無い。
    expect(slotWidthMm('mood-tiles')).toBe(87);
  });
});
