import { defineConfig, devices } from '@playwright/test';

/*
 * 実案件1本の通し（第9章）を実ブラウザで走らせる設定。
 *
 * 通常の e2e とは分けてある。こちらは「壊れていないこと」を見るテストではなく、
 * **本番と同じ経路を通して、出力と数値を採る作業**である。所要時間も長い。
 */
const executablePath = process.env.CHROMIUM_PATH;

export default defineConfig({
  testDir: '.',
  // 章を順に入力していくので並列にしない。状態は1つの localStorage を共有する。
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 300_000,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'off',
    screenshot: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        ...(executablePath ? { launchOptions: { executablePath } } : {}),
      },
    },
  ],
  webServer: {
    command: 'npm run preview -- --port 4173 --strictPort --host 127.0.0.1',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
