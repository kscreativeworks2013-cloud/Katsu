import { describe, expect, it } from 'vitest';
import { splitUnits, wrapText } from './kinsoku';

/*
 * 日本語の行分割（第8章）。
 * 実測で出た2つの破綻を直接見る。
 *   1) 行頭に小書きの「っ」が来る（「肌の質感へ寄／っていく」）
 *   2) 欧文が語中で折れる（「MAISON LUMIÈRE／ら／しさ」）
 * 幅は「全角1文字＝2、半角1文字＝1」の単純なモデルで測る。禁則の判定に字形は要らない。
 */
const measure = (text: string): number =>
  [...text].reduce((sum, char) => sum + (char.charCodeAt(0) < 0x100 ? 1 : 2), 0);

describe('wrapText', () => {
  it('は行頭に小書き仮名・句読点・閉じ括弧・長音符を置かない', () => {
    // そのまま折ると「寄」で切れて次行が「っ」から始まる幅にする。
    const lines = wrapText('肌の質感へ寄っていく。', measure, 12);

    expect(lines[0]).not.toMatch(/[っ、。」ー]$/);
    for (const line of lines.slice(1)) {
      expect(line.startsWith('っ')).toBe(false);
      expect(line.startsWith('。')).toBe(false);
    }
    // 追い出しても字は落とさない。
    expect(lines.join('')).toBe('肌の質感へ寄っていく。');
  });

  it('は行末に開き括弧を置かない', () => {
    const lines = wrapText('光と質感（マットな肌）で語る', measure, 12);

    for (const line of lines) expect(line.endsWith('（')).toBe(false);
    expect(lines.join('')).toBe('光と質感（マットな肌）で語る');
  });

  it('は欧文の語を途中で折らない', () => {
    const lines = wrapText('MAISON LUMIÈREらしさを語る', measure, 14);

    expect(lines.some((line) => line.includes('MAISON'))).toBe(true);
    for (const line of lines) {
      // 語の断片（LUMIÈ／RE のような分かれ方）が出ていないこと。
      expect(line).not.toMatch(/LUMI$|^RE/);
    }
    expect(lines.join('')).toBe('MAISON LUMIÈREらしさを語る');
  });

  it('は枠より長い語だけは字で折る（面からはみ出させない）', () => {
    const lines = wrapText('ABCDEFGHIJKLMNOP', measure, 6);

    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(measure(line)).toBeLessThanOrEqual(6);
  });

  it('は改行を段落の区切りとして残す', () => {
    expect(wrapText('あい\nうえ', measure, 10)).toEqual(['あい', 'うえ']);
  });
});

describe('splitUnits', () => {
  it('は欧文の語と和文1字を単位にする', () => {
    expect(splitUnits('100mm macro／中央')).toEqual(['100mm', ' ', 'macro', '／', '中', '央']);
  });

  it('は語中の記号を語に含める', () => {
    expect(splitUnits('余白は画面の1/3')).toEqual(['余', '白', 'は', '画', '面', 'の', '1/3']);
  });
});
