import { BrowserRouter } from 'react-router-dom';
import { AppRoutes } from './app/routes';
import { AppStoreProvider } from './store/AppStoreProvider';

export default function App() {
  return (
    <AppStoreProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AppStoreProvider>
  );
}
