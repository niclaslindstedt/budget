# Overview

How the app's subsystems and features actually behave — the "how it
works" companion to `docs/dictionary.md`.

The dictionary answers _"the user said X — which file is that?"_: it
maps every term to the most specific file and the symbols to grep for,
and stops there. **This file answers the next question** — _"I've
found the file, so how does this subsystem work, and what else does it
touch?"_ Every term in the dictionary has a matching entry here, under
the same section headings, so the two read as a pair: look the word up
in the dictionary to find the code, read the same word here to
understand it.

It is **not** a way to find code (the dictionary does that) and it is
**not** the module / persisted-shape inventory (`docs/architecture.md`
does that — which file owns which helper, the `UserData` shape, the
migration runner). Read this to grasp a feature's behaviour and its
cross-module reach before working a request, especially to discover the
surfaces a change touches beyond the one file the request names.

**Maintain it in lockstep with the code, in the same PR.** When a
feature's behaviour changes, update its entry here — and the dictionary
row too if the file or symbols moved (usually only the overview needs
touching, since the dictionary row is just a pointer). Keep
descriptions to current behaviour and invariants, not changelog
narration ("used to…", "previously…"). Keep the inline `file.ts` /
`symbol` references so the prose stays navigable. The headings here
mirror the dictionary's sections one-to-one; add a new heading
whenever you add a dictionary row.

## Top-level UI

### App shell

`src/components/AppShell.tsx` — the top-level orchestrator. Owns the
reducer, the storage harness, and the page-routing switch that picks
which page renders for the active sheet's `type`.

### Action history

`ActionHistoryModal.tsx` — the timeline modal listing every undoable
action newest-first ("action summary" is the same thing). Each entry's
label is a verb+object string (the `actionHistory.action.<type>` i18n
key) plus the subject it acted on, composed by `formatActionLabel` in
`src/components/action-history-label.ts`. The subject (the named
object, or a count) is resolved at dispatch time by
`describeActionSubject` in `src/data/action-summary.ts` and carried on
`ActionHistoryEntry`. The same label feeds the undo / redo toasts.

### Workspace

The whole `UserData` graph for one user — every sheet, account,
transfer, history entry, setting, achievement.

### Sheet

The universal top-level container. Persisted on `UserData.sheets[]`.
Each sheet has a `type` that selects which page renders.

### Active sheet

The sheet currently visible (`UserData.activeSheetId`). Switched via
the header Sheet switcher dropdown or the swipe gesture.

### Sheet type

The `"budget" | "accounts" | "items" | "salary" | "properties"`
literal on `Sheet.type`. The registry of known types lives in
`src/data/sheet-types/` (`SHEET_TYPE_REGISTRY`). Adding a type means a
new file there plus an arm in `AppShell.tsx`'s page-routing switch.

### Page

A flavour of sheet content. Today: the budget page, the accounts page,
the items page, the salary page, and the properties page. Future:
savings, loans, utility pages.

### Bottom bar

`src/components/BottomBar.tsx` — the action bar pinned to the bottom of
the viewport. Search / undo / redo / action-history / select-mode on
the right; the `BulkActionBar` on the left while in select mode; the
favorites strip (up to 3 favorited-sheet glyph icons) on the left in
normal mode. Full sheet switching lives in the header Sheet switcher.

### Favorite sheet

A sheet marked as a favorite (`Sheet.favorite`, capped at 3 via
`MAX_FAVORITE_SHEETS` in `src/data/sheet.ts`) shows as a quick-switch
glyph icon in the Bottom bar (`FavoriteSheetButton`). Toggled from the
sheet title menu's "Favorite / Unfavorite sheet" item
(`favoriteMenuItem` in `SheetTitleMenu.tsx`), which fires the
`toggle-sheet-favorite` command; the central AppShell handler enforces
the cap and toasts when it's reached.

### Sheet switcher

