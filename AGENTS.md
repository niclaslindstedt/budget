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
- **Visual style**: monospaced face, One Dark / One Light palette, and
  a few syntax-coloured accents for sheet content (dates, amounts,
  completion). That is the whole "terminal" budget — don't dress
  modals, form labels, headers, or buttons up as a CLI. No `$` prompts
  in modal titles, no `--flag`-style field labels, no `command --flag`
  headings. Modal titles are plain sentences ("New entry", "Delete
  row"); form labels are plain words ("Description", "Amount"). The
  `text-flag` / `text-path` / `text-pipe` utilities exist for sheet
  cells and similar data tokens, not for chrome.
- **Always use custom dropdowns.** Never reach for the native
  `<select>` / `<option>` elements — the browser renders them with the
  OS's own widget, which breaks the monospaced One Dark / One Light
  look and feel and looks especially out-of-place on mobile (see the
  iOS wheel picker). Build a button + listbox in the project style
  instead — model new pickers on `TypePicker` / `AccountPicker` in
  `src/components/SheetModal.tsx` or `CategoryPicker` in
  `src/components/CategoryPicker.tsx` (use the latter's portal pattern
  when the dropdown lives in a tight cell or could overflow its
  container). Apply the same rule when refactoring older code: if you
  touch a screen that still has a native `<select>`, replace it.
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

## OSS*SPEC.md exceptions — the website \_is* the project

`OSS_SPEC.md` is written for a hypothetical project shape where the
deliverable is a library, CLI, or SDK and the `website/` is a
**showcase** for that deliverable — a separate marketing site with a
hero, feature grid, hosted docs, and an SEO surface tuned for new
visitors discovering the product. **This project is not that shape.**
The deployed GitHub Pages bundle at `budget.niclaslindstedt.se` _is_
the budget app: it is the entire user-facing deliverable, served as a
single-page React SPA, with no marketing layer wrapped around it. The
"site" and the "product" are the same artifact.

That mismatch makes several spec rules either inapplicable or
actively counter-productive here. The bash validator
(`scripts/validate.sh` from `niclaslindstedt/oss-spec`) cannot model
this distinction and will keep emitting the violations below — they
are intentional and must **not** be "fixed" by inventing the missing
surfaces. Agents running `sync-oss-spec` should compare against this
list before touching anything.

| Spec section                                                                                 | Why it does not apply here                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| §10.3 release pipeline (`version-bump.yml`, `release.yml`, `scripts/`)                       | There is nothing to "release". The single deliverable is a static bundle that GitHub Pages redeploys on every push to `main` (see `pages.yml`). No registry publishes — no npm, no crates, no PyPI — and therefore no need for trusted publishing, OIDC, version bumps, `CHANGELOG.md` regeneration, or matrix release builds. `CHANGELOG.md` exists as a courtesy stub but is not driven by a workflow. |
| §10.5 release toolchain pin file beyond `.nvmrc`                                             | Node is the only toolchain. `.nvmrc` already pins it and `ci.yml` / `pages.yml` read from it.                                                                                                                                                                                                                                                                                                            |
| §11.2 `website/` directory + source-extraction script                                        | There is no separate website to keep in sync with the product — the product IS the website. The source-extraction pattern (`website/scripts/extract-source-data.*` emitting `website/src/generated/sourceData.*`) exists to prevent a showcase from drifting out of sync with the thing it showcases; here there is nothing to mirror.                                                                   |
| §11.3 SEO scaffolding (Open Graph, Twitter Card, JSON-LD, sitemap.xml, robots.txt, llms.txt) | The app is a private financial tool — users put their own ledger into `localStorage`. There is no per-page content for crawlers to index and no audience-acquisition story that SEO would serve. Adding the scaffolding would be cargo-culted noise. The single `index.html` is allowed to ship without per-route head splicing, JSON-LD blocks, or social-card images.                                  |
| §11.3.10 `seo.yml` + `lighthouse.yml` workflows                                              | Quality-gate CI for a marketing site. Not relevant when there is no marketing surface. Page-weight discipline (§11.3.9) is still a worthwhile habit — the dev should keep the bundle small — but it is not gated in CI.                                                                                                                                                                                  |
| §12 CLI obligations (`--help-agent`, `--debug-agent`, `commands`, `man/`)                    | Not a CLI. The user interacts with a UI in their browser.                                                                                                                                                                                                                                                                                                                                                |
| §13 `examples/` directory                                                                    | No CLI / SDK surface to exemplify. The app itself is the example.                                                                                                                                                                                                                                                                                                                                        |
| §13.5 `prompts/` directory                                                                   | This project does not ship versioned AI prompts. (`prompts/<name>/<v>.md` is for repos that publish prompts as a product — e.g. `oss-spec` itself.)                                                                                                                                                                                                                                                      |
| §19 logging + §19.4 central output module                                                    | There is no terminal, no log file, and no `~/.local/state/<project>/` to write into — the app runs entirely in a browser tab. Production error reporting, if it ever lands, will use a thin in-app helper rather than the `src/output.{ts,rs,…}` pattern the spec describes. Add such a helper only when there is a real call site for it.                                                               |
| §21.5 `update-manpages`, `update-website` skills                                             | Required only when the corresponding artifact (`man/`, `website/`) exists. Neither does. See the registry in `.agent/skills/maintenance/SKILL.md`.                                                                                                                                                                                                                                                       |

Everything else in `OSS_SPEC.md` does apply. In particular: the
README / CONTRIBUTING / CODE_OF_CONDUCT / SECURITY trio (§2–§6), the
single-source-of-truth symlinks for tool-specific guidance (§7.1),
Conventional Commits + squash-merge (§8), the `Makefile` target set
(§9), `ci.yml` + `pages.yml` (§10.1 / §10.4), `docs/` (§11.1), test
layout and naming (§20), the source-file size cap (§20.5), and the
agent-skills structure (§21.2–§21.4, §21.6, §21.8) are all in scope
and must stay healthy.

If the project later grows a real marketing site, a CLI companion, or
a published SDK, revisit this table and delete the corresponding row.
The exceptions exist because the surface is absent, not because the
spec is wrong.

## Maintenance skills

Agent-driven maintenance playbooks live under
`.agent/skills/<name>/SKILL.md` per `OSS_SPEC.md` §21. Tool-specific
discovery paths (`.claude/skills/`) are symlinks to `.agent/skills/`
so every tool sees the same canonical set.

| Skill           | Run when                                                                                                                                            | Run order |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| `update-docs`   | `docs/` may be stale relative to `src/` layout, the persisted-data shape, or the `Makefile` target table.                                           | 1         |
| `update-readme` | `README.md` may be stale relative to `package.json` scripts, `Makefile` targets, `.nvmrc`, or the user-visible UI.                                  | 2         |
| `sync-oss-spec` | This repo may have drifted out of conformance with `OSS_SPEC.md` — runs the upstream bash validator and walks the violations until it reports zero. | last      |
| `maintenance`   | Bring the whole repository back into sync without first diagnosing which artifact is stale — dispatches every `update-*` above in order.            | umbrella  |

`update-manpages` and `update-website` are listed in `OSS_SPEC.md`
§21.5 but are intentionally omitted here — see the "OSS_SPEC.md
exceptions" section above. New skills go in this table in the order
they should run — upstream fixes first, downstream mirrors last;
`sync-oss-spec` always runs last to catch residual violations, and
the `maintenance` umbrella reflects the same order in its own
registry.
