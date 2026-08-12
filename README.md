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

第3章（UI/UX設計）までを実装済み。全13画面が動作する。

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

現時点の制約（次フェーズで解消する）:

- 永続化層はなく、案件はブラウザのメモリ上にのみ存在する（リロードでシードデータに戻る）。
- AI生成は `src/data/generate.ts` のモック。案件の入力値から決定的に組み立てているだけで、実モデルは呼んでいない。
- ファイルのアップロードと実出力は未接続。画面と履歴のみ。

次の実装順は `docs/spec/05-backlog.md` を参照。AIワークフロー → データモデル → Proposal Generator。

## ソース構成

```
src/
  app/        アプリシェル、サイドバー、ステッパー、ルート定義
  screens/    13画面
  ui/         画面をまたいで使う表示部品
  store/      案件・生成物・設定のインメモリストア（Context）
  data/       型、ワークフロー定義、シードデータ、生成モック
  lib/        純粋関数（進捗計算、絞り込み、整形）
```

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
