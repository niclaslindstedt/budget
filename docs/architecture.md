# Architecture

The shape of the codebase today, and where it is heading.

## Today

```
src/
├── main.tsx              # React 18 entry, mounts <App /> into #root
├── App.tsx               # owns the budget reducer + persistence wiring
├── styles.css            # global styles + sheet layout
├── components/
│   ├── SheetView.tsx     # one sheet — month grouping + opening balance
│   ├── MonthTable.tsx    # one month's table
│   ├── ColumnHeader.tsx  # draggable column header
│   └── Cell.tsx          # per-type cell editor
├── data/
│   ├── types.ts          # Budget, Sheet, Column, Row, CellValue
│   ├── constants.ts      # MAX_COLUMN_CHARS, STORAGE_KEY
│   └── sheet.ts          # pure helpers (group, sort, balances, reorder)
└── storage/
    └── local.ts          # localStorage adapter (load + save)
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

A version bump (e.g. `version: 1` → `version: 2`) triggers a migration
in `src/storage/local.ts` before the data reaches components. Today
there is only `version: 1` and the loader rejects shapes it does not
recognise, falling back to a fresh budget.

## Import / export (planned)

- **Export** — `src/storage/file.ts` will serialise the in-memory
  state to a `Blob` and trigger a download as
  `budget-YYYY-MM-DD.json`.
- **Import** — the user picks a file; `FileReader` parses it, schema
  guards reject malformed input, and the new state replaces (or merges
  with — TBD) the current `localStorage` document.

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
