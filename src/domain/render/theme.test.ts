import { describe, expect, it } from 'vitest';
import { deriveTheme, themeRgb } from './theme';

/*
 * 版面色の導出（第8章 8-7）。
 * ここで固めるのは個々の色ではなく**関係**である。色そのものは案件ごとに変わってよいが、
 * 「台紙は紙より暗い」「本文は紙の上で読める」は版面の前提であり、
 * どのブランドカラーを入れても崩れてはならない。
 */

const MAISON = [{ hex: '#12100E' }, { hex: '#F3ECE2' }, { hex: '#B3936A' }, { hex: '#8A6A4F' }];
/** 寒色・高彩度・明るい色しか無いパレット（同じ規則で成立するか）。 */
const COOL = [{ hex: '#DDE7F0' }, { hex: '#3C6E9F' }, { hex: '#9FB8CC' }];

const luminance = (hex: string): number => {
  const { r, g, b } = themeRgb(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

describe('deriveTheme', () => {
  it('は台紙を紙色より1〜2段暗く置く（固定値ではなく相対値）', () => {
    for (const palette of [MAISON, COOL, undefined]) {
      const theme = deriveTheme(palette);
      const ratio = luminance(theme.mat) / luminance(theme.paper);

      expect(ratio).toBeLessThan(0.95);
      expect(ratio).toBeGreaterThan(0.8);
    }
  });

  it('は台紙にブランドの色みを移す（紙色を灰にしただけにしない）', () => {
    const warm = deriveTheme(MAISON);
    const cool = deriveTheme(COOL);
    const hue = (hex: string): number => themeRgb(hex).r - themeRgb(hex).b;

    // 暖色のブランドでは台紙も暖色側、寒色のブランドでは寒色側に寄る。
    expect(hue(warm.mat)).toBeGreaterThan(hue(cool.mat));
  });

  it('は本文が紙の上で読める明度差を必ず作る', () => {
    for (const palette of [MAISON, COOL, [{ hex: '#EEEEEE' }, { hex: '#DDDDDD' }]]) {
      const theme = deriveTheme(palette);

      expect(luminance(theme.paper)).toBeGreaterThan(0.9);
      expect(luminance(theme.ink)).toBeLessThan(0.1);
      // 差し色は小見出しに使うので、紙の上で沈まない程度に抑える。
      expect(luminance(theme.accent)).toBeLessThan(0.65);
    }
  });

  it('はタイルの境界線を台紙と墨の間に置く（素材の明暗によらず枠が立つ）', () => {
    const theme = deriveTheme(MAISON);

    expect(luminance(theme.matEdge)).toBeLessThan(luminance(theme.mat));
    expect(luminance(theme.matEdge)).toBeGreaterThan(luminance(theme.ink));
  });

  it('はパレットの並び順に依存しない', () => {
    const reversed = deriveTheme([...MAISON].reverse());

    expect(reversed).toEqual(deriveTheme(MAISON));
  });

  it('は壊れた値を無視し、パレットが無ければ既定に落ちる', () => {
    expect(deriveTheme([{ hex: 'not-a-color' }])).toEqual(deriveTheme([]));
    expect(deriveTheme(undefined).paper).toBe(deriveTheme([]).paper);
  });
});
