import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import type { CropFocus, ProposalBody } from '../data/types';
import {
  ASSET_ORIGIN_LABEL,
  effectivePpi,
  requiredPixels,
  resolveAsset,
  variantOf,
} from '../domain/assets';
import { slotWidthMm, slotWidthRatio } from '../domain/render/layout';
import type { Lang } from '../domain/ir';
import {
  PROPOSAL_TEMPLATE,
  resolveSlot,
  slotHasChoice,
  type ProposalSection,
} from '../domain/proposal';
import type { Asset, PortfolioWork, Workspace } from '../data/types';
import { isProtected } from '../domain/provenance';
import { staleStepLabels } from '../lib/projects';
import { useAppStore, usePendingRun, useProject } from '../store/context';
import { AssetImage } from '../ui/AssetImage';
import { Card, PageHeader } from '../ui/primitives';

/** 枠の供給元にある項目（選択UIの候補）。 */
/** ピッカーに出す候補。原寸の幅を持たせて、その枠で足りるかを候補ごとに言う。 */
interface PoolItem {
  id: string;
  label: string;
  /** 登録済みの原寸の幅（px）。未登録なら undefined。 */
  width?: number;
}

function slotPool(
  slot: ProposalSection['imageSlots'][number],
  workspace: Workspace,
  portfolio: PortfolioWork[],
  assets: Record<string, Asset>,
): PoolItem[] {
  const widthOf = (assetId?: string | null): number | undefined =>
    variantOf(resolveAsset(assets, assetId), 'original')?.width;

  switch (slot.source) {
    case 'moodboard':
      return workspace.moodboard.map((tile) => ({
        id: tile.id,
        label: tile.caption,
        width: widthOf(tile.assetId),
      }));
    case 'shots':
      return workspace.shots.map((shot) => ({
        id: shot.id,
        label: `Cut ${shot.no}｜${shot.subject}`,
        width: widthOf(shot.assetId),
      }));
    case 'competitors':
      return workspace.competitors.map((competitor) => ({
        id: competitor.id,
        label: competitor.name,
        width: widthOf(competitor.assetId),
      }));
    case 'portfolio':
      return portfolio.map((work) => ({
        id: work.id,
        label: work.title,
        width: widthOf(work.assetId),
      }));
    case 'logo':
      return [];
  }
}

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
 * 切り出し位置（第8章 8-7）。同じ画像でも枠の縦横比はスロットごとに違うので、
 * 指定はアセットではなくスロット単位で持つ。既定は上寄せ（人物の頭を落とさないため）。
 */
const FOCUS_OPTIONS: { label: string; value: string }[] = [
  { label: '自動（上寄せ）', value: '' },
  { label: '左上', value: '0,0' },
  { label: '中央上', value: '0.5,0' },
  { label: '右上', value: '1,0' },
  { label: '左', value: '0,0.5' },
  { label: '中央', value: '0.5,0.5' },
  { label: '右', value: '1,0.5' },
  { label: '左下', value: '0,1' },
  { label: '中央下', value: '0.5,1' },
  { label: '右下', value: '1,1' },
];

