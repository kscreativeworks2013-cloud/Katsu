import { useParams } from 'react-router-dom';
import { isProtected } from '../domain/provenance';
import { useAppStore, useIsRunning, useProject } from '../store/context';
import { Badge, Card, Chips, EmptyState, PageHeader, Skeleton } from '../ui/primitives';

/** 3-6 撮影コンセプト生成：2〜3案を生成し、1案を採用する。 */
export function ConceptsScreen() {
  const { projectId = '' } = useParams();
  const { workspace, provenance } = useProject(projectId);
  const { requestRun, setAdoptedConcept, pendingRun } = useAppStore();
  const busy = useIsRunning(projectId, 'concepts');

  if (!workspace) return null;

  const { concepts, adoptedConceptId } = workspace;
  const hasAdopted = concepts.some((concept) => concept.id === adoptedConceptId);
  const edited = isProtected(provenance, 'concepts.list');

  return (
    <>
      <PageHeader
        title="撮影コンセプト"
        lead="採用した1案が、ムードボード以降の生成条件として引き継がれます。"
        actions={
          <button
            className="btn"
            type="button"
            onClick={() => requestRun(projectId, 'concepts')}
            disabled={pendingRun !== null}
          >
            {busy ? '生成中…' : concepts.length > 0 ? 'コンセプトを再生成' : 'AIで生成'}
          </button>
        }
      />

      {busy && (
        <div className="grid grid--3">
          {[0, 1, 2].map((index) => (
            <Card key={index}>
              <Skeleton lines={4} />
            </Card>
          ))}
        </div>
      )}

      {!busy && concepts.length === 0 && (
        <Card>
          <EmptyState
            title="コンセプトがまだありません"
            description="ブランド分析と差別化ポイントを条件に、撮影コンセプトを3案生成します。"
            action={
              <button
                className="btn"
                type="button"
                onClick={() => requestRun(projectId, 'concepts')}
                disabled={pendingRun !== null}
              >
                AIで生成する
              </button>
            }
          />
        </Card>
      )}

      {!busy && concepts.length > 0 && (
        <>
          {!hasAdopted && (
            <p className="form-error" role="status">
              採用案が未選択です。1案を採用すると以降のステップに引き継がれます。
            </p>
          )}
          {edited && (
            <p className="muted">
              コンセプト一覧は手動編集済みです。再生成しても、差分プレビューで明示的に選ばない限り上書きされません。
            </p>
          )}
          <div className="grid grid--3">
            {concepts.map((concept) => {
              const adopted = concept.id === adoptedConceptId;
              return (
                <article
                  key={concept.id}
                  className={[
                    'concept',
                    adopted ? 'concept--adopted' : '',
                    hasAdopted && !adopted ? 'concept--muted' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <h3>{concept.title}</h3>
                    {adopted && <Badge tone="done">採用</Badge>}
                  </div>
                  <dl style={{ margin: 0 }}>
                    <dt>狙い</dt>
                    <dd>{concept.aim}</dd>
                    <dt>ストーリー</dt>
                    <dd>{concept.story}</dd>
                    <dt>ビジュアル方向性</dt>
                    <dd>{concept.direction}</dd>
                    <dt>想定カット数</dt>
                    <dd>{concept.cutCount}カット</dd>
                  </dl>
                  <Chips items={concept.keywords} />
                  <button
                    className={adopted ? 'btn btn--ghost' : 'btn'}
                    type="button"
                    onClick={() => setAdoptedConcept(projectId, concept.id)}
                    disabled={adopted}
                  >
                    {adopted ? '採用済み' : `${concept.title} を採用`}
                  </button>
                </article>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
