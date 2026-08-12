import type { CSSProperties } from 'react';
import { useParams } from 'react-router-dom';
import type { MoodCategory, MoodTile } from '../data/types';
import { MOOD_CATEGORY_LABEL } from '../data/workflow';
import { resolveAsset } from '../domain/assets';
import { createId } from '../lib/projects';
import { useAppStore, usePendingRun, useProject } from '../store/context';
import { AssetPicker } from '../ui/AssetPicker';
import { Card, EmptyState, PageHeader, Skeleton, Swatches } from '../ui/primitives';

const CATEGORIES = Object.keys(MOOD_CATEGORY_LABEL) as MoodCategory[];

/** 3-7 ムードボード：採用コンセプトを光・質感・色・構図の4章立てに翻訳する。 */
export function MoodboardScreen() {
  const { projectId = '' } = useParams();
  const { project, workspace } = useProject(projectId);
  const { requestRun, editField, assets } = useAppStore();
  const pending = usePendingRun(projectId, 'moodboard');
  const busy = pending?.status === 'running';
  const blocked = pending !== undefined;

  if (!project || !workspace) return null;

  const tiles = workspace.moodboard;

  function write(next: MoodTile[]) {
    // タイルの追加・編集・並べ替えは手動編集。以降このコレクションは再生成から保護される。
    editField(projectId, 'moodboard.tiles', next);
  }

  function addTile(category: MoodCategory) {
    const palette = workspace?.brand?.palette ?? [];
    write([
      ...tiles,
      {
        id: createId('mood'),
        category,
        caption: '新しいタイル',
        source: '手動追加',
        from: palette[0]?.hex ?? '#E6E0D6',
        to: palette[2]?.hex ?? '#B3936A',
      },
    ]);
  }

  /**
   * 並べ替え。ドラッグ操作は次フェーズで載せる前提で、
   * まずキーボードでも使える前後移動を用意している。
   */
  function move(tileId: string, direction: -1 | 1) {
    const index = tiles.findIndex((tile) => tile.id === tileId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= tiles.length) return;
    const next = [...tiles];
    [next[index], next[target]] = [next[target], next[index]];
    write(next);
  }

  return (
    <>
      <PageHeader
        title="ムードボード"
        lead="タイルはそのまま提案書のムードボード頁に引き継がれます。"
        actions={
          <button
            className="btn"
            type="button"
            onClick={() => requestRun(projectId, 'moodboard')}
            disabled={blocked}
          >
            {busy ? '生成中…' : tiles.length > 0 ? '構成案を追加生成' : 'AIで生成'}
          </button>
        }
      />

      {busy && (
        <Card>
          <Skeleton lines={4} />
        </Card>
      )}

      {!busy && tiles.length === 0 && (
        <Card>
          <EmptyState
            title="ボードが空です"
            description="採用コンセプトから、光・質感・色・構図の4章立てで構成案を作ります。"
            action={
              <button
                className="btn"
                type="button"
                onClick={() => requestRun(projectId, 'moodboard')}
                disabled={blocked}
              >
                AIで生成する
              </button>
            }
          />
        </Card>
      )}

      {!busy && tiles.length > 0 && (
        <>
          {workspace.brand && (
            <Card title="カラーパレット">
              <Swatches colors={workspace.brand.palette} />
            </Card>
          )}

          {CATEGORIES.map((category) => {
            const rows = tiles.filter((tile) => tile.category === category);
            return (
              <Card
                key={category}
                title={MOOD_CATEGORY_LABEL[category]}
                actions={
                  <button
                    className="btn btn--ghost btn--small"
                    type="button"
                    onClick={() => addTile(category)}
                  >
                    タイルを追加
                  </button>
                }
              >
                {rows.length === 0 ? (
                  <p className="muted">この章のタイルはまだありません。</p>
                ) : (
                  <div className="grid grid--4">
                    {rows.map((tile) => {
                      const asset = resolveAsset(assets, tile.assetId);
                      return (
                        <figure className="tile" key={tile.id} style={{ margin: 0 }}>
                          {asset?.thumbnail ? (
                            <img
                              className="tile-art"
                              src={asset.thumbnail}
                              alt={tile.caption}
                            />
                          ) : (
                            <div
                              className="tile-art"
                              style={
                                {
                                  '--from': tile.from,
                                  '--to': tile.to,
                                } as CSSProperties
                              }
                              aria-hidden="true"
                            />
                          )}
                          <figcaption className="tile-body">
                            <label className="field">
                              <span className="visually-hidden">キャプション</span>
                              <input
                                value={tile.caption}
                                onChange={(event) =>
                                  write(
                                    tiles.map((row) =>
                                      row.id === tile.id
                                        ? { ...row, caption: event.target.value }
                                        : row,
                                    ),
                                  )
                                }
                              />
                            </label>
                            <p>出典：{tile.source}</p>
                            <div style={{ marginTop: 8 }}>
                              <AssetPicker
                                label={tile.caption}
                                assetId={tile.assetId}
                                onChange={(assetId) =>
                                  write(
                                    tiles.map((row) =>
                                      row.id === tile.id ? { ...row, assetId } : row,
                                    ),
                                  )
                                }
                              />
                            </div>
                            <div className="actions" style={{ marginTop: 8 }}>
                              <button
                                className="btn btn--ghost btn--small"
                                type="button"
                                onClick={() => move(tile.id, -1)}
                                aria-label={`${tile.caption} を前へ`}
                              >
                                ←
                              </button>
                              <button
                                className="btn btn--ghost btn--small"
                                type="button"
                                onClick={() => move(tile.id, 1)}
                                aria-label={`${tile.caption} を後ろへ`}
                              >
                                →
                              </button>
                              <button
                                className="btn btn--ghost btn--small"
                                type="button"
                                onClick={() => write(tiles.filter((row) => row.id !== tile.id))}
                                aria-label={`${tile.caption} を削除`}
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
            );
          })}
        </>
      )}
    </>
  );
}
