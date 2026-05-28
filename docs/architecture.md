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
│   ├── AppShell.tsx               # top-level orchestrator — reducer + routing
│   ├── AppLoading.tsx             # full-area loader while a backend boots
│   ├── BottomBar.tsx              # bottom tab bar — sheet glyphs + `+`
│   ├── SheetModal.tsx             # universal: new / edit sheet form (… menu)
│   ├── SheetTitleMenu.tsx         # universal: "…" menu next to a sheet title
│   ├── SettingsModal/             # app-level settings (formats, storage, etc.)
│   ├── BackendPicker.tsx          # browser / folder / Dropbox / Drive picker
│   ├── DropboxGlyph.tsx           # Dropbox brand mark for the picker
│   ├── SyncStatus.tsx             # syncing / saved indicator for cloud backends
│   ├── SaveStateButton.tsx        # manual "save now" affordance
│   ├── ImportExportControls.tsx   # file download + file picker
│   ├── CloudBackupModal.tsx       # list, create, and restore timestamped backups
│   ├── ActiveRowProvider.tsx      # universal row-claim coordinator
│   ├── useClaimActiveRow.ts       # hook in-row interactive elements call
│   ├── ConfirmDialog.tsx          # generic confirm prompt with scope options
│   ├── DatePickerModal.tsx        # modal calendar (mobile-friendly)
│   ├── CategoryPicker.tsx         # custom dropdown + inline category creator
│   ├── icons.tsx                  # column-type + category-icon registries
│   ├── budget/                    # budget page — per-account ledger
│   │   ├── BudgetPage.tsx              # page root — month grouping + balances
│   │   ├── BudgetViewerModal.tsx       # read-only viewer
│   │   ├── BudgetMonthTable.tsx              # one month's table
│   │   ├── BudgetColumnHeader.tsx            # draggable column header
│   │   ├── BudgetCell.tsx              # per-type cell editor
│   │   ├── BudgetRow.tsx               # row body — swipe-to-act + cell wiring
│   │   ├── BudgetAddEntryButton.tsx, BudgetEntryActionsMenu.tsx
│   │   ├── BudgetComplexEntryModal.tsx       # recurring + categorised entry form
│   │   ├── BudgetEditEntryModal.tsx          # promote-to-recurring / scoped series edit
│   │   ├── BudgetEditEntryFullModal.tsx, BudgetSplitEntryModal.tsx
│   │   ├── BudgetRecurrenceForm.tsx          # mode-tabs + preview, shared by both modals
│   │   ├── BudgetBulkEditModal.tsx, BudgetMoveCopyModal.tsx, BudgetApplySeriesDialog.tsx
│   │   ├── BudgetMatchRuleModal.tsx          # wildcard rule for history rendering
│   │   ├── BudgetRecurringCandidatesPanel.tsx
│   │   ├── TransactionSearchModal.tsx
│   │   ├── BudgetFormulaHelpButton.tsx, BudgetFormulaInput.tsx, BudgetFormulaVariableHelper.tsx
│   │   └── cells/                      # readonly cell variants
│   └── accounts/                  # accounts page — workspace dashboard
│       ├── AccountsPage.tsx            # page root — accounts table + transfers
│       ├── AccountModal.tsx, AccountActionsMenu.tsx
│       ├── TransactionModal.tsx, UpdateBalanceModal.tsx
│       ├── HistoryModal.tsx            # per-account bank history viewer
│       ├── ImportHistoryModal.tsx, EditHistoryEntryModal.tsx,
│       │   AccountCutHistoryModal.tsx
│       ├── AccountReconciliationModal.tsx     # post-import flow on a single account
│       └── AccountTransferCollapseModal.tsx   # cross-account pair collapse
├── data/
│   ├── types.ts          # UserData, Account, Sheet, SheetItem, AccountBudget,
│   │                     # Settings, StoredUser, UsersFile, …
│   ├── constants/        # topical constants — one file per group:
│   │   ├── storage.ts    # STORAGE_KEY, USERS_KEY, userDataKey,
│   │   │                 # nsKey/nsCloudPath/nsIdbName, password params
│   │   ├── defaults.ts   # DEFAULT_SETTINGS, DEFAULT_PERSISTED_SETTINGS,
│   │   │                 # device defaults, download prefs, recurrence horizon
│   │   ├── format.ts     # MAX_COLUMN_CHARS, font-scale + session-timeout
│   │   │                 # bounds/presets, DATE_FORMATS, SHORT_DATE_FORMATS
│   │   ├── currency.ts   # SUPPORTED_LANGUAGES, CURRENCY_PRESETS,
│   │   │                 # REGION_TO_CURRENCY_ID
│   │   └── taxonomy.ts   # CATEGORY_COLORS, SHEET_COLORS, glyph allowlists
│   │                     # (CATEGORY_ICON_NAMES, SHEET_GLYPH_NAMES, …)
│   ├── sheet.ts          # universal sheet primitives (newId,
│   │                     # createDefaultSheet, column + sheet-tree
│   │                     # traversal helpers)
│   ├── sheet-types/      # per-flavour descriptors composed into one
│   │   │                 # SHEET_TYPE_REGISTRY — adding a new flavour
│   │   │                 # is a new file here plus a registry entry
│   │   ├── budget.ts     # createDefaultAccountBudget + descriptor
│   │   ├── accounts.ts   # createDefaultAccountsView + descriptor
│   │   └── index.ts      # SHEET_TYPE_REGISTRY + SHEET_TYPE_IDS +
│   │                     # getSheetTypeDescriptor lookup
│   ├── presets/          # built-in entry types + categories that
│   │   │                 # pickers, validators, and the admin UI all
│   │   │                 # read through — preset first, user-added next
│   │   ├── types.ts      # PRESET_ENTRY_TYPES + entry-type helpers
│   │   │                 # (isPresetTypeId, visiblePresetTypes,
│   │   │                 # effectivePresetKind, effectiveTypeKind,
│   │   │                 # createSeedEntryTypes for v12 → v13 migration)
│   │   ├── categories.ts # PRESET_CATEGORIES + DEFAULT_CATEGORY_ID +
│   │   │                 # category helpers (isPresetCategoryId,
│   │   │                 # visiblePresetCategories)
│   │   └── merge.ts      # allTypes / allCategories — presets the user
│   │                     # hasn't hidden, then their own entries
│   ├── fiscal-month.ts   # fiscal-month + ISO date math (getMonthKey,
│   │                     # groupRowsByMonth, previous/nextMonthKey, …)
│   ├── budget/
│   │   ├── rows.ts       # budget-row algebra (sortRowsByDate,
│   │   │                 # computeBalances, isRowSavable, buildVisibleRows,
│   │   │                 # mintBudgetRow, propagateCellInSeries, …)
│   │   ├── synthesis.ts  # synthesized rows (transfersForAccount,
│   │   │                 # synthesizeTransferRow, synthesizeHistoryRow,
│   │   │                 # resolveEntryLabels, isTransferRow)
│   │   ├── export.ts     # CSV/XLSX export builder for an AccountBudget
│   │   ├── cells.ts      # generic Row.cells readers (readStringCell,
│   │   │                 # readNumberCell, firstNonBlank)
│   │   ├── formula.ts    # tokenizer + parser + evaluator for the
│   │   │                 # `=` formula cell + display/stored rewriting
│   │   ├── formula-resolve.ts  # per-row resolveEffectiveAmounts walker
│   │   │                       # that drives the budget table's
│   │   │                       # computed amount column
│   │   ├── pattern-apply.ts    # cross-sheet match-rule application
│   │   │                       # (reapplyPatternsToAllSheets,
│   │   │                       # countRuleHitsOnSheets, …)
│   │   ├── pattern-derive.ts   # derives a glob-pattern seed from a
│   │   │                       # row description for the
│   │   │                       # "Label similar" modal
│   │   ├── recurring-detection.ts  # surfaces "looks recurring"
│   │   │                           # candidates from HistoryEntry
│   │   │                           # clusters (detectRecurringCandidates)
│   │   └── conflicts.ts        # duplicate-finder for an AccountBudget
│   │                           # (findConflicts, pickWinner) consumed
│   │                           # by BudgetFindConflictsModal
│   ├── accounts/
│   │   ├── balance.ts    # account-level aggregation (accountBalance)
│   │   ├── export.ts     # JSON export builder for the accounts sheet
│   │   └── transfer-collapse.ts  # mirror-pair detector for
│   │                             # cross-account history entries
│   │                             # (detectTransferCandidates)
│   ├── reconciliation.ts # matches imported history against budget
│   │                     # rows (used by both pages — kept at root)
│   ├── recurrence.ts     # RecurrenceRule + expandRecurrence, plus the
│   │                     # generic isIsoDate validator used by the
│   │                     # universal DatePickerModal
│   ├── merchant-hints.ts # description→typeId hints recorded by the
│   │                     # transfer, recurring, and item reducers
│   ├── row-candidate.ts  # plumbing for pattern-apply.ts and the
│   │                     # item-reducer hint path (cross-page)
│   ├── migrations.ts     # forward-only schema migration runner
│   └── validate.ts       # boundary validator: unknown → Result<UserData>
├── storage/
│   ├── adapter.ts                 # StorageAdapter interface (load/save/clear)
│   ├── local.ts                   # bootstrap helpers — freshUserData() + readUserDataFromText()
│   ├── local-adapter.ts           # StorageAdapter implementation over localStorage (id "browser")
│   ├── folder-adapter.ts          # StorageAdapter over a picked directory (File System Access)
│   ├── folder-handle-store.ts     # IDB persistence + permission helpers for the folder handle
│   ├── dropbox-adapter.ts         # StorageAdapter over the Dropbox HTTP API
│   ├── gdrive-adapter.ts          # StorageAdapter over the Google Drive HTTP API
│   ├── encrypting-adapter.ts      # AES-GCM envelope wrapper around any adapter
│   ├── crypto.ts                  # PBKDF2 + AES-GCM primitives
│   ├── backend-preference.ts      # per-user backend + encryption choice
│   ├── session.ts                 # sessionStorage cache for the active password
│   ├── users.ts                   # device-wide user registry + password hashing
│   ├── useUserDataStorage.ts      # React hook tying adapter ↔ reducer
│   ├── backup-index.ts            # backup manifest serializer + tolerant parser
│   ├── backup-metadata.ts         # derive BackupMetadata from UserData + filename helper
│   └── file.ts                    # JSON file codec: serialize + parse
├── utils/
│   └── format.ts                  # currency / amount / date formatting helpers
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
  version: 25;
  sheets: Sheet[];
  activeSheetId: string;
  accounts: Account[];
  categories: Category[]; // analysis buckets; each type belongs to one of these
  types: EntryType[]; // concrete labels, parented by `EntryType.categoryId`
  hiddenPresetTypeIds: string[];
  hiddenPresetCategoryIds: string[];
  transactions: Transaction[]; // cross-account transfers; see below
  history: Record<string /* accountId */, HistoryEntry[]>; // imported bank rows
  historyImports: Record<string /* accountId */, HistoryImport[]>; // audit log
  // Per-merchant type memory, keyed by the normalised description
  // (lowercase, dates / long digit sequences / Swedish bank-noise
  // prefixes stripped). The recurring-candidate panel reads this to
  // suggest a type before the user confirms a promotion; the
  // suggestion is always visible, never silently applied. The hint's
  // category is derived through `typeId → EntryType.categoryId`.
  // Hints whose typeId no longer references a known type are dropped
  // on load.
  merchantHints: Record<string /* normalised description */, MerchantHint>;
  // Normalised-description keys the user dismissed with "Not
  // recurring" on the candidates panel; the detector skips these on
  // every import. Cleared from the Memory section in Settings.
  recurringDismissals: string[];
  // Pair keys the user dismissed with "Never" on the transfer-collapse
  // modal; same allowlist shape, same Memory section.
  transferCollapseDismissals: string[];
  // Auto-reconciliation rules learned from "Apply to whole series" in
  // the post-import reconciliation modal. Each rule binds a recurring
  // series to a bank-description glob, an amount-tolerance band, and
  // a date lag; future imports collapse any matching predicted row +
  // history entry pair silently. See `src/data/reconciliation.ts`
  // for the matcher and `src/components/accounts/AccountReconciliationModal.tsx`
  // for the surface that records them.
  seriesMatchRules: SeriesMatchRule[];
  // Per-account rename memory: "the bank wrote X, the user calls it Y".
  // Recorded inside the `updateHistoryEntry` reducer chokepoint so the
  // pen-button history-edit modal AND the budget-view quick-rename both
  // feed it. Surfaced by the `AccountRenamePredictorModal` as the last step of
  // every import that has learned renames to offer; accepted suggestions
  // ride through `applyImportRenames` to land as `userDescription`
  // overrides on the matching history entries. See
  // `src/data/rename-patterns.ts` for the pure helpers.
  renamePatterns: Record<
    string /* accountId */,
    Record<string /* normalised description */, RenamePattern>
  >;
  settings: Settings;
};

