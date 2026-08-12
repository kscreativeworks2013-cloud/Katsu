import { render, type RenderResult } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from '../app/routes';
import { AppStoreProvider } from '../store/AppStoreProvider';

/**
 * アプリ全体を指定URLでマウントする。ルーティングとストアを含めて検証したい
 * コンポーネントテストはこれを使う（Router は MemoryRouter に差し替える）。
 */
export function renderApp(path = '/'): RenderResult {
  return render(
    <AppStoreProvider>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </AppStoreProvider>,
  );
}
