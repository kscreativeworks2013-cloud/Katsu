import { defineConfig } from 'vitest/config';

/*
 * 版面案の PDF を書き出すためだけの設定（第8章 (b)）。
 * 通常のテスト実行（vite.config.ts の include は src/ のみ）には混ざらない。
 *   npx vitest run --config tools/layout-preview/vitest.config.ts
 */
export default defineConfig({
  test: {
    include: ['tools/layout-preview/*.test.ts'],
    environment: 'node',
    testTimeout: 120_000,
  },
});
