import { useRef, useState, type ChangeEvent } from 'react';
import { ASSET_ORIGIN_LABEL } from '../domain/assets';
import { importImageFromUrl } from '../lib/importImage';
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
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const asset = assetId ? assets[assetId] : undefined;

  /**
   * URL登録時にその場で取り込む（第6章 6-8）。
   * 取り込めた画像だけが PDF・PowerPoint に入るので、取り込めない場合はここで明示する。
   */
  async function registerUrl() {
    const trimmed = url.trim();
    if (!trimmed) return;

    setImporting(true);
    const outcome = await importImageFromUrl(trimmed);
    setImporting(false);

    const { asset: created, rejected } = registerAsset({
      origin: 'external',
      label,
      source: trimmed,
      runId: null,
      mimeType: outcome.image?.mimeType ?? 'image/*',
      thumbnail: outcome.image?.dataUri,
    });
    onChange(created.id);
    setNotice(
      outcome.image
        ? // 取り込めても保存容量に収まらないことがある。その場合も理由を必ず出す（第6章 6-9）。
          (rejected ?? null)
        : `画像を取り込めませんでした：${outcome.reason}。参照は残りますが、PDF・PowerPoint には含まれません。`,
    );
    setUrl('');
    setOpen(false);
  }

  function registerFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.addEventListener('load', () => {
      const { asset: created, rejected } = registerAsset({
        origin: 'upload',
        label,
        source: file.name,
        runId: null,
        mimeType: file.type || 'image/*',
        thumbnail: typeof reader.result === 'string' ? reader.result : undefined,
      });
      onChange(created.id);
      setNotice(rejected ?? null);
      setOpen(false);
    });
    reader.readAsDataURL(file);
    event.target.value = '';
  }

  if (asset) {
    return (
      <div className="stack" style={{ gap: 6 }}>
        <div className="row" style={{ gap: 8 }}>
          <Badge>{ASSET_ORIGIN_LABEL[asset.origin]}</Badge>
          <span className="muted">{asset.source}</span>
          {!asset.thumbnail && <Badge tone="alert">成果物に含まれません</Badge>}
          <button
            className="btn btn--ghost btn--small"
            type="button"
            onClick={() => {
              setNotice(null);
              onChange(null);
            }}
            aria-label={`${label}の画像を解除`}
          >
            解除
          </button>
        </div>
        {notice && (
          <p className="form-error" role="status">
            {notice}
          </p>
        )}
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
      <div className="row">
        <button
          className="btn btn--small"
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
      <label className="field">
        <span>画像URL（任意）</span>
        <input
          type="url"
          value={url}
          placeholder="https://"
          onChange={(event) => setUrl(event.target.value)}
        />
      </label>
      <p className="muted">
        外部URLはブラウザのCORS制限で取り込めないことが多く、その場合は成果物に含まれません。確実に含めるにはファイル登録を使ってください。（サーバー経由での取得は次フェーズ）
      </p>
      <div className="row">
        <button
          className="btn btn--ghost btn--small"
          type="button"
          onClick={() => void registerUrl()}
          disabled={!url.trim() || importing}
        >
          {importing ? '取り込み中…' : 'URLから取り込む'}
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
