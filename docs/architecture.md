# Architecture

The shape of the codebase today, and where it is heading.

## Today

```
src/
├── main.tsx              # React 18 entry, mounts <App /> into #root
├── App.tsx               # owns the budget reducer + persistence wiring
├── styles.css            # global styles + sheet layout
├── components/
│   ├── SheetView.tsx              # one sheet — month grouping + opening balance
│   ├── MonthTable.tsx             # one month's table
│   ├── ColumnHeader.tsx           # draggable column header
│   ├── Cell.tsx                   # per-type cell editor
│   └── ImportExportControls.tsx   # file download + file picker
├── data/
│   ├── types.ts          # Budget, Sheet, Column, Row, CellValue
│   ├── constants.ts      # MAX_COLUMN_CHARS, STORAGE_KEY
│   ├── sheet.ts          # pure helpers (group, sort, balances, reorder)
│   ├── migrations.ts     # forward-only schema migration runner
│   └── validate.ts       # boundary validator: unknown → Result<Budget>
└── storage/
    ├── local.ts          # localStorage glue (load + save)
    └── file.ts           # JSON file codec: serialize + parse
```

## Planned shape

```
src/
├── main.tsx
├── App.tsx
├── components/           # UI sections (sheets, dialogs, navigation)
├── storage/
│   ├── local.ts          # localStorage adapter (load / save / clear)
│   └── file.ts           # JSON file export + import (Blob, FileReader)
├── data/
│   ├── types.ts          # Budget, Sheet, Column, Row + future shapes
│   ├── sheet.ts          # sheet-level pure helpers
│   ├── migrations.ts     # schema migrations on load
│   └── forecasting/      # savings, loans, leave planning (TBD)
└── utils/                # money formatting, date helpers, …
```

## Data model

The persistent state is a single JSON document stored under the
`localStorage` key `budget.v1`. Top-level shape:

```ts
type Budget = {
  version: 1;
  sheets: Sheet[];
  activeSheetId: string;
};

type Sheet = {
  id: string;
  name: string;
  columns: Column[]; // ordered; drag-and-drop reorders this array
  rows: Row[]; // flat list; month grouping is derived in the view
  openingBalance: number;
};

type Column = {
  id: string;
  type: "date" | "description" | "amount" | "balance" | "completed";
  label: string;
};

type Row = {
  id: string;
  cells: Record<string /* column id */, string | number | boolean | null>;
};
```

Cells are keyed by column id (not column type) so the model supports
adding multiple columns of the same type without ambiguity. The
`balance` column is **derived** — its value is computed by
`computeBalances()` from the row's date and amount, as a running total
from the sheet's `openingBalance` across all rows in chronological
order. It is never written to row cells.

Month grouping is a view concern: `groupRowsByMonth()` buckets rows
by the `YYYY-MM` prefix of their date cell. Changing a date moves a
row between buckets automatically on the next render.

### Migrations

`src/data/migrations.ts` holds a forward-only chain of migration
functions keyed by source version. Loading any persisted budget — from
`localStorage` or an imported file — runs:

1. `JSON.parse` the raw text.
2. `migrate()` walks the version forward one step at a time until it
   reaches `LATEST_VERSION`. A newer-than-supported version is a hard
   error (the data is from a future build of the app).
3. `validateBudget()` enforces the latest schema. Soft anomalies are
   repaired (cells referencing dropped columns are removed, a dangling
   `activeSheetId` falls back to the first sheet); hard violations
   (unknown column type, duplicate ids, wrong field types) are
   surfaced as an error string.

Today only `version: 1` exists, so the migration chain is empty. The
scaffolding is in place so the next bump is a single entry.

## Import / export

`src/storage/file.ts` provides the codec; `ImportExportControls`
wires it to the DOM. Both `localStorage` reads and file imports run
through the same `parseBudget(text)` pipeline.

- **Export** — `serializeBudget(budget)` produces pretty-printed JSON
  with **sorted keys at every level** plus a trailing newline. Two
  exports of equal budgets are byte-identical, which keeps diffs clean
  if a user version-controls their file. The DOM glue wraps the string
  in a `Blob` and triggers a download as `budget-YYYY-MM-DD.json`.
- **Import** — the user picks a file; `parseBudget(text)` returns
  either `{ ok: true, budget, migrated }` or `{ ok: false, error }`.
  On success the budget replaces the in-memory state (and is persisted
  by the usual save effect). The `migrated` flag tells the UI to
  surface that the file was upgraded.

The on-disk JSON shape is identical to the in-memory `Budget` shape —
no envelope or metadata wrapper. Round-trip identity is the
invariant: `parse(serialize(b))` equals `b`.

No network. No third party. The file is the user's data, in plain
JSON, in their hands.

## Dependency direction

`components/` depend on `data/` and `storage/`. Nothing in `data/` or
`storage/` imports from `components/`. The storage modules are the
only places that touch `localStorage` or `FileReader` directly —
components consume a small typed API.

## Why GitHub Pages

The whole app is a static bundle. GitHub Pages is the cheapest way to
serve it without a vendor in the loop, and the deploy pipeline is one
workflow (`.github/workflows/pages.yml`).

Project sites at `<user>.github.io/<repo>/` mean every asset URL needs
the `/budget/` prefix in production. That is pinned in
`vite.config.ts` via the `base` option.
