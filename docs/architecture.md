# Architecture

The shape of the codebase today, and where it is heading.

## Today

```
src/
├── main.tsx              # React 18 entry, mounts <App /> into #root
├── App.tsx               # owns the auth state + budget reducer + adapter wiring
├── styles.css            # global styles + sheet layout
├── components/
│   ├── AuthScreen.tsx             # sign-in / sign-up / "continue without account"
│   ├── UserMenu.tsx               # per-user menu (sign out, switch, delete)
│   ├── SettingsModal.tsx          # app-level settings (formats, storage, etc.)
│   ├── SheetTabs.tsx              # bottom tab bar — sheet glyphs + `+`
│   ├── SheetModal.tsx             # new / edit sheet form (name, type, glyph, …)
│   ├── BackendPicker.tsx          # local vs Dropbox backend chooser
│   ├── DropboxGlyph.tsx           # Dropbox brand mark for the picker
│   ├── SyncStatus.tsx             # syncing / saved indicator for cloud backends
│   ├── SaveStateButton.tsx        # manual "save now" affordance
│   ├── ImportExportControls.tsx   # file download + file picker
│   ├── SheetView.tsx              # one sheet — month grouping + balances
│   ├── MonthTable.tsx             # one month's table
│   ├── ColumnHeader.tsx           # draggable column header
│   ├── Cell.tsx                   # per-type cell editor
│   ├── SheetRow.tsx               # row body — swipe-to-act + cell wiring
│   ├── AddRowButton.tsx           # `+` with long-press / right-click hatch
│   ├── ComplexEntryModal.tsx      # recurring + categorised entry form
│   ├── EditEntryModal.tsx         # promote-to-recurring / scoped series edit
│   ├── RecurrenceForm.tsx         # mode-tabs + preview, shared by both modals
│   ├── BulkActionBar.tsx          # toolbar shown in select mode
│   ├── BulkEditModal.tsx          # apply patches to many rows at once
│   ├── MoveCopyModal.tsx          # shift / duplicate rows across months
│   ├── DatePickerModal.tsx        # modal calendar (mobile-friendly)
│   ├── ConfirmDialog.tsx          # generic confirm prompt with scope options
│   ├── CategoryPicker.tsx         # custom dropdown + inline category creator
│   └── icons.tsx                  # column-type + category-icon registries
├── data/
│   ├── types.ts          # UserData, Account, Sheet, SheetItem, AccountBudget,
│   │                     # Settings, StoredUser, UsersFile, …
│   ├── constants.ts      # MAX_COLUMN_CHARS, STORAGE_KEY, USERS_KEY,
│   │                     # userDataKey(), DEFAULT_SETTINGS, palette, icon list
│   ├── sheet.ts          # pure helpers (group, sort, balances, reorder)
│   ├── recurrence.ts     # RecurrenceRule + expandRecurrence
│   ├── migrations.ts     # forward-only schema migration runner
│   └── validate.ts       # boundary validator: unknown → Result<UserData>
├── storage/
│   ├── adapter.ts                 # StorageAdapter interface (load/save/clear)
│   ├── local.ts                   # bootstrap helpers — freshUserData() + readUserDataFromText()
│   ├── local-adapter.ts           # StorageAdapter implementation over localStorage
│   ├── dropbox-adapter.ts         # StorageAdapter over the Dropbox HTTP API
│   ├── encrypting-adapter.ts      # AES-GCM envelope wrapper around any adapter
│   ├── crypto.ts                  # PBKDF2 + AES-GCM primitives
│   ├── backend-preference.ts      # per-user backend + encryption choice
│   ├── session.ts                 # sessionStorage cache for the active password
│   ├── users.ts                   # device-wide user registry + password hashing
│   ├── useUserDataStorage.ts      # React hook tying adapter ↔ reducer
│   └── file.ts                    # JSON file codec: serialize + parse
├── utils/
│   ├── format.ts                  # currency / amount / date formatting helpers
│   └── select-on-focus.ts         # global focus handler — select-all on focus
└── seo/
    ├── siteConfig.ts              # SITE_URL, SITE_NAME, AUTHOR, OG defaults
    └── routes.ts                  # per-route <title> / description / JSON-LD
```

The `src/seo/` modules are also imported by `vite.config.ts` — its
`emit-path-alias-with-seo` plugin reads `dist/index.html` after the
Vite build and writes `dist/<route>/index.html` for each entry in
`routes.ts` with the route-specific `<title>`, meta description,
canonical, og:\*, twitter:\*, and JSON-LD blocks spliced in between
the `<!-- HEAD_SEO_START -->` / `<!-- HEAD_SEO_END -->` markers in the
shell. The plugin also emits a `dist/404.html` copy marked
`noindex,follow` so GitHub Pages' SPA-fallback URLs don't leak
soft-404 signals.

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
│   ├── types.ts          # UserData, Account, Sheet, SheetItem, AccountBudget, …
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
type UserData = {
  version: 9;
  sheets: Sheet[];
  activeSheetId: string;
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[]; // cross-account transfers; see below
  settings: Settings;
};

