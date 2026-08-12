import { useParams } from 'react-router-dom';
import type { BrandAnalysis as BrandAnalysisData } from '../data/types';
import { useAppStore, useProject } from '../store/context';
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

/** 3-4 ブランド分析：資料から世界観・トーン・ターゲット・ビジュアルコードを抽出する。 */
export function BrandAnalysisScreen() {
  const { projectId = '' } = useParams();
  const { project, workspace } = useProject(projectId);
  const { runStep, updateWorkspace, generating } = useAppStore();

  if (!project || !workspace) return null;

  const busy = generating === `${projectId}:brand`;
  const brand = workspace.brand;

  const sources = [
    { label: 'ブランドURL', value: project.brandUrl },
    { label: 'ブランドコンセプト', value: project.brandConcept },
    { label: 'ターゲット顧客', value: project.targetCustomer },
    ...project.references.map((reference) => ({ label: '参考資料', value: reference })),
  ];

  /** 手動編集は編集済みとして記録し、再生成時の上書き確認に使う。 */
  function edit(patch: Partial<BrandAnalysisData>, field: string) {
    if (!brand) return;
    const editedFields = brand.editedFields.includes(field)
      ? brand.editedFields
      : [...brand.editedFields, field];
    updateWorkspace(projectId, { brand: { ...brand, ...patch, editedFields } });
  }

  return (
    <>
      <PageHeader
        title="ブランド分析"
        lead="ブランド資料から抽出した内容です。すべて手動で上書きできます。"
        actions={
          <button
            className="btn"
            type="button"
            onClick={() => runStep(projectId, 'brand')}
            disabled={busy}
          >
            {busy ? '解析中…' : brand ? 'AIで再解析' : 'AIで解析'}
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
                  <Badge tone={brand ? 'done' : 'neutral'}>
                    {brand ? '読み込み済み' : '未読み込み'}
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

      {!busy && !brand && (
        <Card title="抽出結果">
          <EmptyState
            title="まだ解析していません"
            description="登録済みのブランド資料と案件情報から、世界観・トーン・ビジュアルコードを抽出します。"
            action={
              <button className="btn" type="button" onClick={() => runStep(projectId, 'brand')}>
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
            description="編集した項目には「手動更新」が付き、再生成時に確認を挟みます。"
          >
            <div className="grid grid--2">
              <Field label="ブランドの世界観">
                <textarea
                  value={brand.worldview}
                  onChange={(event) => edit({ worldview: event.target.value }, 'worldview')}
                />
              </Field>
              <Field label="トーン＆マナー">
                <textarea
                  value={brand.tone}
                  onChange={(event) => edit({ tone: event.target.value }, 'tone')}
                />
              </Field>
              <Field label="ターゲット顧客">
                <textarea
                  value={brand.target}
                  onChange={(event) => edit({ target: event.target.value }, 'target')}
                />
              </Field>
              <Field label="表現上の制約／NG事項" hint="1行に1件">
                <textarea
                  value={brand.constraints.join('\n')}
                  onChange={(event) =>
                    edit({ constraints: event.target.value.split('\n') }, 'constraints')
                  }
                />
              </Field>
            </div>
            {brand.editedFields.length > 0 && (
              <p className="muted" style={{ marginTop: 14 }}>
                手動更新：{brand.editedFields.join('、')}
              </p>
            )}
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
