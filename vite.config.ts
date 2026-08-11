import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // Unit and component tests live beside the code they cover. Playwright owns
    // `e2e/`, so it is excluded here to keep the two runners from colliding.
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    css: true,
    coverage: {
      provider: 'v8',
      // Report only — no thresholds. CI surfaces the numbers without failing
      // the build. Add `thresholds` here once the codebase has settled.
      reporter: ['text', 'html', 'lcov', 'json-summary'],
      reportsDirectory: './coverage',
      // List fully-covered files too — the point of the report is the whole
      // picture, not just today's gaps.
      skipFull: false,
      // `include` covers every source file, not just the ones a test happened
      // to import, so untested modules show up as 0% rather than vanishing.
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.{test,spec}.{ts,tsx}',
        'src/test/**',
        'src/main.tsx',
        'src/**/*.d.ts',
      ],
    },
  },
});
