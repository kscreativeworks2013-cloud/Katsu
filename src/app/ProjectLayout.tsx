import { Link, NavLink, Outlet, useParams } from 'react-router-dom';
import { STEP_STATUS_LABEL } from '../data/workflow';
import { STEP_BY_ID, WORKFLOW_STEPS } from '../domain/steps';
import { staleStepIds, unmetPrerequisites } from '../lib/projects';
import { useAppStore, useProject } from '../store/context';
import { EmptyState } from '../ui/primitives';
import { RunPreview } from '../ui/RunPreview';

/**
 * 案件内の共通枠。ステッパー、前提未完了の注意、stale の通知、
 * 生成結果の差分プレビューをここでまとめて出す。
 * ステッパーはステップ定義から生成しているので、ステップの増減にそのまま追従する（第4章 4-8）。
 */
export function ProjectLayout() {
  const { projectId, '*': rest } = useParams();
  const { project } = useProject(projectId);
  const { requestRun, pendingRun } = useAppStore();

  if (!project || !projectId) {
    return (
      <EmptyState
        title="案件が見つかりません"
        description="削除されたか、URLが正しくない可能性があります。"
        action={
          <Link className="btn" to="/projects">
            案件一覧へ戻る
          </Link>
        }
      />
    );
  }

  const segment = rest?.split('/')[0] ?? '';
  const current = WORKFLOW_STEPS.find((step) => step.segment === segment);
  const pending = current ? unmetPrerequisites(project.steps, current.id) : [];
  const stale = staleStepIds(project.steps);
  const busy = pendingRun?.status === 'running';

  return (
    <>
      <nav className="stepper" aria-label="制作ステップ">
        {WORKFLOW_STEPS.map((step, index) => {
          const record = project.steps[step.id];
          // 適用待ちの間は「生成中」ではなく、利用者の判断待ちであることを示す。
          const awaiting = pendingRun?.stepId === step.id && pendingRun.status === 'ready';
          const state = awaiting
            ? '確認待ち'
            : record.stale
              ? '要確認'
              : STEP_STATUS_LABEL[record.status];
          return (
            <NavLink
              key={step.id}
              to={`/projects/${project.id}/${step.segment}`}
              className="step"
              // 読み上げ順が「見出し・状態」で崩れないよう、名前は明示する。
              aria-label={`STEP ${index + 1} ${step.label}（${state}）`}
              aria-current={step.id === current?.id ? 'step' : undefined}
            >
              <span className="step-index">STEP {index + 1}</span>
              {step.label}
              <span
                className={`step-state step-state--${
                  record.stale || awaiting ? 'stale' : record.status
                }`}
              >
                {' '}
                — {state}
                {record.status === 'done' && !record.stale && ' ✓'}
              </span>
            </NavLink>
          );
        })}
      </nav>

      {pending.length > 0 && (
        <p className="form-error" role="status">
          前提ステップが未完了です：{pending.join('、')}
          。先に進めることもできますが、生成結果の精度が下がります。
        </p>
      )}

      {stale.length > 0 && (
        <section className="card" aria-label="内容が古い可能性のあるステップ">
          <div className="card-head">
            <div>
              <h2>上流の変更により、内容が古い可能性があります</h2>
              <p>データはそのまま使えます。再生成する場合も、適用前に差分を確認できます。</p>
            </div>
          </div>
          <ul className="stack" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {stale.map((stepId) => {
              const record = project.steps[stepId];
              const cause = record.staleCause ? STEP_BY_ID[record.staleCause].label : '上流';
              return (
                <li className="row" key={stepId} style={{ justifyContent: 'space-between' }}>
                  <span>
                    {STEP_BY_ID[stepId].label}
                    <span className="muted">　{cause}の変更が反映されていません</span>
                  </span>
                  <span className="row">
                    <Link
                      className="btn btn--ghost btn--small"
                      to={`/projects/${project.id}/${STEP_BY_ID[stepId].segment}`}
                    >
                      開く
                    </Link>
                    <button
                      className="btn btn--small"
                      type="button"
                      disabled={busy}
                      onClick={() => requestRun(projectId, stepId)}
                    >
                      再生成
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <RunPreview />

      <Outlet />
    </>
  );
}
