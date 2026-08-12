import { useState } from 'react';
import type { StepId } from '../data/types';
import { DIFF_KIND_LABEL, summarizeDiff, type FieldDiff } from '../domain/run';
import { useAppStore, usePendingRun } from '../store/context';
import { itemLabels, summarizeValue } from './format';
import { Badge } from './primitives';

function kindTone(diff: FieldDiff): 'progress' | 'alert' | 'protected' | 'neutral' {
  if (diff.kind === 'overwrite') return 'progress';
  if (diff.kind === 'protected') return 'protected';
  return 'neutral';
}

/** コレクション（オブジェクト配列）は件数だけでは判断できないため、展開導線を出す。 */
function isCollection(diff: FieldDiff): boolean {
  return [diff.current, diff.proposed].some(
    (value) =>
      Array.isArray(value) && value.some((item) => typeof item === 'object' && item !== null),
  );
}

function ItemList({ title, value }: { title: string; value: unknown }) {
  const labels = itemLabels(value);
  return (
    <div>
      <p className="muted">{title}</p>
      {labels.length === 0 ? (
        <p className="muted">（なし）</p>
      ) : (
        <ol style={{ margin: '4px 0 0', paddingLeft: 20 }}>
          {labels.map((label, index) => (
            <li key={index}>{label}</li>
          ))}
        </ol>
      )}
    </div>
  );
}

/**
 * 生成結果の差分プレビュー（第4章 4-3）。
 * 適用するまで生成物には一切書き込まない。既定表示は判断対象（上書き・保護）のみで、
 * 「変更なし」は件数付きの折りたたみにする。
 */
export function RunPreview({ projectId, stepId }: { projectId: string; stepId: StepId }) {
  const { toggleRunField, applyRun, discardRun } = useAppStore();
  const run = usePendingRun(projectId, stepId);
  const [showUnchanged, setShowUnchanged] = useState(false);
  const [openDetails, setOpenDetails] = useState<string[]>([]);

  if (!run || run.status === 'running') return null;

  if (run.status === 'failed') {
    return (
      <section className="card" aria-label="生成の失敗">
        <p className="form-error" role="alert">
          生成に失敗しました：{run.error}
          。既存のデータは変更していません。
        </p>
        <div className="actions" style={{ marginTop: 14 }}>
          <button
            className="btn btn--ghost"
            type="button"
            onClick={() => discardRun(projectId, stepId)}
          >
            閉じる
          </button>
        </div>
      </section>
    );
  }

  const decidable = run.diffs.filter((diff) => diff.kind !== 'unchanged');
  const unchanged = run.diffs.filter((diff) => diff.kind === 'unchanged');
  const protectedCount = decidable.filter((diff) => diff.kind === 'protected').length;
  const visible = showUnchanged ? [...decidable, ...unchanged] : decidable;

  const toggleDetail = (path: string) =>
    setOpenDetails((current) =>
      current.includes(path) ? current.filter((item) => item !== path) : [...current, path],
    );

  // 上書きも保護も無い＝生成結果が現在の内容と一致。適用するものがないので閉じるだけにする。
  if (decidable.length === 0) {
    return (
      <section className="card run-preview" aria-label="生成結果の差分プレビュー">
        <div className="card-head">
          <div>
            <h2>生成結果の確認</h2>
            <p>生成結果は現在の内容と一致しました（変更なし{unchanged.length}件）。</p>
          </div>
          <div className="actions">
            <button className="btn" type="button" onClick={() => discardRun(projectId, stepId)}>
              閉じる
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="card run-preview" aria-label="生成結果の差分プレビュー">
      <div className="card-head">
        <div>
          <h2>生成結果の確認</h2>
          <p>
            {summarizeDiff(run.diffs)}
            。適用するフィールドを選んでください。
          </p>
        </div>
        <div className="actions">
          <button
            className="btn btn--ghost"
            type="button"
            onClick={() => discardRun(projectId, stepId)}
          >
            破棄
          </button>
          <button
            className="btn"
            type="button"
            onClick={() => applyRun(projectId, stepId)}
            disabled={run.selected.length === 0}
          >
            選択したフィールドを適用
          </button>
        </div>
      </div>

      {protectedCount > 0 && (
        <p className="muted" style={{ marginBottom: 12 }}>
          手動編集済みの{protectedCount}
          件は既定で適用しません。上書きする場合はチェックを入れてください。
        </p>
      )}

      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>適用</th>
              <th>フィールド</th>
              <th>扱い</th>
              <th>現在</th>
              <th>生成結果</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((diff) => (
              <RunPreviewRow
                key={diff.path}
                diff={diff}
                selected={run.selected.includes(diff.path)}
                detailOpen={openDetails.includes(diff.path)}
                onToggleSelect={() => toggleRunField(projectId, stepId, diff.path)}
                onToggleDetail={() => toggleDetail(diff.path)}
              />
            ))}
          </tbody>
        </table>
      </div>

      {unchanged.length > 0 && (
        <button
          className="btn btn--ghost btn--small"
          type="button"
          style={{ marginTop: 12 }}
          aria-expanded={showUnchanged}
          onClick={() => setShowUnchanged((current) => !current)}
        >
          {showUnchanged ? '変更なしを隠す' : `変更なし${unchanged.length}件を表示`}
        </button>
      )}
    </section>
  );
}

function RunPreviewRow({
  diff,
  selected,
  detailOpen,
  onToggleSelect,
  onToggleDetail,
}: {
  diff: FieldDiff;
  selected: boolean;
  detailOpen: boolean;
  onToggleSelect: () => void;
  onToggleDetail: () => void;
}) {
  const collection = isCollection(diff);
  return (
    <>
      <tr>
        <td>
          {diff.kind === 'unchanged' ? (
            <span className="muted" aria-hidden="true">
              —
            </span>
          ) : (
            <label className="check">
              <input type="checkbox" checked={selected} onChange={onToggleSelect} />
              <span className="visually-hidden">{diff.label}を適用</span>
            </label>
          )}
        </td>
        <td>
          {diff.label}
          {collection && diff.kind !== 'unchanged' && (
            <div>
              <button
                className="btn btn--ghost btn--small"
                type="button"
                style={{ marginTop: 6 }}
                aria-expanded={detailOpen}
                onClick={onToggleDetail}
              >
                {detailOpen ? '中身を閉じる' : '中身を確認'}
              </button>
            </div>
          )}
        </td>
        <td>
          <Badge tone={kindTone(diff)}>{DIFF_KIND_LABEL[diff.kind]}</Badge>
        </td>
        <td className="muted">{summarizeValue(diff.current)}</td>
        <td>{diff.kind === 'unchanged' ? '—' : summarizeValue(diff.proposed)}</td>
      </tr>
      {detailOpen && (
        <tr>
          <td colSpan={5}>
            <div className="grid grid--2" style={{ padding: '4px 0 12px' }}>
              <ItemList title="現在" value={diff.current} />
              <ItemList title="生成結果" value={diff.proposed} />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
