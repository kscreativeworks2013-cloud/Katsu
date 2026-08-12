import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Vitest runs with `globals: false`, so Testing Library's automatic cleanup
// hook never registers itself. Unmount explicitly between tests to stop DOM
// from one test leaking into the next.
afterEach(() => {
  cleanup();
  // アプリは localStorage に状態を保存する。テスト間で持ち越さないよう毎回消す。
  localStorage.clear();
});
