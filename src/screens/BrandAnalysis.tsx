import { useParams } from 'react-router-dom';
import { isProtected } from '../domain/provenance';
import { useAppStore, useIsRunning, useProject } from '../store/context';
import {
  Badge,
  Card,
  Chips,
  EmptyState,
  Field,
  PageHeader,
  Skeleton,
  Swatches,
} from '../ui/primitives';

/**
 * 手動編集済みのフィールドに付ける印。再生成時はこの印が保護の根拠になる。
 * ラベルの外に置く：中に入れると入力欄のアクセシブル名にこの文言が混ざる。
 */
function EditedMark({ edited }: { edited: boolean }) {
  if (!edited) return null;
  return <p className="muted">手動編集済み（再生成から保護）</p>;
}

/** 3-4 ブランド分析：資料から世界観・トーン・ターゲット・ビジュアルコードを抽出する。 */
export function BrandAnalysisScreen() {
  const { projectId = '' } = useParams();
  const { project, workspace, provenance } = useProject(projectId);
  const { requestRun, editField, pendingRun } = useAppStore();
  const busy = useIsRunning(projectId, 'brand');

  if (!project || !workspace) return null;

  const brand = workspace.brand;
  const hasBrand = brand !== undefined;
  const blocked = pendingRun !== null;

  const sources = [
    { label: 'ブランドURL', value: project.brandUrl },
    { label: 'ブランドコンセプト', value: project.brandConcept },
    { label: 'ターゲット顧客', value: project.targetCustomer },
    ...project.references.map((reference) => ({ label: '参考資料', value: reference })),
  ];

  return (
    <>
      <PageHeader
        title="ブランド分析"
        lead="ブランド資料から抽出した内容です。手動編集した項目は再生成から保護されます。"
        actions={
          <button
            className="btn"
            type="button"
            onClick={() => requestRun(projectId, 'brand')}
            disabled={blocked}
          >
            {busy ? '解析中…' : hasBrand ? 'AIで再解析' : 'AIで解析'}
          </button>
        }
      />

      <Card title="入力ソース" description="読み込んだ資料と、その反映状況。">
        {sources.filter((source) => source.value).length === 0 ? (
          <EmptyState
            title="ソースが登録されていません"
            description="ブランドURL・ガイドライン・参考資料を案件情報に追加すると精度が上がります。"
          />
        ) : (
          <ul className="stack" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {sources
              .filter((source) => source.value)
              .map((source, index) => (
                <li className="row" key={`${source.label}-${index}`}>
                  <Badge tone={hasBrand ? 'done' : 'neutral'}>
                    {hasBrand ? '読み込み済み' : '未読み込み'}
                  </Badge>
                  <span className="muted">{source.label}</span>
                  <span>{source.value}</span>
                </li>
              ))}
          </ul>
        )}
      </Card>

      {busy && (
        <Card title="抽出結果">
          <Skeleton lines={5} />
        </Card>
      )}

      {!busy && !hasBrand && (
        <Card title="抽出結果">
          <EmptyState
            title="まだ解析していません"
            description="登録済みのブランド資料と案件情報から、世界観・トーン・ビジュアルコードを抽出します。"
            action={
              <button
                className="btn"
                type="button"
                onClick={() => requestRun(projectId, 'brand')}
                disabled={blocked}
              >
                AIで解析する
              </button>
            }
          />
        </Card>
      )}

      {!busy && brand && (
        <>
          <Card
            title="抽出結果"
            description="編集するとその項目は手動編集済みになり、再生成では上書きされません。"
          >
            <div className="grid grid--2">
              <div className="stack" style={{ gap: 4 }}>
                <Field label="ブランドの世界観">
                  <textarea
                    value={brand.worldview}
                    onChange={(event) =>
                      editField(projectId, 'brand.worldview', event.target.value)
                    }
                  />
                </Field>
                <EditedMark edited={isProtected(provenance, 'brand.worldview')} />
              </div>
              <div className="stack" style={{ gap: 4 }}>
                <Field label="トーン＆マナー">
                  <textarea
                    value={brand.tone}
                    onChange={(event) => editField(projectId, 'brand.tone', event.target.value)}
                  />
                </Field>
                <EditedMark edited={isProtected(provenance, 'brand.tone')} />
              </div>
              <div className="stack" style={{ gap: 4 }}>
                <Field label="ターゲット顧客">
                  <textarea
                    value={brand.target}
                    onChange={(event) =>
                      editField(projectId, 'brand.target', event.target.value)
                    }
                  />
                </Field>
                <EditedMark edited={isProtected(provenance, 'brand.target')} />
              </div>
              <div className="stack" style={{ gap: 4 }}>
                <Field label="表現上の制約／NG事項" hint="1行に1件">
                  <textarea
                    value={brand.constraints.join('\n')}
                    onChange={(event) =>
                      editField(projectId, 'brand.constraints', event.target.value.split('\n'))
                    }
                  />
                </Field>
                <EditedMark edited={isProtected(provenance, 'brand.constraints')} />
              </div>
            </div>
          </Card>

          <div className="grid grid--2">
            <Card title="ビジュアルコード">
              <ul className="stack" style={{ margin: 0, paddingLeft: 18 }}>
                {brand.visualCodes.map((code) => (
                  <li key={code}>{code}</li>
                ))}
              </ul>
            </Card>
            <Card title="キーワード">
              <Chips items={brand.keywords} />
            </Card>
          </div>

          <Card title="ブランドカラーパレット">
            <Swatches colors={brand.palette} />
          </Card>
        </>
      )}
    </>
  );
}
