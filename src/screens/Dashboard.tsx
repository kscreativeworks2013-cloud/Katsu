import { Link } from 'react-router-dom';
import { EXPORT_FORMAT_LABEL, PROJECT_STATUS_LABEL } from '../data/workflow';
import { WORKFLOW_STEPS } from '../domain/steps';
import { currentStep, dueThisWeek, formatDate, workflowProgress } from '../lib/projects';
import { useAppStore } from '../store/context';
import { Badge, Card, EmptyState, PageHeader, Stat } from '../ui/primitives';

/** 3-1 ダッシュボード：進行中の案件と直近の成果物へ最短で到達する。 */
export function Dashboard() {
  const { projects, workspaces } = useAppStore();
  const today = new Date();

  const active = projects.filter((project) => project.status !== 'delivered');
  const dueSoon = dueThisWeek(projects, today);
  const exports = Object.entries(workspaces)
    .flatMap(([projectId, workspace]) =>
      workspace.exports.map((record) => ({ ...record, projectId })),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const proposals = projects.filter(
    (project) => project.steps.proposal.status !== 'todo',
  ).length;

  return (
    <>
      <PageHeader
        title="ダッシュボード"
        lead="進行中の案件と、直近に出力した提案書をここから開けます。"
        actions={
          <Link className="btn" to="/projects/new">
            新しい案件を作成
          </Link>
        }
      />

      <dl className="grid grid--4" style={{ margin: 0 }}>
        <Stat label="進行中案件" value={String(active.length)} unit="件" />
        <Stat label="今週の締切" value={String(dueSoon.length)} unit="件" />
        <Stat label="生成済み提案書" value={String(proposals)} unit="件" />
        <Stat label="出力ファイル" value={String(exports.length)} unit="件" />
      </dl>

      <Card
        id="recent-projects"
        title="最近の案件"
        description="行を選ぶと、直近の作業ステップから再開します。"
      >
        {projects.length === 0 ? (
          <EmptyState
            title="案件がまだありません"
            description="最初の案件を作成すると、ここに進捗が表示されます。"
            action={
              <Link className="btn" to="/projects/new">
                新しい案件を作成
              </Link>
            }
          />
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>案件名</th>
                  <th>ブランド</th>
                  <th>ステータス</th>
                  <th>進捗</th>
                  <th>納期</th>
                </tr>
              </thead>
              <tbody>
                {projects.slice(0, 5).map((project) => {
                  const step = currentStep(project.steps);
                  const segment = WORKFLOW_STEPS.find((item) => item.id === step)?.segment;
                  const progress = workflowProgress(project.steps);
                  return (
                    <tr key={project.id}>
                      <td>
                        <Link to={`/projects/${project.id}/${segment}`}>{project.name}</Link>
                        <p className="muted">{project.client}</p>
                      </td>
                      <td>{project.brand}</td>
                      <td>
                        <Badge
                          tone={
                            project.status === 'delivered'
                              ? 'done'
                              : project.status === 'draft'
                                ? 'neutral'
                                : 'progress'
                          }
                        >
                          {PROJECT_STATUS_LABEL[project.status]}
                        </Badge>
                      </td>
                      <td>
                        {progress}%
                        <span className="meter" aria-hidden="true">
                          <span style={{ width: `${progress}%` }} />
                        </span>
                      </td>
                      <td>{formatDate(project.dueDate)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card id="recent-exports" title="最近出力したファイル">
        {exports.length === 0 ? (
          <EmptyState
            title="出力履歴がありません"
            description="提案書を出力すると、ここから再ダウンロードできます。"
          />
        ) : (
          <ul className="stack" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {exports.slice(0, 5).map((record) => (
              <li className="row" key={record.id} style={{ justifyContent: 'space-between' }}>
                <span>
                  {record.fileName}
                  <span className="muted"> ／ {formatDate(record.createdAt)}</span>
                </span>
                <span className="row">
                  <Badge>{EXPORT_FORMAT_LABEL[record.format]}</Badge>
                  <Link
                    className="btn btn--ghost btn--small"
                    to={`/projects/${record.projectId}/export`}
                  >
                    出力画面へ
                  </Link>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
