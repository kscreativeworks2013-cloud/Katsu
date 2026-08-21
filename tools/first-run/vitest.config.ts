import { defineConfig } from 'vitest/config';

/*
 * 通しの測定を回すための設定（第9章 工程R-9）。
 * 通常のテスト実行には混ざらない（時間がかかるうえ、合否ではなく数値が成果物）。
 *   npx vitest run --config tools/first-run/vitest.config.ts
 */
export default defineConfig({
  test: {
    include: ['tools/first-run/*.test.ts'],
    environment: 'node',
    testTimeout: 900_000,
  },
});