function CropFocusPicker({
  imageKey,
  focus,
  precise,
  onChange,
}: {
  imageKey: string;
  focus: CropFocus | undefined;
  /**
   * 連続値でも指定できるようにするか（第9章 工程N-5）。
   *
   * 全面帯は 297×138.6mm ＝ 約 2.14:1 で、2:3 の縦位置素材からは高さの6割以上を切る。
   * 10択（0／0.5／1）では刻みが粗すぎて主題が保てない——実測で帽子の天面が切れた。
   * 帯の枠に限ってスライダーを添える。細かく指定できて困る面ではない。
   */
  precise?: boolean;
  onChange: (focus: CropFocus | null) => void;
}) {
  const current = focus ?? { x: 0.5, y: 0 };

  return (
    <div className="stack" style={{ gap: 4, marginTop: 4 }}>
      <label className="row" style={{ gap: 6 }}>
        <span className="muted">切り出し</span>
        <select
          value={focus ? `${focus.x},${focus.y}` : ''}
          aria-label={`${imageKey}の切り出し位置`}
          onChange={(event) => {
            const [x, y] = event.target.value.split(',').map(Number);
            onChange(event.target.value === '' ? null : { x, y });
          }}
        >
          {FOCUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      {precise && (
        <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
          {(['x', 'y'] as const).map((axis) => (
            <label className="row" style={{ gap: 6 }} key={axis}>
              <span className="muted">{axis === 'x' ? '左右' : '上下'}</span>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={Math.round(current[axis] * 100)}
                aria-label={`${imageKey}の切り出し位置（${axis === 'x' ? '左右' : '上下'}）`}
                onChange={(event) =>
                  onChange({ ...current, [axis]: Number(event.target.value) / 100 })
                }
              />
              <span className="muted">{Math.round(current[axis] * 100)}%</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * 枠に載せる項目の選択（第8章 8-7）。
 * 供給元が枠数を超えるとき、どれを載せるかは提案書ごとに変わる（実績が典型）。
 * 既定は供給元の先頭から枠数ぶん。選択は保存されるが、生成物ではないので
 * provenance では扱わず、再生成でも保護しない。
 */
function SlotPicker({
  slot,
  pool,
  picks,
  onChange,
}: {
  slot: ProposalSection['imageSlots'][number];
  pool: PoolItem[];
  picks: string[] | undefined;
  onChange: (ids: string[]) => void;
}) {
  // 表示条件は提出前チェックの「未選択」判定と同じものを見る（第9章 工程N-7）。
  if (!slotHasChoice(slot, pool.length)) return null;
  const chosen = picks ?? pool.slice(0, slot.capacity).map((item) => item.id);

  /*
   * 枠数1の枠は**選び直し**であって、増減ではない（第9章 工程R-1）。
   *
   * チェックボックスで組むと詰む：枠数に達しているので他は押せず、唯一の選択を外すと
   * 空配列＝「既定に戻す」になって元へ戻る。表紙とコンセプトのキービジュアルが
   * これで、画面から一度も変更できなかった。ラジオなら1回の操作で入れ替わる。
   */
  const single = slot.capacity === 1;

  // その枠に置かれる実寸。候補ごとの ppi はここから決まる（第8章 8-4）。
  const widthMm = slotWidthMm(slot.id, Math.min(slot.capacity, pool.length));
  const fits = (item: PoolItem): boolean =>
    item.width === undefined || item.width >= requiredPixels(widthMm);

  return (
    <details className="stack" style={{ gap: 6, marginTop: 6 }}>
      <summary className="muted">
        掲載する{slot.label}を選ぶ（{pool.length}件中{slot.capacity}件）
      </summary>
      <div className="stack" style={{ gap: 4, marginTop: 6 }}>
        {pool.map((item) => {
          const on = chosen.includes(item.id);
          return (
            <label className="row" style={{ gap: 6 }} key={item.id}>
              <input
                type={single ? 'radio' : 'checkbox'}
                name={single ? `pick-${slot.id}` : undefined}
                checked={on}
                // 枠数に達したら、選んでいないものは押せない（先に外してもらう）。
                // 枠数1は例外で、押した時点で入れ替える。
                disabled={!single && !on && chosen.length >= slot.capacity}
                /*
                 * 既定と同じものを押したときも選択として記録する（第9章 工程R-1）。
                 * onChange は「値が変わったとき」しか来ないので、既定のまま確定した
                 * 意思が残らない。実測：表紙で既定の1枚を選び直したのに、提出前チェックは
                 * 「未選択」と言い続けた。押した事実は onClick でしか拾えない。
                 */
                onClick={() => {
                  if (single) onChange([item.id]);
                }}
                onChange={() =>
                  onChange(
                    single
                      ? [item.id]
                      : on
                        ? chosen.filter((id) => id !== item.id)
                        : [...chosen, item.id],
                  )
                }
              />
              <span>{item.label}</span>
              {/*
                候補ごとに、その枠での実効解像度を出す（第9章 工程N-4）。
                全面配置は 2,339px 要るので候補が絞られるが、画面がそれを示さないと
                選んでから警告で気づくことになる。基準を満たさない候補も**選べる**
                ——隠すと「なぜ選べないのか」が分からず、判断も奪う。
              */}
              {item.width !== undefined && (
                <span className={fits(item) ? 'muted' : 'form-error'}>
                  {effectivePpi(item.width, widthMm)}ppi
                  {fits(item) ? '' : `（${requiredPixels(widthMm)}px 必要）`}
                </span>
              )}
            </label>
          );
        })}
        <button
          className="btn btn--ghost btn--small"
          type="button"
          onClick={() => onChange([])}
        >
          既定に戻す
        </button>
      </div>
    </details>
  );
}

/**
 * 章の画像スロット（第5章 5-2）。アセット未登録・サムネイル退避時は
 * グラデーションやプレースホルダにフォールバックし、参照切れで壊れない。
 */
function SectionSlots({
  section,
  slots,
  crops,
  onCrop,
  picks,
  onPick,
}: {
  section: ProposalSection;
  slots: {
    slot: ProposalSection['imageSlots'][number];
    images: ReturnType<typeof resolveSlot>;
    pool: PoolItem[];
  }[];
  crops: Record<string, CropFocus>;
  onCrop: (key: string, focus: CropFocus | null) => void;
  picks: Record<string, string[]>;
  onPick: (slotId: string, ids: string[]) => void;
}) {
  if (section.imageSlots.length === 0) return null;
  return (
    <div className="stack" style={{ marginTop: 16 }}>
      {slots.map(({ slot, images, pool }) => (
        <div key={slot.id}>
          <p className="muted">{slot.label}</p>
          <SlotPicker
            slot={slot}
            pool={pool}
            picks={picks[slot.id]}
            onChange={(ids) => onPick(slot.id, ids)}
          />
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
                      <>
                        <p className="muted">{ASSET_ORIGIN_LABEL[image.asset.origin]}</p>
                        <CropFocusPicker
                          imageKey={image.key}
                          focus={crops[image.key]}
                          // 全面帯（表紙・撮影コンセプト）は切る量が大きいので連続値も出す。
                          precise={slotWidthRatio(slot.id) === 1}
                          onChange={(focus) => onCrop(image.key, focus)}
                        />
                      </>
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
  const {
    requestRun,
    editField,
    setCropFocus,
    setSlotPicks,
    portfolio,
    assets,
    provenance: allProvenance,
  } = useAppStore();
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
              pool: slotPool(slot, workspace, portfolio, assets),
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
                    <SectionSlots
                      section={section}
                      slots={slots}
                      crops={workspace.crops ?? {}}
                      onCrop={(key, focus) => setCropFocus(projectId, key, focus)}
                      picks={workspace.picks ?? {}}
                      onPick={(slotId, ids) => setSlotPicks(projectId, slotId, ids)}
                    />
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
