import { NavLink, useMatch } from 'react-router-dom';
import { WORKFLOW_STEPS } from '../data/workflow';
import { useAppStore } from '../store/context';

const GLOBAL_LINKS = [
  { to: '/', label: 'ダッシュボード', end: true },
  { to: '/projects', label: '案件一覧', end: true },
  { to: '/projects/new', label: '新しい案件作成', end: true },
];

const LIBRARY_LINKS = [
  { to: '/portfolio', label: 'ポートフォリオ', end: true },
  { to: '/settings', label: '設定', end: true },
];

/**
 * 左サイドバー。案件を選択している間だけ制作ステップを表示する（第3章 共通レイアウト）。
 */
export function Sidebar() {
  const { projects } = useAppStore();
  const match = useMatch('/projects/:projectId/*');
  const activeProject = projects.find((project) => project.id === match?.params.projectId);

  return (
    <nav className="sidebar" aria-label="グローバルナビゲーション">
      <div className="wordmark">
        Luxury Beauty
        <span>Visual Proposal OS</span>
      </div>

      <div className="nav-group">
        <h2>案件管理</h2>
        {GLOBAL_LINKS.map((link) => (
          <NavLink key={link.to} to={link.to} end={link.end} className="nav-link">
            {link.label}
          </NavLink>
        ))}
      </div>

      {activeProject && (
        <div className="nav-group nav-project">
          <h2>制作ステップ</h2>
          <p className="nav-project-name">{activeProject.name}</p>
          <p className="nav-project-brand">{activeProject.brand}</p>
          {WORKFLOW_STEPS.map((step) => (
            <NavLink
              key={step.id}
              to={`/projects/${activeProject.id}/${step.segment}`}
              className="nav-link"
            >
              {step.label}
              {activeProject.steps[step.id] === 'done' && (
                <span className="nav-step-mark" aria-label="完了">
                  ✓
                </span>
              )}
            </NavLink>
          ))}
        </div>
      )}

      <div className="nav-group">
        <h2>ライブラリ</h2>
        {LIBRARY_LINKS.map((link) => (
          <NavLink key={link.to} to={link.to} end={link.end} className="nav-link">
            {link.label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
