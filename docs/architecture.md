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
│   ├── SheetRow.tsx               # row body — swipe-to-act + cell wiring
│   ├── AddRowButton.tsx           # `+` with long-press / right-click hatch
│   ├── ComplexEntryModal.tsx      # recurring + categorised entry form
│   ├── EditEntryModal.tsx         # promote-to-recurring / scoped series edit
│   ├── RecurrenceForm.tsx         # mode-tabs + preview, shared by both modals
│   ├── ConfirmDialog.tsx          # generic confirm prompt with scope options
│   ├── CategoryPicker.tsx         # custom dropdown + inline category creator
│   ├── icons.tsx                  # column-type + category-icon registries
│   └── ImportExportControls.tsx   # file download + file picker
├── data/
│   ├── types.ts          # Budget, Sheet, Column, Row, Category, CellValue
│   ├── constants.ts      # MAX_COLUMN_CHARS, STORAGE_KEY, palette, icon list
│   ├── sheet.ts          # pure helpers (group, sort, balances, reorder)
│   ├── recurrence.ts     # RecurrenceRule + expandRecurrence
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
`localStorage` key `budget.v1` (the key is fixed; the document
carries its own `version` field). Top-level shape:

```ts
type Budget = {
  version: 3;
  sheets: Sheet[];
  activeSheetId: string;
  categories: Category[];
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
  type:
    | "date"
    | "description"
    | "amount"
    | "balance"
    | "completed"
    | "category";
  label: string;
};

type Row = {
  id: string;
  cells: Record<string /* column id */, string | number | boolean | null>;
  seriesId?: string; // shared by all rows in the same recurrence
};

type Category = {
  id: string;
  name: string;
  color: string; // hex
  icon: CategoryIcon; // one of a fixed allowlist
};
```

A row's category is stored in the `category`-typed column's cell as
the category id (string). The category record itself lives on the
budget so renaming or recolouring updates every row at once.

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

Current `LATEST_VERSION` is `3`. The chain has two steps:

- **v1 → v2** — introduces top-level `categories: []` and inserts a
  `category` column into every sheet (just after the description
  column) so existing rows can be tagged without re-arranging.
- **v2 → v3** — version bump only. No row data is rewritten; this
  release adds an optional `Row.seriesId` field that older builds
  would silently drop, so bumping signals the new shape.

## Complex entries

`src/data/recurrence.ts` defines `RecurrenceRule` — a discriminated
union covering one-off dates, an arbitrary list of dates, an
every-N-days cadence, and an every-N-months cadence with an anchor
`dayOfMonth` and signed `offsetDays`. Monthly / quarterly / yearly
are presets over the `everyNMonths` rule (`intervalMonths` of 1, 3,
or 12). `expandRecurrence(rule)` returns a sorted, de-duplicated
list of ISO `YYYY-MM-DD` strings clamped to `[start, end]`.

The `ComplexEntryModal` collects a description, amount, category,
and a recurrence rule; on submit it expands the rule, dispatches one
row per emitted date, and tags every generated row with a shared
`seriesId` so they can be edited or deleted as a group later.

### Series operations

Each row on the sheet has two actions, revealed by swiping the row
left on mobile (or via the action icons at the right edge on
desktop):

- **Pen icon** opens `EditEntryModal`. On a non-series row the modal
  is a "promote to recurring" form — it reuses `RecurrenceForm` to
  capture a cadence + end date and dispatches `convertToRecurring`,
  which generates future rows that inherit the anchor's description,
  amount, and category, all sharing a new `seriesId`. On a row that
  already belongs to a series, the modal shows the editable fields
  plus a **scope chooser**: "Only this entry", or "This entry and
  all future" with an optional "until …" date so temporary changes
  (a one-quarter rent bump, a price hike that reverts) can revert
  automatically. The scope is dispatched as `editSeries` and the
  reducer rewrites only the matching rows.
- **Trash icon** opens `ConfirmDialog`. For a one-off row it offers
  a single danger action; for a series row it adds "Just this one"
  and "This and all future (N)" so the matching rows are removed in
  a single `deleteRows` dispatch.

Inline cell edits on series rows remain local — they only change
that one row, so day-to-day tweaks (marking a single payment as
done, correcting one date) don't trigger a scope prompt. The pen
icon is the dedicated path for changes meant to propagate.

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
