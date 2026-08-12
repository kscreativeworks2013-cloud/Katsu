import type { Language, ModelAssignment } from '../data/types';
import { variantOf } from '../domain/assets';
import { LANGUAGE_LABEL } from '../data/workflow';
import { createId } from '../lib/projects';
import { PERSIST_STATE_LABEL, persistNotice } from '../lib/storagePersistence';
import { useAppStore } from '../store/context';
import { Card, Field, PageHeader } from '../ui/primitives';

/** 3-13 設定：AIモデル、言語、会社情報、見積もり基準を一元管理する。 */
export function SettingsScreen() {
  const { settings, updateSettings, assets, assetStorage, removeAsset } = useAppStore();
  const usage = assetStorage.usage;
  const missing = assetStorage.missingAssetIds
    .map((id) => assets[id])
    .filter((asset) => asset !== undefined);
  const stored = Object.values(assets).filter((asset) => asset.variants.length > 0);

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
        description="原寸はブラウザ内（IndexedDB）に保存します。上限はブラウザが空き容量に応じて決めるため、固定値はありません。"
      >
        <p className="lede">
          {Math.round(usage.bytes / 1_000_000).toLocaleString()}MB 使用
          {usage.quotaBytes
            ? `（この端末の利用可能量の目安 ${Math.round(usage.quotaBytes / 1_000_000).toLocaleString()}MB）`
            : '（利用可能量はこの環境では取得できません）'}
        </p>
        <p className="muted" style={{ marginTop: 10 }}>
          原寸あり {usage.originalCount}件／表示用のみ {usage.previewOnlyCount}件／参照のみ{' '}
          {usage.referenceOnlyCount}件／失われた画像 {usage.missingCount}件
          （原寸のある画像だけが出力に使えます）
        </p>

        <p className="muted" style={{ marginTop: 10 }}>
          保存の永続化：{PERSIST_STATE_LABEL[assetStorage.persist]}
        </p>
        {persistNotice(assetStorage.persist) && (
          <p className="form-error" role="status" style={{ marginTop: 8 }}>
            {persistNotice(assetStorage.persist)}
          </p>
        )}

        {assetStorage.migration && (
          <p className="muted" style={{ marginTop: 10 }}>
            以前の形式からの移行：{assetStorage.migration.moved}件を移しました
            {assetStorage.migration.failed > 0 &&
              `／${assetStorage.migration.failed}件は移行できませんでした（登録し直してください）`}
          </p>
        )}

        {missing.length > 0 && (
          <div className="stack" style={{ marginTop: 14, gap: 8 }}>
            <p className="form-error" role="status">
              次の画像は保存領域から失われています。登録元の画面で原寸を貼り直してください。参照は残しています。
            </p>
            <ul className="stack" style={{ margin: 0, paddingLeft: 18 }}>
              {missing.map((asset) => (
                <li key={asset.id}>
                  {asset.label}（{asset.source}）
                </li>
              ))}
            </ul>
          </div>
        )}

        {stored.length > 0 && (
          <div className="table-scroll" style={{ marginTop: 14 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>画像</th>
                  <th>原寸</th>
                  <th>サイズ</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {stored.map((asset) => {
                  const original = variantOf(asset, 'original');
                  return (
                    <tr key={asset.id}>
                      <td>{asset.label}</td>
                      <td>
                        {original ? `${original.width}×${original.height}px` : '（表示用のみ）'}
                      </td>
                      <td>
                        {Math.round(
                          asset.variants.reduce((sum, item) => sum + item.bytes, 0) / 1000,
                        ).toLocaleString()}
                        KB
                      </td>
                      <td>
                        <button
                          className="btn btn--ghost btn--small"
                          type="button"
                          onClick={() => removeAsset(asset.id)}
                          aria-label={`${asset.label} の画像を削除`}
                        >
                          削除
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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
