# Dictionary

Maps the words the user (and the team) say in plain English to the
concrete components, types, files, and concepts in this codebase.

**When an agent encounters a term in user instructions that is not a
literal filename or import path**, look it up here first to resolve
it to the right code surface before searching. **When a new feature
ships or the user introduces a new word**, add a row here — same
pull request, alongside the code change — so the next agent doesn't
have to guess.

Entries are alphabetical within each section. Brief descriptions
only; deep architecture lives in `docs/architecture.md` and the
codified rules in `AGENTS.md`.

## Top-level UI

| Term                                   | Refers to                                                                                                                                                                                                           |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **App shell**                          | `src/components/AppShell.tsx` — top-level orchestrator. Owns the reducer, storage harness, and the page-routing switch.                                                                                             |
| **Workspace**                          | The whole `UserData` graph for one user — every sheet, account, transaction, history entry, setting, achievement.                                                                                                   |
| **Sheet**                              | Universal top-level container. Persisted on `UserData.sheets[]`. Each sheet has a `type` that selects which **page** renders.                                                                                       |
| **Active sheet**                       | The sheet currently visible. `UserData.activeSheetId`. Switched via the `BottomBar` tabs or the swipe gesture.                                                                                                      |
| **Sheet type**                         | The `"budget" \| "accounts"` literal on `Sheet.type`. Adding a new type means adding an arm in `AppShell.tsx`'s routing switch.                                                                                     |
| **Page**                               | A flavour of sheet content. Today: the budget page and the accounts page. Future: savings, loans, utility pages.                                                                                                    |
| **Bottom bar** / **tabs**              | `src/components/BottomBar.tsx` — the sheet tab strip at the bottom of the viewport.                                                                                                                                 |
| **Sheet tab**                          | One tab in the BottomBar. Long-press opens the SheetModal; tap selects.                                                                                                                                             |
| **Sheet title** / **title menu**       | The sheet's name shown above the page, plus the "…" menu next to it. Menu is `src/components/SheetTitleMenu.tsx`.                                                                                                   |
| **Sheet modal** / **edit-sheet modal** | `src/components/SheetModal.tsx` — universal modal that creates or edits sheet metadata (name, type, glyph, colour, description, optional account binding). Opened from the title's "…" menu or the BottomBar's "+". |
| **Header menu** / **burger menu**      | `src/components/HeaderMenu.tsx` — the top-right burger menu (settings, privacy, changelog, achievements, sign-out, …).                                                                                              |
| **Header star**                        | `src/components/HeaderStar.tsx` — the achievements star next to the header menu. Outline when there are no unread unlocks.                                                                                          |

## Budget page

The per-account ledger. Sheet type `"budget"`. Files live in
`src/components/budget/`.

| Term                                                                | Refers to                                                                                                                                                                        |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Budget page** / **budget sheet** / **budget ledger**              | `src/components/budget/BudgetPage.tsx` — the page root. Renders months + columns + rows + balances.                                                                              |
| **Budget viewer modal** / **view-mode** / **read-only budget**      | `src/components/budget/BudgetViewerModal.tsx` — opens from the eye affordance. Same rows, no editing.                                                                            |
| **Month table**                                                     | `src/components/budget/MonthTable.tsx` — one month's table inside the budget page. Header row + body rows + footer add-row.                                                      |
| **Budget row** / **row**                                            | `src/components/budget/BudgetRow.tsx` — one row inside a month table. Swipe-to-act, inline cells, action menu.                                                                   |
| **Budget cell** / **cell**                                          | `src/components/budget/BudgetCell.tsx` — one cell. Renders the editor or a readonly chip depending on column type and synthesized state.                                         |
| **Column header**                                                   | `src/components/budget/ColumnHeader.tsx` — draggable header for a budget column.                                                                                                 |
| **Add-row button**                                                  | `src/components/budget/AddRowButton.tsx` — the inline "+" at the bottom of each month. Long-press opens the recurring/categorised picker.                                        |
| **Row actions menu**                                                | `src/components/budget/RowActionsMenu.tsx` — the kebab popover with edit/delete/copy/split actions for one row.                                                                  |
| **Edit-entry modal**                                                | `src/components/budget/EditEntryModal.tsx` — edits a row's description + type. Also handles "promote history entry to recurring".                                                |
| **Edit-row modal**                                                  | `src/components/budget/EditRowModal.tsx` — generic full-row edit form (every field at once). Opened by long-press.                                                               |
| **Split entry modal** / **split modal**                             | `src/components/budget/SplitEntryModal.tsx` — split a bank-history row into multiple categorised parts.                                                                          |
| **Complex entry modal**                                             | `src/components/budget/ComplexEntryModal.tsx` — recurring + categorised entry creator. Supports `amountFormula`.                                                                 |
| **Bulk edit modal** / **move-copy modal** / **apply-series dialog** | `src/components/budget/BulkEditModal.tsx`, `MoveCopyModal.tsx`, `ApplySeriesEditDialog.tsx` — toolbars / dialogs that fire on selected rows.                                     |
| **Match rule modal** / **pattern modal**                            | `src/components/budget/MatchRuleModal.tsx` — creates a wildcard rule that auto-labels future history entries matching a pattern.                                                 |
| **Recurring candidates panel**                                      | `src/components/budget/RecurringCandidatesPanel.tsx` — floating suggestions panel: "this looks like a recurring expense, want to promote it?"                                    |
| **Recurrence form**                                                 | `src/components/budget/RecurrenceForm.tsx` — the mode-tab / preview UI shared by the recurring modals.                                                                           |
| **Transaction search modal**                                        | `src/components/budget/TransactionSearchModal.tsx` — search across all transactions; clicking a result jumps to the row.                                                         |
| **Formula** / **formula input**                                     | `src/components/budget/FormulaInput.tsx` — typed expression in an amount cell (`=`-prefixed). Resolves at render. Helpers: `FormulaHelpButton.tsx`, `FormulaVariableHelper.tsx`. |

