# Luxury Beauty Visual Proposal OS

ラグジュアリー／ビューティー領域の広告撮影案件について、案件情報とブランド資料から、企画・提案書・AI生成用プロンプトまでを一貫して作成する統合システム。

リポジトリは**アプリ本体**と**仕様書のドキュメント生成**を分離している。

| ディレクトリ       | 役割                                                             |
| ------------------ | ---------------------------------------------------------------- |
| `src/`             | アプリ本体（React + TypeScript + Vite）                          |
| `docs/spec/`       | 仕様書の原稿（Markdown、1ファイル＝1セクション）                 |
| `tools/spec-docs/` | `docs/spec/` を PDF / Word / PowerPoint に書き出す Python ツール |
| `e2e/`             | Playwright のE2Eテスト                                           |

アプリ側は `tools/` を参照せず、ツール側も `src/` を参照しない。片方を変更しても、もう片方のビルドには影響しない。

## Getting started

```bash
npm install
npm run dev
```

## 実装状況

第4章（AIワークフロー＋データモデル）までを実装済み。全13画面が動作する。

| 画面                     | ルート                      |
| ------------------------ | --------------------------- |
| ダッシュボード           | `/`                         |
| 案件一覧                 | `/projects`                 |
| 新しい案件作成           | `/projects/new`             |
| ブランド分析             | `/projects/:id/brand`       |
| 競合分析                 | `/projects/:id/competitors` |
| 撮影コンセプト           | `/projects/:id/concepts`    |
| ムードボード             | `/projects/:id/moodboard`   |
| ショットリスト／絵コンテ | `/projects/:id/shots`       |
| AIプロンプト生成         | `/projects/:id/prompts`     |
| 提案書プレビュー         | `/projects/:id/proposal`    |
| PDF／PowerPoint出力      | `/projects/:id/export`      |
| ポートフォリオ管理       | `/portfolio`                |
| 設定                     | `/settings`                 |

### 生成と手動編集の扱い（第4章）

- 生成物は**フィールド単位の provenance**（AI生成／手動編集済み／未生成、生成ラインID、更新時刻）を持つ。
- 再生成は既存値を無条件に上書きしない。**差分プレビュー**で「上書き／保護（手動編集済み）／変更なし」を提示し、選択したフィールドだけを適用する。適用するまで生成物には一切書き込まない。
- 上流が変わると下流ステップは **stale**（要確認）になる。データは無効化せず、提案書プレビューと出力画面で警告する。自動再生成はしない。「確認したが再生成不要」を記録でき、上流が再変化したら stale に戻る。
- Run 完了・未適用は独立したステータス **確認待ち（review）**。異なるステップの Run は並走でき、差分プレビューは開いているステップのものだけが出る。
- 画像アセットはメタデータと実体を分離し、AI生成か持ち込みかを origin で常に区別する（第5章 5-1）。localStorage にはサムネイルのみを上限付きで保持し、容量超過時はサムネイルだけを退避する。
- 提案書の章本文も章ごとに1フィールドの生成物。生成→差分プレビュー→適用を通り、章単位で編集・保護できる。
- 出力は**Proposal IR**（第6章）を経由する。IR は AI を呼ばず、ワークスペースから決定的に組み立てる中間表現で、章ごとに生成元 Run・provenance・stale 状態を持ち、内容から決まる版ID（revision）が付く。Markdown・PDF・PowerPoint はこの IR だけを入力にする。出力履歴には revision が残り、どの版を出したかを後から照合できる。
- PDF は日本語フォントをサブセット埋め込みする。フォントを読み込めない環境では、文字化けした PDF を出さずにエラーにする。
- 状態は localStorage に保存する。リロードしても手動編集と provenance は残る。

現時点の制約（次フェーズで解消する）:

- AI生成はテストダブル（`src/engine/mockEngine.ts` ＋ `src/data/generate.ts` / `src/data/proposalBody.ts`）。実モデルは未接続で、エンジンを差し替えれば繋がる形にしてある。
- 実ファイル出力は Markdown・PDF・PowerPoint。Word はレンダラ未実装で履歴のみ。
- 画像アセットは参照とサムネイルのみ。実体の保存はサーバー側永続化フェーズ。
- コレクション（コンセプト一覧、ショットリスト等）は全体で1フィールド。アイテム単位のマージは未対応。
- 永続化はブラウザ内のみ。サーバー側とマルチユーザーの同時編集は未対応。

