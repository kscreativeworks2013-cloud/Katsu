import { useState } from 'react';
import { useParams } from 'react-router-dom';
import type { ExportFormat, ExportRecord, Language } from '../data/types';
import { EXPORT_FORMAT_LABEL, LANGUAGE_LABEL } from '../data/workflow';
import { blockingWarnings, buildProposalIR, type Lang, type ProposalIR } from '../domain/ir';
import { isSupportedFormat, loadRenderer } from '../domain/render';
import { downloadFile } from '../lib/download';
import { createId, formatDate } from '../lib/projects';
import { loadJapaneseFont } from '../lib/pdfFont';
import { useAppStore, useProject } from '../store/context';
import { Badge, Card, EmptyState, Field, PageHeader } from '../ui/primitives';

const FORMATS: ExportFormat[] = ['pdf', 'pptx', 'docx', 'md'];

/** 3-11 出力：確定した提案書をファイルとして書き出す（第6章のIR経由）。 */
export function ExportScreen() {
  const { projectId = '' } = useParams();
  const { project, workspace, provenance } = useProject(projectId);
  const { recordExports, portfolio, assets } = useAppStore();
  const [formats, setFormats] = useState<ExportFormat[]>(['pdf', 'pptx']);
  const [language, setLanguage] = useState<Language>('both');
  const [template, setTemplate] = useState('standard');
  const [running, setRunning] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!project || !workspace) return null;

  const history = workspace.exports;
  const languages: Lang[] = language === 'both' ? ['ja', 'en'] : [language as Lang];

  /** 出力前の点検にも同じ IR を使う。画面の警告と出力物の警告がずれない。 */
  const previewIr = buildProposalIR({
    project,
    workspace,
    provenance,
    portfolio,
    assets,
    lang: languages[0],
    builtAt: new Date(0),
  });
  const warnings = blockingWarnings(previewIr);

  function toggleFormat(format: ExportFormat) {
    setFormats((current) =>
      current.includes(format)
        ? current.filter((item) => item !== format)
        : [...current, format],
    );
  }

  async function renderAll(irs: ProposalIR[]): Promise<ExportRecord[]> {
    const stamp = new Date().toISOString().slice(0, 10);
    const records: ExportRecord[] = [];
    // フォントは PDF を選んだときだけ読み込む（第6章 6-6）。
    const fontBytes = formats.includes('pdf') ? await loadJapaneseFont() : undefined;

    for (const format of formats) {
      const renderer = await loadRenderer(format);
      for (const ir of irs) {
        if (!renderer) {
          // 未対応形式は履歴だけを残す。何が出ていないかを画面で明示する。
          records.push({
            id: createId('exp'),
            fileName: `${ir.project.brand.replace(/\s+/g, '_')}_Proposal_${ir.lang.toUpperCase()}_${ir.revision}.${format}`,
            format,
            language: ir.lang,
            createdAt: stamp,
            irRevision: ir.revision,
            rendered: false,
          });
          continue;
        }

        const file = await renderer.render(ir, { fontBytes });
        downloadFile(file.fileName, file.bytes, file.mimeType);
        records.push({
          id: createId('exp'),
          fileName: file.fileName,
          format,
          language: ir.lang,
          createdAt: stamp,
          irRevision: ir.revision,
          rendered: true,
        });
      }
    }
    return records;
  }

  function run(skipWarningCheck = false) {
    if (formats.length === 0 || !project || !workspace) return;

    // 警告があっても出力自体はブロックしない。確認だけ挟む（第4章 4-4、第6章 6-4）。
    if (warnings.length > 0 && !skipWarningCheck) {
      setConfirming(true);
      return;
    }

    setConfirming(false);
    setError(null);
    setRunning(true);

    const builtAt = new Date();
    const irs = languages.map((lang) =>
      buildProposalIR({ project, workspace, provenance, portfolio, assets, lang, builtAt }),
    );

    renderAll(irs)
      .then((records) => {
        recordExports(projectId, records);
        setRunning(false);
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : '出力に失敗しました');
        setRunning(false);
      });
  }

  return (
    <>
      <PageHeader
        title="出力"
        lead="提案書は中間表現（Proposal IR）を経由して書き出します。ここでは生成を行いません。"
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
                {!isSupportedFormat(format) && (
                  <span className="muted">（未対応・履歴のみ）</span>
                )}
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

        <p className="muted" style={{ marginTop: 16 }}>
          出力予定の版：{previewIr.revision}（章 {previewIr.sections.length}
          件／参照した生成ライン {previewIr.sources.runIds.length}件）
        </p>

        <div className="actions" style={{ marginTop: 16 }}>
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

        {error && (
          <p className="form-error" role="alert" style={{ marginTop: 14 }}>
            {error}
          </p>
        )}
      </Card>

      {confirming && (
        <Card title="このまま出力しますか">
          <p className="lede">出力前に確認が必要な項目があります。</p>
          <ul className="stack" style={{ margin: '12px 0 0', paddingLeft: 18 }}>
            {warnings.map((warning, index) => (
              <li key={index}>{warning.message}</li>
            ))}
          </ul>
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
            description="出力すると、ここから版と形式を確認できます。"
          />
        ) : (
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>ファイル名</th>
                  <th>形式</th>
                  <th>言語</th>
                  <th>版</th>
                  <th>出力日</th>
                </tr>
              </thead>
              <tbody>
                {history.map((record) => (
                  <tr key={record.id}>
                    <td>{record.fileName}</td>
                    <td>
                      <Badge tone={record.rendered === false ? 'alert' : 'neutral'}>
                        {EXPORT_FORMAT_LABEL[record.format]}
                        {record.rendered === false && '（未生成）'}
                      </Badge>
                    </td>
                    <td>{LANGUAGE_LABEL[record.language]}</td>
                    <td>{record.irRevision ?? '—'}</td>
                    <td>{formatDate(record.createdAt)}</td>
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