## Accounts page

The workspace dashboard. Sheet type `"accounts"`. Files live in
`src/components/accounts/`.

| Term                                                                           | Refers to                                                                                                                                                                    |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Accounts page** / **accounts sheet** / **accounts overview** / **dashboard** | `src/components/accounts/AccountsPage.tsx` — page root. Renders the accounts table + cross-account transfer log.                                                             |
| **Account**                                                                    | One named bank/cash account. `Account` in `src/data/types.ts`. Has name, glyph, colour, bank/IBAN, opening balance.                                                          |
| **Account modal**                                                              | `src/components/accounts/AccountModal.tsx` — create/edit an account.                                                                                                         |
| **Account actions menu**                                                       | `src/components/accounts/AccountActionsMenu.tsx` — swipe-revealed menu on an account row (edit, delete, import, view history, cut history, …).                               |
| **Update balance modal** / **balance correction**                              | `src/components/accounts/UpdateBalanceModal.tsx` — user asserts current balance; appends a correction row to the first AccountBudget tracking the account.                   |
| **Transaction** / **transfer**                                                 | A cross-account transfer. `Transaction` in `src/data/types.ts`. Distinct from a row's "is-transfer" flag (a one-off marker that doesn't mint a Transaction).                 |
| **Transaction modal**                                                          | `src/components/accounts/TransactionModal.tsx` — create/edit a Transaction.                                                                                                  |
| **Transfer log**                                                               | The bottom table on the AccountsPage that lists all Transactions in date order.                                                                                              |
| **History** / **bank history** / **imported entries**                          | Bank-statement entries imported from a CSV/XLSX. Lives on `UserData.history[accountId]`. Read-only — `HistoryEntry` in `src/data/types.ts`.                                  |
| **History modal** / **history viewer**                                         | `src/components/accounts/HistoryModal.tsx` — read-only viewer of one account's imported history.                                                                             |
| **Import history modal**                                                       | `src/components/accounts/ImportHistoryModal.tsx` — file picker + bank-parser selector.                                                                                       |
| **History entry edit modal**                                                   | `src/components/accounts/HistoryEntryEditModal.tsx` — per-entry override of description and type.                                                                            |
| **Cut history modal**                                                          | `src/components/accounts/CutAccountHistoryModal.tsx` — drops imported entries and transactions dated before a cutoff.                                                        |
| **Reconciliation modal**                                                       | `src/components/accounts/ReconciliationModal.tsx` — post-import flow that pairs new history entries with existing budget rows.                                               |
| **Transfer collapse modal**                                                    | `src/components/accounts/TransferCollapseModal.tsx` — folds a detected pair of mirrored bank entries (one outgoing, one incoming on the other account) into one Transaction. |

## Data and storage