type MerchantHint = {
  typeId: string; // category is derived via `types[typeId].categoryId`
  hitCount: number; // re-resets to 1 when the assigned type changes
  lastUsedAt: number; // unix ms of the most recent assignment
  // Optional user-typed label set by the history-row promote-to-
  // recurring flow. Synthesized history rows that share this
  // merchant key pick it up so the row shows under the user's
  // label instead of the raw bank text.
  description?: string;
};

type RenamePattern = {
  suggestedDescription: string; // user-typed label the next import should suggest
  hitCount: number; // bumps each time the same rename is repeated
  lastUsedAt: number; // unix ms of the most recent rename
};

type EntryType = {
  id: string;
  name: string;
  color: string;
  glyph: CategoryIcon;
  categoryId: string; // parent category — every type belongs to exactly one
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
  type: "date" | "description" | "amount" | "balance" | "completed";
  label: string;
};

type Row = {
  id: string;
  cells: Record<string /* column id */, string | number | boolean | null>;
  seriesId?: string; // shared by all rows in the same recurrence
  // Reference to an `EntryType` in `UserData.types` (or a preset). When
  // set, the description cell renders the type's chip and the row's
  // category is derived through `EntryType.categoryId`. There is no
  // category cell or column — categories live one level up, on types.
  typeId?: string;
  isCorrection?: boolean; // see Account.openingBalance / "update balance" flow
  amountFormula?: string; // optional formula; renderer resolves each pass
};

