import { Link, NavLink, Outlet, useParams } from 'react-router-dom';
import { STEP_STATUS_LABEL, WORKFLOW_STEPS } from '../data/workflow';
import { unmetPrerequisites } from '../lib/projects';
import { useProject } from '../store/context';
import { EmptyState } from '../ui/primitives';

/**
 * 案件内の共通枠。8ステップのステッパーを常に上部へ出し、
 * 未完了の前提ステップがある場合は注意表示を添える（第3章 ワークフローステッパー）。
 */
export function ProjectLayout() {
  const { projectId, '*': rest } = useParams();
  const { project } = useProject(projectId);

  if (!project) {
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

  return (
    <>
      <nav className="stepper" aria-label="制作ステップ">
        {WORKFLOW_STEPS.map((step, index) => {
          const status = project.steps[step.id];
          return (
            <NavLink
              key={step.id}
              to={`/projects/${project.id}/${step.segment}`}
              className="step"
              // 読み上げ順が「見出し・状態」で崩れないよう、名前は明示する。
              aria-label={`STEP ${index + 1} ${step.label}（${STEP_STATUS_LABEL[status]}）`}
              aria-current={step.id === current?.id ? 'step' : undefined}
            >
              <span className="step-index">STEP {index + 1}</span>
              {step.label}
              <span className={`step-state step-state--${status}`}>
                {' '}
                — {STEP_STATUS_LABEL[status]}
                {status === 'done' && ' ✓'}
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

      <Outlet />
    </>
  );
}
