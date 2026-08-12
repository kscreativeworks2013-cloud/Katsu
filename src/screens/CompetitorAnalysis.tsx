import { useParams } from 'react-router-dom';
import { useAppStore, useProject } from '../store/context';
import { Card, EmptyState, PageHeader, Skeleton } from '../ui/primitives';

const MAP_SIZE = { width: 520, height: 360, pad: 44 };

/** 3-5 競合分析：競合との差分を可視化し、差別化軸を決める。 */
export function CompetitorAnalysisScreen() {
  const { projectId = '' } = useParams();
  const { project, workspace } = useProject(projectId);
  const { runStep, updateWorkspace, generating } = useAppStore();

  if (!project || !workspace) return null;

  const busy = generating === `${projectId}:competitors`;
  const { competitors, differentiators } = workspace;

  const toX = (value: number) => MAP_SIZE.pad + value * (MAP_SIZE.width - MAP_SIZE.pad * 2);
  const toY = (value: number) =>
    MAP_SIZE.height - MAP_SIZE.pad - value * (MAP_SIZE.height - MAP_SIZE.pad * 2);

  return (
    <>
      <PageHeader
        title="競合分析"
        lead="競合の立ち位置を並べ、この案件で取るべき差別化軸を決めます。"
        actions={
          <button
            className="btn"
            type="button"
            onClick={() => runStep(projectId, 'competitors')}
            disabled={busy}
          >
            {busy ? '分析中…' : competitors.length > 0 ? '再分析' : 'AIで分析'}
          </button>
        }
      />

      {busy && (
        <Card title="競合ブランド">
          <Skeleton lines={4} />
        </Card>
      )}

      {!busy && competitors.length === 0 && (
        <Card title="競合ブランド">
          <EmptyState
            title="競合がまだ登録されていません"
            description="案件情報の競合ブランドを元に、ポジションと差別化ポイントを整理します。"
            action={
              <button
                className="btn"
                type="button"
                onClick={() => runStep(projectId, 'competitors')}
              >
                AIで分析する
              </button>
            }
          />
        </Card>
      )}

      {!busy && competitors.length > 0 && (
        <>
          <Card
            title="ポジショニングマップ"
            description="縦軸：クラシック⇔ドラマティック／横軸：ミニマル⇔モダン"
          >
            <svg
              className="map"
              viewBox={`0 0 ${MAP_SIZE.width} ${MAP_SIZE.height}`}
              role="img"
              aria-label={`ポジショニングマップ。${project.brand}と競合${competitors.length}ブランドの配置。`}
            >
              <line
                x1={MAP_SIZE.pad}
                y1={MAP_SIZE.height / 2}
                x2={MAP_SIZE.width - MAP_SIZE.pad}
                y2={MAP_SIZE.height / 2}
                stroke="#E6E0D6"
              />
              <line
                x1={MAP_SIZE.width / 2}
                y1={MAP_SIZE.pad}
                x2={MAP_SIZE.width / 2}
                y2={MAP_SIZE.height - MAP_SIZE.pad}
                stroke="#E6E0D6"
              />
              <text
                x={MAP_SIZE.width / 2}
                y={22}
                textAnchor="middle"
                fontSize="11"
                fill="#8A8279"
              >
                ドラマティック
              </text>
              <text
                x={MAP_SIZE.width / 2}
                y={MAP_SIZE.height - 8}
                textAnchor="middle"
                fontSize="11"
                fill="#8A8279"
              >
                クラシック
              </text>
              <text x={8} y={MAP_SIZE.height / 2 - 8} fontSize="11" fill="#8A8279">
                ミニマル
              </text>
              <text
                x={MAP_SIZE.width - 8}
                y={MAP_SIZE.height / 2 - 8}
                textAnchor="end"
                fontSize="11"
                fill="#8A8279"
              >
                モダン
              </text>

              {competitors.map((competitor) => (
                <g key={competitor.id}>
                  <circle cx={toX(competitor.x)} cy={toY(competitor.y)} r="5" fill="#8A8279" />
                  <text
                    x={toX(competitor.x) + 10}
                    y={toY(competitor.y) + 4}
                    fontSize="11"
                    fill="#3A352F"
                  >
                    {competitor.name}
                  </text>
                </g>
              ))}

              <g>
                <circle cx={toX(0.42)} cy={toY(0.58)} r="7" fill="#B3936A" />
                <text x={toX(0.42) + 12} y={toY(0.58) + 4} fontSize="12" fill="#12100E">
                  {project.brand}（自ブランド）
                </text>
              </g>
            </svg>
          </Card>

          <div className="grid grid--3">
            {competitors.map((competitor) => (
              <Card
                key={competitor.id}
                title={competitor.name}
                description={competitor.position}
              >
                <dl className="stack" style={{ margin: 0 }}>
                  <div>
                    <dt className="muted">ビジュアル特徴</dt>
                    <dd style={{ margin: 0 }}>{competitor.visual}</dd>
                  </div>
                  <div>
                    <dt className="muted">トーン</dt>
                    <dd style={{ margin: 0 }}>{competitor.tone}</dd>
                  </div>
                  <div>
                    <dt className="muted">強み</dt>
                    <dd style={{ margin: 0 }}>{competitor.strength}</dd>
                  </div>
                  <div>
                    <dt className="muted">弱み</dt>
                    <dd style={{ margin: 0 }}>{competitor.weakness}</dd>
                  </div>
                </dl>
              </Card>
            ))}
          </div>

          <Card
            title="差別化ポイント"
            description="採用した項目がコンセプト生成の条件として引き継がれます。"
          >
            <div className="stack">
              {differentiators.map((item) => (
                <label className="check" key={item.id}>
                  <input
                    type="checkbox"
                    checked={item.adopted}
                    onChange={() =>
                      updateWorkspace(projectId, {
                        differentiators: differentiators.map((row) =>
                          row.id === item.id ? { ...row, adopted: !row.adopted } : row,
                        ),
                      })
                    }
                  />
                  {item.text}
                </label>
              ))}
            </div>
          </Card>
        </>
      )}
    </>
  );
}
