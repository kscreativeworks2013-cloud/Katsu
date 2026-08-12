import { Link, useParams, useSearchParams } from 'react-router-dom';
import type { Project, Settings, Workspace } from '../data/types';
import { PROPOSAL_SECTIONS } from '../data/workflow';
import { formatDate, formatYen } from '../lib/projects';
import { adoptedConcept } from '../domain/steps';
import { staleStepLabels } from '../lib/projects';
import { useAppStore, useIsRunning, useProject } from '../store/context';
import { Card, PageHeader } from '../ui/primitives';

type Lang = 'ja' | 'en';

/** 見積もりは設定画面の単価から組み立てる。 */
function estimate(project: Project, workspace: Workspace, settings: Settings): number {
  const { rates } = settings;
  return (
    rates.dayRate * project.production.shootDays +
    rates.gear +
    rates.studio * project.production.shootDays +
    rates.retouch * Math.max(workspace.shots.length, 1)
  );
}

/** 章ごとの本文。未生成の章は空配列を返し、呼び出し側でプレースホルダを出す。 */
function sectionBody(
  id: string,
  lang: Lang,
  project: Project,
  workspace: Workspace,
  settings: Settings,
): string[] {
  const concept = adoptedConcept(workspace);
  const ja = lang === 'ja';

  switch (id) {
    case 'cover':
      return [
        project.name,
        `${project.brand}／${project.client}`,
        ja
          ? `提案日 ${formatDate(project.proposalDate)}　納期 ${formatDate(project.dueDate)}`
          : `Proposal ${formatDate(project.proposalDate)} / Due ${formatDate(project.dueDate)}`,
      ];
    case 'brand':
      if (!workspace.brand) return [];
      return ja
        ? [
            workspace.brand.worldview,
            workspace.brand.tone,
            `ターゲット：${workspace.brand.target}`,
          ]
        : [
            `Worldview: ${workspace.brand.worldview}`,
            `Tone: ${workspace.brand.tone}`,
            `Target: ${workspace.brand.target}`,
          ];
    case 'competitors':
      if (workspace.competitors.length === 0) return [];
      return [
        ...workspace.competitors.map((competitor) =>
          ja
            ? `${competitor.name}：${competitor.position}／${competitor.visual}`
            : `${competitor.name}: ${competitor.position} / ${competitor.visual}`,
        ),
        (ja ? '差別化：' : 'Differentiation: ') +
          workspace.differentiators
            .filter((item) => item.adopted)
            .map((item) => item.text)
            .join(ja ? '、' : ' / '),
      ];
    case 'concept':
      if (!concept) return [];
      return ja
        ? [concept.title, concept.aim, concept.story, concept.direction]
        : [concept.title, concept.aim, concept.story, concept.direction];
    case 'moodboard':
      if (workspace.moodboard.length === 0) return [];
      return workspace.moodboard.slice(0, 6).map((tile) => `・${tile.caption}`);
    case 'shots':
      if (workspace.shots.length === 0) return [];
      return workspace.shots.map(
        (shot) => `Cut ${shot.no}｜${shot.subject}／${shot.lens}／${shot.composition}`,
      );
    case 'lighting':
      return [
        project.creative.lighting ||
          (ja ? '面光源＋レフ1枚' : 'Soft key light with a reflector'),
        project.creative.lens || '100mm macro',
        project.creative.retouch || (ja ? '質感を残すレタッチ' : 'Texture-preserving retouch'),
      ];
    case 'staff':
      return ja
        ? [
            `モデル ${project.production.models}名`,
            `ヘアメイク：${project.production.hairMakeup || '未定'}`,
            `スタイリスト：${project.production.stylist || '未定'}`,
          ]
        : [
            `Models: ${project.production.models}`,
            `Hair & make-up: ${project.production.hairMakeup || 'TBD'}`,
            `Stylist: ${project.production.stylist || 'TBD'}`,
          ];
    case 'schedule':
      return ja
        ? [
            `撮影日数 ${project.production.shootDays}日`,
            `ロケーション：${project.production.location || '未定'}`,
            `納品：${formatDate(project.dueDate)}／${project.production.delivery || '未定'}`,
          ]
        : [
            `Shoot days: ${project.production.shootDays}`,
            `Location: ${project.production.location || 'TBD'}`,
            `Delivery: ${formatDate(project.dueDate)} / ${project.production.delivery || 'TBD'}`,
          ];
    case 'budget': {
      const total = estimate(project, workspace, settings);
      return ja
        ? [
            `撮影費：${formatYen(settings.rates.dayRate * project.production.shootDays)}`,
            `機材・スタジオ：${formatYen(settings.rates.gear + settings.rates.studio * project.production.shootDays)}`,
            `レタッチ：${formatYen(settings.rates.retouch * Math.max(workspace.shots.length, 1))}`,
            `合計：${formatYen(total)}（税別）`,
          ]
        : [
            `Shooting: ${formatYen(settings.rates.dayRate * project.production.shootDays)}`,
            `Gear & studio: ${formatYen(settings.rates.gear + settings.rates.studio * project.production.shootDays)}`,
            `Retouch: ${formatYen(settings.rates.retouch * Math.max(workspace.shots.length, 1))}`,
            `Total: ${formatYen(total)} (excl. tax)`,
          ];
    }
    case 'risk':
      return ja
        ? [
            '天候によるロケ変更：スタジオを予備日として確保',
            'モデル・スタッフの体調不良：代替候補を事前提示',
            `NG事項：${project.ngNotes.join('、') || '指定なし'}`,
          ]
        : [
            'Weather: studio held as a fallback',
            'Talent illness: alternates proposed in advance',
            `Restrictions: ${project.ngNotes.join(' / ') || 'none'}`,
          ];
    default:
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

/** 3-10 提案書プレビュー：出力前に全体を確認し、章単位で修正する。 */
export function ProposalPreviewScreen() {
  const { projectId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const { project, workspace } = useProject(projectId);
  const { settings, requestRun, pendingRun } = useAppStore();
  const busy = useIsRunning(projectId, 'proposal');

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
              disabled={pendingRun !== null}
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
          {PROPOSAL_SECTIONS.map((section, index) => (
            <a key={section.id} href={`#page-${section.id}`}>
              {String(index + 1).padStart(2, '0')}　{lang === 'ja' ? section.ja : section.en}
            </a>
          ))}
        </nav>

        <div className="stack" style={{ gap: 18 }}>
          {PROPOSAL_SECTIONS.map((section, index) => {
            const body = sectionBody(section.id, lang, project, workspace, settings);
            const step = SECTION_STEP[section.id];
            return (
              <article className="proposal-page" id={`page-${section.id}`} key={section.id}>
                <p className="page-no">PAGE {String(index + 1).padStart(2, '0')}</p>
                <h3>{lang === 'ja' ? section.ja : section.en}</h3>
                {body.length > 0 ? (
                  <div className="stack" style={{ marginTop: 12 }}>
                    {body.map((line, lineIndex) => (
                      <p key={lineIndex}>{line}</p>
                    ))}
                  </div>
                ) : (
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
