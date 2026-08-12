import { useRef, useState, type ChangeEvent } from 'react';
import { ASSET_ORIGIN_LABEL } from '../domain/assets';
import { useAppStore } from '../store/context';
import { Badge } from './primitives';

/**
 * 画像アセットの登録・解除（第5章 5-1）。
 * 外部URLは参照のみ、ファイルはサムネイルだけを保持する。実体の保存は
 * サーバー側永続化フェーズで扱うため、ここでは参照とメタデータだけを作る。
 */
export function AssetPicker({
  label,
  assetId,
  onChange,
}: {
  label: string;
  assetId: string | null | undefined;
  onChange: (assetId: string | null) => void;
}) {
  const { assets, registerAsset } = useAppStore();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const asset = assetId ? assets[assetId] : undefined;

  function registerUrl() {
    const trimmed = url.trim();
    if (!trimmed) return;
    const created = registerAsset({
      origin: 'external',
      label,
      source: trimmed,
      runId: null,
      mimeType: 'image/*',
    });
    onChange(created.id);
    setUrl('');
    setOpen(false);
  }

  function registerFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.addEventListener('load', () => {
      const created = registerAsset({
        origin: 'upload',
        label,
        source: file.name,
        runId: null,
        mimeType: file.type || 'image/*',
        // 容量上限を超えるサムネイルはストア側で落とされる。参照は残る。
        thumbnail: typeof reader.result === 'string' ? reader.result : undefined,
      });
      onChange(created.id);
      setOpen(false);
    });
    reader.readAsDataURL(file);
    event.target.value = '';
  }

  if (asset) {
    return (
      <div className="row" style={{ gap: 8 }}>
        <Badge>{ASSET_ORIGIN_LABEL[asset.origin]}</Badge>
        <span className="muted">{asset.source}</span>
        <button
          className="btn btn--ghost btn--small"
          type="button"
          onClick={() => onChange(null)}
          aria-label={`${label}の画像を解除`}
        >
          解除
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        className="btn btn--ghost btn--small"
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`${label}に画像を登録`}
      >
        画像を登録
      </button>
    );
  }

  return (
    <div className="stack" style={{ gap: 8 }}>
      <label className="field">
        <span>画像URL</span>
        <input
          type="url"
          value={url}
          placeholder="https://"
          onChange={(event) => setUrl(event.target.value)}
        />
      </label>
      <div className="row">
        <button
          className="btn btn--small"
          type="button"
          onClick={registerUrl}
          disabled={!url.trim()}
        >
          URLを登録
        </button>
        <button
          className="btn btn--ghost btn--small"
          type="button"
          onClick={() => fileRef.current?.click()}
        >
          ファイルを選ぶ
        </button>
        <button
          className="btn btn--ghost btn--small"
          type="button"
          onClick={() => setOpen(false)}
        >
          やめる
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        onChange={registerFile}
        className="visually-hidden"
        aria-label={`${label}の画像ファイル`}
      />
    </div>
  );
}
