import { useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Language } from '../data/types';
import {
  DEFAULT_OUTPUTS,
  GENRES,
  LANGUAGE_LABEL,
  OUTPUT_OPTIONS,
  PURPOSES,
} from '../data/workflow';
import { useAppStore } from '../store/context';
import { Card, Field, PageHeader } from '../ui/primitives';

/** カンマ・読点・改行区切りの入力を配列にする。 */
function toList(value: string): string[] {
  return value
    .split(/[,、\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

const INITIAL = {
  name: '',
  client: '',
  brand: '',
  proposalDate: new Date().toISOString().slice(0, 10),
  dueDate: '',
  budget: '',
  language: 'ja' as Language,
  brandUrl: '',
  guideline: '',
  logo: '',
  brandConcept: '',
  targetCustomer: '',
  competitorNames: '',
  genre: GENRES[0] as string,
  productName: '',
  purposes: [] as string[],
  keywords: '',
  mustCuts: '',
  ngNotes: '',
  references: '',
  worldview: '',
  palette: '',
  lighting: '',
  lens: '',
  composition: '',
  staging: '',
  texture: '',
  retouch: '',
  shootDays: '1',
  location: '',
  models: '1',
  hairMakeup: '',
  stylist: '',
  gear: '',
  delivery: '',
  outputs: DEFAULT_OUTPUTS,
};

/** 3-2 新しい案件作成：第2章の入力フォーマットを1画面で受け取る。 */
export function ProjectNew() {
  const { createProject } = useAppStore();
  const navigate = useNavigate();
  const [form, setForm] = useState(INITIAL);
  const [errors, setErrors] = useState<string[]>([]);
  const nameRef = useRef<HTMLInputElement>(null);
  const clientRef = useRef<HTMLInputElement>(null);
  const brandRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof typeof INITIAL>(key: K, value: (typeof INITIAL)[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const toggle = (key: 'purposes' | 'outputs', value: string) =>
    setForm((current) => ({
      ...current,
      [key]: current[key].includes(value)
        ? current[key].filter((item) => item !== value)
        : [...current[key], value],
    }));

  function handleSubmit(event: FormEvent) {
    event.preventDefault();

    // 必須は案件名・クライアント名・ブランド名の3つのみ。残りは後から補完できる。
    const missing: string[] = [];
    if (!form.name.trim()) missing.push('案件名');
    if (!form.client.trim()) missing.push('クライアント名');
    if (!form.brand.trim()) missing.push('ブランド名');

    if (missing.length > 0) {
      setErrors(missing);
      const target = !form.name.trim() ? nameRef : !form.client.trim() ? clientRef : brandRef;
      target.current?.focus();
      return;
    }

    const project = createProject({
      name: form.name.trim(),
      client: form.client.trim(),
      brand: form.brand.trim(),
      genre: form.genre,
      purposes: form.purposes,
      proposalDate: form.proposalDate,
      dueDate: form.dueDate,
      budget: Number(form.budget) || 0,
      language: form.language,
      brandUrl: form.brandUrl,
      brandConcept: form.brandConcept,
      targetCustomer: form.targetCustomer,
      competitorNames: toList(form.competitorNames),
      productName: form.productName,
      keywords: toList(form.keywords),
      mustCuts: toList(form.mustCuts),
      ngNotes: toList(form.ngNotes),
      references: [form.guideline, form.logo, ...toList(form.references)].filter(Boolean),
      creative: {
        worldview: form.worldview,
        palette: toList(form.palette),
        lighting: form.lighting,
        lens: form.lens,
        composition: form.composition,
        staging: form.staging,
        texture: form.texture,
        retouch: form.retouch,
      },
      production: {
        shootDays: Number(form.shootDays) || 1,
        location: form.location,
        models: Number(form.models) || 0,
        hairMakeup: form.hairMakeup,
        stylist: form.stylist,
        gear: form.gear,
        delivery: form.delivery,
      },
      outputs: form.outputs,
    });

    navigate(`/projects/${project.id}/brand`);
  }

  return (
    <>
      <PageHeader
        title="新しい案件を作成"
        lead="必須は案件名・クライアント名・ブランド名の3つだけです。残りは後から追記できます。"
      />

      {errors.length > 0 && (
        <p className="form-error" role="alert">
          {errors.join('、')}を入力してください。
        </p>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <Card>
          <fieldset style={{ borderTop: 0, paddingTop: 0 }}>
            <legend>基本情報</legend>
            <div className="grid grid--3">
              <Field label="案件名" required>
                <input
                  ref={nameRef}
                  value={form.name}
                  onChange={(event) => set('name', event.target.value)}
                  placeholder="ホリデーコレクション キービジュアル"
                />
              </Field>
              <Field label="クライアント名" required>
                <input
                  ref={clientRef}
                  value={form.client}
                  onChange={(event) => set('client', event.target.value)}
                />
              </Field>
              <Field label="ブランド名" required>
                <input
                  ref={brandRef}
                  value={form.brand}
                  onChange={(event) => set('brand', event.target.value)}
                />
              </Field>
              <Field label="提案日">
                <input
                  type="date"
                  value={form.proposalDate}
                  onChange={(event) => set('proposalDate', event.target.value)}
                />
              </Field>
              <Field label="納期">
                <input
                  type="date"
                  value={form.dueDate}
                  onChange={(event) => set('dueDate', event.target.value)}
                />
              </Field>
              <Field label="予算" hint="円（税別）">
                <input
                  type="number"
                  min="0"
                  step="10000"
                  value={form.budget}
                  onChange={(event) => set('budget', event.target.value)}
                />
              </Field>
              <Field label="使用言語">
                <select
                  value={form.language}
                  onChange={(event) => set('language', event.target.value as Language)}
                >
                  {(['ja', 'en', 'both'] as Language[]).map((code) => (
                    <option key={code} value={code}>
                      {LANGUAGE_LABEL[code]}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </fieldset>

          <fieldset style={{ marginTop: 28 }}>
            <legend>ブランド情報</legend>
            <div className="grid grid--3">
              <Field label="ブランドURL">
                <input
                  type="url"
                  value={form.brandUrl}
                  onChange={(event) => set('brandUrl', event.target.value)}
                  placeholder="https://"
                />
              </Field>
              <Field label="ブランドガイドラインPDF" hint="ファイル名またはURL">
                <input
                  value={form.guideline}
                  onChange={(event) => set('guideline', event.target.value)}
                />
              </Field>
              <Field label="ロゴ" hint="ファイル名またはURL">
                <input
                  value={form.logo}
                  onChange={(event) => set('logo', event.target.value)}
                />
              </Field>
              <Field label="ブランドコンセプト">
                <textarea
                  value={form.brandConcept}
                  onChange={(event) => set('brandConcept', event.target.value)}
                />
              </Field>
              <Field label="ターゲット顧客">
                <textarea
                  value={form.targetCustomer}
                  onChange={(event) => set('targetCustomer', event.target.value)}
                />
              </Field>
              <Field label="競合ブランド" hint="カンマ区切り">
                <textarea
                  value={form.competitorNames}
                  onChange={(event) => set('competitorNames', event.target.value)}
                />
              </Field>
            </div>
          </fieldset>

          <fieldset style={{ marginTop: 28 }}>
            <legend>撮影内容</legend>
            <div className="grid grid--3">
              <Field label="ジャンル">
                <select
                  value={form.genre}
                  onChange={(event) => set('genre', event.target.value)}
                >
                  {GENRES.map((genre) => (
                    <option key={genre} value={genre}>
                      {genre}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="商品名">
                <input
                  value={form.productName}
                  onChange={(event) => set('productName', event.target.value)}
                />
              </Field>
              <Field label="キーワード" hint="カンマ区切り">
                <input
                  value={form.keywords}
                  onChange={(event) => set('keywords', event.target.value)}
                />
              </Field>
            </div>
            <fieldset style={{ borderTop: 0, paddingTop: 12 }}>
              <legend className="visually-hidden">撮影目的</legend>
              <p className="muted">撮影目的</p>
              <div className="row">
                {PURPOSES.map((purpose) => (
                  <label className="check" key={purpose}>
                    <input
                      type="checkbox"
                      checked={form.purposes.includes(purpose)}
                      onChange={() => toggle('purposes', purpose)}
                    />
                    {purpose}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="grid grid--3" style={{ marginTop: 18 }}>
              <Field label="必須カット" hint="カンマ区切り">
                <textarea
                  value={form.mustCuts}
                  onChange={(event) => set('mustCuts', event.target.value)}
                />
              </Field>
              <Field label="NG事項" hint="カンマ区切り">
                <textarea
                  value={form.ngNotes}
                  onChange={(event) => set('ngNotes', event.target.value)}
                />
              </Field>
              <Field label="参考資料" hint="URL・ファイル名をカンマ区切り">
                <textarea
                  value={form.references}
                  onChange={(event) => set('references', event.target.value)}
                />
              </Field>
            </div>
          </fieldset>

          <fieldset style={{ marginTop: 28 }}>
            <legend>クリエイティブ設定</legend>
            <div className="grid grid--3">
              <Field label="世界観">
                <textarea
                  value={form.worldview}
                  onChange={(event) => set('worldview', event.target.value)}
                />
              </Field>
              <Field label="カラーパレット" hint="#12100E, #F3ECE2 のように指定">
                <input
                  value={form.palette}
                  onChange={(event) => set('palette', event.target.value)}
                />
              </Field>
              <Field label="ライティング">
                <input
                  value={form.lighting}
                  onChange={(event) => set('lighting', event.target.value)}
                />
              </Field>
              <Field label="レンズイメージ">
                <input
                  value={form.lens}
                  onChange={(event) => set('lens', event.target.value)}
                />
              </Field>
              <Field label="構図">
                <input
                  value={form.composition}
                  onChange={(event) => set('composition', event.target.value)}
                />
              </Field>
              <Field label="演出">
                <input
                  value={form.staging}
                  onChange={(event) => set('staging', event.target.value)}
                />
              </Field>
              <Field label="質感">
                <input
                  value={form.texture}
                  onChange={(event) => set('texture', event.target.value)}
                />
              </Field>
              <Field label="レタッチ方針">
                <input
                  value={form.retouch}
                  onChange={(event) => set('retouch', event.target.value)}
                />
              </Field>
            </div>
          </fieldset>

          <fieldset style={{ marginTop: 28 }}>
            <legend>制作条件</legend>
            <div className="grid grid--3">
              <Field label="撮影日数">
                <input
                  type="number"
                  min="1"
                  value={form.shootDays}
                  onChange={(event) => set('shootDays', event.target.value)}
                />
              </Field>
              <Field label="ロケーション／スタジオ">
                <input
                  value={form.location}
                  onChange={(event) => set('location', event.target.value)}
                />
              </Field>
              <Field label="モデル人数">
                <input
                  type="number"
                  min="0"
                  value={form.models}
                  onChange={(event) => set('models', event.target.value)}
                />
              </Field>
              <Field label="ヘアメイク">
                <input
                  value={form.hairMakeup}
                  onChange={(event) => set('hairMakeup', event.target.value)}
                />
              </Field>
              <Field label="スタイリスト">
                <input
                  value={form.stylist}
                  onChange={(event) => set('stylist', event.target.value)}
                />
              </Field>
              <Field label="撮影機材">
                <input
                  value={form.gear}
                  onChange={(event) => set('gear', event.target.value)}
                />
              </Field>
              <Field label="納品形式">
                <input
                  value={form.delivery}
                  onChange={(event) => set('delivery', event.target.value)}
                />
              </Field>
            </div>
          </fieldset>

          <fieldset style={{ marginTop: 28 }}>
            <legend>生成オプション</legend>
            <p className="muted">既定で主要項目にチェックが入っています。</p>
            <div className="row" style={{ marginTop: 10 }}>
              {OUTPUT_OPTIONS.map((option) => (
                <label className="check" key={option}>
                  <input
                    type="checkbox"
                    checked={form.outputs.includes(option)}
                    onChange={() => toggle('outputs', option)}
                  />
                  {option}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="actions" style={{ marginTop: 28 }}>
            <button className="btn" type="submit">
              案件を作成してブランド分析へ
            </button>
          </div>
        </Card>
      </form>
    </>
  );
}
