import { useState } from 'react';
import { useParams } from 'react-router-dom';
import type { ExportFormat, ExportRecord, Language } from '../data/types';
import { EXPORT_FORMAT_LABEL, LANGUAGE_LABEL } from '../data/workflow';
import { createId, formatDate } from '../lib/projects';
import { staleStepLabels } from '../lib/projects';
import { useAppStore, useProject } from '../store/context';
import { Badge, Card, EmptyState, Field, PageHeader } from '../ui/primitives';

const FORMATS: ExportFormat[] = ['pdf', 'pptx', 'docx', 'md'];
const EXTENSION: Record<ExportFormat, string> = {
  pdf: 'pdf',
  pptx: 'pptx',
  docx: 'docx',
  md: 'md',
};

/** 3-11 PDF／PowerPoint出力：確定した提案書をファイルとして書き出す。 */
export function ExportScreen() {
  const { projectId = '' } = useParams();
  const { project, workspace } = useProject(projectId);
  const { recordExports } = useAppStore();
  const [formats, setFormats] = useState<ExportFormat[]>(['pdf', 'pptx']);
  const [language, setLanguage] = useState<Language>('both');
  const [template, setTemplate] = useState('standard');
  const [running, setRunning] = useState(false);
  const [confirming, setConfirming] = useState(false);

  if (!project || !workspace) return null;

  const history = workspace.exports;
  const stale = staleStepLabels(project.steps);

  function toggleFormat(format: ExportFormat) {
    setFormats((current) =>
      current.includes(format)
        ? current.filter((item) => item !== format)
        : [...current, format],
    );
  }

  function run(skipStaleCheck = false) {
    if (formats.length === 0 || !project) return;

    // 古い章があっても出力自体はブロックしない。確認だけ挟む（第4章 4-4）。
    if (stale.length > 0 && !skipStaleCheck) {
      setConfirming(true);
      return;
    }

    setConfirming(false);
    setRunning(true);
    const languages: Language[] = language === 'both' ? ['ja', 'en'] : [language];
    const stamp = new Date().toISOString().slice(0, 10);
    const created: ExportRecord[] = formats.flatMap((format) =>
      languages.map((code) => ({
        id: createId('exp'),
        fileName: `${project.brand.replace(/\s+/g, '_')}_Proposal_${code.toUpperCase()}.${EXTENSION[format]}`,
        format,
        language: code,
        createdAt: stamp,
      })),
    );

    // 実ファイル生成は Proposal Generator フェーズで接続する。ここでは履歴だけを進める。
    setTimeout(() => {
      recordExports(projectId, created);
      setRunning(false);
    }, 600);
  }

  return (
    <>
      <PageHeader
        title="PDF／PowerPoint出力"
        lead="選んだ形式と言語の組み合わせで、提案書をまとめて書き出します。"
      />

      <Card title="出力設定">
        <fieldset style={{ borderTop: 0, paddingTop: 0 }}>
          <legend className="visually-hidden">出力形式</legend>
          <p className="muted">出力形式</p>
          <div className="row" style={{ marginTop: 8 }}>
            {FORMATS.map((format) => (
              <label className="check" key={format}>
                <input
                  type="checkbox"
                  checked={formats.includes(format)}
                  onChange={() => toggleFormat(format)}
                />
                {EXPORT_FORMAT_LABEL[format]}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid grid--2" style={{ marginTop: 20 }}>
          <Field label="言語">
            <select
              value={language}
              onChange={(event) => setLanguage(event.target.value as Language)}
            >
              {(['ja', 'en', 'both'] as Language[]).map((code) => (
                <option key={code} value={code}>
                  {LANGUAGE_LABEL[code]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="テンプレート">
            <select value={template} onChange={(event) => setTemplate(event.target.value)}>
              <option value="standard">標準</option>
              <option value="brand">ブランドカラー適用</option>
            </select>
          </Field>
        </div>

        <div className="actions" style={{ marginTop: 20 }}>
          <button
            className="btn"
            type="button"
            onClick={() => run()}
            disabled={running || formats.length === 0}
          >
            {running ? '出力中…' : '出力を実行'}
          </button>
          <span role="status" className="muted">
            {running
              ? `${formats.map((format) => EXPORT_FORMAT_LABEL[format]).join('、')}を生成しています`
              : formats.length === 0
                ? '形式を1つ以上選んでください'
                : ''}
          </span>
        </div>
      </Card>

      {confirming && (
        <Card title="古い内容のまま出力しますか">
          <p className="lede">上流の変更が反映されていない章があります：{stale.join('、')}</p>
          <div className="actions" style={{ marginTop: 16 }}>
            <button className="btn" type="button" onClick={() => run(true)}>
              このまま出力する
            </button>
            <button
              className="btn btn--ghost"
              type="button"
              onClick={() => setConfirming(false)}
            >
              やめる
            </button>
          </div>
        </Card>
      )}

      <Card title="出力履歴">
        {history.length === 0 ? (
          <EmptyState
            title="まだ出力していません"
            description="出力すると、ここから再ダウンロードできます。"
          />
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>ファイル名</th>
                  <th>形式</th>
                  <th>言語</th>
                  <th>出力日</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {history.map((record) => (
                  <tr key={record.id}>
                    <td>{record.fileName}</td>
                    <td>
                      <Badge>{EXPORT_FORMAT_LABEL[record.format]}</Badge>
                    </td>
                    <td>{LANGUAGE_LABEL[record.language]}</td>
                    <td>{formatDate(record.createdAt)}</td>
                    <td>
                      <button className="btn btn--ghost btn--small" type="button" disabled>
                        再ダウンロード
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
