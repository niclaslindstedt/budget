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

Vite serves the app at `http://localhost:5173`. The dev server uses
`base: "/"` so paths look like normal `/assets/...`; the production
build uses `base: "/budget/"` because GitHub Pages project sites are
served from a sub-path.

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
  sets `base: "/budget/"` for production. Rename the repo? Update that
  value to match.
- **Vite dev server complains about a missing `#root` element** — the
  app expects `<div id="root"></div>` in `index.html`. Don't remove it.