`src/components/SheetSwitcher.tsx` — the header button (showing the
active sheet's glyph + name) that opens a `FloatingPanel` dropdown
listing every sheet, with the active one checked and a "New sheet"
footer. It is the sole in-chrome way to switch sheets (besides the
swipe gesture); it replaced the BottomBar tab strip, which couldn't
scroll without breaking iOS composited scrolling.

### Sheet title

`src/components/SheetTitleMenu.tsx` — the sheet's name shown above the
page; the whole title (name + "…" glyph) is one trigger that opens the
actions dropdown.

### Sheet modal

`src/components/SheetModal.tsx` — the universal modal that creates or
edits sheet metadata (name, type, glyph, colour, description, optional
account binding). Opened from the title "…" menu or the BottomBar "+".

### Header menu

`src/components/HeaderMenu.tsx` — the top-right burger menu (settings,
privacy, changelog, achievements, sign-out, …).

### Header star

`src/components/HeaderStar.tsx` — the achievements star next to the
header menu. Outline when there are no unread unlocks.

### Changelog

`src/components/ChangelogModal.tsx` — the "What's new" / full-history
modal, opened automatically on first mount after an upgrade (gated by
`Settings.lastSeenChangelogVersion`) and manually from the header menu.
Its content comes from `CHANGELOG.md` via the build-time parser
(`vite/changelog-plugin.ts` → `src/generated/changelog.ts`).

Each changelog bullet is **markdown**, rendered by the small in-house
parser + renderer in `src/components/markdown.ts` and `Markdown.tsx`
(bold, italic, code, links, lists, headings, blockquotes, fenced code —
no `react-markdown` dependency; every colour reads through a theme
token). A bullet for a large feature ends with a **"Learn more" link**
whose href uses the `feature:<slug>` scheme. Following it doesn't
navigate — the modal swaps to an inline **feature-doc** view (a back
button in the header returns to the list), rendering the markdown of
`docs/features/<slug>.md`. Opening a feature doc unlocks the
**Bookworm** achievement.

**Feature docs** live at `docs/features/*.md` (English-only, like the
CHANGELOG body) and are bundled into the app at build time by
`vite/feature-docs-plugin.ts` (mirrored by `scripts/codegen/feature-docs.mjs`
for `make codegen`) → `src/generated/feature-docs.ts`. They are the home
for the long-form explanation of a big feature; the changelog bullet
stays one sentence and links here. Authoring flow: a changeset fragment
sets `doc: <slug>` (see `AGENTS.md` → "Changeset fragments"), and the
matching `docs/features/<slug>.md` ships in the same PR.

### Homepage

`src/components/HomePage.tsx` — a static **showcase / landing page**
served at `/home` (and `/preview/home` on the staging slot), separate
from the SPA itself, which is served at `/`. It exists to satisfy
Google's OAuth "app homepage" requirements: identify the app and
brand, describe what every sheet type tracks, explain **why** the app
requests optional access to a user's own Dropbox (App-folder scope) or
Google Drive (`drive.file` scope), link to the privacy policy, and
stay reachable without signing in. The feature list renders from
`SITE_FEATURES` (`src/seo/siteConfig.ts`); the prose is hand-written.

It is wired exactly like the privacy page: `SHOWCASE_ROUTE` in
`src/seo/routes.ts` (path `/home/`) is added to the alias list in
`emitPathAliasWithSeo(...)` in `vite.config.ts`, so the build emits
`dist/home/index.html` with its own SEO head plus sitemap / `llms.txt`
entries; the path switch in `src/main.tsx` mounts `HomePage` when the
pathname ends with `/home`. Like `PrivacyPage` it is hardcoded
English, not routed through the i18n catalogs. Because it is the
Google-facing homepage and a compliance surface, it must be kept in
lockstep with the actual feature set and OAuth scopes — see the "App
homepage (`/home`)" section in `AGENTS.md`.

## Budget page

The per-account ledger. Sheet type `"budget"`. Files live in
`src/components/budget/`.

### Budget page

`BudgetPage.tsx` — the page root. Renders months + columns + rows +
balances.

### Budget viewer modal

`BudgetViewerModal.tsx` — opens from the eye affordance. Same rows, no
editing ("view-mode" / "read-only budget"). A row with no user-authored
description falls back to a line-item pill or company pill in the
description column, mirroring the editable table's `DescriptionCell`
resolve order (line items win, then company). Its in-modal search bar
(the shared `ModalSearchBar`, `actions` slot) carries viewer-scoped
sort + filter controls via the universal `ModalSearchControls`: a
newest/oldest sort toggle and a popover to hide transfers / uncompleted
rows, all local to the open viewer.

### Month table

`BudgetMonthTable.tsx` — one month's table inside the budget page.
Header row + body rows + footer add-row.

### Budget row

`BudgetRow.tsx` — one row inside a month table. Swipe-to-act, inline
cells, action menu. The code type is `Row` in `src/data/types.ts`.

### Budget cell

`BudgetCell.tsx` — one cell. Renders the editor or a readonly chip
depending on column type and synthesized state.

### Finished row

A **finished** row is an imported bank transaction (a `historic` row)
the user has fully categorised: it carries a type AND either a company
or the explicit "omit company" flag (`isRowFinished` in
`src/data/budget/rows.ts`). Finishing is the real confirm signal for
imported history, so the Done column doubles as a progress scan ("what
haven't I finished?"):

- **Historic, unfinished** → a **grey** check in the Done column (the
  transaction already happened, but it still needs a type / company),
  no row tint.
- **Historic, finished** → a **green** check plus a **green background
  wash** across the whole row.
- **User-authored** (and transfer) rows → a manual Done checkbox that
  shows a **green** check when ticked but never tints the row.

The check colour is driven by `ReadonlyCompletedCell`'s `tone` prop
(`success` vs `muted`) for historic rows and `text-success` on the
editable checkbox for user rows. The row tint (`tr.is-finished`) lives
in the **unlayered** `src/styles/utilities.css`, not `components.css`:
every data cell carries `bg-surface` from `CELL_BASE`, which sits in
Tailwind's `utilities` layer, so the same rule in `@layer components`
would lose the cascade and paint nothing.

### Column header

`BudgetColumnHeader.tsx` — the draggable header for a budget column.

### Add-entry button

`BudgetAddEntryButton.tsx` — the inline "+" at the bottom of each
month. Long-press opens the recurring / categorised picker.

### Covered-month footer

`OrphanIndicator.tsx` — the month-table footer for a month fully
covered by bank history (the "orange triage CTA" / "entries to move or
delete"). Green when reconciled; an orange button when manual rows
remain, which opens the Reconciliation modal scoped to that month
(`AppShell`'s `manualTriage` state).

### Entry actions menu

`BudgetEntryActionsMenu.tsx` — the kebab popover with edit / delete /
copy / split actions for one row ("row actions menu").

### Entry info modal

`BudgetEntryInfoModal.tsx` — a read-only modal that lays out every
field of one budget or imported-history row: date, bank description,
description, amount, type (glyph + name) and its derived category,
company, tags, plus recurring / transfer / receipt flags. For a
synthesized `historic` row it also surfaces the backing
`HistoryEntry`'s raw bank description, import timestamp, and any
splits — the fields the synthesized row doesn't carry. Each value has a
copy glyph that lifts just that field onto the clipboard, and a footer
"Copy all details" button copies the whole entry as `Label: value`
lines. Reached three ways: the info button in a row's swipe strip (left
of the edit pen), the `Info` item in the compact
`BudgetEntryActionsMenu`, and a long-press / right-click anywhere on the
row. The `open-entry-info` modal command resolves through
`BudgetModalHost`, which looks up the history entry and the taxonomy
lists the modal indexes. Transfer rows and attributed cover
itemizations have their own info affordance (`BudgetCoverInfoModal`) and
don't show this one.

### Salary entry actions menu

`SalaryEntryActionsMenu.tsx` — the "…" overflow popover in a salary
row's swipe strip. Renders a single payslip entry whenever the backend
can hold payslips (the `payslips` capability), toggling between "Upload
payslip" (no file yet) and "View payslip" (file present); picking it
opens the shared attachment modal (`AttachmentUploadModal`) to upload /
view / replace / remove the file. Mirrors `BudgetEntryActionsMenu` /
`ItemEntryActionsMenu`.

### Item entry actions menu

`src/components/items/ItemEntryActionsMenu.tsx` — the "…" overflow
popover in an item row's swipe strip (the items-sheet analogue of
`SalaryEntryActionsMenu`). Renders a single receipt entry only when the
item is linked to a purchase AND the backend can hold receipts,
toggling between "Upload receipt" / "View receipt"; picking it opens
the shared attachment modal (`AttachmentUploadModal`) bound to the
linked transaction's `receiptPath`. Hidden for unlinked items (no
transaction to attach a receipt to).

### Attachment modal

`AttachmentUploadModal` in `src/components/AttachmentUploadModal.tsx` —
the universal "manage a single file attachment" modal, shared by
payslips (salary row "…" menu) and receipts (item row "…" menu). With
no file it shows a drag-and-drop / click-to-browse upload zone; with
one it renders the file inline (`<img>` for images, `<iframe>` for
PDFs) plus Replace / Remove / Download. Every mutation commits
immediately through host callbacks (`onUpload` / `onDownload` /
`onRemove`) — the file write and the data reference move together — so
it opens straight from a row menu, not from a parent form's Save.
Rendering the blob inline (not a new-tab `blob:` URL) is what makes the
preview work on iOS in-app browsers and standalone PWAs. Replaced the
old read-only `AttachmentViewerModal`.

### Edit-entry modal

`BudgetEditEntryModal.tsx` — a tri-mode dispatcher across
`BudgetEditSeriesForm.tsx` (existing series),
`BudgetPromoteHistoryForm.tsx` (synthesized history row), and
`BudgetPromoteToSeriesForm.tsx` (regular row). Description + type only;
full-row edit is the next entry.

### Edit-entry full modal

`BudgetEditEntryFullModal.tsx` — the generic full-row edit form (every
field at once), the "edit-row modal". Opened from the edit (pen) button
in a row's swipe strip / actions menu. For a recurring row a scope
picker offers "just this" / "this and all future" / "all in series",
with an explicit **Shift days by** nudge that slides every row in the
chosen scope. Moving the **date** under the "this and all future"
scope is itself treated as a shift: the day delta between the old and
new date slides every upcoming occurrence by the same number of days
(an explicit Shift-days value still wins if the user typed one), so a
one-off correction to the anchor's day carries the rest of the run
with it. The day delta drives the same `dateShiftDays` machinery via
`editSeries` / `applyPatch`; the anchor is then re-stamped to the exact
typed date. The "all" scope is excluded from this auto-shift (and locks
the amount field) so already-reconciled history isn't rewritten.

### Split entry modal

`BudgetSplitEntryModal.tsx` — splits a row into multiple categorised
parts. Each split carries its own description, amount, type, and
**company** — useful when a credit-card bill or bankgiro is broken into
the individual purchases whose actual merchants differ from the parent
entry's. The picked company rides through `SplitSubmission.companyId`
onto the new rows (`splitRow` reducer) or onto each
`HistoryEntrySplit.companyId` for a bank-history split.

### Complex entry modal

`BudgetComplexEntryModal.tsx` — the recurring + categorised entry
creator. Supports `amountFormula`.

### Amount span

`BudgetAmountSpanFields.tsx` — the exact-vs-estimate amount control
shared by the add / edit modals ("estimate range" / "min/estimate/max"),
including the promote-history-to-recurring form (`BudgetPromoteHistoryForm`)
so a varying bill can be promoted with a band. Estimate mode stores a
signed `amountMin` / `amountMax` band on the `Row` (sign math in
`budget-amount-span.ts`; reconciliation tolerance via `amountWithinSpan`
in `src/data/reconciliation.ts`).

### Amount calculator

The calculator button on a `SignedAmountInput`
(`src/components/form/SignedAmountInput.tsx`, opt-in via the
`calculator` prop) — opens a popover where the user types an arithmetic
expression (`100 + 30 + 50`) that `evaluateExpression`
(`src/utils/calc.ts`) resolves; the computed magnitude replaces the
field's value while the sign stays on the +/− toggle. Enabled on the
split-entry amount fields (`BudgetSplitEntryModal`) and metadata mode's
split amount (`BudgetMetadataModal`) so a credit-card bill's line items
can be summed straight into a split.

### Bulk edit modal

`BudgetBulkEditModal.tsx`, `BudgetMoveCopyModal.tsx`,
`ApplySeriesDialog.tsx` (at `src/components/` root — shared with the
scenarios page's override sweep) — the toolbars / dialogs that fire on
selected rows (bulk edit, move-copy, apply-series).

### Bulk action bar

`src/components/BulkActionBar.tsx` — the count + Edit / Move / Copy /
Delete / Cancel toolbar shown in select mode ("select-many toolbar").
Presentational; used by the `BottomBar` and the search modal's footer.
Move / Copy are optional (omitted on the salary sheet, whose rows are
pinned to their pay month) so only Edit + Delete render there.

### Match rule modal

`BudgetMatchRuleModal.tsx` — creates a wildcard rule that auto-labels
matching history entries ("pattern modal" / "label similar" / "label by
pattern"). Opened via "label similar", it prefills the pattern + labels
from the source row (`resolveEntryLabels`; seed shape in
`budget-match-rule-modal-reducer.ts`). The "Save pattern" checkbox
(default on) controls whether the rule persists.

### Find conflicts modal

`BudgetFindConflictsModal.tsx` — opened from the budget sheet's title
"…" menu. Folds same-day, same-category, near-equal pairs **within one
account** (a bank-history row against a parallel user-authored row) into
one row. Detector: `src/data/budget/conflicts.ts`. Not to be confused
with the accounts-page **Find duplicates modal**, which spans different
accounts and is bank-history-only.

### Visualize spending

`BudgetSpendingModal.tsx` — the budget sheet's spending dashboard
("spending dashboard"), opened from the title "…" menu ("Visualize
spending"). A single scrollable dashboard (default modal mode:
fullscreen on mobile, wide `max-w-4xl` card on desktop) with four
sections, all clipped to one trailing fiscal-month window picked by an
Avanza-style sliding-pill range row (3M / 6M / 12M / All, default 6M).
A cogwheel button right of the range row — rendered only when at least
one owned item carries both a purchase price and a lifetime — opens a
chart-options dropdown with **Spread item costs over lifetime**: when
ticked, each expense row's line-item costs are lifted out of the
purchase month and re-emitted as equal monthly slices across the item's
`lifetimeYears` (straight-line cost allocation, Swedish "avskrivning"),
de-spiking the charts around big purchases. The lifted amount is
clamped to the row's expense so the residual never flips into income;
slices inherit the row's type / category / company and slices past the
current month fall away. Off by default, resets on open.

- **Monthly spending by category** — `StackedBarChart`, one bar per
  fiscal month, segments per category in the category's colour
  (uncategorised rows get `--muted`).
- **Where the money goes** — `DonutChart` of expense share per
  category; clicking a slice (or its legend-row button, the
  accessible target) drills into the entry types inside that
  category, with a back link to return. The legend lists amount +
  percent per slice.
- **Income vs expenses** — `LineChart` with per-month income
  (`--positive`), expenses (`--negative`), and net (`--accent`);
  rendered only when the window spans ≥ 2 months.
- **Top merchants** — the top 8 companies by spend as plain
  token-styled bar rows (no chart primitive).

**Data scope:** only money that actually moved counts — synthesized
bank-history rows plus rows whose completed cell is ticked; transfers
(either kind) and balance corrections are excluded. The predicate and
all aggregation live in the pure helpers in
`src/data/budget/spending.ts` (`isActualSpendingRow`,
`collectSpendingFacts`, `computeMonthlyCategorySpending`,
`computeCategoryShares` / `computeTypeShares`,
`computeIncomeVsExpenses`, `computeTopMerchants`). Grouping honours
the fiscal-month shift cascade (grouping runs before the scope filter
so filtered-out anchors still cascade), reads amounts from
`decoratedItem.rows` (formula amounts pre-resolved by
`computeBudgetState`), and zero-fills the window so every chart shares
one x-domain. Opening the modal unlocks the `spendingDetective`
achievement.

### Metadata mode

`BudgetMetadataModal.tsx` — opened from the title "…" menu. Walks
bank-history entries still needing a type / description, one at a time,
saving via `updateHistoryEntry`. Back and Forward buttons (left of
Skip) revisit entries already skipped or saved this session via a
`trail` of handled ids + a `reviewIndex` cursor; Forward returns toward
the live front without saving or skipping. The "Also apply to N
similar" checkbox fans labels out via `applyMetadataToMatchingHistory`
(`src/data/budget/pattern-apply.ts`); checking it expands a selection
list of the matched entries (date, amount, bank text — all checked by
default) so individual lookalikes can be unchecked and left out of the
sweep, e.g. when one merchant's bank text covers unrelated payments.
The "Split into parts…" button
enters the inline split builder (`budget-metadata-split-reducer.ts`):
fill an amount + type / company / tags / description per part, press
Split again to commit it and start the next on the remaining sum, or
Next to let the final part absorb the remainder. The per-part company
picker offers the same "Omit company" option as the single-entry form;
an omitted part persists as `HistoryEntrySplit.companyId = null`. Saves
via `splitHistoryEntry` (writes the entry's `splits` array, same as the
scissors-button modal).

### Recurring candidates panel

`BudgetRecurringCandidatesPanel.tsx` — the floating suggestions panel:
"this looks like a recurring expense, want to promote it?"

### Recurrence form

`RecurrenceForm.tsx` (components root) — the mode-tab / preview UI
shared by the budget page's recurring modals and the scenario
added-row modal.

### Entry search modal

`BudgetTransferSearchModal.tsx` — searches every entry across all
sheets; clicking a result jumps to the row (the visible label is
"Search"; the file name predates the rename, hence "transfer search
modal"). The filter popover lives in `BudgetTransferSearchFilterMenu.tsx`;
the filter / search / ranking primitives (`SearchFilter`, `runSearch`,
`searchBounds`, `matchingEntries`) live in `src/data/search.ts`.
The amount / date bands each show a `RangeSlider` whose `from – to`
readout is a click-to-edit `RangeBoundsEditor` (`src/components/form/`)
— clicking a bound swaps it to a typed field (a decimal input for
amounts, a native `<input type="month">` for dates) so an exact value
can be pinned instead of dragged; the same editor backs the history /
viewer search via `ModalSearchControls`. Supports filter-only browsing,
select-many → `BulkActionBar`, and a result cap tuned in Settings →
Search.

### Search settings

`src/components/SettingsModal/tabs/search.tsx` (`SearchTab`) — edits
`Settings.searchRanking` (`SearchRankingSettings` in
`src/data/types/settings.ts`): match-quality vs field-order priority,
recency mode, per-field weights, amount tolerance, result cap ("search
ranking" / "relevance settings"). Defaults: `DEFAULT_SEARCH_RANKING`
(`src/data/constants/defaults.ts`). Consumed by `scoreEntry` /
`runSearch` in `src/data/search.ts`.

### Formula

`BudgetFormulaInput.tsx` — a typed `=`-prefixed expression in an amount
cell, resolved at render. Helpers: `BudgetFormulaHelpButton.tsx`,
`BudgetFormulaVariableHelper.tsx`; the engine lives under
`src/data/budget/formula*.ts`.

## Accounts page

The workspace dashboard. Sheet type `"accounts"`. Files live in
`src/components/accounts/`.

### Accounts page

`AccountsPage.tsx` — the page root ("accounts sheet" / "accounts
overview" / "dashboard"). Renders the accounts table; the cross-account
transfer log opens in a modal from the title menu.

### Account

One named bank / cash account. `Account` in `src/data/types.ts`. Has
name, glyph, colour, bank / IBAN, opening balance.

### Account modal

`AccountModal.tsx` — create / edit an account.

### Account actions menu

`AccountActionsMenu.tsx` — the overflow dropdown on an account row
(import history, cut history, update balance). Edit / delete live in the
swipe strip; clicking the row body views history.

### Update balance modal

`UpdateBalanceModal.tsx` — the user asserts the current balance; it
appends a correction row to the first AccountBudget tracking the account
("balance correction").

### Transfer

A cross-account money movement. `Transfer` in `src/data/types.ts`
(`UserData.transfers`). Distinct from a row's "is-transfer" flag, which
doesn't mint a Transfer.

### Transfer modal

`AccountTransferModal.tsx` — create / edit a Transfer.

### Transfers modal

`AccountTransfersModal.tsx` — lists every Transfer in date order
(month-grouped, swipe-to-edit, "New transfer" footer), the "transfer
log". Opened from the accounts title menu ("…"), mirroring the budget
page's "Viewing mode" modal. Carries the same in-modal search bar as
the budget viewer (shared `ModalSearchBar` + universal
`ModalSearchControls`): free-text search across description / accounts /
type / amount / date, a newest/oldest sort toggle, and a "hide
uncompleted" filter (the one filter that makes sense when every row is
already a transfer).

### History

Bank-statement entries imported from CSV / XLSX ("bank history" /
"imported entries"). Lives on `UserData.history[accountId]`. Read-only
— `HistoryEntry` in `src/data/types.ts`.

### Last activity

The "Last activity" column on the Accounts and Savings tables: the full
date of each account's most recent imported transaction, a quick read on
whether the account's history is up to date or has gone stale.
`historyDateRange` (`src/data/history.ts`) scans `UserData.history[id]`
for the latest entry date (hidden entries included — they're still part
of the statement), and the cell renders it through `formatDate` in the
user's date format. `historyStaleness` buckets that date's age in whole
days against today — `fresh` (today / yesterday), `recent` (2–3 days),
`aging` (4–6 days), `stale` (a week or more) — and `STALENESS_TEXT_CLASS`
(`src/components/history-staleness.ts`, shared by both rows) maps the
bucket to a theme colour: green → yellow → orange → red. An em-dash in
the muted colour shows when nothing has been imported. The cell sits
beside the bank column and is hidden on phones (portrait and landscape),
same as the bank cell, so the mobile grid stays compact.

### History modal

`HistoryModal.tsx` — the read-only viewer of one account's imported
history. Raw bank fields only (date, bank description, amount,
balance); user-curated metadata belongs to the budget view. Its search
bar carries a viewer-scoped newest/oldest sort toggle plus a filter
popover (time range, amount band, date band) via the universal
`ModalSearchControls`, all local to the open viewer (the sort seeds
from `transactionSortOrder`; the filter bands reset on close). No
transfer / completed / type filters — history rows carry only raw bank
fields. Opened by tapping an account's row body on the accounts page,
and — since a savings account stores transactions for transfer
detection under the same `history[id]` key — by tapping a savings
account's row body on the Savings page (the savings account is
presented as an `Account` for the modal chrome; both routes share this
one modal).

### Import history modal

`ImportHistoryModal.tsx` — the file picker + bank-parser selector. The
preview also surfaces the matched bank (human name, falling back to the
parser id), the date range, and the clearing / account number extracted
from the statement header. On commit, the `importBankHistory` reducer
back-fills `bank` / `clearing` / `accountNumber` on the target record
from the statement — only when each field is empty, so a manual override
isn't clobbered by a re-import. The bank name comes from the parser
(`ParsedBankFile.bankName`, set per parser via `bankName` on the
xlsx / csv spec); clearing and account number come from the parser's
`accountIds` header extractor. This applies whether the import target is
a regular `Account` or a `Saving` (savings share the `history` id-space
and the same three bank-detail fields).

**Overlap-on-import confirmation.** A bank statement is the complete record
of one account over its date range, so importing one into an account that
already has history for that period usually means the wrong account was
picked. After staging, `importOverlap` (in `import-staging.ts`) compares
the date range of the rows the import would ADD against the account's
existing range; when they overlap by more than `IMPORT_OVERLAP_SLACK_DAYS`
(7 — a few late-posting card charges from the previous statement may
legitimately spill over), `useImportFlow` opens a `ConfirmDialog`
(`ImportFlowState.overlapConfirm`) naming the overlapping range before
committing. Confirming re-stages against current data and proceeds;
cancelling returns to the import modal. A clean continuation (new rows
after the existing range) never prompts.

### History entry edit modal

`EditHistoryEntryModal.tsx` — a per-entry override of description and
type.

### Cut history modal

`AccountCutHistoryModal.tsx` — drops imported entries and cross-account
transfers dated before a cutoff. When a dropped transfer was a collapsed
pair, the `cutAccountHistory` reducer also restores (un-hides + clears
the `collapsedIntoTransferId` backref on) its partner bank entry on the
other account — the same restoration `deleteTransfer` does — so the leg
reappears and can re-pair on a later import instead of being stranded
hidden.

### Find duplicates modal

`AccountDuplicatesModal.tsx` — opened from the accounts sheet's title
"…" menu ("duplicate finder" / "duplicates" / "cross-account
duplicates"). Finds the same bank transaction imported into **two or
more different accounts** — the wrong-statement-into-the-wrong-account
case — by grouping history entries that share a date, a normalised bank
description, and a signed amount. Detector:
`src/data/accounts/duplicates.ts` (`findDuplicateImports`), pure and
bank-history-only. Distinct from the budget-page **Find conflicts
modal**, which is within one account and can pair a user-authored row.

Per group the user picks which account **owns** the transaction; the
matching copies in every other account are deleted (the owner keeps its).
The finder suggests the most likely owner by balance continuity
(`suggestOwner` / `AccountIndex.fitById`): a copy "fits" an account when a
**non-duplicate** entry on EITHER side of the mis-import block hands the
running total into or out of it. The backward check anchors on the last
genuine row before the copy, carried forward across any intervening
duplicates (`anchor.balance + Σ(amounts from the anchor up to and
including the copy) == copy.balance`); the forward check anchors on the
first genuine row after the block
(`copy.balance + Σ(amounts from the copy up to and including that row) ==
that row's balance`). The stray copy lands on a balance the account's own
genuine history never produced on either side, so it doesn't fit and is
flagged. Three subtleties shape the check — the anchor is the **nearest
non-duplicate**, not the immediate neighbour; **both directions** count;
and it is **not** a set membership:

- A whole statement mis-imported into the wrong account is a contiguous
  block of duplicates whose balances were copied verbatim, so the block
  chains into _itself_. Checking the immediate neighbour would validate
  every duplicate in the wrong account too; anchoring on the nearest
  genuine row — and summing the skipped duplicates' amounts across the
  gap — is what distinguishes the owner (its genuine chain flows into or
  out of the block) from the mis-import (it doesn't).
- The owner's only genuine neighbour is often **after** the charge, not
  before: a ledger whose genuine rows are the salary deposits and
  transfers between runs of card charges leaves many a charge with no
  genuine predecessor but a genuine successor it hands the running total
  off to (a charge posted right before a deposit lands 1407, then +9000
  reaches the genuine 10407). A backward-only anchor flagged every such
  charge on the true owner as a mismatch, so only the first copy after a
  genuine deposit was detected; the forward anchor reconciles the rest.
- An earlier version asked only whether the pre-balance existed _anywhere_
  in the account's balance set. Over months of history a wrong account
  coincidentally holds that balance at some unrelated point, so every copy
  "fit", ownership fell to the tie-breakers, and the balance painted green
  on the wrong account.

The chain spans every entry the bank posted — auto-collapsed transfer legs
(`collapsedIntoTransferId`) and hidden rows included — because they all
move (or hold) the running total, and a non-duplicate one is a valid
anchor (the genuine owner's neighbour is frequently a salary deposit or
internal transfer that got collapsed into a `Transfer`). When the balance
genuinely can't decide (a copy with no non-duplicate anchor on either
side), ownership falls to the tie-breakers — denser same-day statement,
then fuller history. A transaction is only grouped when
date, normalised description, signed amount, AND running balance all
match across accounts: a verbatim mis-import copies the statement row's
balance too, so the two copies share it, whereas a mere coincidence (a
recurring card payment posting the same amount on the same day to two
accounts) lands each account on its own running total and is therefore
NOT flagged. Balance-less credit-card exports bucket under a "no balance"
sentinel so two such copies still match each other, but a balance-less
copy never matches one carrying a balance. Every cross-account duplicate
is listed regardless of amount — there is no minimum-amount floor.
Tapping a group header expands an inline **context panel**
(`historyContext`) showing, per account, the bank rows immediately before
and after the matched transaction with their balances (newest first, like
the history viewer), so the user can eyeball whether the running balance
flows cleanly through the matched row (it belongs) or jumps over it (a
foreign mis-import). The matched row's balance carries an explicit verdict
pill: **green with a checkmark** when it sits cleanly on the account's
running total (`fits === true`), **red with a warning** when it doesn't
(`fits === false`), and plain when there was no balance to judge
(`fits === null`). The owner is only pre-selected when at least one
account's balance reconciles; when every copy mismatches (or there is no
balance to judge) the group defaults to **Skip**, so a blind guess never
deletes a copy. When more than one group is listed, a **Set owner for
all** row offers a chip per account involved across the finds
(`duplicateBatchOwners`); clicking one points every group that holds a copy
in that account at it in a single click — the common case is one statement
mis-imported into one wrong account, so all finds share the same true
owner and picking it per-card is pure tedium. The chip shows a pressed
state while every applicable group is pointed at it, and any single card
can still be overridden afterwards. **Accept all**
resolves every group at once. A per-group **Skip** option keeps every copy
(the group drops from the list for the session); a per-group **Ignore** button
(`ignoreDuplicates`, fed by `ignoreRulesForGroup`) records a persistent
`UserData.duplicateIgnores` rule keyed by the EXACT bank description and
amount, so the charge is skipped on every future import — cleared from
the Memory settings tab (`clearDuplicateIgnores`). Resolution dispatches
`resolveDuplicateImports`, which
deletes the listed entries and re-derives each touched account's
`openingBalance`. It also carries any categorisation done on the losing
copies onto the surviving owner copy: the modal computes a fill-blanks
patch per owner entry from the removed copies (`migrateMetadata` /
`duplicateMetadataMigrations` — `userDescription` / `userTypeId` /
`userCompanyId` / `userTagIds` / `userSeriesId` / `splits` / `lineItems` /
`receiptPath` / `fiscalMonthShift` / `isTransfer` / `ignored` /
`hintIgnored` / `noCompany`, never overwriting a field the owner already
has), and the reducer applies it through the `metadataPatches` payload — so
time spent categorising on the wrong account isn't lost. Transfer legs
(`collapsedIntoTransferId`) are excluded from candidacy so collapsing a
transfer is never mistaken for a duplicate.

When a whole bank statement landed in the wrong account, the offending
copy is just one row of a larger mis-import. Every history entry carries
an `importId` backref to the `HistoryImport` session that first added it
(stamped at import time), so when a non-owner copy belongs to a session
that left more rows in the account than the group itself matched, the
card offers a **"remove the rest of that import (N more)"** checkbox
(`duplicateSessions` / `duplicateSessionRemovals`). Ticking it expands the
resolution to drop the entire mis-imported session in that account, not
just the colliding row. Because a swept-up entry can itself be a collapsed
transfer leg, `resolveDuplicateImports` also drops any transfer whose leg
it removes and un-hides the partner leg on the other account (mirroring
`cutAccountHistory` / `deleteTransfer`), so the partner is never stranded
`hidden` with a dangling backref.

Duplicate detection also runs **at import time**, not just from the menu.
After any import commits, `useImportFlow` stamps the import's `now` into
`ImportFlowState.duplicatesCheckAt` and derives `importDuplicateGroups` —
the cross-account groups holding a row with that `importedAt` (every
freshly-added entry carries it). When non-empty, `AccountsModalHost`
auto-opens a **separate** modal, `ImportDuplicatesModal` — a
**single-owner** picker rather than the per-group resolver, since an
import almost always overlaps just one other account. It lists the
affected transactions and offers one owner choice for the whole batch
(`duplicateBatchOwners` builds the options with per-account fit tallies).
The pre-selection uses the strongest signal first: a bank statement is the
complete record of one account over its date range, so `exclusiveRangeOwner`
(computed in `useImportFlow` from the just-imported rows' date span) picks
the account whose history within that range is **exactly** these duplicates
and nothing else — an account carrying them alongside other rows in the
same window can't be the owner. When no account is exclusive (or more than
one is — e.g. a fresh import target and a dedicated copy are
indistinguishable), it falls back to `suggestBatchOwner` (most-reconciling
account), then Skip. Confirming consolidates every
detected duplicate to that owner via `duplicateBatchRemovals` →
`resolveDuplicateImports`: owner = the import target keeps the new rows and
removes the older copies elsewhere; owner = an existing account removes the
just-imported copies. An effect in `useImportFlow` clears
`duplicatesCheckAt` once the list empties (all resolved, or none found) so
the finder stops re-running. The menu-opened `AccountDuplicatesModal` keeps
its per-group resolution and is unaffected.

### Reconciliation modal

`AccountReconciliationModal.tsx` — the post-import flow that pairs new
history entries with existing budget rows. Each matched / orphan row
renders its label through the shared `EntryDescriptionContent`
(`src/components/EntryDescriptionContent.tsx`), the same read-only
description rendering the budget table's `DescriptionCell` uses, so a row
named only by a company pill or type-name fallback reads the way it does
in the ledger instead of collapsing to a bare "(no label)". Matches and
orphan predictions render as bordered cards in a gapped list (the same
visual language as the transfer-collapse modal) rather than flush
bottom-bordered rows, each match card labelling its predicted-vs-bank
lines. The "Probable matches" section header carries a "Check all" /
"Uncheck all" toggle (shown only when there is more than one candidate)
so a long match list doesn't have to be confirmed checkbox by checkbox;
the label flips to "Uncheck all" once every candidate is selected, and
the footer shows how many matches are currently selected.

### Transfer collapse modal

`AccountTransferCollapseModal.tsx` — folds a detected pair of mirrored
bank entries (one outgoing, one incoming on the other account) into one
Transfer. Re-runs detection on every render, so once every pair is
collapsed the list is empty. The empty state distinguishes "you just
collapsed them all" (a success message) from "nothing was ever detected"
(the `noMatches` copy) via a `collapsedAny` session flag — without it a
successful collapse re-detects the now-hidden pairs as absent and reads
as a failure.

### Cover transfer

A `Transfer` carrying a `cover` payload (`CoverDetails` in
`src/data/types/accounts.ts`) that reimburses specific imported
transactions — expenses the user charged to the wrong account (a main
card) that "belong" to a savings / spending account. Data layer in
`src/data/accounts/cover-transfer.ts`: `generateCoverMessage` mints the
≤12-char bank reference (`COVER_MESSAGE_MAX_CHARS`), `coverTotal` sums the
covered magnitudes, `buildCoverIndex` / `coverKey` map each covered entry
to its cover transfer (the check-glyph lookup), and
`attachImportedCoverTransfers` is the silent import-time detector (run from
`importBankHistory`, mirroring `attachImportedLoanPayments`) that binds a
posted leg to its pending cover transfer by amount + date span or by the
reference message in the bank description, hides the leg
(`collapsedIntoTransferId`), and flips the cover to `completed`. The
endpoints may be an account **or** a saving — both keep their transactions
under their id in `UserData.history`. Created via `createCoverTransfer`
(reduced in `src/data/reducers/transfers.ts`). UI: `useCoverTransferFlow`
owns the modal state; `BudgetCoverTransferModal` (create — motivation +
account/savings source picker + live total) and `BudgetCoverInfoModal`
(read-only — total + message with copy buttons, covered list, motivation,
status) render in `BudgetModalHost`. Reachable from a history row's "…"
menu (`BudgetEntryActionsMenu`) and the bulk toolbar (`BulkActionBar`) in
both the budget tables and the transfer-search modal — the Cover action
only shows when every selected row is imported (historic), and Edit / Move
/ Delete are hidden for those (Copy stays). Covered transactions render a
check glyph after their description (`DescriptionCell`); tapping it — or a
synthesized cover-transfer row — opens the info modal. The set of
cover-transfer ids is threaded through `BudgetContext` (for the
transfer-row tap); the per-row covered/attributed markers are set on the
synthesized rows by `applyCoverRoles`.

**Spending attribution.** A covered expense belongs to the account that
covered it, not the one it was charged to. `applyCoverRoles`
(`src/data/accounts/cover-transfer.ts`, run in `BudgetPage`'s synthesis
memo) tags each reimbursed expense on the charged account with
`Row.coverRole = "covered"` — `isActualSpendingRow`
(`src/data/budget/spending.ts`) drops those from that account's Visualize-
spending stats, while they stay in its running balance (they really
happened, offset by the incoming cover transfer). For every cover transfer
the covering account _sources_, `applyCoverRoles` injects a read-only,
balance-neutral itemization row (`Row.coverRole = "attributed"`, resolved
from the charged account's history and re-synthesized against the covering
account's columns) so the spending counts there under each expense's
category. `computeBalances` (`src/data/budget/rows.ts`) skips
`coverRole === "attributed"` rows so they don't double the cover transfer's
own balance step; `BudgetRow` / `BudgetCell` render them fully read-only
(no swipe actions, no selection) like a transfer row, with the cover glyph
opening the info modal.

### Rename predictor

`AccountRenamePredictorModal.tsx` — the last step of every import that
has learned renames; each row carries an accept toggle + editable text,
the freshly-imported entry's date and signed amount (so the user can
verify the suggestion against the actual transaction — the rename
memory keys only on the normalised description and ignores the amount),
with Cancel / Skip / Apply renames in the footer.

## Items page

The owned-items catalog. Sheet type `"items"`. Files live in
`src/components/items/`.

### Items page

`ItemsPage.tsx` — the page root ("items catalog"). Renders a table of
every currently-owned `Item` (disposed items are hidden) with name,
purchased date, purchase value, and current (resale) value, plus a
footer totals row and a "+ add item" button. Modelled on the accounts
page. The seed `SheetItem` is `ItemsView` (a data-light marker; the
catalog lives in `UserData.items`).

### Item row

`ItemRow.tsx` — one item line. Left-swipe reveals edit (opens the Edit
item modal) and delete (confirm → `deleteItem`); pressing the name
opens a description popover when the item has a note. The current value
comes from `computeItemCurrentValue` in `src/data/items/value.ts`.

### Current value (item)

`computeItemCurrentValue(item, iso)` (`src/data/items/value.ts`), also
called "resale value": a disposed item is worth its `soldFor`; else the
latest dated value snapshot on or before `iso` (see **Update value
(item)**) wins; else a manual `resaleValue`; else the depreciation rule
decays the purchase price from `acquiredAt` — a steady declining balance
(`percentPerYear`) or the accelerated curve (`accelerated`: an instant
`initialDrop` % off the moment the item is no longer new, `firstYearRate`
% of the remainder across year one, then `ratePerYear` % per year after
that), never below `floor` — else the purchase price. The function is
date-aware so the Insights net-worth roll-up (`src/data/insights/`) can
sample it per month. `isItemOwned` is the predicate the Items table
filters on.

### Update value (item)

`UpdateItemValueModal.tsx` (`src/components/items/`, hosted by
`UniversalModalHost`, opened via the `open-update-item-value` modal
command from an item row's "…" overflow menu). Records dated value
snapshots so an item that **appreciates** (art, sculptures, collectibles)
tracks its rising value over time instead of sitting flat at its purchase
price. Each snapshot is an `ItemValuePoint` (`{ id, date, value }`)
appended to `Item.valueHistory` by the `addItemValue` reducer; a point is
removed by `deleteItemValue`. The item's purchase (`purchasePrice` at
`acquiredAt`) folds in as a read-only first point via
`resolveItemValueHistory` for display only — it is owned by the item's
purchase fields, not stored in `valueHistory`. The latest recorded point
on or before a date is the item's value at that date (see **Current value
(item)**), winning over both a static `resaleValue` and a `depreciation`
curve, so the recorded values flow straight into the net-worth graph and
total. Mirrors **Update value (property)** / the investment
`UpdateHoldingValueModal`.

### Find items modal

`ItemFinderModal.tsx` (hosted by `UniversalModalHost`, opened via the
`open-find-items` modal command from the Items sheet title "…" menu).
Scans imported bank history for likely item purchases
(`findItemPurchaseCandidates` in `src/data/items/find.ts`: outflows
only — `amount < 0` and `|amount| >= Settings.itemFindThreshold` —
restricted to `Settings.itemFindTypeIds` (seeded to a durable-goods
allow-list, `DEFAULT_ITEM_FIND_TYPE_IDS`; empty means scan every type),
dropping the hard `NEVER_ITEM_TYPE_IDS` denylist (rent, utilities,
subscriptions, … — never resaleable goods) regardless of the allow-
list, and skipping hidden / transfer / collapsed / ignored / excluded
entries plus fully-catalogued ones — an entry whose linked items'
`purchasePrice`s already cover its full amount drops out of the scan,
while a partial allocation keeps it). Per candidate: add line items
(opens the embedded
`BudgetLineItemsModal` → `linkLineItemsToHistoryEntry`), skip
(session-local), ignore one entry (`ignoreItemEntry` →
`UserData.ignoredItemEntryIds`), or exclude similar
(`excludeSimilarItemEntries` → `UserData.itemFindExclusionPatterns`, a
normalised-description key that drops every matching charge, past +
future).

### Exclude similar

The `CopyX` button on a Find-items candidate. Persists
`normaliseDescription(label)` to `UserData.itemFindExclusionPatterns`
via the `excludeSimilarItemEntries` reducer; the scanner then drops
every entry whose resolved description collapses to that key. Distinct
from ignore (a single `HistoryEntry.id`). Cleared via the Items
settings tab.

### Items settings tab

`src/components/SettingsModal/tabs/items.tsx` (`ItemsTab`) — edits the
"Find items" scan: `Settings.itemFindThreshold` (amount floor, seeded
per-currency by `getDefaultItemFindThreshold`), the
`Settings.itemFindTypeIds` allow-list, a "Clear ignored purchases"
button (`clearIgnoredItemEntries`), and a "Clear excluded patterns"
button (`clearItemFindExclusions` → `UserData.itemFindExclusionPatterns`).
Also hosts the Receipt name pattern picker (`Settings.receiptNamePattern`).

## Salary page

Salary over time. Sheet type `"salary"`. Files live in
`src/components/salary/`; data helpers in `src/data/salary/`.

### Salary page

`SalaryPage.tsx` — the page root ("salary sheet"). Renders
`UserData.salaries` as one `SalaryYearTable` per year (gross + net
totals). Select-many runs through the universal `BottomBar` select
toggle (state lifted into AppShell's `useSalaryBulkSelection`, not an
in-page button) and a salary-adjusted `BulkActionBar` (Edit employer /
tax + Delete, no Move / Copy); each year table gets a "select all in
year" header checkbox mirroring the budget month table. The seed
`SheetItem` is `SalaryView`, which carries `accountId` — the salary
account the sheet is bound to. Title menu: Add payslip (`SalaryAddModal`)

- Find salaries + Employers.

### Salary row

`SalaryRow.tsx` — one month's paycheck inside a `SalaryYearTable`.
Left-swipe (mobile) reveals edit / delete from behind the row, plus a
"…" overflow menu (`SalaryEntryActionsMenu.tsx`) whenever the backend
can hold payslips — its payslip entry ("Upload payslip" / "View
payslip") opens the shared attachment modal to upload / view / replace
/ remove the file. On desktop those icons sit inline. When a payslip is
attached (and the backend can read it), a small `FileText` icon also
sits beside the gross figure in the row — tapping it opens the same
attachment modal. Same `useRowSwipe` + `useClaimActiveRow` +
`.salary-table` overlay pattern as the budget / accounts / items rows.
Swipe is suppressed in bulk-select mode.

### Salary account

The bank account a salary sheet is bound to (`SalaryView.accountId`),
edited from the sheet's Edit sheet modal (`SheetModal.tsx`) exactly like
the budget sheet's account picker. It is where that person's pay lands;
Find salaries scans this account's history directly instead of asking
which account to scan each time, so one salary sheet per person each
points at their own pay account. Set via the universal `setItemAccount`
action (now covers `accountBudget` and `salaryView`). Nullable until
picked — the discovery walk's intro step then steers the user to Edit
sheet.

### Salary (object)

`Salary` in `src/data/types/salary.ts` (a "paycheck"). `net` = the bank
deposit (netto); `gross` = the entered brutto; tax = gross − net
(`salaryTax` / `salaryGross` in `src/data/salary/salary.ts`). Absence-
day counts (VAB / parental / vacation / sick) explain an off-average
month. Added from scratch — no backing bank transaction, for paychecks
older than the imported history reaches — via `SalaryAddModal.tsx` (the
Add payslip title-menu / empty-state action), which leaves
`sourceHistoryId` / `sourceRowId` absent. Edited via `SalaryEditModal.tsx`,
which can also attach a payslip (`Salary.payslipPath`).

### Find salaries

`SalaryDiscoveryModal.tsx` — a guided, year-by-year walk driven by
`discoverSalaries` (`src/data/salary/discovery.ts`). It scans the
sheet's bound salary account (`SalaryView.accountId`) — no in-walk
account picker; the intro step just confirms the bound account and
previews its clusters, or steers the user to Edit sheet when none is
bound — reading that account's full bank history
(`data.history[accountId]`) via `detectRecurringCandidates` from the
earliest deposit forward (no date floor, no future projection). The
account step then lists the pay periods (clusters) instead of a single
average — each stretch between raises / title changes / employer
changes, with its month range, tenure length, and typical net
(`summariseSalaryClusters`); a step up is a "Raise", a permanent drop
is "Likely new employer" (an employer can't permanently cut pay). A
per-year step then lists every detected paycheck (amount + month,
unusual ones tagged) so the user sees exactly what "Accept all" adds.
The per-segment baseline stays internal — it is the cluster's median
net and only flags off months (a paycheck more than
`SAME_SALARY_TOLERANCE`, 10 %, from its own segment's median is tagged
"Unusual" — a likely vacation / sick / bonus month), it is never an
editable field and is never written onto a salary. From there the walk
can step month-by-month to accept / edit / skip. Job-change / raise
segmentation is shared with `detectSalaries` via `assignEmployerGroups`,
which also reports `raises` — boundaries whose new level is a sustained
increase, labelled "Raise" in the walk instead of "Likely new
employer". A salary-typed transaction only boosts confidence — the
trigger for the walk is the absence of top-level `Salary` objects, not
of tagged rows. Added salaries link back via `Salary.sourceHistoryId`
for dedupe. When the paychecks already added all trace back to bank
deposits sharing one description (`confirmedSalarySignal`), that
description is fed back into the scan as a confirmed signal: discovery
then also surfaces every other deposit under it that landed within the
confirmed payout-day window (the day-of-month span those paychecks
landed in). That recovers months the recurring-cadence family dropped —
a reduced parental-leave month, a half-month for a new hire — and works
even when too few deposits exist for any recurring series to be
detected; the day-of-month guard keeps a same-description mid-month
reimbursement out of the suggestions.

### Employer

`Employer` (`UserData.employers`) referenced by `Salary.employerId`;
managed in `EmployerManageModal.tsx`. A `Role` = `{ id, title }` (no
dates, the "job title"); a salary points at the role it was paid under
via `Salary.roleId`, and the title shown for a salary is that role's
(`roleForSalary`). A role's effective span is derived from the min/max
payment date of the salaries referencing it (`roleDateRange`), shown
read-only in `EmployerManageModal`. Assign a title to many paychecks at
once with Set job title in the salary mass edit (`SalaryBulkEditModal`),
which find-or-creates a role on each selected salary's employer
(`bulkSetSalaryRole`, `findRoleByTitle`); a blank title clears it.
Changing a salary's employer drops its now-orphaned `roleId`. Picked
with `EmployerPicker.tsx`, whose dropdown has an inline "New employer"
footer (name + colour + an industry glyph from `EMPLOYER_GLYPH_NAMES`,
defaulting to a briefcase) so a workplace can be added without leaving
the salary flow; roles are filled in later from `EmployerManageModal`.

### Bulk tax rate

`SalaryBulkEditModal.tsx` — sets an employer or a tax percent on many
salaries at once ("skattejämkning"). The percent derives each salary's
gross from its own net (`grossFromNetAndRate`, dispatched as
`bulkSetSalaryTaxRate`).

### Tax profile

A reusable, named bundle of tax inputs (`TaxProfile` on
`UserData.taxProfiles`): country, municipality, church membership,
birth year, income type. Created / edited in `TaxProfileModal.tsx`,
picked for a salary sheet with `TaxProfilePicker.tsx` inside
`SheetModal`. Referenced from `SalaryView.taxProfileId` so several
salary sheets can share one. Drives the estimated gross on the Salary
page.

### Estimated gross

When a salary has no entered gross and the sheet has a tax profile
bound, the Salary page back-calculates the gross (and tax) from the net
deposit using `resolveSalary` / `resolveSalaryGross`
(`src/data/salary/salary.ts`), which inverts the country tax engine
(`grossFromNetMonthly` in `src/data/tax/engine.ts`). The estimate uses
the paycheck's own tax year. Rendered muted + italic with a "≈" prefix;
an entered gross always overrides it. Country rules live under
`src/data/tax/<cc>/` (Sweden: `src/data/tax/se/`).

### Municipality picker

`MunicipalityPicker.tsx` — a searchable button + listbox over Sweden's
~290 kommuner (`MUNICIPALITIES` in `src/data/tax/se/municipalities.ts`),
shown in `TaxProfileModal`. Each option shows the kommun's combined
(municipal + regional) rate.

## Properties page

Owned homes, their mortgages, and their repairs. Sheet type
`"properties"`. Files live in `src/components/properties/`; data helpers
in `src/data/property-mortgage/` and `src/data/property-repairs/`, with
the shared mortgage math (amortisation, interest, payment split) in
`src/data/finance/` — it's also consumed by the Loans and Insights
pages.

### Properties page

`src/components/properties/PropertiesPage.tsx` — the page root
("Properties sheet"). Renders `UserData.properties` as one
`PropertyCard` per property, plus an "Add property" button. The seed
`SheetItem` is `PropertiesView` (a data-light marker; the catalog lives
in `UserData.properties`). Title menu: Edit sheet. Owns all the property
/ mortgage modals locally and dispatches the property actions directly.

### Property

`Property` in `src/data/types/properties.ts` — one home / apartment the
user owns: `name`, optional `companyId` (the lender, referencing
`UserData.companies` — one bank per property, the strong signal Find
mortgage payments uses; swept on the `deleteCompany` cascade / on load
like `Row.companyId`), optional bound `accountId` (the bank account
whose history Find mortgage payments scans — one account per property,
shared across all its mortgages because a property is paid to the bank
as a single charge covering every loan; a dangling reference is dropped
to `null` on load), optional `purchaseAmount` (what it was bought for) +
`purchaseDate`, optional `soldDate` + `soldAmount` (the sale that ended
the ownership — see [Sold property](#sold-property)), optional `size`
(living area in square metres), optional
`rooms` (number of rooms), a
`valueHistory` of value points, `mortgages`, `repairs`, `files` (uploaded
documents / photos — see Property file), and an optional `saleEstimate`
(the saved Net sale profit inputs). Created / edited via
`PropertyEditorModal.tsx` (`addProperty` / `updateProperty`; the
editor's lender is a `CompanyPicker`, its account a bespoke account
picker); deleted via a confirm (`deleteProperty`). Rendered by
`PropertyCard.tsx`, which shows the lender and the bound account as
stats and a "… actions menu" (`PropertyActionsMenu`) in its header.

### Property size

`Property.size` is the living area as a bare square-metre number. The
unit it renders with is a global display preference,
`Settings.propertySizeUnit` (`"kvm"` | `"sqm"`, default `"kvm"`; both
mean square metres), edited in the Property settings tab. The card and
editor append the chosen label next to the number.

### Property rooms

`Property.rooms` is the number of rooms in the property, a bare
non-negative number. Sweden counts half-rooms ("rok"), so fractional
values like `1.5` are allowed. Entered in `PropertyEditorModal` and shown
as a stat on `PropertyCard`. Optional and additive — absent until the
user records one, so old budgets simply lack it and no migration is
needed.

### Property fee

`Property.fee` is a flat recurring monthly charge to hold the property,
separate from any mortgage — the Swedish bostadsrätt "avgift" to the
housing association, or an equivalent HOA / service fee. A non-negative
number in the user's currency, entered in `PropertyEditorModal` and
shown as a stat on `PropertyCard` (formatted with the currency, like the
purchase amount). Optional and additive — absent until the user records
one, so old budgets simply lack it and no migration is needed.

### Association loan

`Property.associationLoan` (`AssociationLoan` in
`src/data/types/properties.ts`) is the property's share of a housing
association's own debt — the Swedish bostadsrätt case, where the förening
carries loans you indirectly own a slice of through your apartment. It is
not a loan you pay to a bank directly: its interest is baked into the
monthly fee, which is why a flat with a high `fee` often hides a large
indirect debt. Entered the way an _årsredovisning_ (annual report) reports
it — `loanPerSize`, a figure per unit of living area (e.g. 6,000 kr/kvm),
plus the association's annual interest `rate`. The property's own share is
`loanPerSize × area` (`associationLoanShare` in
`src/data/property-value/interest.ts`), and the indirect interest is
charged on that share at `rate`. The `area` is the association's own
lägenhetsförteckning figure when recorded — an optional
`AssociationLoan.size` that can differ from the measured living area (a
flat measured at 82 kvm may be registered as 80, so its debt share is
lower) — falling back to the property's measured `size` otherwise. All
non-negative. Entered in `PropertyEditorModal`; surfaced only by the
Visualize-value chart's association-interest toggle (see below).

The figures restate over the loan's life — a new _årsredovisning_ each year
gives a fresh loan-per-area and rate — so the loan carries an
effective-dated `history` (`AssociationLoanChange[]`, both figures changing
together), mirroring a mortgage's `rateHistory`. The most recent entry by
date is the current loan, mirrored onto the headline `loanPerSize` / `rate`;
`resolveAssociationLoanAt(loan, date)` (`src/data/property-value/interest.ts`)
walks the list to the figures in effect on any date, so
`cumulativeAssociationInterestAt` accrues each historical month at the
figures that applied that year. A blank `date` marks the original figures.
The registered `size` is a fixed property of the flat, so it is **not** part
of the yearly history — only the loan figure and rate change. The editor
collapses a single original-figures row to the headline only (no history
clutter), exactly as the mortgage rate editor does.

Optional and additive — absent until the user records one, so old budgets
simply lack it. The v80 validator drops an all-zero loan to absent so it
stays byte-identical to a property that never set one, keeps the registered
`size` only when positive (otherwise the share falls back to
`Property.size`), and validates each `history` entry leniently (malformed
dropped, ids deduped). It is deliberately **not** folded into the
Insights net-worth roll-up: it is an indirect liability already reflected
in the fee, and modelling it as net-worth debt would be a separate
decision.

### Sold property

A property owned in the past — `Property.soldDate` (ISO sale date) plus
optional `Property.soldAmount` (the sale price), both set in
`PropertyEditorModal` (the amount field appears once a sale date is
picked; the amount only persists alongside a date — the validator drops
an amount with no date to ride with). `isPropertySoldAt(property, iso)`
(`src/data/property-value/value.ts`) answers "was it already sold at
this date?", inclusive of the sale date itself. The property stays in
`UserData.properties` with all its history — value points, repairs,
mortgage payments, files — so old bank charges keep attributing to the
right home. What changes: `PropertyCard` shows a "Sold" header badge
plus "Sold for" / "Sold" stats, `PropertiesPage` sorts sold properties
after the owned ones, the net-worth math drops the property's value AND
its mortgage debt from every sample on/after the sale date (and gives
it no snapshot breakdown row — the proceeds are cash the account
balances already count), and Find mortgage payments stops attributing
charges after the sale (`toDate` in `discoverMortgagePayments`, the
symmetric cut-off to the purchase-date one; the expected window the
"highly probable" promotion judges completeness against ends at the
sale month). Both fields are optional and additive — no migration. The
sale-handover export deliberately omits them: the archive is for the
property's buyer, whose ownership is just beginning. Recording a first
sale date unlocks the `propertySold` achievement.

### Property settings tab

`src/components/SettingsModal/tabs/properties.tsx` (`PropertiesTab`) —
Properties-page preferences. Hosts the size unit picker
(`Settings.propertySizeUnit`), the **Repairs / Renovations subtypes**
admin (`SubtypesAdmin` with `bucket="repairs"` — rename / delete; new
subtypes are minted from the repairs editor), and the **file categories**
admin (`FileCategoriesAdmin` — create / rename / delete the subfolders
property files are filed under). Registered in `TAB_REGISTRY` with the
`Home` icon.

### Current value (property)

`PropertyValuePoint` (`{ id, date, value }`) on `Property.valueHistory`.
A property's purchase is its first value: `resolveValueHistory`
(`src/data/property-value/value.ts`) folds a synthesised purchase point
(`purchaseAmount` at `purchaseDate`, id `"purchase"`) into the history so a
property with a dated purchase always shows at least one value, without
storing a duplicate snapshot. The point is suppressed when a recorded
snapshot already sits on the purchase date (older budgets, an imported
property), so it never doubles up. A property's current value is the latest
point by date with the purchase folded in (`currentPropertyValue`), used by
the card stat grid and the Net sale profit prefill. The current-value figure
in the card's stat grid is a button — pressing it opens the **Update value**
modal (`UpdatePropertyValueModal.tsx`), which appends one point
(`addPropertyValue`); the modal lists every value (including the synthesised
purchase point, tagged "Purchase" and not deletable — change it by editing
the property) and deletes past recorded points (`deletePropertyValue` /
`updatePropertyValue`). Recorded values are manually entered — there is no
automatic valuation.

### Mortgage

`Mortgage` in `src/data/types/properties.ts` — a loan against a
property: `name`, optional loan terms (`loanAmount` — the sum borrowed,
`currentBalance` — outstanding now, `interestRate` — the current annual
%, `rateHistory` — effective-dated past rate changes, `rateChangeMonths`
/ `nextRateChangeDate`, `amortization` — monthly amortisation as either
an annual percent of the initial loan or a fixed sum per month, resolved
by `resolveMonthlyAmortization` in
`src/data/finance/amortization.ts`. A **percent** plan is taken against
the property's **combined** initial loan, not the single mortgage's own:
Swedish "amorteringskrav" is set on the property's total debt, so a
property carrying a large interest-only first loan plus a small amortising
top-up amortises (say) 2% of the _combined_ original loan, charged against
the top-up. The basis is `propertyInitialLoanTotal(property.mortgages)`
(sum of every mortgage's `loanAmount`), threaded into the resolvers as
`percentBasis` and defaulting to the mortgage's own `loanAmount` so a
single-mortgage property is unchanged. `paymentCadenceMonths` —
how often amortisation + interest is charged in months (1 = monthly, the
default; 3 = quarterly, etc., picked in the editor's "Payment frequency"
dropdown), `loanStartDate` — when the loan started being paid, falling
back to the property's `purchaseDate`), and `payments`. The last two feed
Find mortgage payments' "highly probable" check: it counts how many
charges to expect since `loanStartDate` at the `paymentCadenceMonths`
cadence, so a clean run that covers only part of that window isn't
promoted. The
lender and the bound account both live on the parent Property, not here
(one bank / one account per home — every loan against it is paid to the
same account as a single charge). A property can carry several. Created
/ edited via `MortgageEditorModal.tsx` (`addMortgage` / `updateMortgage`,
both carrying the parent `propertyId`; the interest field is a
rate-history editor); deleted via a confirm (`deleteMortgage`). Surfaced
on the `MortgageRow` in `PropertyCard` with its current rate and payment
count; the property's active payment account is what Find mortgage payments
pre-selects to scan (the walk can add more accounts).
The `rateChangeMonths` reset cadence shows as a pill next to the rate —
read in months below a year ("monthly", "3 months") and in whole years at
or above one ("yearly", "2 years"), since a reset interval is always a
whole number of months and of years once it reaches a year.

### Mortgage payoff bar

The slim progress bar on each `MortgageRow` in `PropertyCard` labelled
"Paid off" (the "power bar"). Shows the share of the original loan
amortised away — `mortgagePayoffProgress(mortgage)` in
`src/data/property-mortgage/progress.ts` = `(loanAmount − currentBalance)
/ loanAmount`, clamped to [0, 1]. The percentage is rendered with two
decimals via `formatRate` (e.g. "82,35 %"), capped just below 100 until
the loan is actually paid off so it never reads "100 %" early. 0 % when
the balance still equals the loan, 100 % (full green bar + a check,
`--success`) when the balance reaches zero. Hidden when either
`loanAmount` or `currentBalance` is
unset. Interest paid is deliberately excluded — only amortising the
principal pays the loan _off_. Reaching 100 % unlocks the `mortgageFree`
achievement. When the mortgage has recorded payments, the bar doubles as
a collapse toggle (a chevron on the "Paid off" label): the Paid /
Interest / Amortisation breakdown card below it starts hidden and is
revealed by pressing the bar. With recorded payments but no loan terms
(so no bar to press) the breakdown stays always-on.

### Unified mortgage view

The summed presentation of a property's mortgages, the default on a card
that carries two or more loans. `UnifiedMortgageView` in `PropertyCard`
renders one card from `aggregateMortgages(mortgages)`
(`src/data/property-mortgage/aggregate.ts`): combined `currentBalance` and
`loanAmount`, the **effective rate** (balance-weighted annual rate — each
loan's rate weighted by the balance it accrues on, so an unrated or
zero-balance loan doesn't drag it), total monthly interest and
amortisation (Σ of the per-loan `resolveMonthlyInterest` /
`resolveMonthlyAmortization`), an aggregate payoff bar over the combined
principal, and a combined paid breakdown — all sharing the per-mortgage
`PayoffSection` so the summed and split views behave identically. Each
total is hidden when no mortgage supplied it. The combined balance also
carries a parenthetical loan-to-value share — combined balance ÷ the
price the property was bought for (`Property.purchaseAmount`), the way the
bank reads LTV, rounded to a whole percent (`6 028 400 (82%)`) — shown only
when both figures resolve and the purchase amount is positive, so a missing
or zero value hides it. The **split view** (the
toggle's other state) is the per-loan list of `MortgageRow`s, where an
individual loan is edited or deleted; the unified card carries no per-loan
controls. The toggle is a two-glyph segmented control
(`MortgageViewToggle`) to the right of the mortgage section actions — one
glyph per view, molded into a single track, with an "active" pill that
slides between them when the view changes. It defaults to unified and is
ephemeral per-card local state (resets on reload, like the payoff
breakdown toggle). Switching into unified unlocks the
`unifiedMortgage` achievement. A property with 0 or 1 mortgage always shows
the split row(s) and offers no toggle.

### Mortgage section actions

The glyph buttons at the right of a property card's "MORTGAGES" section
header (`PropertyCard.tsx`): a **View payments** button (receipt glyph,
shown only when a mortgage has recorded payments) and a **Find mortgage
payments** button (magnifier glyph, shown whenever the property has ≥ 1
mortgage). Find opens the `MortgageDiscoveryModal` scoped to that
property (its `initialPropertyId`); the modal's own picker can still
switch to another property. The unified ⇄ split view toggle is a
two-glyph segmented control (`MortgageViewToggle`) to the right of these
buttons — see the **Unified mortgage view** entry. "Add mortgage" lives
in the property's "…" menu (`PropertyActionsMenu`).

### Mortgage rate change

`MortgageRateChange` (`{ id, date, rate }`) on `Mortgage.rateHistory` —
an effective-dated annual interest rate. The rate became `rate`% on
`date` (blank `date` = the original rate, effective from the start) and
holds until the next change; the latest by date is the current rate
(mirrored onto `Mortgage.interestRate`). `resolveRateAt(mortgage, date)`
in `src/data/finance/interest.ts` walks it to the rate in
effect on any date, so a historical payment's interest is computed at
the rate that actually applied that month. Absent ⇒ `interestRate` is
used for every date.

### Mortgage amortisation change

`MortgageAmortizationChange` (`{ id, date, amortization }`) on
`Mortgage.amortizationHistory` — an effective-dated amortisation plan,
the exact analogue of a rate change. The plan `amortization` (a percent
of the initial loan, or a fixed monthly sum) became effective on `date`
(blank `date` = the original plan, effective from the start) and holds
until the next change; the latest by date is the current plan (mirrored
onto `Mortgage.amortization`). Banks step the amortisation requirement
over a loan's life (Swedish "amorteringskrav" falls as the
loan-to-value ratio drops, e.g. 3% → 2% → 1%), an exact, round change —
not the small month-to-month drift the interest leg carries.
`resolveAmortizationPlanAt(mortgage, date)` /
`resolveMonthlyAmortizationAt(mortgage, date)` in
`src/data/finance/amortization.ts` walk the history to the plan in
effect on any date, so a recorded payment's amortisation leg is taken
from the plan that actually applied that month and **steps** on the
first charge after a change. Absent ⇒ the current `amortization` is used
for every date. Edited as a list of dated rows in `MortgageEditorModal`
(one percent/fixed mode toggle for the whole loan), mirroring the
rate-history editor.

### Mortgage payment

`MortgagePayment` (`{ id, date, amount, sourceHistoryId?, sourceAccountId? }`)
on `Mortgage.payments`. One mortgage's share of a monthly charge. A
property is paid to the bank as a single transaction covering every loan
against it, so Find mortgage payments splits each found transaction
across the property's mortgages (`splitPaymentAcrossMortgages` in
`src/data/finance/payment.ts` — each loan's amortisation is
settled in full first, then each loan is pinned to its **own** computed
interest for that month, with only the residual shared out). Each loan's
interest is taken on the balance reconstructed for the charge's date by
`balanceAt` (`interest.ts`), not a flat snapshot of today's balance: a fixed
interest-only loan's reconstructed interest is constant month over month,
while an amortising loan's falls as it pays down. `balanceAt` reconstructs
the balance **forward from the original loan amount** (`loanAmount` minus the
amortisation accrued from the loan's effective start —
`mortgage.loanStartDate ?? property.purchaseDate` — to the charge's date)
whenever that start is known; otherwise it walks `currentBalance` back along
the deterministic monthly amortisation, capped at `loanAmount`. The forward
anchor is what makes the interest correct for a **sold property**, whose
`currentBalance` is zeroed at the sale: walking back from that zero would
understate every historical balance and charge far too little interest. Crucially the interest is used as the loan's **absolute**
share, not as a weight to apportion the leftover — so a charge that shrinks
month over month because one loan is paying down is attributed to that loan,
and an interest-only loan at a static rate keeps a constant share instead of
drifting down with it. Only the residual (the gap between the charge's actual
interest and the modelled total — the model's estimate error) is shared out,
and it rides the amortising interest-bearing loans by amortisation weight, so
the fixed loan never absorbs another loan's amortisation-driven decline. When
no interest-bearing loan amortises the residual is shared by interest weight
instead (it is interest and only they can hold it). It records one payment per
mortgage, all sharing the transaction's `sourceHistoryId` (the 1-1 link

- the re-scan dedupe key) plus its `sourceAccountId` (which account that
  transaction lives in — the walk can scan several at once, so a charge
  isn't always drawn from the property's main account, and the payments
  view needs the account to resolve the bank row back). `PropertyCard`
  sums a mortgage's payments as
  its Paid total, broken down beneath into the cumulative interest and
  amortisation (`splitRecordedPayment` in
  `src/data/finance/payment.ts` inverts the amortisation-first
  split: amortisation = the mortgage's monthly amortisation **for the plan in
  effect on the charge's date** (`resolveMonthlyAmortizationAt`) capped at the
  recorded amount, interest = the rest). The amortisation leg is the loan's
  plan figure — a fixed sum or an exact percent of the _initial_ loan — so it
  is a **constant** that does not move with the balance: it is identical across
  every charge of the same plan, and the whole month-to-month difference
  between charges (the balance falls, so the rate accrues less interest) lands
  on the interest leg. The split deliberately does not reconstruct the balance
  to re-derive interest and let amortisation absorb the remainder — that made
  the amortisation leg drift a few currency units every month instead of
  holding flat. A genuine amortisation-plan change steps the plan by a whole
  tier (e.g. 3% → 2%); the exact, round step comes from the loan's recorded
  `amortizationHistory` (see Mortgage amortisation change), so the amortisation
  leg steps on the first charge after the change while interest holds — not from
  inferring it out of the recorded charge, which only manufactures drift. Added
  in bulk via
  `addMortgagePaymentsForProperty` (one undo entry for the whole
  property), re-balanced within a charge via `setMortgageChargeSplit`, or
  deleted individually (`deleteMortgagePayment`) — all surfaced in the
  Mortgage payments view.

### Mortgage payments view

`MortgagePaymentsModal.tsx` — a per-property list of all recorded
mortgage payments, opened from the View payments glyph button in the
property card's "MORTGAGES" header (shown only when the property has ≥ 1
payment). Rows
are grouped by the monthly charge they came from (`groupPaymentsByCharge`
in `src/data/finance/payment.ts` — keyed by `sourceHistoryId`,
falling back to date) with a per-charge total, one row per mortgage's
share rendered as a glyph-headed table with a leading Loan (`Landmark`,
label on desktop / glyph only on mobile) column plus Amortisation (↘) /
Interest (%) / Amount columns (`splitRecordedPayment` derives the
per-row split) — all headers left-aligned with accent glyphs, matching
the items / salary tables (the mobile `.mortgage-payments-table` grid
uses fixed money-column tracks so the per-row grids line up). The
per-charge header bar (date + total) becomes a button when the charge
carries a `sourceHistoryId`: pressing it opens a popover (the shared
`FloatingPanel`) showing the original bank transaction it was split from
— description, date, amount, balance, account — resolved live from the
source account's history (`MortgageChargeGroup.sourceAccountId` +
`sourceHistoryId` → `UserData.history[sourceAccountId]`, threaded in by
`PropertiesPage` as the `sourceTransactions` map keyed by
`${accountId}:${entryId}` and covering every account the property's
payments reference). The source account is the one recorded on the
payment, falling back to the property's main `accountId` for legacy
payments that predate `sourceAccountId` — so a charge drawn from any
account "Find mortgage payments" scanned, not only the property's main
one, traces back to its bank row. Hand-entered charges (no
`sourceHistoryId`) keep a plain, non-interactive bar. Each row carries edit + trash in a
trailing actions column — inline on desktop, hidden behind a left-swipe
on mobile via the shared `useRowSwipe` / `useClaimActiveRow` pattern
(the `.mortgage-payments-table` rules in `src/styles/components.css`
mirror the items / salary two-button strip). Edit
(`MortgagePaymentEditModal.tsx`) changes one mortgage's share: the
charge total is fixed, so pinning the edited amount re-splits the
remainder across the charge's other mortgages
(`splitPaymentAcrossMortgages` — amortisation first, then interest),
previews the re-balance, and writes the whole charge atomically via
`setMortgageChargeSplit` (one undo entry); the date applies to the whole
charge. Trash removes that single record (`deleteMortgagePayment`). Both
unlock the `paymentLedger` achievement. A footer "Delete all" button
(shown only when ≥ 1 payment exists) clears every recorded payment
across the property's mortgages in one undo entry
(`deleteAllMortgagePayments`), behind a confirm — the escape hatch when
the recorded payments are wrong and the user wants to re-run Find
mortgage payments from scratch. A footer "Unaccounted for" summary
(`reconcileMortgageAmortization` in
`src/data/finance/payment.ts`) lists any mortgage whose
recorded amortisation doesn't reconcile with `loanAmount −
currentBalance` — a positive gap means a payment is missing, a negative
one means the balance / loan figure is off; only shown for loans with
both figures and a ≥ 1 difference.

### Find mortgage payments

`MortgageDiscoveryModal.tsx` — a per-property walk opened from the Find
mortgage payments glyph button in a property card's "MORTGAGES" header
(scoped to that property via `initialPropertyId`), driven by
`discoverMortgagePayments` (`src/data/property-mortgage/discovery.ts`).
The modal's picker can still switch to another property. The walk scans one
or more accounts' history: a multi-select **Accounts** dropdown
(`AccountMultiPicker`) is pre-set to the property's active payment account
(`Property.accountId`) but can take several at once — a loan's payments can
move between accounts over time, and the merged history (deduped by entry
id) is scanned as one. It resolves each
entry's effective company / type via `resolveEntryLabels` and anchoring
on the charges tagged with the property's lender (`Property.companyId`)
and/or the `preset-type-mortgage` type, on the descriptions of payments
already recorded, AND — whenever the loan terms resolve an expected
figure — on the maths, all at once: every recurring outflow whose
typical charge lands within `MORTGAGE_AMOUNT_ANCHOR_TOLERANCE` (±20 %)
of an expected figure (combined or per-loan) is also offered as a
candidate. All three strictness levels are surfaced at once and ranked
by strictness (`anchorRank`: tagged → payment-seeded → amount-only),
then by closeness within a level — rather than a winner-takes-all
cascade, so a single unrelated charge to the lender bank (a card fee
billed by the same bank) can't be the only tagged anchor that shadows
the mortgage: the fee is dropped as implausible and the maths-found
charge still appears below any genuine tags. The reported `seed`
reflects the leading surfaced series (`"tags"` / `"payments"` /
`"amount"`); only with no tag, no payment, and no loan terms is there
nothing to go on (`seed: "none"` → a nudge to tag a month). Charges are
grouped by a finder-local `financeGroupKey` — the EXACT bank description
(trimmed only). A recurring mortgage charge's description is static per
property (byte-identical every month, even as the amount drifts with the
rate), and a Swedish autogiro reference like "Avibetalning 9120-3273663"
carries the same reference on every payment for that property while a
different property's charge carries a different one — so matching
verbatim both coalesces one property's months into a single series AND
keeps two properties whose charges share a prefix ("Avibetalning …")
apart, so one property's payments are never offered for another (the
amount band alone can't separate them when their payments are close in
size). A charge that is nothing but a reference number normalises to
empty (`isNormalisedKeyMeaningful(normaliseDescription(...))` is false)
and is instead salvaged into the nearest expected-figure amount group. The whole funnel (entries dropped
as inflows / collapsed transfers / meaningless descriptions, every
grouped candidate with its amount, `targetDelta`, and keep/drop reason)
is returned as `result.diagnostics` and logged to the in-app Logs tab
under the `mortgage-finder` scope so a "no matches" report can be
diagnosed. From each anchored charge it learns the bank description and
sweeps the history for matching charges, clustering each group's charges
into payment occurrences by a day-gap (`MORTGAGE_OCCURRENCE_MIN_GAP_DAYS`,
two weeks) rather than by calendar month — two charges at least two weeks
apart are distinct payments and both survive (so a weekend-slipped charge
that shares a calendar month with the next payment is no longer thrown
away by a one-per-month winner), while charges closer than that (a
reversal + repost) fold into one with the larger draw standing in. It
drops any occurrence outside the ownership window — before the property's
`purchaseDate` or after its `soldDate` — outright (a payment can't
predate ownership, and a sold home stopped being charged at the sale)
and centres the amount band on the surviving owned occurrences.
Series rank a highly probable charge first (`highlyProbable`) — one whose
typical amount lands within `MORTGAGE_AMOUNT_ANCHOR_TOLERANCE` of an
expected figure. A charge the user marked as the mortgage (a company /
type tag) or whose description matches an already-recorded payment is
promoted on that amount alone: the metadata vouches for it, so a
weekend-slipped or missed month doesn't demote it. An **amount-only**
charge has no such metadata, so it additionally has to recur on its
loan's cadence with no gaps (`regularCadence`: consecutive months spaced
by `paymentCadenceMonths`, over ≥ `MORTGAGE_RECURRENCE_MIN_MONTHS`
occurrences) under one stable description (not amount-salvaged) AND cover
the whole window the loan has been active (`windowCovered`: charges from
the loan start — `loanStartDate`, or the purchase — to the latest outflow
the account has seen, or the sale month for a sold property, at that
cadence, allowing one missing slot). The window leg is what keeps an
amount-only charge that recurs cleanly for only the last five of eight
expected months (started late, or stopped) out of the promotion — it
stays an ordinary candidate. Only one
charge is promoted per expected figure (combined, or per-loan): among the
eligible candidates for a figure the strongest by the
usual strictness-then-closeness order wins, so a second clean-but-wrong
charge near the same figure never also lights up, while a property paid
as one draw per loan can light up each loan's charge. A complete
recurrence + matching amount + stable text trumps the tag / company
anchor and leads even over a tagged charge (marked "Highly probable" in
the modal, standout `--success` styling). The modal threads
`targetSchedules` (parallel to `targetAmounts`: each loan's start +
cadence, index 0 the combined) into the walk; the per-target funnel logs
each candidate's `regularCadence` / `coversExpectedWindow`. Below that they
rank by strictness (tagged / payment-seeded above amount-only), then by
closeness to the expected combined figure (Σ `resolveMonthlyPaymentAt`
across the mortgages — `targetDelta`); any whose typical charge is more
than `MORTGAGE_PLAUSIBILITY_FACTOR`× off every expected figure is
dropped as too far from the maths to be the payment (only when the loan
terms resolve a figure). The user ticks charge groups; the walk pre-checks
only the "highly probable" charges when any surfaced (so the weaker
candidates are opt-in), falling back to pre-checking just the leading
(best-ranked) candidate when none were promoted — a single mortgage almost
always maps to one recurring charge, so the long tail of weak one-off
matches stays unchecked rather than being bulk-selected
(`defaultSelectedSeriesKeys`). Each month within
the ± band (a `Slider`, default ±10 % `DEFAULT_MORTGAGE_TOLERANCE`, up to
±200 % for a rate that swung hard, `monthsWithinBand`) is split across the
mortgages by their amortisation +
dated interest and recorded via `addMortgagePaymentsForProperty`,
deduping months already added via the `sourceHistoryId` set. The action
also carries `entryRefs` — the source bank entries behind the accepted
payments — and the properties reducer stamps each with
`userTypeId: preset-type-mortgage` and the property's lender
(`Property.companyId`) as `userCompanyId`, folded into the same undo entry
so the metadata reverts with the payments; a property with no lender stamps
only the type. This write-back carries the finder's own type / company
anchors forward onto every charge it accepts, so the budget view and search
see the mortgage metadata without any per-entry tagging by hand.

### Property repair

`PropertyRepair` (`{ id, date, amount, description, typeId, subtypeId?,
accountId, sourceHistoryId, additionalSources?, receipts? }`) on
`Property.repairs` in `src/data/types/properties.ts` — a repair /
renovation on a property, sourced from one or more bank charges the user
tagged Repairs (`preset-type-repairs`, drill glyph) or Renovations
(`preset-type-renovations`, paint-roller glyph). `typeId` picks the
glyph / label; `description` is the user's editable label for the work;
the optional `subtypeId` classifies it as a `Subtype` under that type.
The primary source (`accountId` + `sourceHistoryId`) locates the host
`HistoryEntry` that resolves the row's company / tags; `additionalSources`
(`{ accountId, entryId }[]`, optional) are the rest of the transactions
paying one invoice; `amount` is the sum across every source, and
`repairSources` / `repairSourceCount` (`src/data/property-repairs/sources.ts`)
flatten primary + additional into one list. The receipts are owned by the
repair itself (`receipts?: RepairReceipt[]`, each `{ id, path, date }`) —
a job often arrives as several dated invoices (a deposit at the start, a
balance at the end), so a repair holds a _list_, decoupled from any
transaction (managed through the property-attachment hook
`usePropertyAttachments`; `repairReceipts` / `hasReceipt` in
`src/data/property-repairs/receipts.ts` normalise the optional field).
Each receipt files into the property's `<name>/receipts/` subfolder inside
the backend's per-property `properties/` store (a sibling of the `files/`
tree uploaded documents land in), named `<date> <company> - <description>`
(`buildRepairReceiptPath` in `src/data/items/receipt-name.ts`) using the
_receipt's own_ date, so the folder reads like a dated log; a new receipt
defaults its date to the repair's date but is editable, and changing it
(or editing the repair's company / description, or renaming the property)
re-files the bytes to the new canonical path (`setRepairReceiptDate` /
`renameRepairReceipts`). Recorded for a future deductible "net value of a
property" calc — a repair with no receipts is flagged "missing receipt".
Added with one-or-more transactions + description + subtype, or in bulk
(one per charge) via `addRepairs`, edited (transactions + description +
subtype) via `updateRepair`, removed via `deleteRepair`; receipts are
attached / re-dated / detached via `addRepairReceipt` /
`updateRepairReceipt` / `removeRepairReceipt`; all nest under the
property, so `deleteProperty` drops them with it (their receipt bytes are
orphaned, like a deleted row's). Its company and tags are deliberately
NOT stored here — they live on the primary `HistoryEntry` (`userCompanyId`
/ `userTagIds`) and resolve live, so the same metadata enriches the
budget view; the repair editor edits them on the transaction. The first
repair unlocks the `firstRepair` ("Fixer-Upper") achievement; grouping
more than one transaction under a repair unlocks `groupedRepair`
("Itemized").

### Repair receipt

`RepairReceipt` (`{ id, path, date }`) — one dated invoice document on a
`PropertyRepair.receipts` list (`src/data/types/properties.ts`). A repair
owns several because a single job is often paid across several invoices
over time (a deposit, a balance, staged payments), each sent on its own
date — the repair's own date can't stand in for all of them. `path`
locates the bytes in the backend's per-property `properties/` store
(`<name>/receipts/…`); `date` is the receipt's own date and drives the
dated filename. `repairReceipts` / `repairReceiptCount` / `hasReceipt`
(`src/data/property-repairs/receipts.ts`) normalise the optional list (a
repair with zero receipts surfaces the "missing receipt" flag). The
`*RepairReceipt` reducer actions and the `usePropertyAttachments`
callbacks (`uploadRepairReceipt` / `replaceRepairReceipt` /
`setRepairReceiptDate` / `removeRepairReceipt` / `renameRepairReceipts`)
keep the file write and the data record in lockstep, and attaching a
second receipt to one repair unlocks the `receiptArchivist` ("Receipt
Archivist") achievement.

### Repair receipts modal

`RepairReceiptsModal.tsx` (`src/components/properties/`) — the receipts
manager, opened from a repair row's "Manage receipts" action in the
wrench view. Lists the repair's receipts (each with an editable native
date input, defaulting to the repair's date at upload, plus the filename),
an "Add receipt" picker, and a per-receipt open / replace / download /
remove flow that reuses the universal `AttachmentUploadModal` scoped to
that one path. Editing a receipt's date re-files the stored document
(`setRepairReceiptDate`) so the property's `receipts/` folder stays a
clean dated log. Centered (its only inputs — date pickers and a file
picker — don't open the soft keyboard).

### Repairs and renovations modal

`RepairsModal.tsx` (`src/components/properties/`) — a per-property list
of the property's repairs / renovations (the "wrench view"), opened from
the property card's "… actions menu" (the View repairs entry; the entry
shows a missing-receipt count and a small `--danger` dot marks the menu
trigger when some repairs lack a receipt). Each row (a swipeable
`.repairs-table` `<tr>`, same pattern as the items / mortgage-payment
lists via `useRowSwipe`) shows the type glyph, the description, the full
date (`Settings.dateFormat`), a transaction count (a layers glyph + "N
transactions") when the repair groups more than one source, the resolved
company name and tags, the amount (the sum across every source), and
either a receipt-count badge (a file glyph + "N receipts") or a
missing-receipt flag when the repair carries no receipts of its own.
Receipt management opens the `RepairReceiptsModal` (the receipts manager),
which targets the repair via `usePropertyAttachments` (the per-property
`properties/` store). Company / tags for a transaction-backed
repair are NOT stored on the `PropertyRepair` — they're resolved live
from the source transaction via `resolveEntryLabels` (the `repairMetadata`
map `PropertiesPage` builds, keyed by `repairMetaKey`), so the same
metadata enriches the budget view and search. A manual repair (no
transaction) instead stores its own `companyId` / `tagIds` on the
repair, resolved into the same map under a `manual:<id>` key. Swipe left
(or the trailing column on desktop) reveals edit (`RepairsEditModal`
edit mode), delete (confirm), and a "…" menu (`RepairEntryActionsMenu`)
holding Manage receipt (the shared `AttachmentUploadModal` to view /
upload / replace / remove — gated on `canManageReceipt`; the flag still
shows on a receipt-incapable backend). The footer's Add button opens the
single-add form (`RepairsEditModal` add mode), Quick add opens the bulk
candidate picker (`RepairsAddModal`), and Add manually opens
`ManualRepairModal` to record a repair with no backing bank transaction
(work older than the imported history reaches). Editing a manual repair
routes back to `ManualRepairModal`; editing a transaction-backed one to
`RepairsEditModal`. Receipt status is read live from a
`${accountId}:${sourceHistoryId}` → `HistoryEntry` map `PropertiesPage`
builds.

### Add repairs picker

`RepairsAddModal.tsx` (`src/components/properties/`) — the candidate
multi-select behind the repairs modal's Quick add button (bulk path;
skips description / subtype, denormalising the charge's label). Each tick
becomes its own single-transaction repair — grouping several charges
into one repair is the full Repair editor's job, not quick add's. Lists
`findRepairCandidates(data)` (`src/data/property-repairs/candidates.ts`):
every Repairs / Renovations outflow across all accounts (resolved via
`resolveEntryLabels`, skipping hidden / collapsed / inflow entries) that
isn't already bound to any property's repairs as a primary or additional
source — so the same transaction can't back two repairs. Checkboxes with
amount + date + type glyph + a receipt hint; "Add N" mints a
`PropertyRepair` per selection (`addRepairs`).

### Repair editor

`RepairsEditModal.tsx` (`src/components/properties/`) — the single-repair
form shared by the repairs modal's Add (add mode) and a row's swipe edit
(edit mode). The source picker is a multi-select checklist of
transactions (each a checkbox + glyph + date + amount + receipt hint,
with a running "N transactions · total" header) so one repair can group
several charges paying one invoice. Add mode: ticks over
`findRepairCandidates`; the primary transaction (the company / tags
metadata anchor whose `date` / `typeId` the repair tracks) is derived
from the selection by `derivePrimary` — the most recent ticked charge —
the rest becoming `additionalSources`; a `description` input and a
`SubtypePicker` scoped to the primary's Repairs / Renovations type (fed a
filtered list + `fixedParentTypeId`); commits via `addRepairs` with one
repair. Edit mode: the primary transaction is pinned (a disabled,
always-checked row — it owns the date / type / identity); the checklist
(the repair's own sources via `resolveRepairSourceRows` merged with the
unused candidates) lets the user add / remove additional transactions,
and `description` / `subtypeId` / `amount` / `additionalSources` commit
to the repair via `updateRepair`. The receipt is owned by the repair
(not a transaction), so the editor has no receipt anchor — receipts are
attached separately from the wrench view's per-row receipt action. Both
modes also expose a `CompanyPicker` and `TagsPicker` that edit the
PRIMARY transaction's `userCompanyId` / `userTagIds` (dispatched as
`updateHistoryEntry` via `onSetEntryMetadata`, only for a field the user
changed) — company / tags belong to the transaction, not the repair, so
the same metadata flows to the budget. The pickers seed from the anchor
charge's effective company / tags (resolved override → rule → hint),
re-seeding when a selection change moves the derived primary (add mode).
Fullscreen (it has a text input).

### Manual repair editor

`ManualRepairModal.tsx` (`src/components/properties/`) — the editor for
a manual repair / renovation: one with no backing bank transaction, for
work older than the imported bank history reaches (or paid in a way the
ledger never saw). Reached from the wrench view footer's Add manually
button (create mode) and from editing an existing manual repair (the
row's swipe edit routes manual repairs here, transaction-backed ones to
the Repair editor). Every field is entered directly and stored on the
`PropertyRepair` itself: a two-button type toggle (Repairs /
Renovations), a date, an amount, a description, a `SubtypePicker` scoped
to the chosen type (`fixedParentTypeId`), a `CompanyPicker` (the
contractor → `PropertyRepair.companyId`), and a `TagsPicker` (→
`PropertyRepair.tagIds`). Commits via `addRepairs` (one repair) /
`updateRepair`; on edit it reconciles the repair's receipt name (via
`onRenameRepairReceipt`) like the Repair editor. Distinct from the
Repair editor, which sources a repair from one or more charges and keeps
company / tags on the transaction. Fullscreen (it has text inputs).

### Receipt target

`TxnReceiptTarget` + `resolveTxnReceipt` (`src/data/receipts/target.ts`)
and `useReceiptManager` (`src/components/AppShell/hooks/`) — the
host-generic receipt layer (the "receipt manager"). A receipt's bytes
live in the backend's `receipts/` folder; its path is stored on the host
it hangs off — a `HistoryEntry` or a budget `Row`. The target is a
discriminated union by `kind`: `history` / `row` (transaction hosts,
with line-item links to preserve). Property attachments — repair receipts
and uploaded files — are NOT a transaction host: they live in the
separate per-property `properties/` store and are handled by
`usePropertyAttachments` (see Property attachments), not this layer.
`useReceiptManager` (called in `AppShell`) owns both the file write and
the data commit — through `linkLineItemsToHistoryEntry` /
`setRowLineItems` (re-reading the live line-item links so a receipt
change never disturbs them) — and threads `uploadReceipt` /
`downloadReceipt` / `removeReceipt` to the Items sheet. Receipts follow
the user's global `receiptNamePattern` (`buildReceiptPath`). The Items
`on*ItemReceipt` callbacks are thin wrappers that resolve
`item → findItemLink → TxnReceiptTarget` and supply item-based naming.

### Property attachments

`usePropertyAttachments` (`src/components/properties/`) — the
per-property file layer. Both a property's repair receipts and the
arbitrary files the user uploads against it live in the backend's
`properties/` store (a sibling of `receipts/` / `payslips/`, gated on the
`propertyFiles` adapter capability), laid out per-property as
`<name>/receipts/<date> <company> - <description>` (repair receipts) and
`<name>/files/[<category>/]<name>` (uploaded files). The hook owns the
file write plus the data commit for both: `uploadRepairReceipt` /
`replaceRepairReceipt` / `removeRepairReceipt` / `setRepairReceiptDate` /
`renameRepairReceipts` (commit through `addRepairReceipt` /
`updateRepairReceipt` / `removeRepairReceipt`, since a repair owns a list
of dated receipts) and `uploadPropertyFile` / `replacePropertyFile` /
`removePropertyFile` (commit through `addPropertyFile` /
`updatePropertyFile` / `deletePropertyFile`), plus a shared `download`.
Path building is `buildRepairReceiptPath` / `buildPropertyFilePath`
(`src/data/items/receipt-name.ts`); `collectReceiptPaths`
(`src/data/items/link.ts`) includes every property file path so a fresh
upload's name stays unique. Instantiated in `AppShell` and threaded to
`PropertiesPage` as the `attachments` prop. Repair receipts used to ride
the transaction-generic `useReceiptManager`; they moved here when the
store split out from the flat `receipts/` folder. Uploading a property
file unlocks the `propertyFiler` ("Property Filer") achievement.

### Property file

`PropertyFile` (`{ id, path, description?, tagIds?, categoryId?, private? }`)
on `Property.files` in `src/data/types/properties.ts` — an arbitrary
document / photo uploaded against a property (a before/after image, an
inspection report, an insurance document — anything that isn't a repair
receipt). `private` (a **private file**) holds it out of a property
export unless the user opts in. The bytes live in the `properties/` store at
`<name>/files/[<category>/]<name>`; only the relative `path` is stored on
the record (mirroring a `PropertyRepair.receipts` entry's `path`).
`description` is the
user's label, `tagIds` reference `UserData.tags`, `categoryId` references
a **file category** (absent ⇒ the `files/` root). Managed through the
**property files modal**; viewable like a receipt via the shared
`AttachmentUploadModal`.

### File category

`FileCategory` (`{ id, name }`) in `src/data/types/properties.ts`
(`UserData.fileCategories`) — a user-defined category that becomes a
subfolder under a property's `files/` folder. Global / workspace-wide and
name-only (like `Subtype` minus its parent type); no presets. Referenced
from `PropertyFile.categoryId`; a dangling reference (the category was
deleted) renders uncategorised and the file falls back to the `files/`
root. Created inline while uploading (the **file category picker**'s "New
category") or in the **Properties settings tab** via `FileCategoriesAdmin`
(`src/components/SettingsModal/`); CRUD through `addFileCategory` /
`updateFileCategory` / `deleteFileCategory` (the delete cascades, clearing
`categoryId` on every file that referenced it — the stored `path` is left
untouched).

### Property files modal

`PropertyFilesModal.tsx` (`src/components/properties/`) — the per-property
files manager, opened by the **Upload file** entry on the property card's
"… actions menu" (its first entry). Lists the property's
uploaded files (each with its description, tags, and category) — a file
opens in the shared `AttachmentUploadModal` (view / replace / download /
remove), its metadata is editable, and it can be deleted. The footer's
**Upload** button picks a file then opens a metadata form (description,
`TagsPicker`, **file category picker**) and commits via
`uploadPropertyFile`. Gated on the backend's `propertyFiles` capability;
on a file-incapable backend (plain localStorage) the upload affordance is
hidden.

### File category picker

`FileCategoryPicker.tsx` (`src/components/properties/`) — a custom
single-select dropdown (button + listbox, never a native `<select>`) for
choosing a `FileCategory` on the upload / edit form, modelled on
`SubtypePicker` minus the parent-type scaffolding. Carries a "No category"
option (the `files/` root) and a "New category" footer that opens a
focused name creator (`onCreateFileCategory`).

### Property actions menu

`PropertyActionsMenu.tsx` (`src/components/properties/`) — the "…"
overflow menu in a `PropertyCard` header, collapsing the per-property
actions into one trigger (modelled on `RepairEntryActionsMenu` /
`SheetTitleMenu`, on `FloatingPanel`). Entries: **Add mortgage**, **Upload
file** (opens the **property files modal**), Net sale profit, **Export
property** (opens the **property export modal**), Edit property, Delete
property. Net sale profit is omitted once the property is sold
(`soldDate` set) — the forward-looking estimator no longer applies. Updating the recorded value is not here — the current-value
figure in the card's stat grid is itself the button that opens the
**Update value** modal. Visualize value and View repairs (the latter with
a `--danger` dot when any repair lacks a receipt) are their own glyph
buttons to the left of this menu; View payments and Find mortgage payments
are glyph buttons in the **mortgage section actions**, and the
unified/split view toggle is the segmented control beside them.

### Property export / import

The sale-handover flow: bundle everything the app knows about a property
into a single ZIP a seller hands the new owner, and re-import it into
another workspace. The archive is `manifest.json` (shape +
`PROPERTY_EXPORT_VERSION` in `src/data/property-transfer/manifest.ts`)
plus the real files under `files/[<category>/]` and `receipts/`.
Everything the property references by id (lender / contractor companies,
tags, file categories, repair subtypes) is denormalized to **names** so
the importer can re-link them in its own workspace; the seller's bank
bindings (`Property.accountId`, payment `sourceHistoryId`) are dropped.

**Export** is reached from a property card's "… actions menu" →
`PropertyExportModal.tsx`. Three toggles gate the contents: include
receipts (default on), include private files (default off), and include
mortgages & payments (default off — the seller's own loans, payment
history, purchase price, and value estimates). The pure builder is
`buildPropertyExport` (`src/data/property-transfer/export.ts`); the
attachment hook's `exportProperty` downloads the chosen file / receipt
bytes from the backend and zips them with `buildZip`. Files whose bytes
can't be fetched are skipped and counted.

The built archive has two destinations, chosen in the modal: **download
file** (the default — `triggerDownload`) or **save to exports folder**.
The second is gated on the `exports` adapter capability — the folder and
cloud backends advertise it (plain localStorage doesn't), so the chooser
only appears when the backend can store the archive. Picking it routes
the bytes through the hook's `saveExportToBackend`, which writes the ZIP
to the backend's sibling `exports/` folder (flat filename, never
encrypted — same passthrough as receipts) via the `StorageAdapter.exports`
`ReceiptOps` store. The modal keeps open with a success note rather than
auto-closing, since there's no browser download to signal the save.

**Import** is reached from the Properties sheet's title "…" menu →
`PropertyImportModal.tsx`, which reads the ZIP (`src/utils/unzip.ts`),
parses + version-guards the manifest (`parsePropertyManifest`), and
previews it. On confirm, `planPropertyImport`
(`src/data/property-transfer/import.ts`) resolves each denormalized name
against the importer's existing companies / tags / file categories /
subtypes (case-insensitive, minting any that are missing) and builds a
fresh `Property` (new ids throughout; repairs land as **manual** repairs
since the source transactions aren't in the archive). The hook's
`importProperty` re-uploads the bytes to the backend, then dispatches one
atomic `importProperty` action that appends the new lookups and the
property together. On a file-incapable backend (localStorage) the
details still import; the attachments are skipped.

### Private file

`PropertyFile.private` — a per-file flag, toggled in the **property files
modal**'s metadata form, that holds a file out of a **property export**
unless the user turns on "include private files". Default (absent) ⇒
exported with the rest of the handover. Additive optional boolean — no
migration; the validator preserves it only when explicitly `true`.

### Net sale profit

`NetSaleProfitModal.tsx` (`src/components/properties/`) — a per-property
estimator opened from the "… actions menu" (the "sale estimator").
Sweeps a sale-price `Slider` and shows a live breakdown — sale price
less broker fee, advertising (e.g. Hemnet), repairs / renovations
(prefilled from `Property.repairs`), the purchase price (prefilled from
`Property.purchaseAmount`), and the location's capital-gains tax —
ending in a stand-out net profit / loss (`--success` / `--danger`). The
math is `computePropertySale(settings.location, inputs)`
(`src/data/tax/engine.ts`); for Sweden a private-residence gain keeps
78 % (22 % tax, `src/data/tax/se/property-sale.ts`). The broker model,
advertising cost, and last slider price persist on
`Property.saleEstimate` via `setPropertySaleEstimate` — only when the
user edits something. Opening it unlocks the `netSaleProfit` ("For
Sale") achievement.

### Broker cost

`BrokerCost` in `src/data/tax/types.ts` — how the estate agent is paid
in the Net sale profit estimator. A discriminated union by `mode`:
`none` (skip the broker), `fixed` (a flat amount), `percent` (a % of the
sale price), or `tiered` (a base fee plus a % of the part of the sale
price above a threshold). Edited via a `SelectPicker` mode dropdown with
that mode's inputs; resolved to a fee by `brokerFee` in
`src/data/tax/se/property-sale.ts`.

### Visualize value

`PropertyValueChartModal.tsx` (`src/components/properties/`) — the app's
first data visualization, opened from a property card's "… actions
menu" ("Visualize value"). Plots the recorded market value over time
(`Property.valueHistory`) as a single line, with toggles that
transform that line in place rather than adding more:

- **Include repairs** — adds the cumulative repair spend up to each
  snapshot date on top, so repairs _raise_ the line (the money invested
  shows in the value).
- **Show net value** — turns the line into the full net sale profit per
  snapshot (`computePropertySale`, deducting broker, advertising, the
  cumulative repair spend, the purchase price, and capital-gains tax) —
  what you'd actually take home. Repairs are _deducted_ here, so when
  both toggles are on the added repairs counterbalance the deduction —
  the toggles point opposite ways on purpose.
- **Include interest paid** — _subtracts_ the cumulative interest paid on
  the property's own mortgages up to each snapshot
  (`cumulativeMortgageInterestAt` in
  `src/data/property-value/interest.ts`, walking each loan month by month
  from its start at the rate and reconstructed balance in effect that
  month). Interest is sunk cost, so it pulls the line down and grows over
  time.
- **Include association interest** — a sub-toggle revealed only when
  "Include interest paid" is on _and_ the property records an
  `associationLoan`. Additionally subtracts the cumulative interest on the
  property's share of the housing association's debt
  (`cumulativeAssociationInterestAt`) — the hidden interest paid through
  the monthly fee, so a high-fee bostadsrätt no longer reads as pure gain.

The series math is the pure `buildPropertyValueSeries`
(`src/data/property-value/series.ts`), sampled at the value-snapshot
dates (the only dates a market value is known for). The drawing is the
reusable `LineChart` primitive (see below); this modal only maps the
data to a themed colour (`--meta` when showing net value, else
`--accent`) and a translated label, and shows an empty state until
there are at least two snapshots. `centered` (only toggle checkboxes — no soft keyboard).
Opening it unlocks the `valueChart` ("Trend Spotter") achievement.

### Line chart

`LineChart` in `src/components/charts/LineChart.tsx` — the reusable,
theme-aware multi-series line-chart primitive (the first member of the
app's `charts/` layer), built on visx (`@visx/*`: SVG, modular, so the
bundle only carries what's used). It owns no domain knowledge and ships
no user-facing copy: the caller passes data series (each naming a CSS
colour token like `--accent`), tick formatters, and labels. All
colours, the font, the grid weight, and the tooltip's surface / radius
read through `useThemeTokens` (`src/hooks/useThemeTokens.ts`), which
reads the requested CSS custom properties off `<html>` into JS and
re-reads them on theme change (a `MutationObserver` on the `data-theme`
/ `style` / `data-reduce-motion` attributes `useTheme` mutates). So the
chart follows the active theme — presets and the Custom theme's colour
/ radius / border-width choices — and introduces no animation, so
reduce-motion is respected by construction. Fluid width via
`@visx/responsive`'s `ParentSize`; a hover crosshair + tooltip snap to
the nearest sampled x.

### Time-range buttons

`ChartRangeRow` in `src/components/charts/ChartRangeRow.tsx` — the
Avanza-style sliding-pill segmented control of trailing-window buttons
(1Y / 2Y / 3Y / 5Y / All, default 3Y via `DEFAULT_CHART_RANGE`) that
chart surfaces render below their figure to clip the series to a
window. The component owns only the buttons and their copy (the
`charts.*` i18n group); the caller keeps the `ChartRange` state and
filters its sample points by `chartRangeCutoffMs(range, today)`
(`"all"` maps to `-Infinity`, so every sample passes). Used by the
loans visualizer (`LoansChartModal.tsx`), the Insights net-worth
chart (`InsightsPage.tsx`), and the investment value chart; the first
two show a "pick a longer range" notice when the selected window holds
fewer than two samples, with the buttons staying live. The same file
exports the forward-looking sibling `ChartHorizonRow` (1M / 3M / 6M /
1Y / 2Y, default 6M via `DEFAULT_CHART_HORIZON`) used by projection
charts — the scenarios visualizer — where the window extends months
**ahead** instead of trailing back; both flavours share one pill row.

### Location

`Settings.location` (a `TaxLocation`, `"SE"` today) — the global
jurisdiction whose tax rules apply to estimates not bound to a per-sheet
tax profile (the property-sale capital-gains calc; the default country
for new salary tax profiles). Edited in the Location section of the
General settings tab (`tabs/general.tsx`, a `SelectPicker` listing every
`SUPPORTED_LOCATIONS` entry plus a "Request a new location…" link to the
repo's new-issue page). Drives the calculator bundle in `LOCATIONS`
(`src/data/tax/engine.ts`); `computePropertySale(location, …)` reads it.

## Savings page

### Savings page

The Savings sheet (`SheetType "savings"`, `SavingsView`) renders the
workspace-wide `UserData.savings` collection — savings accounts the user
sets money aside in (a buffer, a vacation fund). It is a data-light
singleton flavour like Accounts / Properties: the page
(`src/components/savings/SavingsPage.tsx`) lists every `Saving` with its
current balance, and savings CRUD goes through `reduceSavings`
(`src/data/reducers/savings.ts`), not the per-item reducer tail. Files
live in `src/components/savings/`; helpers in `src/data/savings/`.

### Savings account

A `Saving` (`src/data/types/savings.ts`) is one savings account:
`name`, optional bank details (`bank`, `clearing`, `accountNumber`),
a `glyph` / `color`, and a `kind: "savings"` discriminator that leaves
room for a future `"investments"` flavour (savings differ from
investments in that they're not expected to grow). The create / edit
modal is `SavingsModal.tsx`; rows carry a left-swipe Edit / Delete strip
and a "…" menu (`SavingActionsMenu.tsx`) whose single entry opens
Update balance. Unlike a transactional `Account`, a savings account's
displayed balance is not derived from transactions — it is the latest
recorded `SavingBalancePoint`.

A savings account is a **first-class transfer endpoint**: it shares the
`UserData.history` / `UserData.transfers` id-space with regular accounts.
Its transactions live in `UserData.history` keyed by the saving's id
(stored, but never surfaced on the Savings page), so
`detectTransferCandidates` pairs a savings deposit with the matching
withdrawal on a regular account automatically, and a `Transfer` may name
a saving on either side. Those transactions are imported through the
savings row's "…" menu — Import / Cut history reuse the accounts
import pipeline (`useImportFlow` resolves a saving id the same as an
account id, and `importBankHistory` merges into `history[savingId]` with
its account- / budget-specific branches harmlessly skipped for a
saving). Viewing that history is the savings row's own body tap (the
same `HistoryModal` the accounts page opens on a row tap), not a menu
item. The transfer log and collapse / create modals
resolve a saving endpoint to its name via `savingAsTransferEndpoint`
(`src/data/savings/value.ts`). Savings are deliberately kept out of the
Accounts table and `computeAccountBalances`. Deleting a saving cascades
its history, import audit, and any touching transfers.

### Savings balance

A `SavingBalancePoint` (`{ id, date, value }`, same shape as a property's
`PropertyValuePoint`) is one balance snapshot in `Saving.balanceHistory`.
The current balance is the latest point by date (`currentSavingBalance`,
`src/data/savings/value.ts`); the create modal seeds the opening balance as
the first point, dated today. Update balance (`UpdateSavingBalanceModal.tsx`)
appends a new dated point (`addSavingBalance`) and lists prior points for
deletion (`deleteSavingBalance`) — the foundation for the savings-over-time
chart (see Visualize value below).

Points are recorded two ways. A user records them by hand through Update
balance, and an **import** seeds them automatically: when a bank statement
is imported into a savings account (the savings row's "…" → Import history,
which reuses the accounts import pipeline), `applyImportedSavingBalances`
(`src/data/savings/value.ts`) folds the imported transactions' daily
**closing** balances into `balanceHistory` — one point per date, the running
balance carried by the **last transaction of that day** (same-day
transactions collapse to that single point). It runs inside the
`importBankHistory` branch of `reduceAccounts` against the merged history, so
re-importing the same statement is idempotent (an existing point on a covered
date keeps its id, its value re-anchored to the bank's figure) and importing
an older statement backfills earlier days. Manual points on dates the import
doesn't cover survive untouched; a date the import _does_ cover becomes
authoritative. Entries without a running balance (credit-card-style exports)
contribute nothing, leaving the history unchanged.

### Visualize value (savings)

`SavingsValueChartModal.tsx` (`src/components/savings/`) — the Savings-sheet
analogue of the property value chart, opened from the sheet title's "…" menu
("Visualize value"). Where the property chart plots one property, this is a
sheet-level view across the collection: a checkbox chooser lets the user pick
which savings accounts to include (all by default), and the chart draws a
**single combined line** — the total set aside across the selected accounts
over time.

The line is built by the pure `buildSavingsTotalSeries`
(`src/data/savings/series.ts`): it samples the union of every snapshot date
across the selected accounts and, at each date, sums each account's most
recent balance on or before it (the last known value carried forward; an
account contributes 0 before its first snapshot). So the total climbs as
accounts come online and as each is topped up. Fewer than two points shows an
empty-state hint; clearing the selection shows a "pick an account" hint. The
reusable `LineChart` primitive (`src/components/charts/`) does the drawing, so
the chart follows the active theme like the property one. Opening it unlocks
the **Nest Egg** achievement (`savingsValueChart`, a manual trigger).

## Loans page

### Loans page

The Loans sheet (`SheetType "loans"`, `LoansView`) renders the
workspace-wide `UserData.loans` collection — the money the user owes
(student loans, car loans, mortgages, money borrowed from a person). It
is a data-light singleton flavour like Savings / Properties: the page
(`src/components/loans/LoansPage.tsx`) lists every `Loan` as a table row
(glyph · name + sub-line · kind column · monthly payment · rate · paid
so far · remaining balance) with a footer total of remaining debt, and
loan CRUD goes through `reduceLoans` (`src/data/reducers/loans.ts`), not
the per-item reducer tail. The kind column renders the kind's glyph +
label on desktop and the glyph alone on mobile; the sub-line carries
the lender (desktop only) or, for a linked mortgage loan, a chain glyph
plus the property name (glyph only on mobile) — the full lender /
linked-mortgage detail lives in the View loan modal. On mobile every
row resolves the shared `--loans-row-template` grid (widest formatted
amount, fixed type-glyph track) so the columns align across rows,
mirroring the transfers table. Files live in `src/components/loans/`;
helpers in `src/data/loans/`. Tapping a row body opens the read-only
View loan modal (see below); rows also carry the standard left-swipe
Edit / Delete strip plus a "…" menu (`LoanActionsMenu.tsx`) with Update
balance, Import payments, and View payments. Adding the first loan
unlocks the **Borrower** achievement.

### Loan

A `Loan` (`src/data/types/loans.ts`) is one debt: a `kind` (`student` /
`mortgage` / `car` / `private` / `personal`), terms (start date, a
`startSum` that anchors the balance walk, an optional annual interest
`rate` it accrues with, an optional `startFee` / uppläggningsavgift
financed into the opening anchor), and dated balance snapshots
(`balanceHistory`, see Update balance below). A **student** loan
collects no start sum — CSN debt accrues over the study years, so there
is no meaningful single principal and the kind anchors on Update
balance alone. There is no monthly-payment input: the Monthly column
derives from the recorded payments (`loanMonthlyPayment` — the average
of the current year's payment months, falling back to the three most
recent payment months at the start of the year). The lender field depends on the kind: a
**personal** loan stores the person's name as free text (`lenderName`),
a **private** or **car** loan references a `Company` (`companyId`), and
a **mortgage** loan can instead link a property's mortgage (see Linked
mortgage below). The create / edit modal is `LoanModal.tsx` — the kind
picker drives which lender field shows, and the term fields hide while
a mortgage link is active. Each kind maps to a preset entry type via
`LOAN_PRESET_TYPE_BY_KIND` (`src/data/loans/presets.ts`); the **Loans**
preset category groups all five (the Mortgage and Student-loan presets
moved in from Housing / Bills, ids unchanged).

### Loan remaining balance

`loanRemainingBalance` (`src/data/loans/balance.ts`) computes the
"Remaining" column. It anchors on the loan's balance points — the
recorded snapshots (`Loan.balanceHistory`, see Update balance below)
plus an implicit opening point worth `startSum` + `startFee` dated at
the start date (or just before the earliest payment when no start date
is recorded): the latest point on or before the asked date — treated as
that day's end-of-day figure — and the payments recorded between the
anchor and the date amortise from there, so the figure at any date
derives from a known balance plus the actual payments. Without a `rate`
the whole payment amortises. With a rate the walk runs month by month:
each month accrues interest on the outstanding balance (annual
rate / 12) before that month's payments land, so only the payment net
of interest amortises — honestly reflecting that early payments are
mostly interest, and that a rated loan with no recorded payments grows.
Clamped at zero once paid off; a date before the earliest point re-adds
the payments in between; with neither a snapshot nor a start sum the
row shows "—". A linked mortgage loan bypasses the walk entirely:
`linkedMortgageFigures` resolves monthly payment / rate / remaining
live from the mortgage's own terms (`resolveMonthlyPaymentAt`,
`resolveRateAt`, `balanceAt` in `src/data/finance/`).

### Update balance (loan)

`LoanUpdateBalanceModal.tsx`, opened from the loan row's "…" menu.
Records what remains of the loan as of a date — appends one
`LoanBalancePoint` (`id` / `date` / `value`) to `Loan.balanceHistory`
via `addLoanBalance`, mirroring the savings Update balance modal: the
inline Add keeps the modal open so a run of snapshots can be recorded
back-to-back, and the recorded list below deletes individual points
(`deleteLoanBalance`). Available for every loan kind: it is the only
balance source for a student loan (which collects no start sum), and
for the other kinds it re-syncs the figure the start sum anchors — see
Loan remaining balance above — no matter what payments were or weren't
imported. Disabled for a linked mortgage loan — its balance lives on
the linked mortgage, maintained on the Properties sheet.

### Linked mortgage (loan)

A `kind: "mortgage"` loan can carry a `propertyId` plus a non-empty
`mortgageIds` list linking **one or several** of that property's
mortgages from the Properties sheet — **linked, never copied**: terms,
payments, and balance all resolve live through
`resolveLinkedMortgages` (`src/data/loans/balance.ts`), so the two
sheets can never disagree. Several mortgages list as ONE loan row
because the bank draws a property's combined monthly cost as a single
transaction; `linkedMortgageFigures` aggregates across them — monthly
payment and remaining balance sum, paid-so-far sums every recorded
payment, and the rate is the balance-weighted blend. The link picker
in `LoanModal.tsx` is a property dropdown plus one checkbox per
mortgage not already linked by another loan (all ticked by default);
linking hides the loan's own term fields. Payment flows fork on the
link: Import payments on a linked loan splits each charge across the
linked mortgages with `splitPaymentAcrossMortgages` (the same
amortisation-first logic as Find mortgage payments) and dispatches
`addMortgagePaymentsForProperty`; the payments view deletes via
`deleteMortgagePayment` — the loan's own `payments[]` stays empty. The
validator keeps the resolvable subset of `mortgageIds` (a deleted
mortgage falls out of the list) and drops the link entirely when
nothing survives, so the loan degrades to an unlinked mortgage rather
than rejecting the file.

### Import payments (loan)

`LoanImportPaymentsModal.tsx`, opened from the loan row's "…" menu. The
candidate scan (`findLoanPaymentCandidates`,
`src/data/loans/candidates.ts`) walks every history bucket (accounts
and savings share the id-space) for outflows whose resolved type
(`resolveEntryLabels` — user override, match rule, or merchant hint)
matches the loan kind's preset type, or whose description matches a
learned payment pattern; entries already recorded (by
`sourceHistoryId`, on the loan or its linked mortgage) are excluded. So
tagging transactions with the Car loan type makes them surface when
importing payments on a car loan — and tagging just ONE is enough: a
"Suggested similar payments" section
(`findSimilarLoanPaymentCandidates`, same file) adds outflows sharing a
normalised bank-description key with a direct match whose amount sits
within an adjustable tolerance (`Slider`, ±10% default, 0–50%).
Candidates arrive default-ticked; importing dispatches
`addLoanPayments` (one undo entry) with the payments and the patterns
learned from the ticked entries' bank text. Two checkboxes (both on by
default) stamp metadata back the other way inside the same action:
"Mark … with the {type} type" writes the loan kind's preset type as
each imported entry's `userTypeId`, and "Rename … to {name}" writes the
loan's name as its `userDescription` (the raw bank text is preserved
underneath, as with any per-entry override). The suggestions section
and both checkboxes are hidden for a linked-mortgage loan — its
payments belong to the Properties flow. The first imported payment
unlocks the **Debt Collector** achievement.

### Loan payment pattern (auto-attach)

`Loan.paymentPatterns` is learned bank-description memory — normalised
keys (`normaliseDescription`, the same key-space as merchant hints)
recorded by `learnPaymentPatterns` (`src/data/loans/patterns.ts`) when
the user imports payments. On every subsequent bank-statement import,
the `importBankHistory` reducer branch runs `attachImportedLoanPayments`
(`src/data/loans/auto-attach.ts`) over the genuinely-new entries: any
outflow matching a loan's patterns is recorded as a payment in the same
pass — no modal, deduped against existing `sourceHistoryId`s, linked
mortgage loans skipped (the mortgage discovery flow owns those). A
re-import can't double-attach because duplicate entries never reach the
"newly added" set.

### Loan payments view

`LoanPaymentsModal.tsx` — the dated list behind "Paid so far", opened
from the loan row's "…" menu (View payments). Lists payments newest
first with per-row delete (`deleteLoanPayment`) and a Delete all
(`deleteAllLoanPayments`). For a linked mortgage loan it renders the
linked mortgages' payments instead — shared with the Properties
sheet's Mortgage payments view — grouped by charge: a combined bank
draw recorded as one split per mortgage (every leg sharing the
charge's `sourceHistoryId`) lists as one summed row, and deleting it
deletes every leg via `deleteMortgagePayment`. The row-building lives
in `listLoanPayments` (`src/data/loans/payments.ts`), shared with the
View loan modal so the two lists can never disagree.

### View loan modal

`LoanViewModal.tsx` — the read-only loan details card, opened by
tapping a loan row's body (the swipe strip's buttons still win their
own taps; a swiped row's first tap retracts the swipe instead,
mirroring the accounts table). Shows the loan's identity (kind plus
the linked property / lending company / person), its description, the
four derived figures the table also shows (monthly payment, rate, paid
so far, remaining — computed with the same helpers, so the modal and
the row can't disagree), the entered terms (start date / start sum /
setup fee; a linked loan lists its linked mortgages instead — each by
name with its own remaining balance and rate, so the card spells out
the terms behind the aggregate figures above it; the mortgages'
full terms live on the Properties sheet), and the recorded payments via
`listLoanPayments`. Management stays
elsewhere: the footer's Edit button closes the view and opens the edit
modal, and the row's "…" menu keeps Update balance / Import payments /
View payments.

### Visualize loans

`LoansChartModal.tsx` (`src/components/loans/`) — the Loans-sheet
visualization, opened from the sheet title's "…" menu ("Visualize
loans"). Where the savings chart draws one combined line, this is a
**stacked area chart**: every loan is its own smooth coloured band (the
loan's picked colour, or a deterministic theme-token fallback), so the
top of the stack reads as the total and each layer as that loan's
contribution. A segmented toggle switches between two views:

- **Balances** (default) — a smooth stacked **area**: each band is the
  loan's outstanding debt over time, sampled monthly from the earliest
  date any included loan knows about (start date, snapshot, payment)
  through today; the last sample lands on today so the stack's top
  matches the page's footer total. Simple loans walk
  `loanRemainingBalance`; linked mortgage loans sum `balanceAt` across
  their linked mortgages, so the chart can never disagree with the
  Properties sheet.
- **Payments** — stacked **bars**, one per month from the earliest
  payment (terms recorded years earlier don't prepend years of empty
  months): each segment is what that loan was paid that month, and a
  month without a payment is an honest gap rather than a curve gliding
  across it. A **Break out estimated interest** checkbox shrinks each
  loan's segment to the month's payment net of estimated interest and
  adds one combined `--danger`-coloured Interest segment on top. The
  estimate is per month — a simple loan with a rate accrues last
  month's balance × rate/12, a linked loan sums
  `resolveMonthlyInterestAt` (rate-history aware) — and the counted
  interest is clamped to that month's payment, so it never exceeds
  what was actually paid and the net segments stay ≥ 0.

A row of **time-range buttons** (the shared `ChartRangeRow`,
1Y / 2Y / 3Y / 5Y / All, default 3Y) clips both
views to a trailing window: the builders sample from each loan's start
date, so an old loan with only recent transactions draws a long flat
line that the default range trims off. Picking a window shorter than
the loan's data zooms in (the area / bars rescale to it); a window with
no samples shows a "pick a longer range" notice while the buttons stay
live. On the **Balances** view a **balance-change** badge reads the
total debt at the first vs. last visible sample as a signed percent —
negative in `--positive` green when the debt shrank (paying off is
good), positive in `--negative` red when it grew; it is hidden on the
Payments view, where the stack is per-month spend rather than a balance.

Two checkboxes (both on by default) include or exclude **student
loans** and **mortgages** from the stack; the filter is by `kind`, so
an unlinked mortgage-kind loan is excluded along with the linked ones.
A third, **Show as multiple of monthly salary** (off by default,
hidden when no salaries are recorded), re-renders both views as
unitless salary multiples: every band's value at each monthly sample
is divided by the household's average monthly net salary effective at
that date — `averageMonthlyNetAt` (`src/data/salary/salary.ts`), the
per-month sum of all recorded paychecks averaged over the up-to-12
most recent recorded months on or before the sample (samples before
the first paycheck fall back to the earliest recorded months). The Y
axis switches from currency to a one-decimal `×` figure, so the
Balances stack reads as months of take-home pay owed (a
debt-to-income view that stays honest as the salary grows) and the
Payments bars as the share of a paycheck spent on loans; the
balance-change badge then tracks the change in the multiple, matching
what's on screen.
The series math is the pure `buildLoanBalanceBands` /
`buildLoanPaymentBands` (`src/data/loans/series.ts`); the drawing is
the reusable `StackedAreaChart` / `StackedBarChart` primitives
(`src/components/charts/`), `LineChart`'s siblings — same theme-token
chrome and crosshair tooltip (per-layer values plus a bold total row),
with layers stacked by manual cumulative offsets over one shared
monthly x array (the area chart adds monotone smoothing; the bar chart
thins its month labels instead). `StackedAreaChart` stacks each sample
around zero — positive values pile up, negative values hang below a
zero baseline — so it diverges when a band goes negative (all-positive
data, like the loan balances, is visually unchanged); an optional
`totalLine` prop overlays the algebraic per-sample sum, which the
Insights net-worth chart uses for its net-worth line. `centered` (only
toggles — no soft keyboard). Opening it unlocks the **Debt Mapper** achievement
(`loansChart`, a manual trigger).

## Insights page

### Insights page

The Insights sheet (`SheetType "insights"`, `InsightsView`) aggregates
data from every area of the app — accounts, savings, items, properties,
loans — into cross-cutting analyses about the user's economic
situation. It is organised around **insight modes** (`InsightsMode` in
`src/data/types/sheets.ts`): one literal today (`"networth"`), and the
page's mode toggle is deliberately hidden until a second mode exists —
the persisted `mode` field and the inline guard in
`src/components/insights/InsightsPage.tsx` are the future-proofing.
Like the other singleton flavours the sheet holds no data of its own;
only the per-mode settings persist on the `InsightsView` item. Files
live in `src/components/insights/`; the pure math in
`src/data/insights/`. Adding an Insights sheet unlocks the **Big
Picture** achievement. **When adding or changing a sheet type (or what
an existing sheet tracks), evaluate whether the insights functions in
`src/data/insights/` should capture the change** — the roll-up is only
as complete as the sources it reads (see the note in `AGENTS.md`).

### Net worth

The first insight mode: assets minus liabilities, computed by
`computeNetWorthSnapshot` (`src/data/insights/networth.ts`). Assets are
account balances (`computeAccountBalances`), savings balances
(latest `balanceHistory` point), owned items' current values
(`computeItemCurrentValue`, disposed items excluded), and property
values (`resolveValueHistory`; a sold property drops out — value and
mortgage debt both — from its `soldDate`, like a disposed item).
Liabilities are counted from two
disjoint sources so a mortgage can never be double-counted: every
property's mortgages directly (`balanceAt`), and only the loans that
resolve **no** linked mortgages (`resolveLinkedMortgages === null`) via
`loanRemainingBalance` — a linked mortgage-kind loan is a live view of
mortgages already counted with its property, so it contributes nothing
and gets no settings row. The page renders the headline total, a
per-category breakdown (Accounts / Savings / Items / Investments /
Properties & mortgages / Other loans; categories with no entities are
omitted), and a net-worth-over-time **diverging `StackedAreaChart`**
built by `buildNetWorthCategorySeries`: one band per present category
sampled monthly from the earliest dated data any included entity knows
about through today (the current month sampled at today). Properties
and mortgages — the two figures that dwarf everything else — fold into
a single **net-equity band** (property value minus mortgage debt,
summed per sample) so they read as one breakdown line, one chart band,
and one toggle; the breakdown and chart both show this merged figure,
while the settings modal still lists properties on their own. Assets
stack upward from a zero baseline, liabilities (other loans, and the
net properties band when it goes underwater) stack downward below it,
and an overlaid `--fg-bright` total line traces the algebraic sum — so
each part's contribution to net worth is legible and the line's last
point equals the snapshot total (`buildNetWorthSeries`, retained for
that algebraic series, is the sum of the same per-category math). The
colour legend beneath the chart doubles as **per-band visibility
toggles** — checkboxes in the loans-visualizer mould: un-ticking a band
drops it from the stack and rescales the axis to what remains, the way
to read the smaller bands when properties dominate. The toggles are
chart-only local state (reset when the sheet changes); the breakdown
list always shows every present category, and hiding a band never reads
as missing data. The net-worth total line, being the algebraic sum of
the visible bands, has no toggle. The shared time-range buttons
(`ChartRangeRow`, 1Y / 2Y / 3Y / 5Y / All, default 3Y — the same row
as the loans visualizer) sit below the chart and clip the series to a
trailing window; a window with fewer than two samples shows a "pick a
longer range" notice while the buttons stay live. Unknown values (no
balance / no value recorded) render "—" and contribute zero.

### Net worth settings

The per-sheet settings for the net-worth mode
(`InsightsSettingsModal.tsx`, opened from the sheet title's "…" menu).
Every entity — account, saving, item, property, standalone loan — gets
an include toggle and an **ownership share** percent (for a co-owned
home or an account shared with a spouse). A property's share applies to
**both** its value and its mortgages, so the property contributes the
user's share of its equity. The draft persists as
`InsightsNetWorthSettings.overrides` on the `InsightsView` item — a map
keyed by entity id holding `excluded?: true` and/or `sharePct?` (absent
⇒ 100) — written wholesale by one `setInsightsNetWorthSettings` action
(one undo step) reduced via the insights descriptor's `reduceItem`
(`src/data/sheet-types/insights.ts`), which normalises redundant fields
away. The validator (`validateInsightsView` in
`src/data/validate/sheet-items.ts`) sweeps override keys against every
known entity id-space so a deleted entity's override silently
disappears.

## Investment page

The Investment sheet (`src/components/investment/InvestmentPage.tsx`,
`InvestmentView`) renders two workspace-wide collections as two card
tables and owns its own modal state (like the Insights page), dispatching
the catalog actions directly. Opened from the title "…" menu: **Visualize
value** and **Edit sheet**.

### Investment holding

A **holding** (`InvestmentHolding`, `src/data/types/investments.ts`;
`UserData.investmentHoldings`) is a broad investable asset — a fund,
basket of shares, gold, silver, crypto, a bond. Its market value is
recorded by hand over time as `valueHistory` points (the purchase is
folded in as the first value via `resolveHoldingValueHistory`, mirroring a
property's value), updated through `UpdateHoldingValueModal`. The
**wrapper** (`InvestmentWrapper`: ISK / KF / depå) is first-class: it
decides the sale tax via `holdingTaxTreatment` (`holdings.ts`) feeding the
location's investment calculator. Created / edited via
`InvestmentHoldingModal` (custom `SelectPicker` dropdowns for wrapper and
asset kind — no native `<select>`). CRUD lives in
`src/data/reducers/investments.ts` (`addInvestmentHolding`,
`updateInvestmentHolding`, `deleteInvestmentHolding`,
`addInvestmentHoldingValue`, `deleteInvestmentHoldingValue`).

### Private stock

A **private stock** (`StockPosition`; `UserData.investmentStocks`) is a
single stock tracked at the share level. Buys and sells are signed-share
`StockTransaction`s entered through `StockTransactionModal`; the share
count and average cost are **derived**, never stored, by
`resolveStockPosition` (`src/data/investment/stock.ts`) using the Swedish
moving-average method (genomsnittsmetoden): a buy blends the average cost,
a sell drops the share count at the unchanged average. The current price
per share is a hand-recorded `priceHistory` point set through
`UpdateStockPriceModal`, which can derive the per-share price from a total
value plus a share count. **Ownership** (`StockOwnership`: private vs your
company) decides the gain tax. CRUD: `addStockPosition`,
`updateStockPosition`, `deleteStockPosition`, `addStockTransaction`,
`deleteStockTransaction`, `addStockPrice`, `deleteStockPrice`.

### Investment net value

The **net value** of an investment is what it's worth after the sale tax,
computed by `computeInvestmentNetValue` (`src/data/tax/engine.ts`) routing
to `swedishInvestmentCalculator` (`src/data/tax/se/investment.ts`) by the
global `Settings.location`. ISK / KF carry no capital-gains tax on a sale
(the yearly schablon already covers it) so net = full value; a depå is
taxed 30 % on the gain over the cost basis when held privately, 20.6 %
(corporate) when held by the user's company. A loss is not taxed. Tunable
via `SE_INVESTMENT_GAINS_PRIVATE` / `SE_INVESTMENT_GAINS_COMPANY`. Holding
net value subtracts the gain from `purchaseAmount`; stock net value from
the derived average-cost basis. Investments also feed the Insights
net-worth roll-up (gross value) under the `investments` category.

### Visualize value (investments)

`InvestmentValueChartModal.tsx` charts the combined value of every holding
and stock over time as one line, via the pure `buildInvestmentTotalSeries`
(`src/data/investment/series.ts`) which samples monthly (like
`buildNetWorthSeries`). A **Show net value** checkbox swaps gross market
value for after-sale-tax value, and the `ChartRangeRow` trailing-window
buttons sit **below** the graph. Reuses the `LineChart` primitive.

## Scenarios page

### Scenarios page

The Scenarios sheet (`SheetType "scenarios"`, `ScenariosView`,
`src/components/scenarios/ScenariosPage.tsx`) plays **what-if futures**
against one existing budget sheet — the **base budget**, bound via
`ScenariosView.baseSheetId`. The empty state opens with an inline base
picker; once bound, the base is changed from the sheet's **Edit sheet
modal** (`SheetModal`'s Base budget picker, applied through
`setScenariosBaseSheet` on save with a clears-your-deltas warning
under the picker). Scenarios are **live-linked deltas**, never
copies: each `Scenario` stores only overrides / exclusions / added rows
keyed against the base budget's row ids, so edits to the real budget
flow into every scenario automatically and scenario edits never touch
the real budget. The page renders, top to bottom: the scenario
switcher (`ScenarioPicker` — a dropdown listing an implicit
**Baseline** entry first, then one entry per scenario with its chart
color dot, then a trailing "New scenario" action; rename / delete
glyph buttons sit to the right of the dropdown and apply to the
active scenario, hidden on the Baseline), the balance monitors (a "+"
button on the title row opens `ScenariosAddMonitorModal`), and
budget-like month tables (`ScenarioMonthTable` / `ScenarioRow`); the
projection chart lives in its own **Visualize scenarios** modal
opened from the sheet title's "…" menu (see
[Scenario chart](#scenario-chart)). The month tables start at the
current fiscal month — scenarios are forward-looking — with a "Show
earlier months" expander for the full history. Rows render with the
budget table's visual language: the recurring `Repeat` glyph +
`--flag` color, the company-pill / type-coloured-name description
fallbacks (`CompanyPill` from `src/components/Pills.tsx`), the
transfer arrow + peer-account prefix, and a **read-only type column**
(`TypeBadge` — glyph only on mobile, tinted glyph + name pill on
desktop; types are shown, never editable here). Descriptions are
**read-only** — a scenario changes what a row costs, never what it is
called. A scenario's deltas are also tinted per kind — green rows
were added by the scenario, red rows are excluded, meta-yellow rows
carry an overridden amount (fixed or [adjusted](#amount-adjustment-scenarios),
the latter with its ×2 / +5000 token rendered before the number; the
`scenario-row-*` rules in `src/styles/components.css`). With `Settings.hideTransfers` on, the
tables collapse inter-account transfers exactly like the budget
table — the same `collectHiddenTransfersByAnchor` /` isTransferRow`
helpers from `src/data/budget/synthesis.ts` group hidden runs under
the next visible anchor row, whose balance renders italic with a
dotted underline and toggles the run's inline reveal (muted
`is-revealed-transfer` rows). On mobile the tables
follow the budget table's layout: a block + per-row grid (the
`.scenario-table` rules in `src/styles/components.css`, plus an
unlayered cell-width reset in `src/styles/utilities.css` so the
desktop `w-px` shrink-to-fit cells fill their grid tracks) with a
day-only date track, a glyph-only type track, ch-var-sized amount /
balance columns, and the per-row actions in a swipe-to-reveal strip
(`useRowSwipeAndClaim` + `swipe-action-cell`). The active scenario
selection is ephemeral component state (not persisted, so switching
scenarios never mints an undo step). Creating the first scenario
unlocks the **What If** achievement. Deleting the base sheet cascades
`baseSheetId` to `null` (the page falls back to the picker); changing
the base clears every scenario's deltas — the row ids belong to the
old base — so the Edit-sheet picker warns (and the empty-state picker
confirms) before the rebind. The pure math lives in `src/data/scenarios/`
(`apply.ts` for delta application + diff, `series.ts` for the
per-variant pipeline run, monthly end balances, chart points, and
monitor lookups); per-variant computation reuses
`computeBudgetState`, so the Baseline is identical to what the budget
page shows (synthesized transfer / history rows, formula resolution,
bank balance pins, fiscal-month grouping). Scenario data is
hypothetical by design and deliberately excluded from the Insights
net-worth roll-up.

### Scenario

One named what-if variant (`Scenario` in `src/data/types/sheets.ts`):
`overrides` (per-row deltas keyed by base row id —
`ScenarioRowOverride` with a replacement `amount`, a live amount
`modulation` (see [Amount adjustment](#amount-adjustment-scenarios)),
and/or `excluded: true`; a fixed `amount` and a `modulation` are
mutually exclusive — setting one displaces the other) plus `addedRows`
(`ScenarioAddedRow` — scenario-only rows with date / description /
amount and an optional `seriesId`, e.g. an unemployment benefit in a
lose-my-job scenario). On
the page, tapping an amount in a scenario's table edits it inline
(dispatching the upsert-by-rowId `setScenarioOverride` action);
descriptions are read-only; the minus control excludes a row (struck
through, contributes nothing to balances); the revert control clears
an override (a bare `{ rowId }` payload normalises to nothing and
removes the entry — the shared `normalizeScenarioOverride` contract
between the reducer and validator). A committed amount equal to the
base row's own clears that field instead of storing a no-op override,
and a commit equal to the value already on screen (fixed override if
set, modulated base if adjusted, base otherwise) is a pure no-op —
nothing is written and no series prompt fires. Committing a genuine
change on a row that belongs to a recurring series which continues
past it stages the shared `ApplySeriesDialog` ("apply to upcoming
entries too?") — same flow as the budget page — without writing
anything yet: "just this entry" applies the staged change to the
anchor row only, confirming dispatches
`propagateScenarioOverrideToFuture` (whose sweep starts at the anchor
itself), and dismissing the dialog (X, Escape, or clicking outside)
cancels the staged change entirely. The sweep fans the change
(fixed amount, modulation, or the exclude / re-include flag) out to
every later occurrence (clamped by the optional "stop after" date;
per target row a fixed value equal to that row's base clears rather
than stores, either amount flavour displaces the other on each
target, and a swept exclusion leaves any amount override in place
underneath it for re-include). The exclude / re-include toggle stages
the same dialog with its own copy, so dropping a recurring expense
takes its future occurrences in one gesture. Added rows are created
through `ScenarioRowModal`, whose add mode embeds the shared
`RecurrenceForm` — one date, a list of dates, every-N-days, or
monthly cadences — and lands every occurrence in one undo step
(`addScenarioRows`), sharing a fresh `seriesId` when there is more
than one so the tables show the Repeat glyph; deleting an occurrence
of such a series offers a "just this" / "this and all future" scope
(`deleteScenarioRows`). The first recurring added row unlocks the
**Recurring Dreams** achievement. Added rows are minted into the
applied clone with deterministic `scn:`-prefixed ids (`applyScenario`
in `src/data/scenarios/apply.ts`, which also carries the `seriesId`)
and edited via `ScenarioRowModal` (edit mode is per-occurrence — a
plain date field, no series move). Overrides whose base row was
deleted are inert (ignored at compute time, skipped by the diff).

### Amount adjustment (scenarios)

A live modulation of a base row's amount
(`ScenarioRowOverride.modulation`, `ScenarioAmountModulation` in
`src/data/types/sheets.ts`): **Add amount** (+5000 — a pay raise),
**Subtract amount** (−500 — picker-level sugar that persists as a
negative add, because the mobile decimal keyboard has no minus key;
the modal re-presents a negative add as Subtract with the positive
figure), **Multiply by** (×2), or **Change by percent** (+300 % — gas
bills quadruple; the amount becomes base × (1 + value / 100)). Unlike a
typed-in fixed amount, the adjustment is recomputed from the base
amount on every apply (`modulateAmount` in
`src/data/scenarios/apply.ts`, rounded to cents), so editing the
underlying budget entry flows straight through the scenario. Attached
from the **Adjust amount** action in the row's action strip (the
swipe-to-reveal strip on mobile, inline icons on desktop — sliders
glyph), which opens `ScenarioModulateModal`: an operation picker, a
value field, and a live base → result preview; saving on a recurring
row offers the same apply-to-upcoming sweep as a fixed amount, and
the modal's Remove button clears just the adjustment. The adjusted
amount renders accent-tinted with a meta-coloured notation token
(`formatModulation` in `src/components/scenarios/modulation.ts` —
"+5 000", "×2", "−50 %") before the number, in both the month table
and the scenario diff. No-op adjustments (+0 / ×1 / +0 %) normalise
away as a revert. Formula-driven rows can't be adjusted — the static
cell under a formula is not the row's real amount — so the action is
hidden there and a persisted modulation on such a row is inert.

### Baseline (scenarios)

The implicit unaltered variant: the base budget exactly as the budget
page computes it. Always present — first entry in the scenario
dropdown, dashed `--muted` series on the chart, first line on every
monitor card — and never user-created, edited, or deleted. Its tables
are read-only.

### Monitor date

A user-chosen ISO date ("how much money do I have on 31 December?")
stored sorted + deduped in `ScenariosView.monitors` (wholesale-replaced
by the `setScenariosMonitors` action). Added through
`ScenariosAddMonitorModal` (a centered date-picker modal opened by the
"+" button on the Balance monitors title row); each monitor renders as
a card (`ScenariosMonitorRow`) listing the projected balance per
variant at that date — `balanceAtDate` in
`src/data/scenarios/series.ts`, the running balance after every row
dated at or before the monitor date (inclusive, plain calendar
compare) — with each scenario's delta vs the Baseline colored positive
/ negative; the name / delta / balance columns share one grid so the
numbers align down the card.

### Scenario chart

The **Visualize scenarios** modal (`ScenariosChartModal`, opened from
the sheet title's "…" menu): a multi-series `LineChart` of **monthly
end balances** — one line per scenario plus the dashed Baseline, all
drawn at once on a shared month axis. The view is strictly
forward-looking: a `ChartHorizonRow` (the forward sibling of the
trailing `ChartRangeRow`, both in
`src/components/charts/ChartRangeRow.tsx`) picks how far past the
current fiscal month the axis runs — 1M / 3M / 6M (default) / 1Y /
2Y — and `buildScenarioChartPoints` (in
`src/data/scenarios/series.ts`) pins the axis to that range, seeding
each variant's starting value from the latest pre-range balance and
carrying the final balance forward past the last dated row. A legend
chip row above the chart toggles individual series in and out
(ephemeral state, all on by default, independent of the active tab).
Scenario series colors derive from the scenario's index via
`scenario-colors.ts` — theme tokens, never persisted.

### Scenario diff

The "View changes" view (`ScenariosDiffModal`, opened from the sheet
title's "…" menu while a scenario is active): the active scenario's
deltas vs the Baseline as a date-sorted diff — overridden rows as
"old → new", excluded rows struck through with a minus marker, added
rows with a plus marker. Built by `diffScenario` in
`src/data/scenarios/apply.ts`; a delta-free scenario shows an empty
state. Only **actual** changes appear: an override field that re-states
the base row's own value is skipped (and the commit path never stores
one — see [Scenario](#scenario)), so the diff never renders a no-op
"old → old" line. Rows without a user-authored description fall back
to their company or type name (the diff entries carry the base row's
`typeId` / `companyId` for the lookup), the same chain the month
tables render.

## Data and storage

### User data

`UserData` in `src/data/types.ts` (also "state" / "the budget"). The
top-level persisted shape. Bumps `version` on schema changes.

### Sheet item

A discriminated-union member inside `Sheet.items`. Today: `AccountBudget`
(budget page), `AccountsView` (accounts page marker), `ItemsView` (items
page marker), `SalaryView` (salary page marker), `PropertiesView`
(properties page marker), `SavingsView` (savings page marker),
`LoansView` (loans page marker), `InsightsView` (insights page —
carries the per-mode settings, see [Net worth
settings](#net-worth-settings)), `InvestmentView` (investment page
marker), or `ScenariosView` (scenarios page — carries the base-budget
binding, monitor dates, and the scenarios themselves, see [Scenarios
page](#scenarios-page)).

### Account budget

`AccountBudget` — the budget-page data: `accountId`, `columns`, `rows`.
One per budget sheet.

### Row

`Row` in `src/data/types.ts`. A budget row with `id`, `cells`, optional
`seriesId`, `recurrence`, `transferId`, `historyEntryId`,
`amountFormula`, `amountMin` / `amountMax`, etc.

### Column

`Column` in `src/data/types.ts`. Defines a column's `id`, `type`
(date / text / amount / balance / completed / type / category), `label`,
`width`.

### Coverage

A fiscal month that imported bank history brackets ("covered month") —
the statement is authoritative, so manual rows there are contradicted.
Helpers in `src/data/coverage.ts` (`coveredMonths`, `isMonthCovered`,
`coverageDelta`).

### Cell value

`CellValue` in `src/data/types.ts`. The persisted value of one row ×
column pair.

### Synthesized row

A read-only row rendered into the budget table but not stored as a
`Row`. Built by `synthesizeTransferRow` / `synthesizeHistoryRow` in
`src/data/budget/synthesis.ts`.

### Series

A set of rows linked by `seriesId`, created when a row gets a
`recurrence` rule and `expandRecurrence` fans it out. Editing asks "just
this row or future?". An imported bank entry reconciled to a series row
keeps the link via `HistoryEntry.userSeriesId` (the matched row is
deleted as redundant), so the synthesized historic row stays a series
member and the recurring entry can be tracked across all its past
occurrences.

### Recurrence rule

`RecurrenceRule` in `src/data/recurrence.ts`. `monthly` / `weekly` /
`custom-dates`. Drives series generation.

### Entry type

`EntryType` in `src/data/types.ts` (a "type"). A labelled tag for a row
(Salary, Rent, …). Carries a colour, glyph, and category.

### Category

`Category` in `src/data/types.ts`. The top-level grouping of types
(Food, Transport, …). User-added + presets.

### Subtype

`Subtype` in `src/data/types/categories.ts` (`UserData.subtypes`). The
third taxonomy tier below category → type ("Consumption" →
"Electronics" → "Laptop"). Name + parent `typeId` only; 100 %
user-defined, no presets, never shown on the sheet. Assigned to an
`Item` in the item creator via `SubtypePicker`, or to a property repair
via the repairs editor (parented to the Repairs / Renovations types).
Subtypes parented to Repairs / Renovations are filtered out of the Items
sheet's pickers by `itemSubtypes` (`src/data/items/subtypes.ts`).
Managed (renamed / deleted, grouped under their parent type) by
`SubtypesAdmin` (`src/components/SettingsModal/SubtypesAdmin.tsx`,
bucketed via its `bucket` prop) in two settings tabs: item subtypes in
the **Items** tab, Repairs / Renovations subtypes in the **Properties**
tab (they used to share a section on the Categories tab). New subtypes
are still only minted from the item / repairs editors, so the admin has
no add affordance.

### Item

`Item` in `src/data/types/items.ts` (`UserData.items`). A physical thing
the user owns; two physical units = two `Item`s. Optional `subtypeId`
gives its taxonomy. Created after the fact via `ItemPicker` (in the
line-items modal), not during entry add / edit, and edited via the Edit
item modal. Beyond name / subtype it carries the inputs the Items sheet
needs: `purchasePrice` ("bought for" — set either in the Edit item modal
or from the amount typed when a line item links a transaction to it),
`acquiredAt` ("bought at"), a `depreciation` rule (`ItemDepreciation`
— steady percent-per-year, or the accelerated front-loaded curve; see
"Current value (item)"), a `lifetimeYears` expected useful life (drives
the spending dashboard's "spread item costs" mode; independent of
`depreciation`, which models resale value), a `resaleValue` override,
and disposal (`disposedAt` / `soldFor`). The Items sheet renders the
catalog and rolls up tied-up capital and current (resale) value. An
item is linked to at most one transaction (the picker hides
already-linked items); its
receipt is NOT held on the item but on that linked purchase, surfaced
through the item row "…" menu.

### Edit item modal

`ItemEditorModal` in `src/components/ItemEditorModal.tsx`, hosted by
`UniversalModalHost`. A root-level (universal catalog) editor mirroring
`CompanyEditorModal`, reached via the `open-edit-item` modal command
from the line-item pill / popover. Sets every `Item` field — name,
subtype, purchase price, acquired date, depreciation, lifetime (years),
resale value, disposal, note — and can delete the item (cascading link
removal via the
`deleteItem` reducer). The depreciation box carries a two-segment
Steady / Accelerated model toggle: Steady asks for a single rate per
year, Accelerated asks for the initial drop, the first-year rate, and
the following-years rate (a blank first-year rate inherits the
following-years rate). Distinct from `BudgetLineItemsModal`, which edits
the links between an entry and items (and the entry's receipt), not THE
item.

### Receipt

A photo or PDF the user attaches to a transaction (proof of the
purchase). Since an item is linked to at most one transaction, the
receipt is surfaced and managed per-item: the item row "…" menu
(`ItemEntryActionsMenu`) opens the shared attachment modal
(`AttachmentUploadModal`) bound to the linked transaction's
`receiptPath`, to upload / view / replace / remove it. AppShell resolves
which transaction via `findItemLink` (`src/data/items/link.ts`) and
names the file off the item (its name + acquired date) through
`buildReceiptPath`. The file is written to a `receipts/` subfolder of
the active storage backend via the adapter's `ReceiptOps`
(`src/storage/adapter.ts`) — implemented on the folder / Dropbox /
Google Drive adapters, absent on `browser`-localStorage, so the menu
entry only appears when `adapter.capabilities.has("receipts")`. Stored
as raw image / PDF bytes and never encrypted — the `withEncryption`
wrapper passes receipts through untouched, so toggling encryption never
re-wraps them. The stored path is held in `Row.receiptPath` (user rows)
/ `HistoryEntry.receiptPath` (imported transactions); the file itself
does not travel through JSON export / import. (The line-items modal no
longer edits the receipt — it only links items.)

### Receipt name pattern

`Settings.receiptNamePattern` — one of four presets (`name`,
`name-date`, `date-name`, `type-name-date`) the user picks in the Items
settings tab that decides how a receipt file is named. The primary token
is the transaction's company (falling back to its description). The pure
builder is `buildReceiptPath` in `src/data/items/receipt-name.ts`; the
`type-name-date` preset files the receipt under a per-type subdirectory
inside `receipts/`. A name collision with another transaction's receipt
appends a short id suffix.

### Payslip

A photo or PDF the user attaches to a salary (proof of the paycheck,
"lönerapport"), the salary-sheet analogue of a receipt. Uploaded /
viewed / replaced / removed via the salary row "…" menu
(`SalaryEntryActionsMenu`), which opens the shared attachment modal
(`AttachmentUploadModal`); it renders the blob inline rather than
opening a `blob:` URL in a new tab — the latter hangs on iOS in-app
browsers and standalone PWAs. The file is written to a dedicated
`payslips/` folder of the active storage backend via the adapter's
`payslips` ops (a second `ReceiptOps`-shaped object in
`src/storage/adapter.ts`) — present on the folder / Dropbox / Google
Drive adapters, absent on `browser`-localStorage, so the control only
appears when `adapter.capabilities.has("payslips")`. Stored as raw image
/ PDF bytes and never encrypted. The filename is the flat `Employer -
YYYY-MM.<ext>` (employer name falling back to a "Payslip" label, pay
month from `Salary.date`, short id suffix on collision) built by
`buildPayslipPath` in `src/data/salary/payslip-name.ts`. The stored path
is held in `Salary.payslipPath`; the file itself does not travel through
JSON export / import.

### Line item

`LineItemLink` in `src/data/types/items.ts`. Connects a row /
`HistoryEntry` to an `Item` it bought. It carries no price of its own —
the amount the user types when adding the line item is written onto the
linked `Item` as its `purchasePrice`, and the pill / popover / allocation
"remainder" read the price back off the item (signed by the
transaction's direction); the unallocated balance is an implicit,
unstored remainder. Stored inline on `Row.lineItems` /
`HistoryEntry.lineItems`, edited via `BudgetLineItemsModal` from the
entry "…" menu (which dispatches `updateItem` to set each item's price
alongside `setRowLineItems` / `linkLineItemsToHistoryEntry`). An item
may be linked to at most one transaction: `unlinkedItems`
(`src/data/items/link.ts`) filters the modal's existing-item picker to
items not already linked elsewhere. Cataloguing a fresh purchase usually
means the item doesn't exist yet, so each line's primary control is a
name input — typing a name creates a new `Item` on save, pre-classified
under the transaction's resolved type via an optional subtype dropdown
scoped to that type (whose own "+" swaps the dropdown for an inline
new-subtype input, filed under the type without a type picker). The
PackageSearch button beside the name input opens the selection-only
`ItemPicker` dropdown (`variant="icon"`, `allowCreate={false}`) for the
uncommon already-created-item path; picking one fills the input, typing
again unlinks back to create-new. Parallel to split but distinct — a
split re-slices the entry into rows, line items annotate it. A row with
line items renders a line-item pill in its description cell.

### Line-item pill

The description-cell rendering for a row that has line items
(`LineItemPill` in `src/components/Pills.tsx`). On
a row with no user-authored description it shows an outlined pill —
`Package` glyph for one line item, `Boxes` glyph for many — captioned
with the first added line item's name. With a description present it
instead prefixes the text with the same small glyph. The description
popover lists every line item (name + amount) at the bottom. Item names
resolve through `BudgetContext.itemsById`. A tap opens the description
popover; on a single-item row a long-press / right-click opens the Edit
item modal (`open-edit-item`) for that item, while on a multi-item row
it falls through to the popover where each listed line item is a button
opening the Edit item modal for its own item. The `BudgetLineItemsModal`
(re-allocating amounts) stays reachable from the row "…" actions menu
(`open-line-items`).

### Company

`Company` in `src/data/types.ts` (`UserData.companies`), a "merchant".
The merchant a row's money flows to. Single per row via `Row.companyId`.
Picked with `CompanyPicker`; administered in Settings → Companies
(`CompaniesAdmin`), where the user can also pin drag-ordered
`Company.typeIds` (see company type hint) and assign a company category.
The picker's open list-box supports type-ahead: typing characters jumps
the roving cursor to the first company whose name starts with the
buffer, which resets after a pause (3s) so a fresh prefix starts a new
search. The matched characters on the cursored option are highlighted
(bold + underline) via `HighlightedLabel`
(`src/components/HighlightedLabel.tsx`, splitting logic in
`src/utils/highlight.ts`), and the buffer reset is timer-driven so the
highlight clears on its own when the user pauses — they see the search
"start over" without pressing a key (arrow / Home / End navigation and
closing the picker also clear it). This is shared infrastructure —
`useTypeahead` (`src/hooks/useTypeahead.ts`) folded into
`useRovingTabindex` behind a `typeaheadLabels` option and surfaced as
`typeaheadQuery`, so every name-list picker (type, category, company
category, subtype, item, tag, employer, property file category) gets the
same behaviour by passing one label per row and feeding the query to the
cursored option. Its "New company" creator submits on Enter.

### Company category

`CompanyCategory` in `src/data/types.ts` (`UserData.companyCategories` +
built-in `PRESET_COMPANY_CATEGORIES` in
`src/data/presets/company-categories.ts`), a "merchant kind". A
classification for merchants (Grocery stores, Pharmacies, Fuel …) used
to analyse where the household shops. Single per company via
`Company.companyCategoryId`. Picked with `CompanyCategoryPicker`;
managed in Settings → Companies (`CompanyCategoriesAdmin`), where presets
are hide-only and user entries get full edit / delete. Distinct from
category (which groups rows through their type, not merchants).

### Company pill

The outlined Building2 + name chip a budget row's `DescriptionCell`
renders when the row has a `companyId`, no user-authored description,
and no line items (the line-item pill wins that slot — `CompanyPill` in
`src/components/Pills.tsx`, the universal pill module shared with the
scenarios table). A tap opens the description popover; a long-press /
right-click opens the `CompanyEditorModal` for that merchant via the
`open-edit-company` modal command (owned by `UniversalModalHost`). The
read-only `BudgetViewerModal` and the scenario rows reuse the exported
`CompanyPill` for the same fallback, without the interactive
affordances.

### Tag

`Tag` in `src/data/types.ts` (`UserData.tags`). A colour-coded label
cutting across categories / types; a row carries several via
`Row.tagIds`. Assigned through `TagsPicker`; administered in Settings →
Tags (`TagsAdmin`). Distinct from entry type (a single bucket).

### Preset

A built-in immutable category or entry type. `PRESET_CATEGORIES`
(`src/data/presets/categories.ts`) / `PRESET_ENTRY_TYPES`
(`src/data/presets/types.ts`). Hide-only, never edited.

### Match rule

`MatchRule` in `src/data/types.ts` (a "pattern rule"). A wildcard match
on raw bank description (+ optional amount filter) that stamps type /
company / description / tags onto matching entries and rows. Evaluated
in `data.matchRules` array order; reordered in Settings → Patterns.

### Merchant hint

`MerchantHint` in `src/data/types.ts`. A learned association from a
normalised bank-description key to a description + typeId. Applied during
`synthesizeHistoryRow`.

### Company type hint

A company's associated types ("suggested type"), ranked manual
`Company.typeIds` first then learned-by-usage, computed by
`computeCompanyTypeHints` (`src/data/budget/company-type-hints.ts`). A
company resolving to one type instant-fills it on pick; several render
as the "Suggested" band atop `TypePicker`.

### Type company hint

The inverse direction: a type's most-used companies, ranked by learned
usage count (no manual-pin source exists for this direction), computed
by `computeTypeCompanyHints` (`src/data/budget/company-type-hints.ts`).
When a budget row has a type set but no company, the row's description
popover surfaces these as a "Suggested" band atop the inline
`CompanyPicker` — picking a type first short-cuts straight to that
type's usual merchants without scrolling the full alphabetic company
list (where the same companies still appear). Threaded through
`BudgetContext.typeCompanyHints` and resolved per-row in `BudgetRow`.

### Description company hint

A merchant's most-used companies, keyed off the **description** rather
than a picked type, computed by `computeDescriptionCompanyHints`
(`src/data/budget/company-type-hints.ts`). Every time the user flags a
budget row or a bank-history entry with a company, that
`(normalised-description → companyId)` pairing is tallied (the
description is run through the shared `normaliseDescription`, so dates,
reference numbers, and currency tokens are stripped and cosmetic
statement noise collapses); the companies most often paired with a key
are ranked by descending usage. Purely usage-derived and recomputed
from data, so the guesses get steadily smarter as more entries are
tagged — no persisted shape, no migration. When a row or entry needs a
company, the same merchant surfaces its learned company atop the
`CompanyPicker` as the "Suggested" band — and unlike the type company
hint it works **before any type is set**, since it's the merchant text
itself that drives the suggestion. In the inline row popover it is
merged ahead of the type company hint via `mergeCompanyHintIds`
(description hits lead, the type's usual companies fill the rest);
`descriptionCompanyHintsFor` centralises the normalise + lookup so
every call site (the inline row picker, the metadata modal, and the
per-entry `EditHistoryEntryModal`) resolves a description the same way.
Threaded through `BudgetContext.descriptionCompanyHints`.

### Drag-to-reorder

A reusable HTML5 drag primitive (`useDragReorder`,
`src/hooks/useDragReorder.ts`) + id-based array helpers `reorderById` /
`arrayMove` (`src/utils/reorder.ts`). Used by the company type-priority
list and the sheet-reorder list in Settings → General (drives the
bottom-bar tab order via the `reorderSheets` action); `moveColumn`
delegates to it.

### Series match rule

`SeriesMatchRule` — an auto-reconciliation rule learned from "Apply to
whole series" in the reconciliation modal.

### Rename pattern

`RenamePattern` in `src/data/types.ts`. A per-account memory of "the
bank wrote X, the user calls it Y", keyed by the normalised bank
description. Recorded by the `updateHistoryEntry` reducer; surfaced by
the Rename predictor.

### Promote

A verb: take a one-off history entry and "promote" it into a budget row
with a recurrence rule.

### Reconciliation

Pairing newly-imported history entries with existing budget rows so the
running balance stays anchored. See `src/data/reconciliation.ts`.

### Transaction

User-vocabulary term for any +/- post on an account — the code type is
`HistoryEntry` in `src/data/types.ts`. A cross-account movement is a
Transfer, not a transaction. Settings like `transactionSortOrder` use
this sense.

### Opening balance

An account's starting balance (`Account.openingBalance`), or a budget
sheet's anchor for the running balance.

### Orphan

A manual budget row sitting inside a covered fiscal month — the bank
statement contradicts it ("orphan row" / "prediction that didn't post").
Detected by `findOrphans` in `src/data/reconciliation.ts`. Resolved
(keep / delete / move) via the reconciliation modal or the orange
covered-month footer.

### Running balance

The per-row balance ("balance column") derived by `computeBalances` in
`src/data/sheet.ts`. Not stored — recomputed on render.

### Balance correction

A row that brings the running balance to a user-asserted value. Created
via `correctAccountBalance` from the UpdateBalanceModal.

### Fiscal month

The month-grouping logic. May shift forward / back based on the user's
payday (`detectPaydayDayOfMonth`). See `src/data/fiscal-month.ts`.

### Payday

The user's chosen day-of-month. Aligns fiscal months and is a "move
orphans here" target in reconciliation.

### Primary income

A recurring series flagged as the user's main payday ("great income of
the month", `UserData.seriesMetadata[seriesId].isPrimaryIncome`). An
occurrence landing before the configured `anchorDayOfMonth` gets
`fiscalMonthShift = 1`. See `computePrimaryIncomeShift` in
`src/data/sheet.ts`; edited from the Edit-row modal.

### Fiscal month shift

The optional `Row.fiscalMonthShift` (`-1` / `+1`) forcing a row into a
different fiscal month than its date implies ("month override"). Set by
the primary-income detector or manually via the Row actions menu.
Cascades to same-day rows; cued by a ↗ / ↙ glyph by the date cell.

### Gross and net

Gross / net salary (also "brutto" / "netto"). The bank deposit is the
net; the user enters the gross and the absolute tax is the difference.
Per-year salary tables total both. Helpers in
`src/data/salary/salary.ts`.

### Backend

A storage backend. `browser` (localStorage), `folder` (File System
Access), `dropbox`, `gdrive`. See `src/storage/`.

### Cloud backup

A timestamped JSON snapshot in cloud storage. Listed and restored via
`src/components/CloudBackupModal.tsx`.

### Encryption

A per-user choice (`none` or `password`). Wraps every cloud write in an
AES-GCM envelope via `src/storage/encrypting-adapter.ts`.

### Achievement

A tier-based feature trophy. The catalogue is in
`src/data/achievements/catalog.ts`. Unlock fires via the bus.

## Cross-cutting UI primitives

### Modal

An overlay with a backdrop that blocks the background.
`src/components/Modal.tsx` is the shared shell. Fullscreen on mobile by
default (iOS soft-keyboard math); pass `centered` for input-free modals.

### Dialog

A lighter modal-like confirm / choose UI. Examples: `ConfirmDialog.tsx`,
`ApplySeriesDialog.tsx`, `CloudLinkDialog.tsx`.

### Panel

A non-blocking overlay (no backdrop, doesn't steal focus).
`FloatingPanel.tsx` is the portalled dropdown shell.

### Picker

A custom dropdown for choosing one of many. Never use a native
`<select>`. Examples: `CategoryPicker.tsx`, `TypePicker.tsx`,
`LanguagePicker.tsx`, `BackendPicker.tsx`, `GlyphPicker.tsx`.

### Batch value import

`BatchValueImportModal.tsx` — the universal "Import from file" modal shared
by every "update value / balance over time" modal (items, property,
savings, loans, investment holdings, stock prices). The user drops a CSV
or `.xlsx` file; it renders as a spreadsheet-style grid where clicking a
column header marks it as the **date** column (accent tint) or the
**value** column (positive tint). The two chosen columns are previewed
**normalised** — the date column shows the parsed ISO date in the user's
display format, the value column shows the parsed number — and rows that
can't be read are dimmed so the user sees exactly what will and won't
import before committing. A role toggle picks which role a header click
assigns; detection seeds a sensible default but both roles are always
re-assignable.

The page-agnostic plumbing lives in `src/data/import/value-import.ts`:
`readTabularFile` (xlsx via `src/storage/xlsx-reader.ts`, otherwise CSV via
`src/utils/csv.ts`) parses the file into a dense grid with header
detection; `suggestColumns` scores each column for date-ness / number-ness
(plus header-keyword nudges in English and Swedish) to pick the defaults;
`buildPoints` turns the two columns into `{ date, value }[]`, skipping
rows that don't parse and clamping the sign (magnitude by default,
signed for savings); `mergeImportedPoints` folds them into an entity's
existing history one-point-per-date (a covered date is replaced, its id
reused so a re-import is idempotent), generalising
`applyImportedSavingBalances`. Date parsing handles ISO, year-first,
numeric day/month-first (disambiguated per-column by `inferDayFirst`,
falling back to the user's `dateFormat`), two-digit years, Excel serials,
and English / Swedish month names — see `src/utils/parse-date.ts`.

Each modal renders the importer behind an **Import from file** button and
passes an `onImport` callback that its host dispatches as a per-entity
bulk action (`importItemValues`, `importPropertyValues`,
`importSavingBalances`, `importLoanBalances`,
`importInvestmentHoldingValues`, `importStockPrices`) — one undo entry per
import.

### Modal search bar

`src/components/ModalSearchBar.tsx` — the search-field shell rendered at
the top of a modal body (search icon + `ClearableInput` + optional
`actions` slot), the "in-modal search". `src/components/ModalSearchControls.tsx`
is the universal sort-toggle + filter-popover cluster dropped into that
`actions` slot (a `sort` toggle, a generic `filters` checkbox array,
plus optional `timeRange` quick-pick / `amount` / `dates` range-slider
sections, with shared chrome strings in the `search.*` i18n namespace).
The month-number slider math the `dates` section needs lives in
`src/utils/date.ts` (`isoToMonthNum` / `monthNumToKey` /
`monthNumToIsoStart` / `monthNumToIsoEnd`); the time-range option list
(`MAX_AGE_OPTIONS`) and `ageFloorIso` live in `src/data/search.ts`.
Restyling either propagates to every search modal at once. Used by
`BudgetViewerModal`, `AccountTransfersModal`, `HistoryModal`.

### Toast

An ephemeral status message at the bottom. `src/components/Toast.tsx` +
`useToast()`.

### Update toast

`src/components/UpdateToast.tsx` — the "new build, click to reload" PWA
prompt. The service-worker registration, update polling, and
download-progress tracking all live in the shared `usePwaUpdate` store
(`src/hooks/usePwaUpdate.ts`) so the toast and the header wordmark read
the same state; the component itself is just the completion CTA. When
the workbox `waiting` event fires the store fetches `version.json`
(emitted into the slot root by `emitVersionJson()` in `vite.config.ts`,
cache-bypassed so the still-active old SW lets it reach the network) to
name the _incoming_ build's version — not the running bundle's
`BUILD_LABEL`, which is the version being upgraded away from. Falls back
to a version-less message when the fetch fails (offline, or a deploy
predating `version.json`).

While a new build downloads, the store turns its transfer into a real
percentage and fills the header **budget** wordmark gold from the
bottom — like a glass of water — and the toast surfaces once it is
full. Workbox exposes no precache-progress API, so the store watches
the shared precache Cache Storage from the window: a build-time plugin
(`emitPrecacheManifest()` in `vite.config.ts`) emits
`precache-manifest.json` listing every precached asset and its byte
size, and the store sums the sizes of the entries already present in
the cache against the manifest total. Content-hashed assets change URL
every build, so they only count once the new SW actually downloads
them, which is what makes the fill track the real transfer. The fill
gradient reads `var(--meta)` (the logo gold) so it follows the user's
theme, and the `.pwa-title-fill` rule lives in
`src/styles/utilities.css`.

### Active row

The "this row has an open editor / popover / swipe" registration ("row
claim" / "row coordinator"). Provider: `ActiveRowProvider.tsx`; claim
from a child via `useClaimActiveRow.ts`. Every in-row interactive
element MUST claim.

### Sheet swipe

The left / right gesture to switch between sheets.
`src/hooks/useSheetSwipe.ts`. An edge band is reserved so row swipes
don't collide.

### Action column compaction

The desktop fallback for the row swipe. On the mobile layout every
sheet table hides its trailing action strip (pen / trash / ⋯) behind a
left-swipe; desktop has no equivalent gesture, so when the browser
narrows enough that the table can no longer fit the strip the action
column used to overflow the `overflow-clip` wrapper and disappear off
the right edge — unreachable. `useActionsCompaction` (`src/hooks/`)
watches each table's wrapper and, on the desktop layout only, flips a
`compact` flag the instant the table would overflow (with a hysteresis
band so it doesn't flip-flop right at the boundary). The flag tags the
`<table>` with `.actions-compact` — unlayered CSS in
`src/styles/utilities.css` then hides the inline pen / trash and the
header label and narrows the column to the lone ⋯ menu — and rides
`ActionsCompactContext` (`src/components/ActionsCompactContext.ts`) into
the per-sheet `*ActionsMenu` components, which grow Edit / Delete
entries so neither action is lost. Wired into all six sheet tables
(budget, accounts, items, salary, loans, savings); the mobile swipe
overlay is untouched.

### Glyph

A lucide-react icon, addressed by name. See the `CategoryIcon` union in
`src/data/types.ts` and the `CategoryIconGlyph` registry in
`src/components/icons.tsx`.

### Pill

The rounded informative chip idiom — a small bordered capsule carrying
a short piece of information, sometimes clickable: a type or category
name on a budget row, the reset cadence ("every 2 years") next to a
mortgage's rate, "today" when scrolled away from the current month.
There is no single Pill component. The shared renderer for entities
that carry `{ name, color, icon }` is `EntityChip`
(`src/components/EntityChip.tsx`, wrapped by `CategoryChip` /
`TypeChip`); each other surface keeps its own variant: the line-item
pill, company pill, and read-only type badge shared by the budget and
scenarios tables (`src/components/Pills.tsx`), the orange / cyan token
pills inside
`BudgetFormulaInput`, the Today pill that jumps the budget back to the
current month (`useScrollToToday.ts`), and the rate-reset cadence pill
in a property card (`PropertyCard.tsx`, `properties.rateResetPill*`
keys). New pills follow the same shape: `rounded-full`, thin border,
tinted fill matching the entity's colour.

### Settings section

The labelled `<fieldset>` group every Settings tab is built from
("collapsible section") — `Section` in
`src/components/SettingsModal/tabs/shared.tsx`. Auto-detects when its
rendered content is taller than half the viewport
(`COLLAPSE_VIEWPORT_RATIO`, measured live via `ResizeObserver`) and
turns the title into a fold toggle: collapsed it shrinks to a slim
dashed bar with a "Tap to expand" hint. Children stay mounted while
folded. Folding one fires the `tidyMind` achievement. Short sections
render as a plain fieldset, unchanged.

### Clear button

The inline X that drops an input's value in one tap (the "(x) button in
input"). `ClearableInput` / `ClearableTextarea` in
`src/components/form/`. Cramped in-table `BudgetCell` editors use
`useSelectAllOnFocus` instead.

## i18n

### Catalog

The English catalogue (composed from per-namespace files under
`src/i18n/locales/en/`) widened into a `Catalog` type that enforces
every other language's coverage at compile time.

### Lang

The `Lang` union in `src/i18n/locale.ts`. Currently `"en" | "sv"`.

### t()

The lookup function from `useT()`. Autocompletes against the `Catalog`
type.

### Plural helper

`plural()` in `src/i18n/index.ts`. Switches between `...One` / `...Other`
keys based on count.

## Workflows / verbs the user might say

### Add a sheet

"New sheet" in the header Sheet switcher dropdown opens `SheetModal`
with no sheet preselected.

### Edit a sheet

Title "…" menu → `SheetModal` with the active sheet's metadata.

### Add a row

Tap `BudgetAddEntryButton` in any month of the budget page. Long-press
opens the recurring / categorised picker.

### Promote a history entry

From the budget page's history row, open `BudgetEditEntryModal` → "Make
recurring". Mints a series and records a merchant hint.

### Split an entry

`BudgetSplitEntryModal` — break one entry into multiple categorised
rows, each with its own type and company.

### Collapse a transfer

Detected automatically; the user accepts via
`AccountTransferCollapseModal`.

### Import history

`AccountActionsMenu` → "Import" → `ImportHistoryModal` → bank parser →
`AccountReconciliationModal`.

### Cut history

`AccountActionsMenu` → "Cut history" → `AccountCutHistoryModal`. Drops
old entries + transfers, restoring the partner leg of any collapsed
transfer it removes (see Cut history modal).

### Update balance

`AccountsPage` row → "…" overflow menu → Update balance →
`UpdateBalanceModal`. Disabled when no AccountBudget points at the
account.

### Mark as transfer

A per-row eye toggle. Sets `Row.isTransfer = true` so the `hideTransfers`
setting can suppress it. Does NOT mint a Transfer.

### Ignore for statistics

A per-row action in the budget entry "…" menu (`BudgetEntryActionsMenu`,
`Ban` glyph). Sets `Row.ignored = true` (or `HistoryEntry.ignored` for a
synthesized history row, via `updateHistoryEntry`). An ignored entry
stays in the ledger and keeps contributing to the running balance — it's
real money — but `isActualSpendingRow` drops it from the spending
dashboard's facts, so it never skews "Visualize spending", the
income-vs-expenses line, the category donut, or the top-merchants table.
Distinct from a transfer (which is inter-account noise) and a gift (a
real expense): use it for a charge that happened but isn't
representative of the household's own spending — e.g. paying for someone
else who'll reimburse off-budget. Only `true` is ever persisted; the
toggle wires through `useRowMutations.onToggleRowIgnored` →
`toggleRowIgnored` (user rows) / `updateHistoryEntry` (history rows), and
the flag surfaces in `BudgetEntryInfoModal`. In the ledger the row carries
an `is-ignored` class (`BudgetRow`) that washes it a faint muted grey
(`src/styles/utilities.css`) so an ignored entry is recognisable at a
glance — it wins over the green `is-finished` tint when a row is both.

### Triage orphans

Tap the orange "{N} entries to move or delete" button on a covered
month's footer (or finish a bank-history import). Opens
`AccountReconciliationModal` scoped to that month; keep / delete / move
each row.

### Sign out

Header burger menu ("switch user"). Triggers `AppShell`'s sign-out /
switch-user handlers.

## Conventions for editing this file

- One H3 per dictionary term, under the H2 that mirrors the dictionary
  section. The heading is the primary term (slash-aliases go in the
  prose); qualify a name that collides with another section's term
  (e.g. `Current value (item)` vs `Current value (property)`).
- Explain current behaviour and invariants — control flow, the data it
  reads / writes, the surfaces it touches. Not changelog narration
  ("used to…", "previously…", PR numbers).
- Keep the inline `file.ts` / `symbol` references so the prose stays
  navigable; the dictionary row carries the same path as the lookup
  key.
- Every term added here gets a matching `dictionary.md` row (and vice
  versa) **in the same PR** as the code change. The two move together.
- Deep module / persisted-shape mechanics that aren't about a single
  user-facing concept belong in `docs/architecture.md`, not here.