| Term                                       | Refers to                                                                                                                                                                                                                                 |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **User data** / **state** / **the budget** | `UserData` in `src/data/types.ts`. The top-level persisted shape. Bumps `version` on schema changes.                                                                                                                                      |
| **Sheet item**                             | A discriminated-union member inside `Sheet.items`. Today: `AccountBudget` (budget page) or `AccountsView` (accounts page marker).                                                                                                         |
| **Account budget**                         | `AccountBudget` — the budget-page data: `accountId`, `columns`, `rows`. One per budget sheet.                                                                                                                                             |
| **Row**                                    | `Row` in `src/data/types.ts`. A budget row with `id`, `cells`, optional `seriesId`, `recurrence`, `transactionId`, `historyEntryId`, `amountFormula`, etc.                                                                                |
| **Column**                                 | `Column` in `src/data/types.ts`. Defines a column's `id`, `type` (date/text/amount/balance/completed/type/category), `label`, `width`.                                                                                                    |
| **Cell value**                             | `CellValue` in `src/data/types.ts`. The persisted value of one row × column pair.                                                                                                                                                         |
| **Synthesized row**                        | A read-only row rendered into the budget table that isn't stored as a `Row`. Two flavours: `synthesizeTransactionRow` (one per cross-account Transaction touching this account) and `synthesizeHistoryRow` (one per imported bank entry). |
| **Series**                                 | A set of rows linked by `seriesId`. Created when a row gets a `recurrence` rule and `expandRecurrence` fans it out. Editing a series asks "just this row or future?".                                                                     |
| **Recurrence rule**                        | `RecurrenceRule` in `src/data/recurrence.ts`. `monthly` / `weekly` / `custom-dates`. Drives series generation.                                                                                                                            |
| **Entry type** / **type**                  | `EntryType` in `src/data/types.ts`. Labelled tag for a row (Salary, Rent, Groceries, …). Carries a colour, glyph, and category.                                                                                                           |
| **Category**                               | `Category` in `src/data/types.ts`. Top-level grouping of types (Food, Transport, Bills, …). User-added + presets.                                                                                                                         |
| **Preset**                                 | Built-in immutable category or entry type. `PRESET_CATEGORIES` / `PRESET_ENTRY_TYPES` in `src/data/constants.ts`. Hide-only, never edited.                                                                                                |
| **Match rule** / **pattern rule**          | `MatchRule` in `src/data/types.ts`. Wildcard-string match on raw bank description; tags every matching history entry with the chosen type.                                                                                                |
| **Merchant hint**                          | `MerchantHint` in `src/data/types.ts`. Learned association from a normalised bank-description key to a user-chosen description + typeId. Applied during `synthesizeHistoryRow`.                                                           |
| **Series match rule**                      | `SeriesMatchRule` — auto-reconciliation rule learned from "Apply to whole series" in the reconciliation modal.                                                                                                                            |
| **Promote**                                | Verb: take a one-off history entry and "promote" it into a budget row with a recurrence rule.                                                                                                                                             |
| **Reconciliation**                         | Pairing newly-imported history entries with existing budget rows so the running balance stays anchored. See `src/data/reconciliation.ts`.                                                                                                 |
| **Opening balance**                        | An account's starting balance (`Account.openingBalance`), or a budget sheet's anchor for the running balance.                                                                                                                             |
| **Running balance** / **balance column**   | Per-row balance derived by `computeBalances` in `src/data/sheet.ts`. Not stored — recomputed on render.                                                                                                                                   |
| **Balance correction**                     | A row that brings the running balance to a user-asserted value. Created via `correctAccountBalance` from the UpdateBalanceModal.                                                                                                          |
| **Fiscal month**                           | The month-grouping logic. May shift forward/back based on the user's payday (`detectPaydayDayOfMonth`).                                                                                                                                   |
| **Payday**                                 | The user's chosen day-of-month. Used to align fiscal months and as a "move orphans here" target in reconciliation.                                                                                                                        |
| **Backend**                                | A storage backend. `browser` (localStorage), `folder` (File System Access), `dropbox`, `gdrive`. See `src/storage/`.                                                                                                                      |
| **Cloud backup**                           | Timestamped JSON snapshot in cloud storage. Listed and restored via `src/components/CloudBackupModal.tsx`.                                                                                                                                |
| **Encryption**                             | Per-user choice (`none` or `password`). Wraps every cloud write in an AES-GCM envelope via `src/storage/encrypting-adapter.ts`.                                                                                                           |
| **Achievement**                            | Tier-based feature trophy. Catalogue in `src/data/achievements/catalog.ts`. Unlock fires via the bus.                                                                                                                                     |

## Cross-cutting UI primitives

