import { Navigate, Route, Routes } from 'react-router-dom';
import { BrandAnalysisScreen } from '../screens/BrandAnalysis';
import { CompetitorAnalysisScreen } from '../screens/CompetitorAnalysis';
import { ConceptsScreen } from '../screens/Concepts';
import { Dashboard } from '../screens/Dashboard';
import { ExportScreen } from '../screens/ExportScreen';
import { MoodboardScreen } from '../screens/Moodboard';
import { NotFound } from '../screens/NotFound';
import { PortfolioScreen } from '../screens/Portfolio';
import { ProjectList } from '../screens/ProjectList';
import { ProjectNew } from '../screens/ProjectNew';
import { PromptStudioScreen } from '../screens/PromptStudio';
import { ProposalPreviewScreen } from '../screens/ProposalPreview';
import { SettingsScreen } from '../screens/Settings';
import { ShotListScreen } from '../screens/ShotList';
import { AppShell } from './AppShell';
import { ProjectLayout } from './ProjectLayout';

/**
 * ルート定義。Router を含まないので、テストからは MemoryRouter で包んで使える。
 * 案件内の8画面は ProjectLayout（ステッパー）配下に置く。
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Dashboard />} />
        <Route path="projects" element={<ProjectList />} />
        <Route path="projects/new" element={<ProjectNew />} />
        <Route path="projects/:projectId" element={<ProjectLayout />}>
          <Route index element={<Navigate to="brand" replace />} />
          <Route path="brand" element={<BrandAnalysisScreen />} />
          <Route path="competitors" element={<CompetitorAnalysisScreen />} />
          <Route path="concepts" element={<ConceptsScreen />} />
          <Route path="moodboard" element={<MoodboardScreen />} />
          <Route path="shots" element={<ShotListScreen />} />
          <Route path="prompts" element={<PromptStudioScreen />} />
          <Route path="proposal" element={<ProposalPreviewScreen />} />
          <Route path="export" element={<ExportScreen />} />
        </Route>
        <Route path="portfolio" element={<PortfolioScreen />} />
        <Route path="settings" element={<SettingsScreen />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
