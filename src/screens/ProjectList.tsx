import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { ProjectStatus } from '../data/types';
import { GENRES, PROJECT_STATUS_LABEL } from '../data/workflow';
import { WORKFLOW_STEPS } from '../domain/steps';
import {
  currentStep,
  filterProjects,
  formatDate,
  formatYen,
  workflowProgress,
} from '../lib/projects';
import { useAppStore } from '../store/context';
import { Badge, Card, EmptyState, Field, PageHeader } from '../ui/primitives';

const STATUSES: ProjectStatus[] = ['draft', 'in_progress', 'review', 'delivered'];

/** 3-3 案件一覧：検索・絞り込みと、成果物への直接アクセス。 */
export function ProjectList() {
  const { projects } = useAppStore();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [genre, setGenre] = useState('all');

  const visible = filterProjects(projects, { query, status, genre });
  const filtered = query !== '' || status !== 'all' || genre !== 'all';

  function reset() {
    setQuery('');
    setStatus('all');
    setGenre('all');
  }

  return (
    <>
      <PageHeader
        title="案件一覧"
        lead="案件名・ブランド・クライアント・キーワードで検索できます。"
        actions={
          <Link className="btn" to="/projects/new">
            新しい案件を作成
          </Link>
        }
      />

      <Card>
        <div className="grid grid--3">
          <Field label="検索">
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="案件名、ブランド、キーワード"
            />
          </Field>
          <Field label="ステータス">
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="all">すべて</option>
              {STATUSES.map((value) => (
                <option key={value} value={value}>
                  {PROJECT_STATUS_LABEL[value]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="ジャンル">
            <select value={genre} onChange={(event) => setGenre(event.target.value)}>
              <option value="all">すべて</option>
              {GENRES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </Card>

      <Card title={`案件 ${visible.length}件`}>
        {visible.length === 0 ? (
          <EmptyState
            title="該当する案件がありません"
            description={
              filtered
                ? '検索条件を変えるか、条件をリセットしてください。'
                : '最初の案件を作成してください。'
            }
            action={
              filtered ? (
                <button className="btn btn--ghost" type="button" onClick={reset}>
                  条件をリセット
                </button>
              ) : (
                <Link className="btn" to="/projects/new">
                  新しい案件を作成
                </Link>
              )
            }
          />
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>案件</th>
                  <th>ジャンル</th>
                  <th>ステータス</th>
                  <th>進捗</th>
                  <th>納期</th>
                  <th>予算</th>
                  <th>成果物</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((project) => {
                  const step = currentStep(project.steps);
                  const segment = WORKFLOW_STEPS.find((item) => item.id === step)?.segment;
                  const progress = workflowProgress(project.steps);
                  return (
                    <tr key={project.id}>
                      <td>
                        <Link to={`/projects/${project.id}/${segment}`}>{project.name}</Link>
                        <p className="muted">
                          {project.brand} ／ {project.client}
                        </p>
                      </td>
                      <td>{project.genre}</td>
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
                      <td>{project.budget > 0 ? formatYen(project.budget) : '—'}</td>
                      <td>
                        <div className="actions">
                          <Link
                            className="btn btn--ghost btn--small"
                            to={`/projects/${project.id}/proposal?lang=ja`}
                          >
                            日本語提案書
                          </Link>
                          <Link
                            className="btn btn--ghost btn--small"
                            to={`/projects/${project.id}/proposal?lang=en`}
                          >
                            English Proposal
                          </Link>
                          <Link
                            className="btn btn--ghost btn--small"
                            to={`/projects/${project.id}/export`}
                          >
                            PDF／PowerPoint出力
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
