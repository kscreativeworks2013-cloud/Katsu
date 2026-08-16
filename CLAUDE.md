# Katsu — 作業の前提

Luxury Beauty Visual Proposal OS。仕様は `docs/spec/` にあり、章番号とファイル名は1つずれる
（第8章＝`09-layout.md`、第9章＝`10-first-run.md`）。未着手の項目は `docs/spec/99-backlog.md`。

## 検証の入口

**型検査は `npm run build` か `npm run typecheck` で行う。`tsc` を直接呼ばない。**

ルートの `tsconfig.json` は `"files": []` のプロジェクト参照だけを持つ。したがって

```
npx tsc --noEmit     # 何も検査せず exit 0。壊れたコードでも通る
```

は**常に成功する no-op** である。実測：わざと型エラーのあるファイルを置いても
`npx tsc --noEmit` は無言で 0 を返し、`npm run typecheck` と `npm run build` だけが
`error TS2322` を報告した。過去に「型検査クリーン」と報告しながら `npm run build` が
落ちていた事故はこれが原因（第9章 9-18）。

| 目的                   | コマンド                                                        |
| ---------------------- | --------------------------------------------------------------- |
| 型検査                 | `npm run typecheck`（`tsc -b --noEmit`）／`npm run build`       |
| 静的解析               | `npm run lint`                                                  |
| 整形                   | `npm run format`（確認だけなら `npm run format:check`）         |
| 単体・コンポーネント   | `npm test`                                                      |
| e2e                    | `npm run test:e2e`（`CHROMIUM_PATH=/opt/pw-browsers/chromium`） |
| 和文フォントの再生成   | `npm run fonts:subset`                                          |
| 和文フォントの整合確認 | `npm run fonts:check`（Python + fontTools が要る）              |

CI（`.github/workflows/ci.yml`）は `lint` → `format:check` → `typecheck` → テスト → e2e を回す。

## 版面プレビューの出力

`npx vitest run --config tools/layout-preview/vitest.config.ts` で `dist/layout-preview/` に
4本の PDF を書き出す（`adopted` / `adopted-en` / `grid-6x6` / `lowres`）。

**`npm run build` は `dist/` を丸ごと消す。** `dist/layout-preview/photos/` の実素材も一緒に
消えるので、レンダリング前に置き直すこと。

## 触るときに気をつけること

- **スキーマ（`PersistedState.version`）は実案件1本の通しが終わるまで v3 で凍結**（第9章）。
  v4 相当の変更が要る修正は、`docs/spec/10-first-run.md` の「通しで見つかった事象」に
  記録だけして後回しにする。
- 和文フォントは事前サブセット済み（`src/assets/fonts/NotoSansJP-jis.ttf`）。
  **実行時にサブセット化しない**——pdf-lib の書き出しは壊れた `glyf` を吐く。
  字形集合を変えたら `npm run fonts:subset` を実行し、生成物とマニフェストごとコミットする。
- レンダラは IR 以外を読まず、ネットワークを使わず、IR を書き換えない（第6章 6-5）。
