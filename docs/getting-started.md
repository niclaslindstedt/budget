# Getting started

Local setup for the `budget` repo.

## Prerequisites

- **Node.js** ≥ 22 (the version pinned in `.nvmrc`)
- **npm** ≥ 10
- Optional: `nvm` to switch Node versions

## First-time setup

```bash
git clone https://github.com/niclaslindstedt/budget.git
cd budget
nvm use          # if you have nvm — picks the version from .nvmrc
make install     # npm ci
```

## Run the dev server

```bash
make dev
```

Vite serves the app at `http://localhost:5173`. Both dev and production
builds use `base: "/"` because the deployed site lives on the custom
domain `budget.niclaslindstedt.se` (see `public/CNAME`). If the custom
domain is ever dropped so the app falls back to
`<user>.github.io/<repo>/`, update `base` in `vite.config.ts` to
`"/<repo>/"` and remove `public/CNAME`.

## Build for production

```bash
make build       # type-check + Vite build → dist/
make preview     # preview dist/ at http://localhost:4173
```

## Format, lint, test

```bash
make fmt         # Prettier rewrite
make lint        # ESLint + tsc -b --noEmit
make test        # Vitest (no tests yet)
```

## Troubleshooting

- **`make install` fails on a fresh clone** — check `nvm use` actually
  switched to a Node 22 binary (`node --version`).
- **Pages preview shows assets 404** — confirm `vite.config.ts` still
  sets `base: "/"` and that `public/CNAME` still points at the custom
  domain. Drop the custom domain? Switch `base` to `"/<repo>/"` and
  remove `public/CNAME`.
- **Vite dev server complains about a missing `#root` element** — the
  app expects `<div id="root"></div>` in `index.html`. Don't remove it.