次の実装順は `docs/spec/99-backlog.md` を参照。Proposal Generator → 実モデル接続 → API・サーバー永続化。

## ソース構成

```
src/
  app/        アプリシェル、サイドバー、ステッパー、ルート定義
  screens/    13画面
  ui/         画面をまたいで使う表示部品、差分プレビュー
  store/      状態（Context）、localStorage 永続化
  domain/     ステップ契約、フィールド定義、provenance、差分の算出と適用、Proposal IR
  domain/render/  出力レンダラ（Markdown／PDF／PowerPoint）。IR だけを入力にする
  engine/     生成エンジンのインターフェースとテストダブル
  data/       型、表示ラベル、シードデータ、生成ロジック
  lib/        純粋関数（進捗計算、絞り込み、整形）
```

ステップの順序・依存・出力フィールドは `src/domain/steps.ts` の1箇所で定義している。ステッパー・サイドバー・進捗率はここから生成するので、ステップを増減しても画面側の改修は不要（第4章 4-8）。

デザイントークン（色・タイポ・余白）は `src/index.css` の CSS 変数に集約している。第3章のデザイン原則に対応するので、色を足すときはまずここを見ること。

## 仕様書の生成

```bash
pip install -r tools/spec-docs/requirements.txt
python tools/spec-docs/build_spec_docs.py       # dist/spec-docs/ に PDF / DOCX / PPTX
```

原稿は `docs/spec/*.md`。書式と日本語まわりの注意は `tools/spec-docs/README.md` に書いてある。

## Testing

The suite is split into three layers. Each has a worked example in the repo — copy the nearest one when adding tests.

| Layer      | Runner                   | Lives in               | Example                            |
| ---------- | ------------------------ | ---------------------- | ---------------------------------- |
| Unit       | Vitest                   | beside the source file | `src/lib/projects.test.ts`         |
| Component  | Vitest + Testing Library | beside the component   | `src/screens/ProjectList.test.tsx` |
| End-to-end | Playwright               | `e2e/`                 | `e2e/smoke.spec.ts`                |

```bash
npm test              # unit + component, single run
npm run test:watch    # same, in watch mode
npm run test:coverage # same, with a coverage report
npm run test:e2e      # end-to-end against a production build
```

### Conventions

- **Query like a user.** Component tests use accessible roles and labels (`getByRole`, `getByLabelText`) rather than CSS classes or test ids. If an element is hard to query, that is usually an accessibility bug worth fixing rather than a reason to reach for a test id.
- **Interact with `userEvent`, not `fireEvent`.** It fires the realistic event sequence, so focus and keyboard behaviour get exercised too.
- **Mount through the router.** `src/test/render.tsx` boots the whole app at a given URL with the store and routes attached, so component tests exercise navigation the way the app really works.
- **Keep e2e thin.** The Playwright suite covers wiring — the app boots, routes, and responds in a real browser. Detailed behaviour belongs in the much faster component tests.
- **E2E runs against the production build,** so it catches bundling and asset problems the dev server would hide.

### Coverage

Coverage is **reported, not enforced**. CI prints a summary on every run and uploads the full HTML report as an artifact, but no threshold can fail the build. Once the codebase settles, add a gate in `vite.config.ts`:

```ts
coverage: {
  thresholds: { lines: 80, branches: 80, functions: 80, statements: 80 },
}
```

Files matched by `coverage.include` are counted even when no test imports them, so untested modules appear at 0% instead of silently dropping out of the report.

One quirk worth knowing: when everything is at 100%, the terminal table prints empty and only the summary block below it shows numbers. The `html`, `lcov`, and `json-summary` outputs always contain every file, so use those (or `coverage/index.html`) for the real picture.

## Other scripts

```bash
npm run build        # typecheck + production build
npm run preview      # serve the production build locally
npm run lint         # ESLint
npm run format       # Prettier, write
npm run format:check # Prettier, verify only
npm run typecheck    # tsc, no emit
```

## CI

`.github/workflows/ci.yml` runs three jobs in parallel on every push to `main` and every pull request:

- **static** — lint, format check, typecheck
- **test** — unit and component tests with coverage (summary in the job page, full report as an artifact)
- **e2e** — Playwright against the production build (HTML report as an artifact)

## Notes for sandboxed environments

If your environment ships a preinstalled Chromium whose revision does not match this Playwright version, point at it directly instead of downloading:

```bash
CHROMIUM_PATH=/path/to/chrome npm run test:e2e
```

CI leaves `CHROMIUM_PATH` unset and uses `playwright install`.