type HistoryEntry = {
  id: string; // content hash so re-importing dedups
  date: string;
  description: string;
  amount: number; // signed (negative = outgoing)
  balance?: number; // bank-reported running balance after this row (omitted
  // for credit-card exports, e.g. Bank Norwegian, that carry only a signed
  // amount per row — Account.openingBalance stays user-set in that case)
  importedAt: number; // unix ms of first import
  hidden?: boolean; // user-shelved noise OR collapsed-into-transfer
  collapsedIntoTransactionId?: string; // backref into UserData.transactions
  // Per-entry overrides applied on top of MerchantHint / MatchRule in
  // `synthesizeHistoryRow`. Set by the pen button on a history row
  // (and by the inline description / type cells). Highest-priority
  // overlay so a single bank entry can be relabelled without dragging
  // every other entry with the same merchant key along.
  userDescription?: string;
  userTypeId?: string;
};

type Transaction = {
  id: string;
  date: string; // ISO YYYY-MM-DD
  description: string;
  amount: number; // ALWAYS positive — direction = from → to
  fromAccountId: string; // money flows OUT of this account
  toAccountId: string; // money flows INTO this account
  typeId?: string | null; // category is derived via types[typeId].categoryId
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

A row's category is **derived** through its type: the row stores
`typeId`, the type stores `categoryId`, the category record lives on
the UserData. There is no category cell and no category column on the
sheet — categories exist purely to group rows for analysis, and
adding or relabelling a type updates every row that references it
automatically. The v24 → v25 migration stripped the old category
column and reassigned every existing row through this chain (see the
migration source for the heuristics).

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

Current `LATEST_VERSION` is `25`. The chain has twenty-four steps:

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
- **v9 → v10** — version bump only. Introduces an optional
  `Row.isCorrection` flag so the "update balance" flow on the Accounts
  page can render its delta rows as a full-width divider.
- **v10 → v11** — adds top-level `history: {}` and `historyImports: {}`
  for imported bank-statement entries, and an optional
  `Account.openingBalance` so the running balance can anchor to what
  the bank says.
- **v11 → v12** — adds `merchantHints: {}` (per-merchant category
  memory), `recurringDismissals: []` (normalised keys dismissed as
  "Not recurring"), and `transferCollapseDismissals: []` (pair keys
  dismissed as "Never" on the transfer-collapse modal). `HistoryEntry`
  also gains an optional `collapsedIntoTransactionId` backref so the
  transfer-collapse flow is reversible (deleting the resulting
  transaction restores both source entries).
- **v12 → v13** — version bump only. Introduces the
  `Settings.abbreviateNumbers` display toggle; the validator falls back
  to the default (off) for v12 records that don't carry the field.
- **v13 → v14** — introduces reusable `EntryType` records and a
  `Row.typeId` reference. Types replace the per-row `glyph` field —
  a type carries a name + colour + glyph that every row using it
  shares, so grouping for stats works while the visual identity
  moves with it. The migration seeds a handful of Swedish-typical
  defaults so the picker isn't empty on first promote, and strips any
  existing `row.glyph` (the user chose "drop, don't salvage" on the
  migration prompt). No rows gain a `typeId` automatically.
- **v14 → v15** — `MerchantHint` gains optional `typeId` and
  `description` fields. The "promote history entry to recurring" flow
  writes them so synthesized history rows that normalise to the same
  merchant key display the user's chosen entry-type chip and label
  instead of the raw bank text. Existing hints don't carry either
  field; both are optional and readers fall through to the bank text
  unchanged.
- **v15 → v16** — adds top-level `matchRules: []`, user-authored
  wildcard rules that relabel synthesized history rows by pattern.
  Distinct from `merchantHints` (which key off the lossy normalised
  description); these are explicit globs with sign / transfer filters
  the user owns. Existing exports default to an empty list — no rules
  have been authored yet, so behaviour matches pre-v16 builds.
- **v16 → v17** — version bump only. `HistoryEntry.balance` becomes
  optional so credit-card exports without a per-row running balance
  (e.g. Bank Norwegian) can be imported. Existing entries carry a
  balance and continue to validate.
- **v17 → v18** — version bump only. Introduces the
  `Settings.fontScale` UI text-size multiplier; the validator falls
  back to the default (1) for v17 records that don't carry the field.
- **v18 → v19** — version bump only. Introduces
  `Settings.lastSeenChangelogVersion: string | null`, the version
  string the user last acknowledged on the "What's new" popup. The
  validator defaults missing values to null so v18 records pass the
  v19 validator unchanged; the app's mount-time check stamps the
  current `APP_VERSION` silently on a fresh install so existing users
  never see the popup the moment they upgrade.
- **v19 → v20** — introduces built-in preset entry types and preset
  categories (`PRESET_ENTRY_TYPES` in `data/presets/types.ts`,
  `PRESET_CATEGORIES` in `data/presets/categories.ts`) plus per-user
  hide lists for each. Existing
  user-added types and categories stay as-is; the migration
  initialises `hiddenPresetTypeIds` and `hiddenPresetCategoryIds` as
  empty arrays so every preset shows up until the user toggles one off
  from Settings.
- **v20 → v21** — version bump only. Introduces the
  `Settings.alwaysAbbreviateBalance` display toggle that bypasses the
  10 000 abbreviation threshold for the running-balance column on the
  main sheet view. The validator falls back to the default for v20
  records that don't carry the field.
- **v21 → v22** — adds top-level `seriesMatchRules: []`, auto-
  reconciliation rules learned from "Apply to whole series" in the
  post-import reconciliation modal. Each rule binds a recurring
  series to a bank-description glob, an amount-tolerance band, and a
  date-lag in days; future imports collapse any matching predicted
  row + history entry pair silently without re-prompting. Existing
  exports default to an empty list — no rules have been confirmed
  yet, so behaviour matches pre-v22 builds.
- **v22 → v23** — introduces optional `Row.amountFormula`, a formula
  string evaluated at render time to produce the row's effective
  amount. Pre-v23 rows have no formula and continue to use the
  literal value in their amount cell; the bump only flags that this
  build understands the new shape so older builds refuse to open
  snapshots that may contain formulas they can't evaluate.
- **v23 → v24** — introduces optional `amountMin` / `amountMax`
  signed bounds on `MatchRule` so a rule can narrow to a specific
  price band on top of `amountSign`. Existing rules don't carry
  either field; both are optional and absent bounds are treated as
  open-ended. The validator drops an inverted `amountMin > amountMax`
  pair silently since such a rule could never fire.
- **v24 → v25** — restructures categories and types so categories
  _contain_ types: `EntryType` gains a required `categoryId` field,
  the `"category"` `ColumnType` is removed, every sheet's category
  column is stripped, and `Transaction.categoryId` /
  `MerchantHint.categoryId` / `MatchRule.categoryId` are folded into
  `typeId` (category derived via `EntryType.categoryId`). The
  migration assigns user types to a category by majority-vote of the
  rows that used them (falling back to a name match against the
  preset map, then the catch-all "Other") and synthesizes
  "{Category} (generic)" types for rows / hints / rules that only
  knew a category. Preset types ship with their built-in category
  mapping.

## Complex entries

`src/data/recurrence.ts` defines `RecurrenceRule` — a discriminated
union covering one-off dates, an arbitrary list of dates, an
every-N-days cadence, and an every-N-months cadence with an anchor
`dayOfMonth` and signed `offsetDays`. Monthly / quarterly / yearly
are presets over the `everyNMonths` rule (`intervalMonths` of 1, 3,
or 12). `expandRecurrence(rule)` returns a sorted, de-duplicated
list of ISO `YYYY-MM-DD` strings clamped to `[start, end]`.

The `BudgetComplexEntryModal` collects a description, amount, type, and a
recurrence rule; on submit it expands the rule, dispatches one row
per emitted date, and tags every generated row with a shared
`seriesId` so they can be edited or deleted as a group later. The
row's category is derived from the chosen type at render time.

### Series operations

Each row on the sheet has two actions, revealed by swiping the row
left on mobile (or via the action icons at the right edge on
desktop):

- **Repeat icon** opens `BudgetEditEntryModal`. On a non-series row the modal
  is a "promote to recurring" form — it reuses `BudgetRecurrenceForm` to
  capture a cadence + end date and dispatches `convertToRecurring`,
  which generates future rows that inherit the anchor's description
  and amount and share its type, all under a new `seriesId`. On a row that
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

## Detection over imported history

Three pure modules under `src/data/` correlate imported
`HistoryEntry`s into actionable suggestions, all keyed off a single
shared `normaliseDescription` so a Spotify charge that's detected as
recurring also memorises its type under the same key the next
import looks up:

- `description-normaliser.ts` collapses cosmetic differences — case,
  whitespace, ISO/short dates, currency suffixes, long digit
  sequences (transaction reference numbers), and a small allowlist
  of Swedish bank-noise prefixes (`Kortköp`, `Överföring`, `Swish`,
  …) — into a stable key. Used by all three modules below.
- `budget/recurring-detection.ts` buckets entries by normalised key,
  ranks each bucket by cadence regularity, amount stability, and
  occurrence count, and emits `RecurringCandidate`s the
  `BudgetRecurringCandidatesPanel` surfaces on the budget view. Promotion
  dispatches `promoteRecurringCandidate`, which mints a series of
  budget rows (using the existing `expandRecurrence` machinery) and
  records the chosen type as a merchant hint (its category is derived
  through `type.categoryId`). Dismissals persist in
  `recurringDismissals` so the noise doesn't keep coming back.
- `accounts/transfer-collapse.ts` finds mirror pairs across accounts —
  opposite signs, equal magnitude, dates within three days, bonus
  confidence for Swish / Överföring keywords — and emits
  `TransferCandidate`s the `AccountTransferCollapseModal` lists with bulk
  Collapse / Skip / Never controls. Collapsing dispatches
  `collapseTransferPair`, which mints a `Transaction` and stamps
  both source entries with `hidden: true` plus a
  `collapsedIntoTransactionId` backref so the operation is
  reversible (deleting the transaction restores both entries) and
  idempotent (the detector skips entries that already carry a
  backref). Dismissals persist in `transferCollapseDismissals`.
- `merchant-hints.ts` records the per-merchant type memory.
  `recordMerchantHints` runs at the tail of every type-assigning
  reducer action (budget row edits, recurring promotion, transaction
  create / update), keyed by the same normalised description. The
  recurring-candidates panel reads `suggestTypeForDescription` to
  render a "Suggested: <chip>" hint on each candidate — always
  visible to the user, never silently applied. The hint's category
  is derived through `typeId → EntryType.categoryId`. Hints whose
  `typeId` no longer references a known type are dropped on load.

The Settings → "Memory" section surfaces the size of each store and
a Clear-all so a misclick on either dismissal list (or a wholesale
reset of the merchant memory) is one tap away.

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
