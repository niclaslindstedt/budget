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

The current commit is a hello-world skeleton — the deploy pipeline,
tooling, and OSS scaffolding are in place; the actual budgeting
features come next.

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
| `make test`      | Vitest suite (none yet)                   |
| `make clean`     | Remove `dist/` and Vite cache             |

CI runs on every push and pull request:

- **CI** (`.github/workflows/ci.yml`) — `make fmt-check`, `make lint`,
  `make build`, `make test`.

Deployment runs separately in **Pages**
(`.github/workflows/pages.yml`) on every push to `main`.

## Architecture summary

```
src/
├── main.tsx        # React 18 entry, mounts <App /> into #root
└── App.tsx         # root component — hello-world placeholder
```

Once the app lands, the planned shape is:

```
src/
├── main.tsx           # React entry
├── App.tsx            # composes routes/sections
├── components/        # one file per UI section
├── storage/           # localStorage adapter + JSON file import/export
├── data/              # budget data types + schema
└── utils/             # date helpers, money formatting, …
```

Dependency direction (planned): components depend on `data` and
`storage`. Nothing in `data/` or `storage/` imports from
`components/`. Keep it that way.

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
- **Vite `base` path.** `vite.config.ts` pins `base` to `/budget/` in
  production. If the repo is renamed, update both `vite.config.ts`
  and the README badge / live-site URL.

## Website staleness pointer

See `OSS_SPEC.md` §11.2 for the website-content invariants once the
app has a public surface beyond the hello-world placeholder.

## Maintenance skills

None yet. When the app gains real features, agent-driven maintenance
playbooks live under `.agent/skills/<name>/SKILL.md` per
`OSS_SPEC.md` §21, with a registry in this section listing every skill
and its run order.