type Account = {
  id: string;
  name: string;
  // All metadata fields below are optional. The Accounts dashboard
  // surfaces them and the create-account modal collects them, but
  // the budget logic only reads `id` and `name`.
  description?: string;
  glyph?: CategoryIcon;
  color?: string;
  bank?: string;
  clearing?: string; // Swedish clearingnummer
  accountNumber?: string;
  iban?: string;
  bic?: string; // BIC / SWIFT
  currency?: string; // overrides Settings.currency for this account's display
};

type Sheet = {
  id: string;
  name: string;
  type: SheetType; // today: "budget" | "accounts"; planners join later
  glyph: SheetGlyph; // displayed in the bottom tab bar
  color: string; // hex; tints the tab and the editor preview
  description: string; // free-form note shown in the modal
  items: SheetItem[]; // typed blocks rendered inside the sheet
};

// Sheet flavour. "accounts" is a singleton dashboard; the type picker
// greys it out once one exists. Future planners (loan, savings,
// parental-leave, …) slot in as additional literals.
type SheetType = "budget" | "accounts";

// Glyph picker reuses the `CategoryIcon` allowlist so the same
// rendering helpers cover both category chips and sheet tabs.
type SheetGlyph = CategoryIcon;

// Discriminated union. AccountBudget is the per-account ledger; the
// AccountsView marker tags the singleton dashboard so the view layer
// can dispatch off `item.type`. Future variants slot in here.
type SheetItem = AccountBudget | AccountsView;

type AccountBudget = {
  id: string;
  type: "accountBudget";
  accountId: string | null; // points at one of UserData.accounts, or null
  // when the budget is not yet tied to an account
  columns: Column[]; // ordered; drag-and-drop reorders this array
  rows: Row[]; // flat list; month grouping is derived in the view
};

// The Accounts dashboard holds no data of its own — it renders the
// global accounts + transactions arrays. Future per-sheet config
// (account filter, sort order, …) lands here without a migration.
type AccountsView = {
  id: string;
  type: "accountsView";
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
  glyph?: CategoryIcon; // optional custom glyph for the description cell;
  // absent rows render the default recurring icon when `seriesId` is set,
  // and on mobile this replaces the "…" popover trigger.
};

type Transaction = {
  id: string;
  date: string; // ISO YYYY-MM-DD
  description: string;
  amount: number; // ALWAYS positive — direction = from → to
  fromAccountId: string; // money flows OUT of this account
  toAccountId: string; // money flows INTO this account
  categoryId?: string | null;
  completed?: boolean;
};

