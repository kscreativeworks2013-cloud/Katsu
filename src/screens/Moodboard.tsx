import { useParams } from 'react-router-dom';
import type { MoodCategory, MoodTile } from '../data/types';
import { MOOD_CATEGORY_LABEL } from '../data/workflow';
import { resolveAsset } from '../domain/assets';
import { createId } from '../lib/projects';
import { useAppStore, usePendingRun, useProject } from '../store/context';
import { AssetImage } from '../ui/AssetImage';
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

  /**
   * 画面で枠を見分けるための名前（第9章 工程R-5）。
   *
   * 説明文は空でよい（納品物には出さない）が、**画面では区別が要る**。
   * 説明文が同じ／空のタイルが並ぶと、画像登録ボタンの名前も画像の代替テキストも
   * 同一になり、どの枠を触っているのか分からない（実測でここで作業が止まった）。
   * 出力には使わない、画面だけの呼び名である。
   */
  function tileLabel(tile: { id: string; caption: string }, all: { id: string }[]): string {
    const trimmed = tile.caption.trim();
    if (trimmed !== '') return trimmed;
    return `タイル ${all.findIndex((row) => row.id === tile.id) + 1}（説明文なし）`;
  }

  function addTile(category: MoodCategory) {
    const palette = workspace?.brand?.palette ?? [];
    write([
      ...tiles,
      {
        id: createId('mood'),
        category,
        /*
         * 説明文は空で作る（第9章 工程R-5）。
         * 「新しいタイル」のような既定名を入れると、書き換え忘れがそのまま
         * 納品物のキャプションに載る（実測：「追加タイル 2」が撮影コンセプトの
         * 全面キャプションとして出力された）。空なら出力側が出自だけを出し、
         * 提出前チェックが未設定として数える。
         */
        caption: '',
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
                          <AssetImage
                            asset={asset}
                            alt={tileLabel(tile, tiles)}
                            fallback={{ from: tile.from, to: tile.to }}
                          />
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
                                label={tileLabel(tile, tiles)}
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
                                aria-label={`${tileLabel(tile, tiles)} を前へ`}
                              >
                                ←
                              </button>
                              <button
                                className="btn btn--ghost btn--small"
                                type="button"
                                onClick={() => move(tile.id, 1)}
                                aria-label={`${tileLabel(tile, tiles)} を後ろへ`}
                              >
                                →
                              </button>
                              <button
                                className="btn btn--ghost btn--small"
                                type="button"
                                onClick={() => write(tiles.filter((row) => row.id !== tile.id))}
                                aria-label={`${tileLabel(tile, tiles)} を削除`}
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
