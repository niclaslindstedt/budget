# budget

[![CI](https://github.com/niclaslindstedt/budget/actions/workflows/ci.yml/badge.svg)](https://github.com/niclaslindstedt/budget/actions/workflows/ci.yml)
[![Pages](https://github.com/niclaslindstedt/budget/actions/workflows/pages.yml/badge.svg)](https://github.com/niclaslindstedt/budget/actions/workflows/pages.yml)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A local-first budget app. Your data lives in your browser's local
storage; you can export it to a file at any time and re-import it on
another device. There is no backend, no account, and no third-party
service in the loop.

> Live at **[niclaslindstedt.github.io/budget](https://niclaslindstedt.github.io/budget/)**.

## What

Single-page TypeScript app — Vite + React — that reads and writes a
JSON document in `localStorage`. The whole bundle is static; deploys
ship to GitHub Pages.

The first piece of UI is a spreadsheet-style sheet (rows × typed
columns) grouped by month and year. Columns support drag-to-reorder,
auto-size up to a configurable max width, and a derived running
balance. Import/export and multiple sheets come next.

## Why

- **Local-first.** No backend means no signups, no syncing surprises,
  no privacy footnotes.
- **Portable data.** Save your budget as a file, copy it to another
  device, import it. The data shape is JSON you can read in any text
  editor.
- **Static deploy.** GitHub Pages serves it from the same repo as the
  source.

## Prerequisites

- **Node.js** ≥ 22 (see `.nvmrc`)
- **npm** ≥ 10

## Install

```bash
git clone https://github.com/niclaslindstedt/budget.git
cd budget
make install
```

## Quick start

```bash
make dev          # Vite dev server at http://localhost:5173
```

## Usage

Common `make` targets:

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

## Configuration

No configuration files yet. When persisted data and import/export land,
the data shape will be documented under [`docs/`](docs/).

## Examples

A single sheet renders at the root route. It is grouped into one
table per month; rows carry a date, description, amount, derived
balance, and completion flag. See
[`src/components/SheetView.tsx`](src/components/SheetView.tsx).

## Troubleshooting

- **`make install` fails** — confirm the active Node version matches
  `.nvmrc` (`nvm use`).
- **Pages deploy 404s** — `vite.config.ts` sets `base: "/budget/"` for
  production builds. If you fork into a differently-named repo, update
  that `base` value.

## Documentation

- [`docs/getting-started.md`](docs/getting-started.md) — local setup.
- [`docs/architecture.md`](docs/architecture.md) — code layout and the
  planned data model.
- [`AGENTS.md`](AGENTS.md) — guidance for AI coding agents.
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — branch, commit, and PR
  conventions.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Licensed under [MIT](LICENSE).
