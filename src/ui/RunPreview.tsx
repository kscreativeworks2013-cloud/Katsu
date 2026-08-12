import { DIFF_KIND_LABEL, summarizeDiff, type FieldDiff } from '../domain/run';
import { useAppStore } from '../store/context';
import { summarizeValue } from './format';
import { Badge } from './primitives';

function kindTone(diff: FieldDiff): 'progress' | 'alert' | 'neutral' {
  if (diff.kind === 'overwrite') return 'progress';
  if (diff.kind === 'protected') return 'alert';
  return 'neutral';
}

/**
 * 生成結果の差分プレビュー（第4章 4-3）。
 * 適用するまで生成物には一切書き込まない。手動編集済みのフィールドは既定で選択されない。
 */
export function RunPreview() {
  const { pendingRun, toggleRunField, applyRun, discardRun } = useAppStore();

  if (!pendingRun || pendingRun.status === 'running') return null;

  if (pendingRun.status === 'failed') {
    return (
      <section className="card" aria-label="生成の失敗">
        <p className="form-error" role="alert">
          生成に失敗しました：{pendingRun.error}
          。既存のデータは変更していません。
        </p>
        <div className="actions" style={{ marginTop: 14 }}>
          <button className="btn btn--ghost" type="button" onClick={discardRun}>
            閉じる
          </button>
        </div>
      </section>
    );
  }

  const protectedCount = pendingRun.diffs.filter((diff) => diff.kind === 'protected').length;

  return (
    <section className="card run-preview" aria-label="生成結果の差分プレビュー">
      <div className="card-head">
        <div>
          <h2>生成結果の確認</h2>
          <p>
            {summarizeDiff(pendingRun.diffs)}
            。適用するフィールドを選んでください。
          </p>
        </div>
        <div className="actions">
          <button className="btn btn--ghost" type="button" onClick={discardRun}>
            破棄
          </button>
          <button
            className="btn"
            type="button"
            onClick={applyRun}
            disabled={pendingRun.selected.length === 0}
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
            {pendingRun.diffs.map((diff) => (
              <tr key={diff.path}>
                <td>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={pendingRun.selected.includes(diff.path)}
                      onChange={() => toggleRunField(diff.path)}
                    />
                    <span className="visually-hidden">{diff.label}を適用</span>
                  </label>
                </td>
                <td>{diff.label}</td>
                <td>
                  <Badge tone={kindTone(diff)}>{DIFF_KIND_LABEL[diff.kind]}</Badge>
                </td>
                <td className="muted">{summarizeValue(diff.current)}</td>
                <td>{diff.kind === 'unchanged' ? '—' : summarizeValue(diff.proposed)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
