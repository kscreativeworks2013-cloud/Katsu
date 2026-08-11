# Katsu

A React + TypeScript web app built with Vite, scaffolded with a full testing setup from the first commit.

## Getting started

```bash
npm install
npm run dev
```

## Testing

The suite is split into three layers. Each has a worked example in the repo — copy the nearest one when adding tests.

| Layer      | Runner                   | Lives in               | Example                  |
| ---------- | ------------------------ | ---------------------- | ------------------------ |
| Unit       | Vitest                   | beside the source file | `src/lib/format.test.ts` |
| Component  | Vitest + Testing Library | beside the component   | `src/App.test.tsx`       |
| End-to-end | Playwright               | `e2e/`                 | `e2e/smoke.spec.ts`      |

```bash
npm test              # unit + component, single run
npm run test:watch    # same, in watch mode
npm run test:coverage # same, with a coverage report
npm run test:e2e      # end-to-end against a production build
```

### Conventions

- **Query like a user.** Component tests use accessible roles and labels (`getByRole`, `getByLabelText`) rather than CSS classes or test ids. If an element is hard to query, that is usually an accessibility bug worth fixing rather than a reason to reach for a test id.
- **Interact with `userEvent`, not `fireEvent`.** It fires the realistic event sequence, so focus and keyboard behaviour get exercised too.
- **Keep e2e thin.** The Playwright suite covers wiring — the app boots, renders, and responds in a real browser. Detailed behaviour belongs in the much faster component tests.
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
