import { Link, Outlet, useLocation, useMatch } from 'react-router-dom';
import { storageUsage } from '../domain/assets';
import { WORKFLOW_STEPS } from '../domain/steps';
import { useAppStore } from '../store/context';
import { Sidebar } from './Sidebar';

const SECTION_LABEL: Record<string, string> = {
  '': 'ダッシュボード',
  projects: '案件',
  new: '新規作成',
  portfolio: 'ポートフォリオ',
  settings: '設定',
};

function useCrumbs(): string[] {
  const location = useLocation();
  const { projects } = useAppStore();
  const match = useMatch('/projects/:projectId/*');
  const project = projects.find((item) => item.id === match?.params.projectId);

  if (project) {
    const segment = match?.params['*'] ?? '';
    const step = WORKFLOW_STEPS.find((item) => item.segment === segment);
    return ['案件', project.name, step?.label ?? ''].filter(Boolean);
  }

  const segments = location.pathname.split('/').filter(Boolean);
  if (segments.length === 0) return [SECTION_LABEL['']];
  return segments.map((segment) => SECTION_LABEL[segment] ?? segment);
}

/**
 * 2カラムのアプリシェル。上部バーは現在地と、案件を開いている間の主要アクションだけを持つ。
 * 案件作成や一覧への移動はサイドバーの役目なので、ここには置かない。
 */
export function AppShell() {
  const crumbs = useCrumbs();
  const { projects, assets, saveOutcome } = useAppStore();
  const usage = storageUsage(assets);
  const match = useMatch('/projects/:projectId/*');
  const project = projects.find((item) => item.id === match?.params.projectId);

  return (
    <div className="shell">
      <Sidebar />
      <div className="main">
        <header className="topbar">
          <p className="crumbs">{crumbs.join(' ／ ')}</p>
          {project && (
            <div className="actions">
              <Link
                className="btn btn--ghost btn--small"
                to={`/projects/${project.id}/proposal`}
              >
                提案書プレビュー
              </Link>
              <Link className="btn btn--small" to={`/projects/${project.id}/export`}>
                出力
              </Link>
            </div>
          )}
        </header>
        <main className="content">
          {/* 保存できていない状態を黙って続けない（第6章 6-9）。 */}
          {(saveOutcome.status === 'degraded' || saveOutcome.status === 'failed') && (
            <p className="form-error" role="alert">
              {saveOutcome.message}
            </p>
          )}
          {saveOutcome.status !== 'failed' && usage.level !== 'ok' && (
            <p className="form-error" role="status">
              {usage.level === 'full'
                ? '画像の保存容量がいっぱいです。新しい画像は保存できません。不要な画像を解除してください。'
                : `画像の保存容量が残りわずかです（${Math.round(usage.ratio * 100)}% 使用）。`}
            </p>
          )}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
