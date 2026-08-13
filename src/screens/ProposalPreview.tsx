import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import type { ProposalBody } from '../data/types';
import { ASSET_ORIGIN_LABEL } from '../domain/assets';
import type { Lang } from '../domain/ir';
import { PROPOSAL_TEMPLATE, resolveSlot, type ProposalSection } from '../domain/proposal';
import { isProtected } from '../domain/provenance';
import { staleStepLabels } from '../lib/projects';
import { useAppStore, usePendingRun, useProject } from '../store/context';
import { AssetImage } from '../ui/AssetImage';
import { Card, PageHeader } from '../ui/primitives';

/** 未生成の章から、生成しに行くべきステップへの導線。 */
const SECTION_STEP: Record<string, string> = {
  brand: 'brand',
  competitors: 'competitors',
  concept: 'concepts',
  moodboard: 'moodboard',
  shots: 'shots',
};

/**
 * 章本文。表示中の言語の行を編集でき、編集した章は再生成から保護される（第4章 4-3）。
 * 章単位で1フィールドなので、日本語を編集するとその章全体が手動編集済みになる。
 */
function SectionBody({
  sectionId,
  body,
  lang,
  edited,
  onEdit,
}: {
  sectionId: string;
  body: ProposalBody;
  lang: Lang;
  edited: boolean;
  onEdit: (next: ProposalBody) => void;
}) {
  const [editing, setEditing] = useState(false);
  const lines = lang === 'ja' ? body.ja : body.en;

  return (
    <div className="stack" style={{ marginTop: 12 }}>
      {editing ? (
        <label className="field">
          <span>{lang === 'ja' ? '本文（日本語）' : 'Body (English)'}</span>
          <textarea
            value={lines.join('\n')}
            onChange={(event) => onEdit({ ...body, [lang]: event.target.value.split('\n') })}
          />
        </label>
      ) : (
        lines.map((line, index) => <p key={`${sectionId}-${index}`}>{line}</p>)
      )}
      <div className="row">
        <button
          className="btn btn--ghost btn--small"
          type="button"
          onClick={() => setEditing((current) => !current)}
        >
          {editing ? '編集を終える' : 'この章を編集'}
        </button>
        {edited && <span className="muted">手動編集済み（再生成から保護）</span>}
      </div>
    </div>
  );
}

/**
 * 章の画像スロット（第5章 5-2）。アセット未登録・サムネイル退避時は
 * グラデーションやプレースホルダにフォールバックし、参照切れで壊れない。
 */
function SectionSlots({
  section,
  slots,
}: {
  section: ProposalSection;
  slots: {
    slot: ProposalSection['imageSlots'][number];
    images: ReturnType<typeof resolveSlot>;
  }[];
}) {
  if (section.imageSlots.length === 0) return null;
  return (
    <div className="stack" style={{ marginTop: 16 }}>
      {slots.map(({ slot, images }) => (
        <div key={slot.id}>
          <p className="muted">{slot.label}</p>
          {images.length === 0 ? (
            <div className="slot-placeholder">{slot.label}は未登録です</div>
          ) : (
            <div className="grid grid--4" style={{ marginTop: 6 }}>
              {images.map((image) => (
                <figure className="tile" key={image.key} style={{ margin: 0 }}>
                  <AssetImage
                    asset={image.asset}
                    alt={image.caption}
                    fallback={image.fallback}
                    // 1〜2枚のスロットは幅780px前後まで広がるので原寸で描く（第7章 7-7）。
                    large={images.length <= 2}
                  />
                  <figcaption className="tile-body">
                    <p>{image.caption}</p>
                    {image.asset && (
                      <p className="muted">{ASSET_ORIGIN_LABEL[image.asset.origin]}</p>
                    )}
                  </figcaption>
                </figure>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/** 3-10 提案書プレビュー：出力前に全体を確認し、章単位で修正する。 */
export function ProposalPreviewScreen() {
  const { projectId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const { project, workspace } = useProject(projectId);
  const { requestRun, editField, portfolio, assets, provenance: allProvenance } = useAppStore();
  const pending = usePendingRun(projectId, 'proposal');
  const busy = pending?.status === 'running';

  if (!project || !workspace) return null;

  const lang: Lang = params.get('lang') === 'en' ? 'en' : 'ja';
  // stale は出力の直前に必ず見えるようにする（第4章 4-4）。
  const stale = staleStepLabels(project.steps);

  return (
    <>
      <PageHeader
        title="提案書プレビュー"
        lead="日本語版と英語版は同じ構成データから生成されます。"
        actions={
          <>
            <div className="tabs" role="tablist" aria-label="言語切替" style={{ border: 0 }}>
              <button
                className="tab"
                type="button"
                role="tab"
                aria-selected={lang === 'ja'}
                onClick={() => setParams({ lang: 'ja' })}
              >
                日本語
              </button>
              <button
                className="tab"
                type="button"
                role="tab"
                aria-selected={lang === 'en'}
                onClick={() => setParams({ lang: 'en' })}
              >
                English
              </button>
            </div>
            <button
              className="btn"
              type="button"
              onClick={() => requestRun(projectId, 'proposal')}
              disabled={pending !== undefined}
            >
              {busy ? '生成中…' : '提案書を生成'}
            </button>
          </>
        }
      />

      {stale.length > 0 && (
        <p className="form-error" role="status">
          内容が古い可能性のある章：{stale.join('、')}
          。出力前に再生成するか、このままでよいか確認してください。
        </p>
      )}

      <div className="split">
        <nav className="outline card" aria-label="章立て">
          {PROPOSAL_TEMPLATE.map((section, index) => (
            <a key={section.id} href={`#page-${section.id}`}>
              {String(index + 1).padStart(2, '0')}　{lang === 'ja' ? section.ja : section.en}
            </a>
          ))}
        </nav>

        <div className="stack" style={{ gap: 18 }}>
          {PROPOSAL_TEMPLATE.map((section, index) => {
            const body = workspace.proposalBody?.[section.id];
            const slots = section.imageSlots.map((slot) => ({
              slot,
              images: resolveSlot(slot, workspace, portfolio, assets),
            }));
            const hasImages = slots.some(({ images }) => images.length > 0);
            const step = SECTION_STEP[section.id];
            return (
              <article className="proposal-page" id={`page-${section.id}`} key={section.id}>
                <p className="page-no">PAGE {String(index + 1).padStart(2, '0')}</p>
                <h3>{lang === 'ja' ? section.ja : section.en}</h3>
                {!body && !hasImages ? (
                  <div className="empty" style={{ marginTop: 12 }}>
                    <p className="muted">この章はまだ生成されていません。</p>
                    {step && (
                      <Link
                        className="btn btn--ghost btn--small"
                        to={`/projects/${projectId}/${step}`}
                      >
                        {lang === 'ja' ? section.ja : section.en}を生成する
                      </Link>
                    )}
                  </div>
                ) : (
                  <>
                    {body && (
                      <SectionBody
                        sectionId={section.id}
                        body={body}
                        lang={lang}
                        edited={isProtected(
                          allProvenance[projectId] ?? {},
                          `proposal.body.${section.id}`,
                        )}
                        onEdit={(next) =>
                          editField(projectId, `proposal.body.${section.id}`, next)
                        }
                      />
                    )}
                    <SectionSlots section={section} slots={slots} />
                  </>
                )}
              </article>
            );
          })}
        </div>
      </div>

      <Card>
        <div className="actions">
          <Link className="btn" to={`/projects/${projectId}/export`}>
            出力画面へ進む
          </Link>
        </div>
      </Card>
    </>
  );
}
