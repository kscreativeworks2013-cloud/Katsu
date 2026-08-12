import { useRef, useState, type ChangeEvent } from 'react';
import { ASSET_ORIGIN_LABEL, hasOriginal } from '../domain/assets';
import { readOriginal } from '../lib/imageProcessing';
import { importImageFromUrl } from '../lib/importImage';
import { useAppStore } from '../store/context';
import { Badge } from './primitives';

/**
 * 画像アセットの登録・解除・貼り直し（第5章 5-1、第7章 7-6／7-11）。
 * ファイル登録が主動線。登録した画像は原寸で保存し、表示用の preview を添える。
 * 実体が失われている場合は、参照を保ったまま原寸を貼り直せるようにする。
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
  const { assets, assetStorage, registerAsset, replaceAssetBinary } = useAppStore();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const repairRef = useRef<HTMLInputElement>(null);

  const asset = assetId ? assets[assetId] : undefined;
  const missing = !!assetId && assetStorage.missingAssetIds.includes(assetId);

  /**
   * URL登録時にその場で取り込む（第6章 6-8）。
   * 取り込めた画像だけが PDF・PowerPoint に入るので、取り込めない場合はここで明示する。
   */
  async function registerUrl() {
    const trimmed = url.trim();
    if (!trimmed) return;

    setImporting(true);
    const outcome = await importImageFromUrl(trimmed);
    const { asset: created, rejected } = await registerAsset(
      {
        origin: 'external',
        label,
        source: trimmed,
        runId: null,
        mimeType: outcome.image?.mimeType ?? 'image/*',
      },
      outcome.image,
    );
    setImporting(false);

    onChange(created.id);
    setNotice(
      outcome.image
        ? // 取り込めても保存できないことがある。その場合も理由を必ず出す（第7章 7-10）。
          (rejected ?? null)
        : `画像を取り込めませんでした：${outcome.reason}。参照は残りますが、PDF・PowerPoint には含まれません。`,
    );
    setUrl('');
    setOpen(false);
  }

  async function registerFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    const binary = await readOriginal(file, file.type);
    const { asset: created, rejected } = await registerAsset(
      { origin: 'upload', label, source: file.name, runId: null, mimeType: binary.mimeType },
      binary,
    );
    onChange(created.id);
    setNotice(rejected ?? null);
    setOpen(false);
  }

  /** 消失したアセットに原寸を貼り直す。参照（assetId）は外さないので構成は壊れない。 */
  async function repairFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !assetId) return;

    const binary = await readOriginal(file, file.type);
    const { rejected } = await replaceAssetBinary(assetId, binary);
    setNotice(rejected ?? null);
  }

  if (asset) {
    return (
      <div className="stack" style={{ gap: 6 }}>
        <div className="row" style={{ gap: 8 }}>
          <Badge>{ASSET_ORIGIN_LABEL[asset.origin]}</Badge>
          <span className="muted">{asset.source}</span>
          {missing ? (
            <Badge tone="alert">画像が失われています</Badge>
          ) : (
            !hasOriginal(asset) && <Badge tone="alert">出力に使えません</Badge>
          )}
          {missing && (
            <button
              className="btn btn--small"
              type="button"
              onClick={() => repairRef.current?.click()}
            >
              画像を貼り直す
            </button>
          )}
          <button
            className="btn btn--ghost btn--small"
            type="button"
            onClick={() => {
              setNotice(null);
              // 参照だけを外す。実体はほかの参照が残っている可能性があるので消さない。
              onChange(null);
            }}
            aria-label={`${label}の画像を解除`}
          >
            解除
          </button>
        </div>
        {missing && (
          <p className="muted">
            この画像はブラウザの保存領域から失われました。出力には含まれません。原寸を貼り直すと復旧します。
          </p>
        )}
        {notice && (
          <p className="form-error" role="status">
            {notice}
          </p>
        )}
        <input
          ref={repairRef}
          type="file"
          accept="image/*"
          onChange={(event) => void repairFile(event)}
          className="visually-hidden"
          aria-label={`${label}の画像を貼り直す`}
        />
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
      <p className="muted">
        登録した画像は原寸で保存します。印刷解像度が足りない画像は、出力前に警告します。
      </p>
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
        onChange={(event) => void registerFile(event)}
        className="visually-hidden"
        aria-label={`${label}の画像ファイル`}
      />
    </div>
  );
}
