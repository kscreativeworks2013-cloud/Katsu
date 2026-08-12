import type { Language, ModelAssignment } from '../data/types';
import { storageUsage } from '../domain/assets';
import { LANGUAGE_LABEL } from '../data/workflow';
import { createId } from '../lib/projects';
import { useAppStore } from '../store/context';
import { Card, Field, PageHeader } from '../ui/primitives';

/** 3-13 設定：AIモデル、言語、会社情報、見積もり基準を一元管理する。 */
export function SettingsScreen() {
  const { settings, updateSettings, assets } = useAppStore();
  const usage = storageUsage(assets);

  function updateModel(id: string, patch: Partial<ModelAssignment>) {
    updateSettings({
      models: settings.models.map((model) =>
        model.id === id ? { ...model, ...patch } : model,
      ),
    });
  }

  return (
    <>
      <PageHeader
        title="設定"
        lead="モデル名は用途別の別名に割り当てて保持します。モデルの変更・追加はこの画面だけで完結します。"
      />

      <Card
        title="AIモデル設定"
        description="別名（alias）を各画面から参照するため、モデルを差し替えても画面改修は不要です。"
        actions={
          <button
            className="btn btn--ghost btn--small"
            type="button"
            onClick={() =>
              updateSettings({
                models: [
                  ...settings.models,
                  { id: createId('mdl'), alias: '', purpose: '', model: '' },
                ],
              })
            }
          >
            別名を追加
          </button>
        }
      >
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>別名</th>
                <th>用途</th>
                <th>使用モデル</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {settings.models.map((model) => (
                <tr key={model.id}>
                  <td>
                    <label>
                      <span className="visually-hidden">別名</span>
                      <input
                        value={model.alias}
                        onChange={(event) =>
                          updateModel(model.id, { alias: event.target.value })
                        }
                      />
                    </label>
                  </td>
                  <td>
                    <label>
                      <span className="visually-hidden">用途</span>
                      <input
                        value={model.purpose}
                        onChange={(event) =>
                          updateModel(model.id, { purpose: event.target.value })
                        }
                      />
                    </label>
                  </td>
                  <td>
                    <label>
                      <span className="visually-hidden">使用モデル</span>
                      <input
                        value={model.model}
                        onChange={(event) =>
                          updateModel(model.id, { model: event.target.value })
                        }
                      />
                    </label>
                  </td>
                  <td>
                    <button
                      className="btn btn--ghost btn--small"
                      type="button"
                      onClick={() =>
                        updateSettings({
                          models: settings.models.filter((row) => row.id !== model.id),
                        })
                      }
                      aria-label={`${model.alias || '空の行'} を削除`}
                    >
                      削除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card
        title="画像の保存容量"
        description="ブラウザ内（localStorage）に保存できる画像の量です。原寸の保存は次フェーズで対応します。"
      >
        <p className="lede">
          {Math.round(usage.bytes / 1000).toLocaleString()}KB /{' '}
          {Math.round(usage.budgetBytes / 1000).toLocaleString()}KB（
          {Math.round(usage.ratio * 100)}% 使用）
        </p>
        <span className="meter" style={{ width: '100%', marginTop: 8 }} aria-hidden="true">
          <span style={{ width: `${Math.min(100, Math.round(usage.ratio * 100))}%` }} />
        </span>
        <p className="muted" style={{ marginTop: 10 }}>
          保存済み {usage.storedCount}件／参照のみ {usage.referenceOnlyCount}件
          （参照のみの画像は PDF・PowerPoint に含まれません）
        </p>
        {usage.level !== 'ok' && (
          <p className="form-error" role="status" style={{ marginTop: 12 }}>
            {usage.level === 'full'
              ? '容量がいっぱいです。新しい画像を登録する前に、不要な画像を解除してください。'
              : '容量が残りわずかです。不要な画像の解除を検討してください。'}
          </p>
        )}
      </Card>

      <Card title="既定値">
        <div className="grid grid--2">
          <Field label="既定言語">
            <select
              value={settings.defaultLanguage}
              onChange={(event) =>
                updateSettings({ defaultLanguage: event.target.value as Language })
              }
            >
              {(['ja', 'en', 'both'] as Language[]).map((code) => (
                <option key={code} value={code}>
                  {LANGUAGE_LABEL[code]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="会社名">
            <input
              value={settings.company}
              onChange={(event) => updateSettings({ company: event.target.value })}
            />
          </Field>
          <Field label="担当者">
            <input
              value={settings.owner}
              onChange={(event) => updateSettings({ owner: event.target.value })}
            />
          </Field>
          <Field label="連絡先">
            <input
              value={settings.contact}
              onChange={(event) => updateSettings({ contact: event.target.value })}
            />
          </Field>
        </div>
      </Card>

      <Card title="見積もり基準" description="提案書の見積もり章はこの単価から算出します。">
        <div className="grid grid--4">
          <Field label="人日単価" hint="円／日">
            <input
              type="number"
              value={settings.rates.dayRate}
              onChange={(event) =>
                updateSettings({
                  rates: { ...settings.rates, dayRate: Number(event.target.value) || 0 },
                })
              }
            />
          </Field>
          <Field label="機材費" hint="円／案件">
            <input
              type="number"
              value={settings.rates.gear}
              onChange={(event) =>
                updateSettings({
                  rates: { ...settings.rates, gear: Number(event.target.value) || 0 },
                })
              }
            />
          </Field>
          <Field label="スタジオ費" hint="円／日">
            <input
              type="number"
              value={settings.rates.studio}
              onChange={(event) =>
                updateSettings({
                  rates: { ...settings.rates, studio: Number(event.target.value) || 0 },
                })
              }
            />
          </Field>
          <Field label="レタッチ単価" hint="円／カット">
            <input
              type="number"
              value={settings.rates.retouch}
              onChange={(event) =>
                updateSettings({
                  rates: { ...settings.rates, retouch: Number(event.target.value) || 0 },
                })
              }
            />
          </Field>
        </div>
      </Card>
    </>
  );
}
