# budget

[![CI](https://github.com/niclaslindstedt/budget/actions/workflows/ci.yml/badge.svg)](https://github.com/niclaslindstedt/budget/actions/workflows/ci.yml)
[![Preview](https://github.com/niclaslindstedt/budget/actions/workflows/preview.yml/badge.svg?branch=main)](https://github.com/niclaslindstedt/budget/actions/workflows/preview.yml)
[![Pages](https://github.com/niclaslindstedt/budget/actions/workflows/pages.yml/badge.svg)](https://github.com/niclaslindstedt/budget/actions/workflows/pages.yml)
[![Release](https://github.com/niclaslindstedt/budget/actions/workflows/release.yml/badge.svg)](https://github.com/niclaslindstedt/budget/actions/workflows/release.yml)
[![License](https://img.shields.io/badge/license-PolyForm%20Noncommercial-blue.svg)](LICENSE)

A local-first budget app. Your data lives in your browser's local
storage; you can export it to a file at any time and re-import it on
another device. Each device holds one or more local accounts —
username + password, hashed and stored on the device only — that keep
separate budgets and settings apart. There is no backend and no
third-party service in the loop.

> Live at **[budget.niclaslindstedt.se](https://budget.niclaslindstedt.se/)**.

## What

Single-page TypeScript app — Vite + React — that reads and writes a
JSON document in `localStorage`. The whole bundle is static; deploys
ship to GitHub Pages.

The first piece of UI is a spreadsheet-style sheet (rows × typed
columns) grouped by month and year. Columns support drag-to-reorder,
auto-size up to a configurable max width, and a derived running
balance. The header has Export / Import buttons that round-trip the
whole budget through a JSON file. Multiple sheets come next.

## Why

- **Local-first.** No backend means no remote signups, no syncing
  surprises, no privacy footnotes. Accounts are kept on the device
  and the budget is encrypted with the account password at rest.
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

| Command            | What it does                                       |
| ------------------ | -------------------------------------------------- |
| `make install`     | `npm ci`                                           |
| `make dev`         | Start the Vite dev server (`SEED=1` for fake data) |
| `make build`       | Type-check and produce a production build          |
| `make preview`     | Preview the production build locally               |
| `make lint`        | ESLint + TypeScript type-check                     |
| `make typecheck`   | `tsc -b --noEmit` only                             |
| `make fmt`         | Prettier rewrite in place                          |
| `make fmt-check`   | Prettier check without writing                     |
| `make test`        | Vitest suite                                       |
| `make e2e`         | Playwright suite against the `/preview/` build     |
| `make e2e-install` | Install the Chromium browser Playwright drives     |
| `make clean`       | Remove `dist/` and Vite cache                      |

## Configuration

No configuration files yet. The persisted-data shape and the JSON
import/export format are documented in
[`docs/architecture.md`](docs/architecture.md).

## Examples

A single sheet renders at the root route. It is grouped into one
table per month; rows carry a date, description, category, amount,
derived balance, and completion flag. The per-month `+` button adds
a blank row; long-press (or right-click) opens a modal for complex
entries — recurring payments (specific dates, every N days, or
monthly / quarterly / yearly with day-of-month + offset) and
category assignment. Swipe a row left on mobile (the action icons
are always visible on desktop) to reveal a repeat icon that promotes
the row to a recurring series — or edits an existing series with a
scope chooser ("only this", "this and all future, until …") for
temporary price changes — plus a trash icon that always asks for
confirmation, with scoped delete options when the row is part of a
series. The header also has a select-mode toggle that surfaces a bulk
action bar (edit, delete, move, copy across months) for any rows you
check. See
[`src/components/SheetView.tsx`](src/components/SheetView.tsx).

## Troubleshooting

- **`make install` fails** — confirm the active Node version matches
  `.nvmrc` (`nvm use`).
- **Pages deploy 404s** — `vite.config.ts` sets `base: "/"` because the
  site is served from the custom domain `budget.niclaslindstedt.se`
  (see `public/CNAME`). If you fork without a custom domain so the
  app is served at `<user>.github.io/<repo>/`, change `base` to
  `"/<repo>/"` and remove `public/CNAME`.

## Documentation

- [`docs/getting-started.md`](docs/getting-started.md) — local setup.
- [`docs/architecture.md`](docs/architecture.md) — code layout and the
  planned data model.
- [`docs/dictionary.md`](docs/dictionary.md) — index mapping the words
  the team says to the files they point at.
- [`docs/overview.md`](docs/overview.md) — how each of those subsystems
  behaves (the description for every dictionary term).
- [`AGENTS.md`](AGENTS.md) — guidance for AI coding agents.
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — branch, commit, and PR
  conventions.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Homepage

The app itself is served at the site root; a static showcase /
homepage lives at
[budget.niclaslindstedt.se/home](https://budget.niclaslindstedt.se/home)
([`src/components/HomePage.tsx`](src/components/HomePage.tsx)). It
identifies the app, describes what every sheet type tracks, and — for
OAuth verification — explains why the app requests optional access to
your own Dropbox or Google Drive. It is reachable without signing in
and links to the privacy policy.

**Keep it current:** when you add, remove, or change a user-facing
feature, or change what data leaves the device (an OAuth scope, a new
third-party integration), update `HomePage.tsx` in the same change so
the homepage keeps describing the app accurately. See the "App
homepage (`/home`)" section in [`AGENTS.md`](AGENTS.md).

## Privacy

The deployed site ships a privacy policy at
[budget.niclaslindstedt.se/privacy](https://budget.niclaslindstedt.se/privacy)
covering what the app stores locally, the optional Dropbox integration,
and the privacy-friendly page-view counter (GoatCounter) loaded on the
production slot.

## License

Source-available under the
[PolyForm Noncommercial License 1.0.0](LICENSE). You may read, run,
fork, and modify the code for any noncommercial purpose (personal use,
research, evaluation, hobby projects). Commercial use requires a
separate license from the copyright holder.
