import { useState, type FormEvent } from 'react';
import { GENRES } from '../data/workflow';
import { resolveAsset } from '../domain/assets';
import { useAppStore } from '../store/context';
import { AssetPicker } from '../ui/AssetPicker';
import { Card, Chips, EmptyState, Field, PageHeader } from '../ui/primitives';

/** 3-12 ポートフォリオ管理：作品を蓄積し、提案書の実績頁の引用元にする。 */
export function PortfolioScreen() {
  const { portfolio, addPortfolioWork, removePortfolioWork, updatePortfolioWork, assets } =
    useAppStore();
  const [genre, setGenre] = useState('all');
  const [tag, setTag] = useState('all');
  const [draft, setDraft] = useState({
    title: '',
    client: '',
    genre: GENRES[0] as string,
    year: String(new Date().getFullYear()),
    tags: '',
  });

  const tags = [...new Set(portfolio.flatMap((work) => work.tags))].sort();
  const visible = portfolio.filter(
    (work) =>
      (genre === 'all' || work.genre === genre) && (tag === 'all' || work.tags.includes(tag)),
  );

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft.title.trim()) return;
    addPortfolioWork({
      title: draft.title.trim(),
      client: draft.client.trim(),
      genre: draft.genre,
      year: Number(draft.year) || new Date().getFullYear(),
      tags: draft.tags
        .split(/[,、]/)
        .map((item) => item.trim())
        .filter(Boolean),
      from: '#E6E0D6',
      to: '#B3936A',
    });
    setDraft({ ...draft, title: '', client: '', tags: '' });
  }

  return (
    <>
      <PageHeader
        title="ポートフォリオ"
        lead="選んだ作品は提案書の実績頁に引用されます。案件に合う作品の自動選定は次フェーズで対応します。"
      />

      <Card title="絞り込み">
        <div className="grid grid--2">
          <Field label="ジャンル">
            <select value={genre} onChange={(event) => setGenre(event.target.value)}>
              <option value="all">すべて</option>
              {GENRES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </Field>
          <Field label="タグ">
            <select value={tag} onChange={(event) => setTag(event.target.value)}>
              <option value="all">すべて</option>
              {tags.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </Card>

      <Card title={`作品 ${visible.length}件`}>
        {visible.length === 0 ? (
          <EmptyState
            title="該当する作品がありません"
            description="絞り込み条件を変えるか、作品を追加してください。"
          />
        ) : (
          <div className="grid grid--3">
            {visible.map((work) => {
              const asset = resolveAsset(assets, work.assetId);
              return (
                <figure className="tile" key={work.id} style={{ margin: 0 }}>
                  {asset?.thumbnail ? (
                    <img className="tile-art" src={asset.thumbnail} alt={work.title} />
                  ) : (
                    <div
                      className="tile-art"
                      style={{ ['--from' as string]: work.from, ['--to' as string]: work.to }}
                      aria-hidden="true"
                    />
                  )}
                  <figcaption className="tile-body">
                    <h4>{work.title}</h4>
                    <p>
                      {work.client}／{work.genre}／{work.year}
                    </p>
                    <div style={{ marginTop: 8 }}>
                      <Chips items={work.tags} />
                    </div>
                    <div style={{ marginTop: 10 }}>
                      <AssetPicker
                        label={work.title}
                        assetId={work.assetId}
                        onChange={(assetId) => updatePortfolioWork(work.id, { assetId })}
                      />
                    </div>
                    <div className="actions" style={{ marginTop: 10 }}>
                      <button
                        className="btn btn--ghost btn--small"
                        type="button"
                        onClick={() => removePortfolioWork(work.id)}
                        aria-label={`${work.title} を削除`}
                      >
                        削除
                      </button>
                    </div>
                  </figcaption>
                </figure>
              );
            })}
          </div>
        )}
      </Card>

      <Card title="作品を追加">
        <form onSubmit={submit}>
          <div className="grid grid--3">
            <Field label="タイトル" required>
              <input
                value={draft.title}
                onChange={(event) => setDraft({ ...draft, title: event.target.value })}
              />
            </Field>
            <Field label="クライアント">
              <input
                value={draft.client}
                onChange={(event) => setDraft({ ...draft, client: event.target.value })}
              />
            </Field>
            <Field label="ジャンル">
              <select
                value={draft.genre}
                onChange={(event) => setDraft({ ...draft, genre: event.target.value })}
              >
                {GENRES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="撮影年">
              <input
                type="number"
                value={draft.year}
                onChange={(event) => setDraft({ ...draft, year: event.target.value })}
              />
            </Field>
            <Field label="タグ" hint="カンマ区切り">
              <input
                value={draft.tags}
                onChange={(event) => setDraft({ ...draft, tags: event.target.value })}
              />
            </Field>
          </div>
          <div className="actions" style={{ marginTop: 18 }}>
            <button className="btn" type="submit">
              作品を追加
            </button>
          </div>
        </form>
      </Card>
    </>
  );
}