| Term                                                 | Refers to                                                                                                                                                                                                                                 |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Modal**                                            | Overlay with backdrop, blocks interaction with background. `src/components/Modal.tsx` is the shared shell. Defaults to fullscreen on mobile so iOS soft-keyboard math can keep the footer visible; pass `centered` for input-free modals. |
| **Dialog**                                           | Lighter modal-like confirm/choose UI. Examples: `ConfirmDialog.tsx`, `ApplySeriesEditDialog.tsx`, `CloudLinkDialog.tsx`.                                                                                                                  |
| **Panel**                                            | Non-blocking overlay (no backdrop, doesn't steal focus). `FloatingPanel.tsx` is the portalled dropdown shell. `RecurringCandidatesPanel.tsx` is a floating suggestions panel.                                                             |
| **Picker**                                           | Custom dropdown for choosing one of many. Never use native `<select>`. Examples: `CategoryPicker.tsx`, `TypePicker.tsx`, `LanguagePicker.tsx`, `BackendPicker.tsx`, `GlyphPicker.tsx`.                                                    |
| **Toast**                                            | Ephemeral status message at the bottom. `src/components/Toast.tsx` + `useToast()`.                                                                                                                                                        |
| **Update toast**                                     | `src/components/UpdateToast.tsx` — "new build, click to reload" PWA prompt.                                                                                                                                                               |
| **Active row** / **row claim** / **row coordinator** | The "this row has an open editor / popover / swipe" registration. Provider: `ActiveRowProvider.tsx`. Claim from a child: `useClaimActiveRow.ts`. Every in-row interactive element MUST claim, or row-dismiss flows break.                 |
| **Sheet swipe**                                      | The left/right gesture to switch between sheets. `src/hooks/useSheetSwipe.ts`. Edge band reserved for sheet swipe so row swipes don't collide.                                                                                            |
| **Glyph**                                            | A lucide-react icon, addressed by name. See `CategoryIcon` union in `src/data/types.ts` and the `CategoryIconGlyph` registry in `src/components/icons.tsx`.                                                                               |

## i18n

| Term                    | Refers to                                                                                                                                     |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **Catalog**             | The English catalogue (`src/i18n/locales/en.ts`) widened into a `Catalog` type that enforces every other language's coverage at compile time. |
| **Lang** / **language** | `Lang` union in `src/i18n/locale.ts`. Currently `"en" \| "sv"`.                                                                               |
| **`t()`**               | The lookup function from `useT()`. Autocompletes against the `Catalog` type.                                                                  |
| **Plural helper**       | `plural()` in `src/i18n/index.ts`. Switches between `...One` / `...Other` keys based on count.                                                |

## Workflows / verbs the user might say

| Term                           | Refers to                                                                                                                     |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| **Add a sheet**                | "+" in the BottomBar opens `SheetModal` with no sheet preselected.                                                            |
| **Edit a sheet**               | Title "…" menu → `SheetModal` with the active sheet's metadata.                                                               |
| **Add a row**                  | Tap `AddRowButton` in any month of the budget page. Long-press opens the recurring/categorised picker.                        |
| **Promote a history entry**    | From the budget page's history row, open EditEntryModal → "Make recurring". Mints a series and records a merchant hint.       |
| **Split an entry**             | SplitEntryModal — break one bank entry into multiple categorised rows.                                                        |
| **Collapse a transfer**        | Detected automatically; user accepts via TransferCollapseModal.                                                               |
| **Import history**             | AccountActionsMenu → "Import" → ImportHistoryModal → bank parser → ReconciliationModal.                                       |
| **Cut history**                | AccountActionsMenu → "Cut history" → CutAccountHistoryModal. Drops old entries + transactions.                                |
| **Update balance**             | AccountsPage row → balance cell → UpdateBalanceModal. Writes a correction row.                                                |
| **Mark as transfer**           | Per-row eye toggle. Sets `Row.isTransfer = true` so the `hideTransfers` setting can suppress it. Does NOT mint a Transaction. |
| **Sign out** / **switch user** | Header burger menu. Triggers `AppShell`'s sign-out / switch-user handlers.                                                    |

## Conventions for editing this file

- One row per term. Keep the description to one or two sentences.
- Group by section above (Top-level UI, Budget page, Accounts page,
  Data and storage, Cross-cutting UI primitives, i18n,
  Workflows). Add a new section only if a future feature genuinely
  doesn't fit any existing one.
- Cite the most specific file path that the term maps to, not the
  whole subtree.
- When the user introduces a new word the codebase doesn't already
  cover, add the entry **in the same pull request** as the code
  change that introduced the word.
- When a renamed file changes what a term resolves to, update the
  entry in the same pull request.
- Don't duplicate `docs/architecture.md`'s deeper explanations.
  Link by file path; readers who need the why can follow.
