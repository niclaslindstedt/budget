# AGENTS.md

Guidance for AI coding agents working on this repository. This file is
the single source of truth for agent guidance — tool-specific guidance
files (`CLAUDE.md`, `GEMINI.md`, `.cursorrules`, `.windsurfrules`,
`.github/copilot-instructions.md`) are symlinks pointing here (see
`OSS_SPEC.md` §7.1).

## What this project is

`budget` — a local-first budget app built with Vite, React 18, and
TypeScript. The built output is a static site deployed to GitHub Pages
via `.github/workflows/pages.yml`. There is no backend, no account, no
sync service: persistent state lives in `localStorage`, and the user
can export / import it as a JSON file for portability.

The first piece of UI is a spreadsheet-style sheet with typed columns
(date, description, amount, balance, completed), draggable column
headers, auto-sizing columns capped by `MAX_COLUMN_CHARS`, a derived
running balance, and one table per month. Persistent state lives
under the `localStorage` key `budget.v1`.

## Vision

The current feature surface is small but the data model and module
boundaries assume the following will land later — design and review
new code with these in mind, even if the immediate change is narrow:

- **Multiple sheets.** Users can add, name, switch between, and
  reorder sheets. The active sheet is part of the persisted state.
- **Sheet types.** Beyond the default transactional ledger: budget
  planning, loan tracking, savings forecasts, parental-leave (Sweden)
  planning, and similar planners. Each type is a sheet flavour with
  its own columns, computed cells, and (where useful) charts.
- **Multiple accounts.** Sheets can belong to a named account so
  balances and forecasts can be computed per account, then rolled up.
- **Import / export.** A JSON file format with a `version` field,
  forward-only migrations, and round-trip safety with localStorage.
  See `src/storage/file.ts` (planned).
- **User options.** Per-sheet column visibility, max column width,
  currency, locale, week-starts-on, etc. Stored alongside the budget.
- **Forecasting and planners.** Pure functions in
  `src/data/forecasting/` consumed by sheet-type components. No
  network calls; all logic runs locally.

The local-first, no-backend invariant holds throughout — none of the
above introduces a server, an account, or a third-party service.
Anything that would needs an explicit spec change.

When introducing a new abstraction, prefer shapes that scale to the
list above (e.g. `Sheet.type`, columns keyed by id so future column
kinds slot in, opening balance modelled per-sheet so per-account roll
ups are mechanical). Do not pre-implement these features — only make
the design accommodate them.

## Build and test commands

Prefer `make` targets over raw `npm run` commands so local and CI stay
in sync:

| Command          | What it does                              |
| ---------------- | ----------------------------------------- |
| `make install`   | `npm ci`                                  |
| `make dev`       | Start the Vite dev server                 |
| `make build`     | Type-check and produce a production build |
| `make preview`   | Preview the production build locally      |
| `make lint`      | ESLint + TypeScript type-check            |
| `make typecheck` | `tsc -b --noEmit` only                    |
| `make fmt`       | Prettier rewrite in place                 |
| `make fmt-check` | Prettier check without writing            |
| `make test`      | Vitest suite                              |
| `make clean`     | Remove `dist/` and Vite cache             |

CI runs on every push and pull request:

- **CI** (`.github/workflows/ci.yml`) — `make fmt-check`, `make lint`,
  `make build`, `make test`.

Deployment runs separately in **Pages**
(`.github/workflows/pages.yml`) on every push to `main`.

## Architecture summary

```
src/
├── main.tsx              # React 18 entry, mounts <App /> into #root
├── App.tsx               # owns the budget reducer + persistence wiring
├── styles.css            # global styles + sheet layout
├── components/
│   ├── SheetView.tsx     # one sheet — month grouping + opening balance
│   ├── MonthTable.tsx    # one month's table (header + rows + add row)
│   ├── ColumnHeader.tsx  # draggable column header (HTML5 drag-and-drop)
│   └── Cell.tsx          # per-type cell editor (date/text/number/check)
├── data/
│   ├── types.ts          # Budget, Sheet, Column, Row, CellValue
│   ├── constants.ts      # MAX_COLUMN_CHARS, STORAGE_KEY
│   └── sheet.ts          # pure helpers (group, sort, balances, reorder)
└── storage/
    └── local.ts          # localStorage adapter (load + save)
```