type Category = {
  id: string;
  name: string;
  color: string; // hex
  icon: CategoryIcon; // one of a fixed allowlist
};
```

Transactions are top-level (not duplicated rows on the involved
budgets). Budget views synthesize a read-only row on each side at
render time so the running balance and month grouping pick the
transfer up. The synthesized rows carry runtime-only marker fields
(`transactionId`, `peerAccountId`, `peerAccountName`) that are never
persisted — `userDataWithSavableRows` strips synthesized rows before
save, and the validator/schema do not list those fields. When
summing balances from a persisted export, walk `transactions`
directly: incoming on the `toAccountId` side, outgoing on the
`fromAccountId` side.

Accounts live at the `UserData` level so the same account can be
referenced from multiple sheets, and a future roll-up view can sum
balances across the whole user. Each `AccountBudget` block points at
one account via `accountId`; the validator rejects dangling
references.

A sheet today holds exactly one `AccountBudget` item, which is what
the UI surfaces. The shape supports stacking more items (e.g. an
`AccountBudget` plus a Graph keyed to the same account) without
another migration when that UX lands.

A row's category is stored in the `category`-typed column's cell as
the category id (string). The category record itself lives on the
UserData so renaming or recolouring updates every row at once.

Cells are keyed by column id (not column type) so the model supports
adding multiple columns of the same type without ambiguity. The
`balance` column is **derived** — its value is computed by
`computeBalances()` from the row's date and amount, as a running total
starting at zero across all rows in chronological order. It is never
written to row cells. Users who need an opening balance record it as
a regular row instead.

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
3. `validateUserData()` enforces the latest schema. Soft anomalies are
   repaired (cells referencing dropped columns are removed, a dangling
   `activeSheetId` falls back to the first sheet); hard violations
   (unknown column type, duplicate ids, wrong field types) are
   surfaced as an error string.

Current `LATEST_VERSION` is `9`. The chain has eight steps:

- **v1 → v2** — introduces top-level `categories: []` and inserts a
  `category` column into every sheet (just after the description
  column) so existing rows can be tagged without re-arranging.
- **v2 → v3** — version bump only. No row data is rewritten; this
  release adds an optional `Row.seriesId` field that older builds
  would silently drop, so bumping signals the new shape.
- **v3 → v4** — introduces budget-level `settings` (fiscal-month
  start, date format, currency, number format, display toggles).
  Existing data gets the canonical defaults.
- **v4 → v5** — introduces explicit `Account`s and turns each `Sheet`
  into a container of typed `SheetItem`s. The pre-v5 `columns` and
  `rows` on a sheet move into the body of one `AccountBudget` item
  pointing at a freshly minted default `Account`.
- **v5 → v6** — widens `AccountBudget.accountId` from `string` to
  `string | null` so a budget can exist without being tied to an
  account, and allows `accounts` to be empty. Existing string ids
  remain valid — the migration is a bare version bump.
- **v6 → v7** — introduces per-sheet display metadata (`type`,
  `glyph`, `color`, `description`) so the bottom tab bar can show
  multiple named, colour-coded sheets. Existing sheets get
  `type: "budget"`, the default glyph + colour, and an empty
  description.
- **v7 → v8** — version bump only. Introduces an optional `Row.glyph`
  field so a recurring entry can carry a custom icon shown in the
  description cell (and replacing the mobile `…` trigger). Older
  builds would silently drop the field, so bumping signals the new
  shape.
- **v8 → v9** — adds top-level `transactions: []` (cross-account
  transfers, see the Data model above) plus the singleton `"accounts"`
  sheet flavour with its `AccountsView` item variant. `Account` gains
  optional `description`, `glyph`, `color`, `bank`, `clearing`,
  `accountNumber`, `iban`, `bic`, `currency` metadata. The migration
  is a bare add of `transactions: []`; every new field is optional so
  v8 records pass the v9 validator unchanged.

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

- **Repeat icon** opens `EditEntryModal`. On a non-series row the modal
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
done, correcting one date) don't trigger a scope prompt. The repeat
icon is the dedicated path for changes meant to propagate.

## Import / export

`src/storage/file.ts` provides the codec; `ImportExportControls`
wires it to the DOM. Both `localStorage` reads and file imports run
through the same `parseUserData(text)` pipeline.

- **Export** — `serializeUserData(data)` produces pretty-printed JSON
  with **sorted keys at every level** plus a trailing newline. Two
  exports of equal data are byte-identical, which keeps diffs clean
  if a user version-controls their file. The DOM glue wraps the string
  in a `Blob` and triggers a download as `budget-YYYY-MM-DD.json`.
- **Import** — the user picks a file; `parseUserData(text)` returns
  either `{ ok: true, data, migrated }` or `{ ok: false, error }`.
  On success the data replaces the in-memory state (and is persisted
  by the usual save effect). The `migrated` flag tells the UI to
  surface that the file was upgraded.

The on-disk JSON shape is identical to the in-memory `UserData` shape —
no envelope or metadata wrapper. Round-trip identity is the
invariant: `parse(serialize(b))` equals `b`.

No network. No third party. The file is the user's data, in plain
JSON, in their hands.

### Public JSON Schema

The exported shape is also published as a JSON Schema (Draft 2020-12)
at `https://budget.niclaslindstedt.se/schema`. The page renders the
schema as both a `<pre>` code block and a
`<script type="application/schema+json">` element, alongside prose
explaining cell semantics, the derived `balance` column, fiscal months,
and series ids. The intent is that an LLM (or any other tool) handed a
`budget-*.json` file can be pointed at the URL and reason about the
data without reading the React source.

The schema lives in `src/data/schema.ts` and is built from the same
constants the runtime validator uses (`CATEGORY_ICON_NAMES`,
`DATE_FORMATS`, `DEFAULT_SETTINGS`, `LATEST_VERSION`, …) so the public
contract cannot drift from the validator silently. The settings-modal
footer links to it next to the privacy policy.

## Dependency direction

`components/` depend on `data/` and `storage/`. Nothing in `data/` or
`storage/` imports from `components/`. The storage modules are the
only places that touch `localStorage` or `FileReader` directly —
components consume a small typed API.

## Why GitHub Pages

The whole app is a static bundle. GitHub Pages is the cheapest way to
serve it without a vendor in the loop, and the deploy pipeline is one
workflow (`.github/workflows/pages.yml`).

The production site is served from the custom domain
`budget.niclaslindstedt.se` (pinned via `public/CNAME`, which Vite
copies into the deployed artifact), so `vite.config.ts` uses
`base: "/"`. If the custom domain is ever dropped and the app falls
back to `<user>.github.io/<repo>/`, switch `base` to `"/<repo>/"` and
remove `public/CNAME`.
