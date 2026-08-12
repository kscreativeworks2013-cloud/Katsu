import { useState } from 'react';
import { useParams } from 'react-router-dom';
import type { Shot } from '../data/types';
import { createId } from '../lib/projects';
import { useAppStore, usePendingRun, useProject } from '../store/context';
import { Badge, Card, EmptyState, PageHeader, Skeleton } from '../ui/primitives';

const PRIORITY_LABEL: Record<Shot['priority'], string> = {
  must: '必須',
  want: '推奨',
  option: '任意',
};

/** 3-8 ショットリスト／絵コンテ：撮影当日に使える単位までコンセプトを分解する。 */
export function ShotListScreen() {
  const { projectId = '' } = useParams();
  const { project, workspace } = useProject(projectId);
  const { requestRun, editField } = useAppStore();
  const pending = usePendingRun(projectId, 'shots');
  const busy = pending?.status === 'running';
  const blocked = pending !== undefined;
  const [view, setView] = useState<'list' | 'board'>('list');

  if (!project || !workspace) return null;

  const shots = workspace.shots;

  /** 必須カットがリストに現れているか（第3章 3-8 の警告表示）。 */
  const missingMustCuts = project.mustCuts.filter(
    (cut) => !shots.some((shot) => shot.subject.includes(cut) || cut.includes(shot.subject)),
  );

  function write(next: Shot[]) {
    // 行の編集・並べ替え・削除は手動編集。以降このコレクションは再生成から保護される。
    editField(
      projectId,
      'shots.list',
      next.map((shot, index) => ({ ...shot, no: index + 1 })),
    );
  }

  function duplicate(shotId: string) {
    const index = shots.findIndex((shot) => shot.id === shotId);
    if (index < 0) return;
    const copy = { ...shots[index], id: createId('shot') };
    write([...shots.slice(0, index + 1), copy, ...shots.slice(index + 1)]);
  }

  function move(shotId: string, direction: -1 | 1) {
    const index = shots.findIndex((shot) => shot.id === shotId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= shots.length) return;
    const next = [...shots];
    [next[index], next[target]] = [next[target], next[index]];
    write(next);
  }

  return (
    <>
      <PageHeader
        title="ショットリスト／絵コンテ"
        lead="リストと絵コンテは同じデータを別の見え方で表示しています。"
        actions={
          <button
            className="btn"
            type="button"
            onClick={() => requestRun(projectId, 'shots')}
            disabled={blocked}
          >
            {busy ? '生成中…' : shots.length > 0 ? 'カットを追加生成' : 'AIで生成'}
          </button>
        }
      />

      {busy && (
        <Card>
          <Skeleton lines={6} />
        </Card>
      )}

      {!busy && shots.length === 0 && (
        <Card>
          <EmptyState
            title="カットがまだありません"
            description="採用コンセプトと必須カットから、撮影単位のショットリストを作ります。"
            action={
              <button
                className="btn"
                type="button"
                onClick={() => requestRun(projectId, 'shots')}
                disabled={blocked}
              >
                AIで生成する
              </button>
            }
          />
        </Card>
      )}

      {!busy && shots.length > 0 && (
        <>
          {missingMustCuts.length > 0 && (
            <p className="form-error" role="status">
              必須カットが未反映です：{missingMustCuts.join('、')}
            </p>
          )}

          <div className="tabs" role="tablist" aria-label="表示切替">
            <button
              className="tab"
              type="button"
              role="tab"
              aria-selected={view === 'list'}
              onClick={() => setView('list')}
            >
              ショットリスト
            </button>
            <button
              className="tab"
              type="button"
              role="tab"
              aria-selected={view === 'board'}
              onClick={() => setView('board')}
            >
              絵コンテ
            </button>
          </div>

          {view === 'list' ? (
            <Card title={`カット ${shots.length}件`}>
              <div className="table-scroll">
                <table className="table">
                  <thead>
                    <tr>
                      <th>No.</th>
                      <th>カット内容</th>
                      <th>レンズ</th>
                      <th>ライティング</th>
                      <th>構図</th>
                      <th>尺／枚数</th>
                      <th>優先度</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shots.map((shot) => (
                      <tr key={shot.id}>
                        <td>{shot.no}</td>
                        <td>
                          {shot.subject}
                          <p className="muted">{shot.description}</p>
                          {shot.note && <p className="muted">備考：{shot.note}</p>}
                        </td>
                        <td>{shot.lens}</td>
                        <td>{shot.lighting}</td>
                        <td>{shot.composition}</td>
                        <td>{shot.volume}</td>
                        <td>
                          <label>
                            <span className="visually-hidden">カット{shot.no}の優先度</span>
                            <select
                              value={shot.priority}
                              onChange={(event) =>
                                write(
                                  shots.map((row) =>
                                    row.id === shot.id
                                      ? {
                                          ...row,
                                          priority: event.target.value as Shot['priority'],
                                        }
                                      : row,
                                  ),
                                )
                              }
                            >
                              {(['must', 'want', 'option'] as const).map((value) => (
                                <option key={value} value={value}>
                                  {PRIORITY_LABEL[value]}
                                </option>
                              ))}
                            </select>
                          </label>
                        </td>
                        <td>
                          <div className="actions">
                            <button
                              className="btn btn--ghost btn--small"
                              type="button"
                              onClick={() => move(shot.id, -1)}
                              aria-label={`カット${shot.no}を前へ`}
                            >
                              ↑
                            </button>
                            <button
                              className="btn btn--ghost btn--small"
                              type="button"
                              onClick={() => move(shot.id, 1)}
                              aria-label={`カット${shot.no}を後ろへ`}
                            >
                              ↓
                            </button>
                            <button
                              className="btn btn--ghost btn--small"
                              type="button"
                              onClick={() => duplicate(shot.id)}
                              aria-label={`カット${shot.no}を複製`}
                            >
                              複製
                            </button>
                            <button
                              className="btn btn--ghost btn--small"
                              type="button"
                              onClick={() => write(shots.filter((row) => row.id !== shot.id))}
                              aria-label={`カット${shot.no}を削除`}
                            >
                              削除
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : (
            <div className="grid grid--3">
              {shots.map((shot) => (
                <Card key={shot.id} title={`Cut ${shot.no}｜${shot.subject}`}>
                  <svg
                    viewBox="0 0 160 100"
                    className="map"
                    role="img"
                    aria-label={`カット${shot.no}のフレーム構成`}
                  >
                    <rect x="0" y="0" width="160" height="100" fill="#F7F3EC" />
                    <rect x="12" y="10" width="136" height="80" fill="none" stroke="#D3C9B8" />
                    <line x1="57" y1="10" x2="57" y2="90" stroke="#E6E0D6" />
                    <line x1="103" y1="10" x2="103" y2="90" stroke="#E6E0D6" />
                    <line x1="12" y1="37" x2="148" y2="37" stroke="#E6E0D6" />
                    <line x1="12" y1="63" x2="148" y2="63" stroke="#E6E0D6" />
                    <circle cx="80" cy="50" r="18" fill="#B3936A" opacity="0.35" />
                  </svg>
                  <p style={{ marginTop: 12 }}>{shot.description}</p>
                  <p className="muted">
                    {shot.lens}／{shot.lighting}／{shot.composition}
                  </p>
                  <Badge tone={shot.priority === 'must' ? 'alert' : 'neutral'}>
                    {PRIORITY_LABEL[shot.priority]}
                  </Badge>
                </Card>
              ))}
            </div>
          )}

          <Card title="ライティングプラン" description="ショットリスト全体に共通する光の設計。">
            <dl className="grid grid--3" style={{ margin: 0 }}>
              <div>
                <dt className="muted">主光源</dt>
                <dd style={{ margin: 0 }}>{project.creative.lighting || '面光源＋レフ'}</dd>
              </div>
              <div>
                <dt className="muted">レンズ</dt>
                <dd style={{ margin: 0 }}>{project.creative.lens || '100mm macro / 85mm'}</dd>
              </div>
              <div>
                <dt className="muted">機材</dt>
                <dd style={{ margin: 0 }}>
                  {project.production.gear || '中判デジタル、定常光'}
                </dd>
              </div>
              <div>
                <dt className="muted">質感</dt>
                <dd style={{ margin: 0 }}>{project.creative.texture || 'マットな肌質'}</dd>
              </div>
              <div>
                <dt className="muted">レタッチ方針</dt>
                <dd style={{ margin: 0 }}>{project.creative.retouch || '質感を残す'}</dd>
              </div>
              <div>
                <dt className="muted">NG事項</dt>
                <dd style={{ margin: 0 }}>{project.ngNotes.join('、') || '指定なし'}</dd>
              </div>
            </dl>
          </Card>
        </>
      )}
    </>
  );
}
