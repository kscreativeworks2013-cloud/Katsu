import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { generatePrompt } from '../data/generate';
import type { PromptTarget } from '../data/types';
import { PROMPT_TARGETS } from '../data/workflow';
import { useAppStore, usePendingRun, useProject } from '../store/context';
import { Card, EmptyState, Field, PageHeader, Skeleton } from '../ui/primitives';

/** 3-9 AIプロンプト生成：AI別に最適化したプロンプトを一括生成する。 */
export function PromptStudioScreen() {
  const { projectId = '' } = useParams();
  const { project, workspace } = useProject(projectId);
  const { requestRun, editField, settings } = useAppStore();
  const pending = usePendingRun(projectId, 'prompts');
  const busy = pending?.status === 'running';
  const blocked = pending !== undefined;
  const [target, setTarget] = useState<PromptTarget>('chatgpt');
  const [shotId, setShotId] = useState('all');
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);

  if (!project || !workspace) return null;

  const shot = workspace.shots.find((item) => item.id === shotId);
  const key = `${target}:${shotId}`;
  const generated = generatePrompt(project, workspace, target, shot);
  const value =
    overrides[key] ?? (shotId === 'all' ? (workspace.prompts[target] ?? generated) : generated);

  const targetKind = PROMPT_TARGETS.find((item) => item.id === target)?.kind ?? 'text';
  // モデル名は画面に固定せず、設定画面の別名割り当てを参照する（第3章 3-13）。
  const alias = settings.models.find((model) =>
    targetKind === 'image' ? model.alias.startsWith('image') : model.alias.startsWith('text'),
  );

  function change(next: string) {
    setOverrides((current) => ({ ...current, [key]: next }));
    if (shotId === 'all') {
      editField(projectId, `prompts.${target}`, next);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard?.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <>
      <PageHeader
        title="AIプロンプト生成"
        lead="使用モデルは設定画面の別名割り当てを参照します。画面にはモデル名を固定しません。"
        actions={
          <button
            className="btn"
            type="button"
            onClick={() => requestRun(projectId, 'prompts')}
            disabled={blocked}
          >
            {busy ? '生成中…' : '全AI分を一括生成'}
          </button>
        }
      />

      {workspace.shots.length === 0 && (
        <Card>
          <EmptyState
            title="先にショットリストを作ると精度が上がります"
            description="カット単位の条件がないと、案件全体の条件だけでプロンプトを組み立てます。"
          />
        </Card>
      )}

      <Card>
        <div className="tabs" role="tablist" aria-label="対象AI">
          {PROMPT_TARGETS.map((item) => (
            <button
              key={item.id}
              className="tab"
              type="button"
              role="tab"
              aria-selected={target === item.id}
              onClick={() => setTarget(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="grid grid--2" style={{ marginBottom: 16 }}>
          <Field label="対象カット">
            <select value={shotId} onChange={(event) => setShotId(event.target.value)}>
              <option value="all">案件全体</option>
              {workspace.shots.map((item) => (
                <option key={item.id} value={item.id}>
                  Cut {item.no}｜{item.subject}
                </option>
              ))}
            </select>
          </Field>
          <Field label="使用モデル（設定画面で変更）">
            <input
              readOnly
              value={alias ? `${alias.alias} → ${alias.model}` : '未割り当て'}
              aria-describedby="model-note"
            />
          </Field>
        </div>
        <p className="muted" id="model-note">
          {targetKind === 'image' ? '画像生成用' : '文章生成用'}
          の別名を使用します。モデルの変更・追加は設定画面のみで行います。
        </p>

        {busy ? (
          <Skeleton lines={6} />
        ) : (
          <Field label="生成プロンプト">
            <textarea
              className="prompt-text"
              value={value}
              onChange={(event) => change(event.target.value)}
            />
          </Field>
        )}

        <div className="actions" style={{ marginTop: 14 }}>
          <button className="btn" type="button" onClick={copy}>
            プロンプトをコピー
          </button>
          <button
            className="btn btn--ghost"
            type="button"
            onClick={() =>
              setOverrides((current) => {
                const next = { ...current };
                delete next[key];
                return next;
              })
            }
          >
            生成結果に戻す
          </button>
          <span role="status" className="muted">
            {copied ? 'コピーしました' : ''}
          </span>
        </div>
      </Card>
    </>
  );
}