Planned additions (not in place yet): `storage/file.ts` for JSON
import/export, `utils/` for money/date helpers, multi-sheet UI.

Dependency direction: `components/` depend on `data/` and `storage/`.
Nothing in `data/` or `storage/` imports from `components/`. Keep it
that way.

## Where new code goes

| Change                           | Location                                              |
| -------------------------------- | ----------------------------------------------------- |
| New UI section / page            | `src/components/<Name>.tsx` + wire into `src/App.tsx` |
| Persisted-data shape changes     | `src/data/` (add types + a migration if needed)       |
| Read/write to `localStorage`     | `src/storage/local.ts`                                |
| Export / import file format      | `src/storage/file.ts`                                 |
| Vite config (base path, plugins) | `vite.config.ts`                                      |
| ESLint rules, TS config          | `eslint.config.js`, `tsconfig.app.json`               |
| New `make` target                | `Makefile` + the README Usage table + `ci.yml`        |

## Conventions

- **TypeScript strict mode is on** (`tsconfig.app.json`: `strict`,
  `noUnusedLocals`, `noUnusedParameters`). Don't disable these.
- **React function components only**, named exports, prop types
  declared inline as a `type Props = { … }`.
- **Prettier** (`.prettierrc.json`) owns formatting — double quotes,
  semicolons, trailing commas, 80-column width. Run `make fmt` before
  pushing.
- **Imports**: relative paths, no path aliases. External packages
  first, then relative, separated by a blank line.
- **Commit style**: Conventional Commits (`feat:`, `fix:`, `chore:`,
  …) per `OSS_SPEC.md` §8.1.
- **PR conventions**: PR titles must follow Conventional Commits
  because the title becomes the squash-merge commit on `main`.
  Squash-merge is the only permitted merge strategy. **Rebase on
  latest `main` before opening a PR**:
  `git fetch origin main && git rebase origin/main`.

## Test conventions

Tests live under `tests/` at the repo root. File stems must end with
`_test` or `_tests` (see `OSS_SPEC.md` §20.2). `make test` runs Vitest;
add coverage when meaningful tests exist.

No tests exist yet — the skeleton has nothing to assert. Add them as
real features land (start with `src/storage/` once data persistence is
in).

## Documentation sync points

| If you change …          | Also update …                         |
| ------------------------ | ------------------------------------- |
| `package.json` scripts   | `Makefile`, `README.md` Usage section |
| `Makefile` targets       | `README.md` Usage section, `ci.yml`   |
| `src/` top-level layout  | `README.md`, this file                |
| Node version in `.nvmrc` | `ci.yml`, `pages.yml`, `README.md`    |
| Persisted-data shape     | `docs/architecture.md`                |

## Cross-cutting rules

- **No backend.** This is a local-first app. Never reach for a remote
  store, third-party API, or analytics service without an explicit
  spec change. The deploy is a plain static bundle on GitHub Pages.
- **Vite `base` path.** `vite.config.ts` uses `base: "/"` because the
  production site is served from the custom domain
  `budget.niclaslindstedt.se` (see `public/CNAME`, which Vite copies
  into the deployed artifact). If the custom domain is ever dropped
  so the app falls back to `<user>.github.io/<repo>/`, update both
  `vite.config.ts` (to `"/<repo>/"`) and the README live-site URL,
  and remove `public/CNAME`.

## Website staleness pointer

See `OSS_SPEC.md` §11.2 for the website-content invariants once the
app has a public surface beyond the hello-world placeholder.

## Maintenance skills

None yet. When the app gains real features, agent-driven maintenance
playbooks live under `.agent/skills/<name>/SKILL.md` per
`OSS_SPEC.md` §21, with a registry in this section listing every skill
and its run order.
