# Architecture

The shape of the codebase today, and where it is heading.

## Today

```
src/
├── main.tsx        # React 18 entry, mounts <App /> into #root
└── App.tsx         # hello-world placeholder
```

The current commit is the deploy skeleton — Vite, React, TypeScript
strict mode, ESLint, Prettier, Vitest, GitHub Pages, OSS_SPEC
scaffolding. No app logic yet.

## Planned shape

```
src/
├── main.tsx           # React 18 entry
├── App.tsx            # composes sections / routes
├── components/        # one file per UI section
├── storage/
│   ├── local.ts       # localStorage adapter (load / save / clear)
│   └── file.ts        # JSON file export + import (Blob, FileReader)
├── data/
│   ├── types.ts       # Budget, Category, Transaction
│   └── schema.ts      # runtime guards / migrations
└── utils/
    ├── money.ts       # currency formatting
    └── date.ts        # period helpers (month, year)
```

## Storage model

Persistent state lives in a single key in `localStorage`. The value is
a JSON document with a top-level schema version:

```json
{
  "version": 1,
  "budgets": [...],
  "categories": [...],
  "transactions": [...]
}
```

A version bump triggers a migration in `src/storage/local.ts` before
the data reaches components.

## Import / export

The user can:

- **Export** — `src/storage/file.ts` serialises the in-memory state to
  a `Blob`, triggers a download as `budget-YYYY-MM-DD.json`.
- **Import** — the user picks a file; `FileReader` parses it, the
  schema guards reject malformed input, the new state replaces (or
  merges with — TBD) the current `localStorage` document.

No network. No third party. The file is the user's data, in plain
JSON, in their hands.

## Dependency direction

Components depend on `data/` and `storage/`. Nothing in `data/` or
`storage/` imports from `components/`. The two storage modules are
the only places that touch `localStorage` or `FileReader` directly —
components consume a small typed API.

## Why GitHub Pages

The whole app is a static bundle. GitHub Pages is the cheapest way to
serve it without a vendor in the loop, and the deploy pipeline is one
workflow (`.github/workflows/pages.yml`).

Project sites at `<user>.github.io/<repo>/` mean every asset URL needs
the `/budget/` prefix in production. That is pinned in
`vite.config.ts` via the `base` option.
