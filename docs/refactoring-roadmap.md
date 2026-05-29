# Refactoring roadmap

Running ledger of refactor candidates for this codebase. The list is
the source of truth for the `refactor` skill — that skill picks an
item, re-verifies it (line counts and severity shift over time), and
either lands it, moves it to **Investigated and skipped**, or extends
the roadmap with newly-discovered smells.

`AGENTS.md` used to embed this list inline; it now lives here so the
core agent guidance stays scannable.

## Strategic context

The codebase is preparing for a feature wave: new sheet types
(**savings**, **investment**, **scenario**, **analysis**,
**prognosis**, **loans**), more bank parsers, possibly an
Open-Banking integration, possibly React Native and desktop wrappers.

That trajectory is what determines whether a smell matters. A 100-line
quirk that only the budget page touches is mostly cosmetic; a 100-line
quirk that every new sheet type would have to re-implement is a
blocker. **When rating a candidate, ask "what would it cost to add the
six new sheet types right now?" — that cost is the severity.**

The local-first, no-backend invariant still holds. Refactors must not
introduce a server, account, or third-party service. They also must
not regress the storage / encryption / sync guarantees stated in
`src/components/PrivacyPage.tsx`.

## Severity rubric

Rate each candidate 1–10 against the heuristic above:

| Band     | Meaning                                                                                                                                                                            |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **9–10** | Architectural blocker. Adding any new sheet type, backend, or platform wrapper bumps into this. Persistence / correctness risk. Land before the feature wave.                      |
| **7–8**  | Multiplier. The smell is local today but every new sheet type / parser / wrapper would have to thread through it, multiplying its blast radius. Land before adding the second one. |
| **5–6**  | Friction. Slows iteration; reading the code is harder than it has to be. Worth landing soon but feature work can ship through it.                                                  |
| **3–4**  | Nit with leverage. Cheap to address; cleans up the surface area. Land opportunistically (alongside a feature-touch on the same file).                                              |
| **1–2**  | Cosmetic. Don't land in isolation. Mention only because the next sweeper will otherwise re-propose it.                                                                             |

**Threshold:** the skill lands items rated **3 or higher**. Items
rated **1–2** are left alone (or moved to **Investigated and skipped**
with the reason). The exception is **easy wins** — mechanical,
boring, low-risk transforms with an obvious upside (rename, file move,
extracting a helper used at five sites) — those land regardless of
rating because the cost is near-zero.

Severity is **re-rated on pickup**, not blindly trusted. Line counts
shift; some smells get worse, others quietly evaporate as adjacent
code gets fixed.

## How this file is organised

- **Pending** — candidates worth doing, grouped by severity band,
  with notes on shape and risk.
- **Landed** — short summaries with file paths so a new agent can
  see what already shipped before proposing a duplicate.
- **Investigated and skipped** — candidates the sweep rejected, with
  the reasoning so they aren't proposed again on the next pass.

When you complete an item, move it from **Pending** to **Landed**
with a one-line summary and the date (`YYYY-MM`). When you reject
one, move it to **Investigated and skipped** with the concrete
call-site count or behavioural reason that made it net-negative.
When the exploration mode of the skill finds something new, add it
to **Pending** with a rating.

---

## Pending

### Severity 9–10 — architectural blockers

_Currently empty._ Re-surveyed top-to-bottom 2026-05 (full refresh —
see Sources). No single candidate gates the feature wave on its own.
The persistence-engine and per-backend splits all landed; the
type-safety, import-direction, and native-`<select>` sweeps came back
clean (zero hits). The closest thing to a blocker is the
**sheet-type-registry coverage** cluster in the 7–8 band, but it is
deliberately deferred to land _with_ the first new sheet type rather
than speculatively now. The multipliers below are worth landing
before adding the second new sheet type; feature work can ship
through them.

### Severity 7–8 — multipliers (land before the second new sheet type)

- **Sheet-type registry doesn't cover validation, item-action
  discrimination, or cross-sheet traversal** — the
  `SHEET_TYPE_REGISTRY` (`src/data/sheet-types/`) landed for
  `reduceItem` dispatch (see Landed), but three other places still
  hard-code the sheet-item type literal and would each grow a new
  arm per sheet type. Re-surveyed 2026-05; current evidence (grep
  `"accountBudget"` across `src/data` + `src/storage` → 40 hits,
  of which most are legitimately budget-scoped and stay put):
  - **Validator dispatch** — `validateSheetItem()` in
    `src/data/validate/sheet.ts:256-280` is a literal if-chain on
    `type === "accountBudget"` / `"accountsView"`, threading four
    `known*Ids` sets that `accountsView` ignores. Every new sheet
    type adds an arm + its own context shape. (The `sheet-types/`
    Landed note **deliberately deferred** folding validators into
    the registry "until multiplied across 6+ flavours" — the
    feature wave is that trigger.)
  - **Item-action discrimination** — the budget descriptor's
    `isBudgetItemAction()` predicate (`src/data/sheet-types/budget.ts`)
    is a hand-maintained switch over budget action types; each new
    sheet type writes its own discriminator and widens the central
    `Action` union in `src/data/reducer.ts`.
  - **Budget-only traversals masquerading as universal** — modules
    at `src/data/` root that read `item.type === "accountBudget"`
    despite not living under `budget/`: `search.ts:369`,
    `achievements/catalog.ts:84`, `storage/backup-metadata.ts:17`.
    (`payday` and `company-type-suggestions` were genuinely
    budget-only and **moved into `src/data/budget/`** 2026-05 — see
    Landed.) `search`, `achievements`, and
    `backup-metadata` are conceptually cross-page (you'll want to
    search / count / back up rows from every sheet type) and want a
    registry callback (`rowsForBackup?` / `searchableRows?` /
    `countableRows?` on the descriptor) so they don't silently
    undercount once a second row-bearing sheet type exists.
  - **Plan**: add optional descriptor fields to `SheetTypeDescriptor`
    — `validate?(raw, path, ctx)`, `itemActionTypes?: readonly string[]`
    (or `ownsAction?(action)`), and the row-accessor callbacks above.
    `validateSheetItem` / the reducer walker / the cross-page
    traversals walk the registry instead of branching on the literal.
    The two existing types (budget + accounts) are the proof the seam
    works; **land the validator + discriminator seam together with the
    first new flavour**, using that flavour as the real second
    consumer rather than building it speculatively against one type.
  - **Risk**: medium. The validator is the single gate on load /
    import — a wrong arm breaks file import, so the migration path
    and round-trip need testing. Pure refactor only: no persisted-
    shape change (the descriptor fields are code, the on-disk shape
    is untouched).
  - **Severity: 7.** The data-layer audit rated parts of this 9; that's
    inflated — the app runs fine on two types today and the registry
    already dispatches `reduceItem`, so nothing is _blocked_. But it
    is the textbook multiplier: every one of the six new sheet types
    threads through all three sub-points, so the recurring cost is
    real and it's the highest-leverage thing to settle as the wave
    starts.

### Severity 5–6 — friction

- **`AppShell.tsx` modal-mount state-ownership shift** — the
  JSX-relocation half of the original severity-8 modal-host item
  landed 2026-05 (see Landed: three modal hosts). Re-verified
  2026-05: `AppShell.tsx` is now **878 lines** (the roadmap's old
  "~930" decayed further), and the three hosts still receive
  prompt / modal-open setters as props — `AccountsModalHost.tsx`
  takes **10** setters, `BudgetModalHost.tsx` takes **14**,
  `UniversalModalHost.tsx` the rest. The sub-hooks in
  `src/components/AppShell/hooks/` still own those `useState`s.
  The remaining "registered modals from a registry" plan moves
  that state into each host and exposes a typed
  `dispatchModal({ kind: "open-edit-row", row })` so AppShell stops
  threading 24+ setters down. **Severity: 5.**
  - Plan: hoist the `useEditPrompts` / `useDeletePrompts` /
    `useBulkSelection` / etc. state into the matching host (or a
    pair of `useReducer`-style contexts colocated with each host).
    AppShell becomes a routing switch + three host mounts with no
    prompt-setter props at all. The hosts become the dispatch
    target every modal-opening flow routes through.
  - Risk: low-medium. Mechanical but touches `BudgetPage` /
    `AccountsPage` prop wiring because some prompts are set from
    page-level callbacks (`onDeleteRequest`, `onEditRequest`).
    Either keep the callbacks in AppShell calling into a
    host-exposed dispatch, or move the callbacks into the hosts.

- **Optional fields on persisted types — `undefined` vs `null`
  drift** — re-verified 2026-05: `src/data/types/accounts.ts` carries
  **26 optional fields** across `Account` (10), `HistoryEntry` (12),
  `HistoryEntrySplit` (2), `Transfer` (2). The de-facto convention is
  `!== undefined` (a codebase grep found 241 `!== undefined` /
  `=== undefined` checks against a single `!= null` site), **but**
  `HistoryEntrySplit.typeId?` / `companyId?` and `Transfer.typeId?`
  are explicitly `T | null`, sending a mixed message, and nothing
  documents or enforces the rule. Adding a new per-account flag risks
  a third convention. **Severity: 5.**
  - Plan: document the convention in `AGENTS.md` (default to
    `field?: T` for "absent / use global default"; reserve
    `field: T | null` for "explicitly cleared by the user, distinct
    from never set"). Sweep `accounts.ts`, `settings.ts`, `rules.ts`
    once and stamp the validator to enforce.

### Severity 3–4 — nits with leverage

- **`useImportFlow.ts` six-modal `useState` collapse** — the
  pipeline-extraction half of the original severity-5 item landed
  2026-05 (see Landed: `stageHistoryImport`), dropping the hook from
  597 → 473 lines and moving the ~155-line `onConfirmImportHistory`
  matcher closure into a pure, unit-tested `src/data/import-staging.ts`.
  What remains is the six parallel `useState` calls (importHistory,
  viewHistory, cutHistory, reconciliation, manualTriage,
  renamePredictor) coordinating six orthogonal modal flows.
  **Severity: 4** (dropped from 5 — the dense business-logic closure
  was the bulk of the weight; the remaining `useState`s are orthogonal
  modal flags, not a reset-together pyramid).
  - Plan: collapse the six modal-open/pending-data `useState`s onto a
    `useReducer` with a `kind`-discriminated action union (the same
    precedent as the landed modal reducers). The win is modest — the
    states are independent — but the reconciliation→renamePredictor
    handoff (`setReconciliation(null); setRenamePredictor({…})`) and the
    import→reconciliation handoff become atomic transitions instead of
    setter pairs, and a discriminated union documents "one import modal
    open at a time".
  - Risk: low-medium. Deep integration point on the deferred-import
    path; the Cancel / success / Escape transitions on every modal
    switch need testing. Not on a cloud-OAuth hot path, so no backend
    smoke-test required.

- **`SettingsModal/admin.tsx` `useAdminUIState()` extraction** —
  half of the previous duplicated-editor item; the `<EntityForm>`
  half landed 2026-05 (see Landed). Re-verified 2026-05: the
  `creating` / `editingId` / `pendingDeleteId` triple-`useState` is
  now confirmed at only **one** clean site (`TypesSection`,
  `admin.tsx:366-368`); `CategoriesAndTypesAdmin` carries a
  differently-named single `creatingCategory` toggle and the
  `CategoryPicker` nested component a separate `creating`. Adding a
  third preset admin (loan types, savings goals) would re-derive it.
  **Severity: 4** — premature at one-to-two sites (it's three
  `useState` lines, not a sub-machine); re-rate up when a
  `<LoanTypeAdmin>` lands and the pattern shows up a third time.

- **`BudgetTransferSearchModal` + `BudgetTransferSearchFilterMenu`
  filter-state extraction** — discovered 2026-05.
  `BudgetTransferSearchModal.tsx` (687 lines) +
  `BudgetTransferSearchFilterMenu.tsx` (604 lines) fuse the filter
  state machine (bounds memoization, category/type/company/tag
  deduplication loops, the `toggleAll*` helpers) into the modal +
  menu. A future per-sheet-type search would re-derive the
  dedup/bounds plumbing. **Severity: 4.**
  - Plan: extract a `useTransferSearchFilter` hook owning the bounds
    memo, the dedup maps, and the toggle/commit functions; leave the
    menu as pure rendering. Revisit a fully generic shape only when a
    second sheet type actually ships an inline search.
  - Risk: low — the per-field memos already exist, this consolidates
    them.

- **`useReducer` in remaining modal state machines (opportunistic)** —
  `useReducer` now has **seven** landed hits
  (`AccountReconciliationModal`, `BudgetRecurrenceForm`,
  `BudgetEditEntryFullModal`, `AccountTransferModal`,
  `BudgetBulkEditModal`, `BudgetMetadataModal`, `BudgetMatchRuleModal`).
  Re-verified 2026-05: the other named sites have decayed and are
  **not** pyramids — `ImportHistoryModal` (3 `useState`, already a
  discriminated `PreviewState` union), `SettingsModal` (independent
  UI toggles that reset on different triggers),
  `BudgetSplitEntryModal` (2 `useState`). **Severity: 3.** Apply
  `useReducer` to a modal only when it grows a 5+-field
  reset-together pyramid (see `BudgetComplexEntryModal` above, now
  tracked separately) or a mode discriminator the current setters let
  drift through.

- **`budget/formula.ts` function registry** — the tokenizer / parser
  / evaluator file split landed 2026-05 (see Landed); what remains of
  the original severity-6 candidate is the function-registry idea so
  new sheet types can register their own functions
  (`loanPayment(rate, years, principal)`). Re-verified 2026-05: every
  existing function (`min`, `max`, `clamp`, `abs`, `round`,
  `categoryTotal`, `typeTotal`, `sheet`) is still budget-scoped, so a
  registry would have nothing to register against. **Severity: 3** —
  re-rate when the first loan/savings flavour needs a domain-specific
  function (it pairs naturally with the sheet-type-registry cluster
  above).

- **OAuth refresh logic duplicated across dropbox/gdrive
  adapters** — Dropbox refreshes via `refreshDropboxAccessToken`
  (dropbox-adapter.ts:169); GDrive uses short-lived GIS tokens with
  no refresh path. Each adapter re-implements 401-handling.
  **Severity: 4.** Skipped previously (see Investigated below)
  because the 4xx semantics legitimately differ; re-verified 2026-05
  (Dropbox 409 path-not-found vs GDrive 404 file-deleted still
  diverge). Revisit only if a third OAuth backend (e.g. iCloud
  Drive) lands.

- **Backup logic per-adapter (Dropbox, GDrive, Folder)** — each
  hand-rolls the backup-index lifecycle via `backup-index.ts` +
  `backup-metadata.ts`. Re-verified 2026-05: all three implement
  `BackupOps` (dropbox ~329-375, gdrive ~400+, folder ~141-175) with
  the same shape; IDB has no backups. (Note: `parseBackupIndex` /
  `serializeBackupIndex` are already shared — only the
  list/create/read/delete lifecycle is duplicated.) **Severity: 4.**
  - Plan: extract a `BackupManager` that accepts an adapter and
    drives the lifecycle. IDB skips backup operations cleanly.

- **Bank parser registry is global, no capability flags** — the
  module-level `registry: BankParser[]` in `src/storage/banks/core.ts`
  (~line 101) registers via a bare `push`, no capability gating. A
  React Native target can't unbundle parsers that depend on
  binary-decompression libs. **Severity: 4.** Defer until a target
  actually needs to drop a parser.

- **`TypePicker.tsx` hardcoded `amountSign` filter** — re-verified
  2026-05 at **747 lines** (the `filterFn?: (type: EntryType) =>
boolean` escape hatch landed and is checked first, `amountSign` is
  the opt-in default at lines ~121-136). **Severity: 3.** Stays put
  until a non-budget sheet type ships and demands a richer registry.

- **Hardcoded user-facing strings drift** — the systematic audit
  landed 2026-05 (see Landed) and consumed the visible chrome hits.
  Re-verified 2026-05: no new native `<select>` (count: 0) and no
  obvious new hardcoded literals surfaced. The remaining drift
  surface is small; promoting the one-off audit script to an ESLint
  rule is the next step but is a tooling change, not a refactor.
  **Severity: 3** — re-rate up if a second batch of hardcoded strings
  surfaces in production.

- **Inline `parseFloat` / `new Date(…)` at remaining sites** —
  `parseInt32` landed 2026-05 and was adopted at the shift-day /
  anchor-day parsers. Re-verified 2026-05: the lone `parseFloat`
  (`useScrollToToday.ts:93`, parsing a CSS computed value) and the
  ~36 `new Date(...)` sites are CSS-value parsing and date
  construction — none share the user-input parsing shape
  `parseDecimal(text, lang)` would cover. Re-rate if
  thousands-separator support lands. **Severity: 3.**

- **Cross-sheet row counters undercount once a second row-bearing
  type exists** — folds into the sheet-type-registry cluster (7–8
  band) but flagged separately because the fix is a one-field
  descriptor callback, not the whole registry pass.
  `achievements/catalog.ts:84` (`eachAccountBudget` traversal) and
  `storage/backup-metadata.ts:17` (`entryCount` over accountBudget
  rows only) silently ignore rows on any future sheet type, so a
  savings / loans workspace would report incomplete achievement
  progress and backup entry counts. **Severity: 3** — harmless today
  (only budget has rows); land with the first new row-bearing flavour.

### Easy wins (mechanical, land regardless of rating)

- **`indexById<T>(items)` adoption at new inline sites** — the helper
  landed 2026-05 (see Landed) and the `search.ts` four-indexer cluster
  was consumed 2026-05 (see Landed). What remains is single
  opportunistic sites in `src/data/budget/export.ts`,
  `formula-resolve.ts`, `formula.ts`,
  `accounts/AccountTransferCollapseModal.tsx`, and
  `AppShell/hooks/useDownloadFlow.ts` — adopt when touching each file,
  none worth a standalone drive-by. Future `Map<string, T>` indexers
  keyed by `item.id` should reach for it from day one.

- The inline `todayIso` / `addMonthsIso` duplication (7 + 2 sites)
  was consumed 2026-05 — see Landed. New ISO date helpers should
  live in `src/utils/date.ts` and import from there.

- **Relocate genuinely-budget-only modules under `src/data/budget/`** —
  `payday.ts` + `company-type-suggestions.ts` landed 2026-05 (see
  Landed). `search.ts`, `achievements/`, and `backup-metadata.ts`
  stay at root / in storage — they're conceptually cross-page and
  want a registry callback instead (see the cluster). The remaining
  root modules (`coverage.ts`, `match-rules.ts`, `merchant-hints.ts`,
  `reconciliation.ts`, `recurrence.ts`, `row-candidate.ts`,
  `rename-patterns.ts`, plus `sheet.ts` / `fiscal-month.ts` /
  `normalize.ts` / `settings.ts` / `themes.ts` /
  `action-payloads.ts` / `reducer.ts` / `migrations/` / `validate/` /
  `hit-count.ts`) are genuinely cross-page or universal.

- Replace remaining native-looking patterns: scan for any new
  `<select>` / `<option>` introduced since the last sweep (AGENTS
  rule forbids them; re-verified 2026-05 — current count: 0).

- Replace `useState`-pyramid modals with `useReducer` as their
  surrounding file is otherwise touched. No batch PR — opportunistic
  drive-by.

---

## Landed

- **`indexById` adoption in `buildSearchIndex` (`src/data/search.ts`)**
  (2026-05): the four inline `new Map<string, T>()` + `for … .set(x.id,
  x)` indexers at the top of `buildSearchIndex` (`typesById`,
  `categoriesById`, `companiesById`, `tagsById`) replaced with
  `indexById(...)` calls from `src/utils/indexById.ts`. `accountsById`
  stays inline — it maps id→name (a `Map<string, string>`), not
  id→item, so the `{ id: string }` helper doesn't fit. Removed the now
  unused `Category` / `Company` / `EntryType` type imports (`Tag` stays,
  used by a later `filter` guard). Mechanical easy win, zero behaviour
  change. Consumes the `search.ts` cluster from the `indexById`
  easy-wins entry, which now lists only single opportunistic sites.
  fmt-check + lint + typecheck + 1043 tests + build + icons-check pass.

- **Save-path retry strategy (`save-retry.ts` + `useSaveStateMachine.ts`)**
  (2026-05): the save chain had no retry at all on transient failure —
  the generic `catch` branch surfaced a red `error` on the first hiccup,
  and the `RateLimitError` branch rescheduled using only the server's
  `retryAfterMs` with no backoff floor or escalation. Added a pure,
  unit-tested policy module `src/storage/save-retry.ts`
  (`MAX_TRANSIENT_SAVE_RETRIES = 4`, an equal-jitter exponential
  `backoffDelayMs(attempt, opts, rand)` capped at 30 s, and
  `isRetryableSaveError(err)` which excludes the three typed adapter
  signals `ConflictError` / `AuthError` / `RateLimitError`). Wired into
  `performSave`'s catch by wrapping the `adapter.save` call in a
  `for (;;)` loop: a transient backend error now sleeps an in-chain
  backoff (the save chain stays in-flight so a queued newer save
  coalesces behind it, and the loop re-checks `isStale()` after each
  sleep so a superseding save / adapter swap abandons it cleanly) and
  retries up to the budget before falling through to the existing
  `error` status. The throttle path gained a backoff floor +
  per-consecutive-429 escalation via a `consecutiveThrottlesRef`
  (`waitMs = max(retryAfterMs, backoffDelayMs(consecutiveThrottles))`,
  reset to 0 on any landed save) so a server returning a tiny/zero
  cooldown can't pull us into a tight resend loop — deliberately no
  budget there, since giving up on a rate limit would stop autosave.
  Not a pure refactor (it adds retry behaviour), but no persisted-shape
  change, no new `SaveStatus` kind, and no UI/i18n surface: status stays
  `saving` across retries. 8 unit tests landed in
  `tests/save_retry_test.ts` (geometric growth, the `[cap/2, cap)`
  jitter window, the `maxMs` clamp, custom options, negative/fractional
  attempt clamping, and the retryable-error classifier). Closes the
  severity-5 "save chain has no retry strategy" item. fmt-check + lint +
  typecheck + 1043 tests + build + icons-check pass.

- **`stageHistoryImport` pure pipeline extraction from
  `useImportFlow.ts`** (2026-05): the ~155-line `onConfirmImportHistory`
  closure that ran the bank-import matcher pipeline — pre-import
  snapshot → `mergeHistory` → silent auto-rule pass → coverage delta →
  candidate / orphan detection → rename prediction — lifted out of the
  hook's `useCallback` into a pure `stageHistoryImport(preImportData,
accountId, parsed, filename, now)` function in
  `src/data/import-staging.ts`. The helper returns a `StagedImport`
  (`{ dedupeOccurred, newEntries, pendingImport, outcome }`) whose
  `outcome` is a `kind`-discriminated union — `commit` /
  `renamePredictor` / `reconciliation` — and the hook now just fires the
  `dedupe` achievement, closes the import modal, and dispatches or opens
  the modal each outcome calls for. `now` is a parameter (was an inline
  `Date.now()`) so the pipeline is deterministic under test. The
  `PendingImport` shape moved to the helper as the single source of
  truth; `ReconciliationState.pendingImport` in
  `src/components/AppShell/types.ts` now references it (dropping the
  duplicated inline type and the now-unused `ParsedBankEntry` import).
  The hook shed five now-unused imports (`coverageDelta`,
  `coveredMonths`, `findCandidates`, `findRuleDrivenCandidates`,
  `mergeHistory`, `Column`/`Row` types) and dropped from 597 → 473
  lines; the new helper is 218 lines. 7 unit tests landed in
  `tests/import_staging_test.ts` covering the commit / reconciliation /
  rename-predictor branches, the reconciliation-over-rename precedence,
  within-file dedupe detection, and the bank-extracted
  clearing/account-number passthrough — none of which were reachable
  before because the pipeline was locked in a closure. Added
  `import-staging.ts` to the `data/` inventory in `docs/architecture.md`.
  This is the pipeline half of the severity-5 `useImportFlow.ts` item;
  the six-`useState`→`useReducer` collapse stays in Pending, re-rated to
  severity 4. Pure refactor — same behaviour, same dispatch order, same
  modal-open transitions; `BudgetModalHost` / `AccountsModalHost` consume
  the hook's result unchanged. fmt-check + lint + typecheck + 1035 tests
  - build + icons-check pass.

- **`BudgetComplexEntryModal` `useReducer` extraction** (2026-05): the
  15 parallel `useState` calls in `BudgetComplexEntryModal.tsx` with
  their 14-field reset-on-open pyramid (`description`, `amountText`,
  `negative`, `amountMode`, `amountMinText`, `amountMaxText`, `typeId`,
  `companyId`, `tagIds`, `isTransfer`, `dates`, `formulaMode`,
  `formulaText`, `resetKey`) collapsed onto a single `useReducer`
  driven by a `ComplexEntryState` shape and a `kind`-discriminated
  action union. The reset-on-open effect previously fired 14 sequential
  `setState` calls (including the seed-vs-blank branch, the
  `normalizeAmountInput(String(abs), settings)` amount-text formatting,
  and the `setResetKey((k) => k + 1)` bump); now one `reset` dispatch
  carrying `{ seed, settings }`, with the seed/blank branch + amount
  formatting moved into the colocated `initialComplexEntryState`
  factory and `resetKey` kept monotonic inside the reducer (the `reset`
  arm reads the prior key and adds one so `BudgetRecurrenceForm`
  re-seeds on every re-open). `useReducer`'s lazy-init third argument
  seeds the form so the first render already reflects the open request.
  The `pickCompany` action folds the `setCompanyId(next)` + conditional
  `setTypeId(auto)` pair into one atomic transition (same precedent as
  `BudgetEditEntryFullModal` / `BudgetMetadataModal`); the
  `autoTypeForCompany` lookup stays in the component because it needs
  the `companyTypeSuggestions` prop the reducer doesn't see. The
  `ComplexEntrySeed` public type moved to the reducer file (re-exported
  from the modal so `useComplexEntry` imports unchanged) to avoid a
  circular import. The reducer + factory live in
  `src/components/budget/budget-complex-entry-modal-reducer.ts`; the
  modal keeps the formula/amount derivations (`parsedAmount`,
  `formulaError`, `formulaResolves`, `canSubmit`) and the `handleSubmit`
  glue. 13 unit tests landed in
  `tests/budget_complex_entry_modal_reducer_test.ts` to lock in the
  blank/seed snapshots, the sign + zero-amount + tagIds seeding, the
  monotonic reset, the atomic `pickCompany` conditional, and that each
  setter only touches its own field. `BudgetComplexEntryModal.tsx` goes
  from 464 → 484 lines (the dispatch-wrapping `useCallback`s offset the
  removed `useState`s); the new reducer file is 162 lines. Pure
  refactor — same behaviour, same i18n keys, same `ComplexEntryDraft`
  payload shape; `BudgetModalHost` consumes the public component
  unchanged. Closes the severity-4 `BudgetComplexEntryModal` reset
  pyramid candidate. fmt-check + lint + typecheck + 1029 tests + build
  - icons-check pass.

- **Relocate `payday.ts` + `company-type-suggestions.ts` into
  `src/data/budget/`** (2026-05): both modules walk every sheet only to
  filter to `item.type === "accountBudget"` and read budget rows
  (salary detection / company→type hints), so they were budget-only
  despite sitting at `src/data/` root. `git mv`'d both into
  `src/data/budget/`, fixed their internal relative imports
  (`./match-rules`/`./sheet`/`./types` → `../`), and rewired all 12
  importers (10 components + 2 test files) plus the four doc-comment
  path references in `BudgetMetadataModal` / `BudgetComplexEntryModal` /
  `BudgetEditEntryFullModal` / `EditHistoryEntryModal`. Added both to
  the `data/budget/` subtree in `docs/architecture.md`. This is the
  mechanical "move" half of the sheet-type-registry cluster's
  "budget-only traversals masquerading as universal" sub-point; the
  cross-page modules (`search.ts`, `achievements/`, `backup-metadata.ts`)
  stay put and want a registry callback instead. Pure file relocation —
  no behaviour change, no persisted-shape change; fmt-check + lint +
  typecheck + 1020 tests + build + icons-check pass.

- **`BudgetMatchRuleModal` form-field `useReducer` extraction** (2026-05):
  the 6 non-amount form-field `useState` calls in
  `BudgetMatchRuleModal.tsx` (`pattern`, `description`, `typeId`,
  `companyId`, `transferFilter`, `saveRule`) collapsed onto a single
  `useReducer` driven by a `MatchRuleFormState` shape and a named-action
  union (`reset | setPattern | setDescription | setTypeId | setCompanyId
| setTransferFilter | setSaveRule`). The win is the reset-on-open
  effect: previously six sequential `setState` calls (including the
  edit-vs-new branch that seeds `transferFilter` to `"any"` for an
  existing rule but `"exclude"` for a fresh one, and the
  `seedPatternFromSeed` derivation); now one `reset` dispatch carrying
  `{ existing, seedEntry }`, with the edit/new branch and the pattern
  derivation moved into the colocated `initialMatchRuleFormState`
  factory. `useReducer`'s lazy-init third argument seeds the form so the
  first render already reflects the open request. The amount filter was
  already extracted to `useMatchRuleAmountFilter` and is untouched. The
  `TransferFilter` type, the `MatchRuleSeed` type, and the
  `seedPatternFromSeed` helper moved to the reducer file; the modal
  re-exports `MatchRuleSeed` so `useMatchRuleAmountFilter` and
  `useMatchRuleUi` keep importing it unchanged, and `MatchRuleDraft`
  (the submit payload, not form state) stays in the modal. The reducer +
  factory live in
  `src/components/budget/budget-match-rule-modal-reducer.ts`; the modal
  keeps the compiled-regex / live-preview / `handleSubmit` glue. 10 unit
  tests landed in `tests/budget_match_rule_modal_reducer_test.ts` to lock
  in the existing-rule seed, the sparse-rule defaults, the
  seed-entry-derived pattern, the blank new rule, the reset-discards-edits
  behaviour, and that each setter only touches its own field.
  `BudgetMatchRuleModal.tsx` drops from 648 → 621 lines; the new reducer
  file is 103 lines. Pure refactor — same behaviour, same i18n keys, same
  `MatchRuleDraft` payload shape; `BudgetModalHost` / `useMatchRuleUi`
  consume the public component unchanged. Closes the high-value
  reset-on-open candidates in the severity-5 modal-`useReducer` item,
  which drops to severity 3. typecheck + lint + fmt-check + 935 tests +
  build + icons-check pass.

- **`BudgetMetadataModal` form-field `useReducer` extraction** (2026-05):
  the 5 per-entry form-field `useState` calls in
  `BudgetMetadataModal.tsx` (`description`, `typeId`, `companyId`,
  `noCompany`, `isTransfer`) plus the parallel `initialRef` snapshot
  collapsed onto a single `useReducer` driven by a `MetadataFormState`
  shape (the live fields + an `initial` snapshot) and a named-action
  union (`reset | setDescription | setTypeId | pickCompany |
setNoCompany | setIsTransfer`). The reset-on-entry-change effect
  previously fired 5 sequential `setState` calls _and_ wrote the
  `initialRef` snapshot; now it's a single `reset` dispatch carrying the
  seed fields, which the reducer mirrors into both the live values and
  the `initial` baseline. The `pickCompany` action folds the
  `setCompanyId(next)` + conditional `setTypeId(auto)` pair into one
  atomic transition (same precedent as `BudgetEditEntryFullModal`),
  removing the brief intermediate render where the company changed but
  the auto-filled type hadn't landed. `dirty` and the per-field touched
  comparisons in `handleSave` now read `form.initial.*` instead of
  `initialRef.current.*`. The session skip/complete sets stay as plain
  `useState` — they reset on a different trigger (modal close) and
  aren't part of the form pyramid. The reducer + seed factory live in
  `src/components/budget/budget-metadata-form-reducer.ts`; the modal
  keeps the queue/progress derivations, the still-missing-field gating,
  and the `handleSave` patch-building glue. 10 unit tests landed in
  `tests/budget_metadata_form_reducer_test.ts` to lock in the
  seed-mirroring, the atomic reset, the `pickCompany` autoTypeId
  conditional, and that each setter only touches its own field.
  `BudgetMetadataModal.tsx` stays at ~566 lines (the dispatch-wrapping
  `useCallback`s offset the removed `useState` + `initialRef` lines);
  the new reducer file is 91 lines. Pure refactor — same behaviour,
  same i18n keys, same patch payload shape; `BudgetModalHost` consumes
  the public component unchanged. typecheck + lint + fmt-check + 929
  tests + build + icons-check pass.

- **`BudgetBulkEditModal` `useReducer` extraction** (2026-05): the
  11 parallel `useState` setters in `BudgetBulkEditModal.tsx`
  (`typeEnabled` / `typeId`, `dateEnabled` / `dateValue`,
  `amountEnabled` / `amountText`, `transferEnabled` / `transferValue`,
  `recurringEnabled` / `recurringDates`, `recurrenceResetKey`)
  collapsed onto a single `useReducer` driven by a `BulkEditState`
  shape and a named-action union (`reset | setTypeEnabled | setTypeId
| setDateEnabled | setDateValue | setAmountEnabled | setAmountText |
setTransferEnabled | setTransferValue | setRecurringEnabled |
setRecurringDates`). The win is the reset-on-open effect: previously
  11 sequential `setState` calls (including the
  `setAmountText(sharedAmount < 0 ? … : …)` formatting branch and the
  `setRecurrenceResetKey((k) => k + 1)` bump); now one `reset` dispatch
  carrying the seed (`{ seedDate, sharedAmount, settings }`), with the
  amount-text formatting moved into the colocated `initialBulkEditState`
  factory and the `recurrenceResetKey` increment kept monotonic inside
  the reducer (the `reset` arm reads the prior key and adds one rather
  than replacing it, so `BudgetRecurrenceForm` keeps re-seeding on every
  re-open). The reducer + seed factory live in
  `src/components/budget/budget-bulk-edit-modal-reducer.ts`; the modal
  keeps the JSX + the `sharedAmount` / `seedDate` / `parsedAmount`
  derivations + the `handleSubmit` patch-building glue. 6 unit tests
  landed in `tests/budget_bulk_edit_modal_reducer_test.ts` to lock in
  the seeded defaults (date, positive/negative amount text), the
  monotonic resetKey, and that each setter only touches its own field.
  `BudgetBulkEditModal.tsx` stays at 310 lines (dispatch wrappers
  offset the removed `useState` lines); the new reducer file is 116
  lines. Pure refactor — same behaviour, same i18n keys, same
  `BulkPatch` / `onApply*` payload shape; `BudgetModalHost` consumes the
  public component unchanged. Mirrors the precedent set by
  `AccountTransferModal` (same `kind`-discriminated action shape;
  side-effect-free reducer). typecheck + lint + fmt-check + 920 tests +
  build pass.

- **`AccountTransferModal` `useReducer` extraction** (2026-05): the
  11 parallel `useState` setters in `AccountTransferModal.tsx`
  (`date`, `description`, `amountText`, `fromAccountId`,
  `toAccountId`, `typeId`, `completed`, `isTransfer`,
  `datePickerOpen`, `fromOpen`, `toOpen`) collapsed onto a single
  `useReducer` driven by a `TransferModalState` shape and a named-
  action union (`reset | setDate | setDescription | setAmountText |
swapAccounts | pickFromAccount | pickToAccount | setTypeId |
setCompleted | setIsTransfer | setDatePickerOpen | setFromOpen |
setToOpen`). Three transitions that previously fired multiple
  sequential `setState` calls in one handler became atomic actions:
  the `useEffect` reset on open / request change (13 setters → one
  `reset` dispatch carrying `initialTransferModalState(request,
settings)`), the `swap()` helper (two setters → one
  `swapAccounts`), and the `AccountPicker` onPick handlers (two
  setters each for the value + closing the panel → one
  `pickFromAccount` / `pickToAccount`). The reducer + initial-state
  factory live in
  `src/components/accounts/account-transfer-modal-reducer.ts`; the
  modal file keeps the JSX + the `parsedAmount` / `trimmedDescription`
  / `canSave` derivations + the `handleSave` / `handleDelete` dispatch
  glue. The reducer uses a narrower structural `TransferModalSeed`
  input rather than importing `TransferModalRequest` from the modal,
  avoiding a circular type dependency while staying assignable from
  the modal's wider request type. 24 unit tests landed in
  `tests/account_transfer_modal_reducer_test.ts` to lock in the
  edit-seed / create-seed snapshots, the swap symmetry, the
  atomic pick-account-and-close behaviour, and that each setter
  only touches its own field. `AccountTransferModal.tsx` grows from
  630 → 636 lines (the dispatch-wrapping callbacks are slightly
  more verbose than bare setters); the new reducer file is 153
  lines. Pure refactor — same behaviour, same i18n keys, same
  payload shape (`TransferDraft` / `TransferModalRequest` stay
  exported from the modal); `useTransferFlow` consumes the public
  component unchanged. Mirrors the precedent set by
  `BudgetEditEntryFullModal` and `BudgetRecurrenceForm` (same
  `kind`-discriminated action shape; side-effect-free reducer; the
  dispatcher computes the imperative side-effects — `onClose`,
  `onCreate`, `onEdit`, `onDelete`, `onUncollapse` — outside the
  reducer). typecheck + lint + fmt-check + 914 tests + build pass.

- **`BudgetEditEntryFullModal` `useReducer` extraction** (2026-05):
  the 14 parallel `useState` setters in `BudgetEditEntryFullModal.tsx`
  (`description`, `amount`, `negative`, `date`, `typeId`, `companyId`,
  `isTransfer`, `completed`, `isPrimaryIncome`, `anchorDayText`,
  `scopeKind`, `untilEnabled`, `untilDate`, `shiftDaysText`) collapsed
  onto a single `useReducer` driven by an `EditFullState` shape and
  a named-action union. The win is the same as the previous reducer
  extractions: the reset effect previously fired 14 sequential
  `setState` calls (atomic in React's batching, but explicit-as-atomic
  in code); now it's a single `reset` dispatch carrying a memoised
  `initialState` snapshot. The snapshot doubles as the reference
  point for the "touched" comparisons in `handleSave`
  (`companyId !== initialState.companyId`, etc.), replacing the
  recurring `initialCompanyId` / `initialIsTransfer` derivations that
  ran on every render. The `pickCompany` action folds the
  `setCompanyId(next)` + conditional `setTypeId(auto)` pair into one
  atomic transition, removing the brief intermediate render where
  the company changed but the auto-filled type hadn't landed yet.
  The reducer + initial-state factory + types live in
  `src/components/budget/budget-edit-entry-full-modal-reducer.ts`;
  the component file keeps the JSX + the `affectedRows` /
  `parsedAmount` derivations + the `handleSave` dispatch glue. 13
  unit tests landed in `tests/budget_edit_entry_full_modal_reducer_test.ts`
  to lock in the row-to-state snapshot, the sign-toggle, the
  `pickCompany` autoTypeId conditional, and the atomic reset.
  `BudgetEditEntryFullModal.tsx` drops from 645 → 628 lines; the
  new reducer file is 159 lines. Pure refactor — same behaviour,
  same i18n keys, same payload shape; `BudgetModalHost` and the
  `useEditPrompts` hook consume the public component unchanged.
  Mirrors the precedent set by `BudgetRecurrenceForm`'s reducer
  (same `kind`-discriminated action shape; side-effect-free reducer;
  the dispatcher computes the imperative side-effects — the
  primary-income notification — outside the reducer).
  typecheck + lint + fmt-check + 901 tests + build pass.

- **`BudgetRecurrenceForm` `useReducer` extraction** (2026-05): the
  11 parallel `useState` setters in `BudgetRecurrenceForm.tsx`
  (`mode`, `onceDate`, `datesList`, `everyNStart`, `everyNEnd`,
  `everyNDays`, `monthlyStride`, `monthlyDay`, `monthlyOffset`,
  `monthlyStartMonth`, `monthlyEndMonth`) collapsed onto a single
  `useReducer` driven by a `RecurrenceFormState` shape and a named
  action union (`reset | setMode | setOnceDate | setDateAt |
addDate | removeDateAt | setEveryN{Start,End,Days} |
setMonthly{Stride,Day,Offset,StartMonth,EndMonth}`). The big win
  is the resetKey-driven reset effect: previously 11 sequential
  `setState` calls (one render per setter in concept, batched in
  practice but still implicit-as-atomic); now one `reset` dispatch
  carrying the full new state, computed by the colocated
  `initialRecurrenceFormState` factory. The reducer + factory +
  helpers (`todayDayOfMonth`, `seedDayOfMonth`) live in
  `src/components/budget/budget-recurrence-form-reducer.ts`; the
  component file keeps the rule-derivation switch (which depends on
  `isIsoMonth` / `startOfMonth` / `endOfMonth` helpers that stay
  scoped to the component) plus the JSX. The list-mutation
  shapes (`setDateAt` / `addDate` / `removeDateAt`) became
  named actions instead of inline array splices, and the reducer
  guards against out-of-range indices + last-remaining-date
  removal — invariants the previous `setDatesList(...)` callers
  enforced via JSX `disabled` attributes alone. Mirrors the
  precedent set by `reconciliationReducer` (same `kind`-
  discriminated action shape; side-effect-free reducer; the
  component owns the rule-derivation `useMemo` and the
  `onChange` notification effect outside the reducer). 18 unit
  tests landed in `tests/budget_recurrence_form_reducer_test.ts` to
  lock in the seed-rule pre-fill, the dayOfMonth clamping, the
  setDateAt index-guard, the addDate fallback when the list is
  empty, the removeDateAt last-entry guard, and the simple setter
  arms. `BudgetRecurrenceForm.tsx` drops from 538 → 470 lines;
  the new reducer file is 160 lines. Pure refactor — same
  behaviour, same `onChange` payload shape, same i18n keys; the
  four parent modals (`BudgetPromoteHistoryForm`,
  `BudgetComplexEntryModal`, `BudgetBulkEditModal`,
  `BudgetPromoteToSeriesForm`) consume the public component
  unchanged. typecheck + lint + fmt-check + 888 tests + build pass.
- **`useRevealAnchorPreservation` + `useVisibleMonthRange` +
  `useScrollToRowRequest` hook extraction from `BudgetPage.tsx`** (2026-05):
  the final three PRs of the display-machinery plan bundled into one.
  The reveal-anchor preservation block (the `captureRevealAnchor`
  callback, the `onShowMoreFutureClick` / `onShowMoreHistoryClick`
  callbacks, the `revealAnchorRef`, and the 8-frame `useLayoutEffect`
  that re-applies the scroll delta as `BudgetMonthTable` placeholders
  settle) lifted into `src/components/budget/useRevealAnchorPreservation.ts`;
  the visible-month-range observer (the `visibleMonthRange` state, the
  IntersectionObserver effect keyed on the join of `visibleMonths`,
  the `todayButtonDirection` memo, and the `showTodayButton`
  derivation) lifted into `src/components/budget/useVisibleMonthRange.ts`;
  and the scroll-to-row request handler (the `useEffect` that grows
  `extraHistory` enough to reach the target month then schedules the
  pulse + scroll-into-view, plus the `forceMountMonthKey` memo that
  tells `BudgetMonthTable` to bypass its viewport-proximity gate for
  the target month) lifted into `src/components/budget/useScrollToRowRequest.ts`.
  Each hook takes the `scrollTargetRef` / `sectionRef` from
  `useScrollToToday` / the parent component as inputs and returns the
  values the JSX consumes. Constants stay in `BudgetPage.tsx`
  (`DEFAULT_HISTORY_MONTHS`, `HISTORY_PAGE_SIZE`, `FUTURE_PAGE_SIZE`)
  because the reveal toggle labels render off the same numbers as the
  setters use; the hooks receive them as params instead of importing.
  `BudgetPage.tsx` drops from 1049 → 856 lines and the page reads as
  "compose data, compose chrome, render visible months" exactly as
  the roadmap predicted. **Closes the severity-5
  `BudgetPage.tsx` display-machinery hooks plan in full** — there
  are no more 50+ line inline-effect clusters in the page. Pure
  refactor — same comments preserved verbatim, same dep arrays
  (including the `eslint-disable-next-line react-hooks/exhaustive-deps`
  on the scroll-to-row effect's `[scrollToRowRequest?.tick, sheetId]`
  pair), same DOM/rAF timing. typecheck + lint + fmt-check + 866
  tests + build pass.

- **`useScrollToToday` hook extraction from `BudgetPage.tsx`** (2026-05):
  the second PR of the display-machinery plan. The scroll-to-today
  machinery — `scrollTargetRef`, `lastScrolledKey`, the `scrollToToday`
  callback with its rAF + 3s polling refine, the sheet+currentMonth-keyed
  auto-scroll effect, plus the two private collaborators
  `findRowNearestToday` and `scrollRowToTop` that only `scrollToToday`
  uses — lifted into `src/components/budget/useScrollToToday.ts`.
  The hook takes `{ sheetId, today, currentMonth, sectionRef }` and
  returns `{ scrollTargetRef, scrollToToday }`; the parent attaches
  the returned ref to the current-month container (`ref={isCurrent ?
scrollTargetRef : null}`) and the reveal-anchor `useLayoutEffect`
  reads through `scrollTargetRef.current` unchanged because the same
  RefObject instance is what matters. `scrollToToday` became a
  `useCallback` (was a plain function with an `exhaustive-deps`
  disable) so the auto-scroll effect can correctly depend on it.
  The orphaned comment block above `findRowNearestToday` was removed
  in the same edit. `BudgetPage.tsx` drops from 1210 → 1049 lines.
  Pure refactor — typecheck + fmt-check + 866 tests + build pass;
  lint emits the same two pre-existing `setExtraFuture` /
  `setExtraHistory` warnings (state setters the linter doesn't
  recognise as stable). The remaining 3 hooks in the plan
  (`useRevealAnchorPreservation`, `useVisibleMonthRange`,
  `useScrollToRowRequest`) stay in Pending with re-verified line
  ranges, severity unchanged at 5 as a multi-PR plan.
- **`useRowFlashing` hook extraction from `BudgetPage.tsx`** (2026-05):
  the first PR of the 5-step display-machinery plan. The heartbeat
  pulse machinery (the `flashRow` callback, the `handleUpdateCell`
  wrapper with the history-row routing branch that diverts description
  / type edits to `onUpdateHistoryEntry`, `handleCommitCell`,
  `handleSetRowCompany`, `handleSetRowNoCompany`, plus the
  `prevRowIdsRef` diff effect that fires on single-row additions)
  lifted into `src/components/budget/useRowFlashing.ts`. The hook
  takes `accountId` / `columns` / `rows` plus the five mutation
  callbacks and returns the four wrapped handlers; `flashRow` stays
  private since the diff effect now lives inside the hook. The
  exhaustive-deps shape on `handleUpdateCell` is preserved exactly
  (closes over `columns` rather than `decoratedItem.columns` so the
  callback stays stable across row edits; the synthesis pipeline
  only ever replaces `rows`). `BudgetPage.tsx` drops from 1326 → 1210
  lines. Pure refactor — typecheck + lint + fmt-check + 866 tests +
  build pass; the remaining 4 hooks in the original plan
  (`useScrollToToday`, `useRevealAnchorPreservation`,
  `useVisibleMonthRange`, `useScrollToRowRequest`) stay in Pending
  with re-verified line ranges, severity unchanged at 5 as a multi-PR
  plan.
- **`Row` as a discriminated union (`kind: "user" | "correction" |
"historic" | "transfer"`)** (2026-05): `Row` in `src/data/types/budget.ts`
  split into `UserRow | CorrectionRow | HistoricRow | TransferRow` keyed
  by a required `kind` literal. `HistoricRow` carries `historyEntryId` /
  `bankDescription` / `descriptionPlaceholder` / `noCompany` as required
  fields on the variant; `TransferRow` carries `transferId` /
  `peerAccountId` / `peerAccountName`; `CorrectionRow` retains
  `isCorrection: true` alongside the kind so older readers still
  recognise the snapshot. `validateRow` derives `kind` from the legacy
  `isCorrection` field so existing on-disk snapshots (no `kind` field)
  load cleanly; `synthesizeTransferRow` and `synthesizeHistoryRow`
  return the typed variants directly; `createEmptyRow` and
  `mintBudgetRow` set `kind: "user"`; the construct-from-scratch
  reducer sites (`bulkCopyToMonths`, `bulkMakeRecurring`) stamp
  `kind: "user"` explicitly. The 50+ field-presence guards across
  AppShell, AppShell/hooks, budget components, accounts components,
  and `src/data/` (reconciliation, coverage, conflicts, payday,
  achievements, accounts/export, budget/export, BudgetMonthTable,
  BudgetRow, BudgetEditEntryModal, BudgetPromoteHistoryForm,
  BudgetFindConflictsModal, BudgetViewerModal, BudgetEntryActionsMenu)
  switched from `row.transferId || row.historyEntryId ||
row.isCorrection` shapes to `row.kind === "..."` / `row.kind !==
"user"` checks so TS narrowing now reveals the kind-specific fields
  and exhaustiveness flags future sites that forget a new kind.
  `AccountBudget.rows` stays typed as the wide `Row[]` (rather than a
  stricter `PersistedRow = UserRow | CorrectionRow` subset) so the
  merged "user rows + synthesized rows" view in `computed-state` and
  `budget/export` keeps the existing `AccountBudget` shape; the
  storage invariant is upheld operationally by the validator + the
  synthesizers (which never write into `item.rows[]`). Persisted
  shape on disk is unchanged for legacy snapshots — they have no
  `kind` field — and forward-compatible for new snapshots, which
  carry `kind` alongside the existing fields. 16 test fixtures
  updated to stamp `kind` on row literals. Closes the original
  severity-7 multipliers entry in one PR rather than the multi-PR
  per-directory plan the entry described — the discriminator gave TS
  exhaustiveness, which made the call-site migration mechanical
  enough to bundle. typecheck + lint + fmt-check + 862 tests + build
  pass.
- **`AppShell.tsx` budget-row mutation callbacks lifted into
  `useRowMutations`** (2026-05): the 6 row-level mutation callbacks
  still defined inline in `AppShell.tsx` after the modal-host split
  (`onToggleRowTransfer`, `onEditHistoryRequest`,
  `onUpdateHistoryEntry`, `onSetRowCompany`, `onSetRowNoCompany`,
  `onCorrectionDeleteRequest`) moved into the existing
  `useRowMutations` hook. The hook's `Params` widened to take
  `activeAccountId`, `history`, `companyTypeSuggestions`,
  `effectiveSettings`, `setHistoryEditPrompt`, and
  `setCorrectionDeletePrompt`; its `Result` widened to return the
  six new callbacks alongside the existing seven. The
  history-row routing branches (`if (row.historyEntryId) dispatch
updateHistoryEntry; else dispatch budget-row action`) moved
  verbatim — pure relocation, no behaviour change. AppShell.tsx
  drops from 1008 → 856 lines; `useRowMutations.ts` grows from
  160 → 395 lines, leaving a single named source for every
  row-level mutation flowing into `BudgetPage`. The sibling
  `useHistoryRowMutations` half of the original plan was rejected:
  the merged hook is 395 lines but mostly callback bodies + comment
  headers, and the routing callbacks (`onToggleRowTransfer`,
  `onSetRowCompany`) branch on history-vs-budget so they can't
  cleanly live in one sub-hook anyway. The unused `autoTypeForCompany`,
  `formatNumber`, and `withCurrency` imports dropped from AppShell
  in the same change. Pure refactor — typecheck, lint, fmt-check,
  861 tests, and build pass.
- **`indexById<T>(items)` helper adoption across 8 files** (2026-05):
  the recurring 5-line `useMemo(() => { const m = new Map<string,
T>(); for (const x of items) m.set(x.id, x); return m; }, [items])`
  pattern consumed by a new `indexById<T extends { id: string }>(items:
readonly T[]): Map<string, T>` helper at `src/utils/indexById.ts`.
  Adopted at 16 sites: `BudgetMetadataModal` (companiesById, typesById),
  `BudgetFindConflictsModal` (typesById, categoriesById), `BudgetPage`
  (typesById, companiesById), `BudgetViewerModal` (typesById),
  `SettingsModal/tabs/patterns` (typesById, categoriesById),
  `AccountsPage` (accountsById, categoriesById, typesById),
  `AccountReconciliationModal` (typesById, entriesById), and the
  inline (non-`useMemo`) site in `src/data/budget/rows.ts`
  (companiesById, typesById). Each `useMemo` body collapses to
  `useMemo(() => indexById(items), [items])`. `BudgetPage`'s
  `accountsById` (maps `a.id → a.name`) and the
  `AccountTransferCollapseModal` peer (same shape) are intentionally
  left inline — they index to a derived value, not the source item,
  so the helper doesn't fit. `AccountReconciliationModal`'s
  `rowsById` is also left alone because its value shape is
  `{ row, columns }` and it walks every sheet, not a flat input list.
  Removes ~55 lines of boilerplate (86 → 31 diff). The unused
  `Account` / `Category` / `EntryType` imports on `AccountsPage` and
  the unused `EntryType` import on `AccountReconciliationModal`
  dropped in the same change (the inline `new Map<string, X>()` type
  annotations were the only references). Pure refactor — typecheck +
  lint + fmt-check + build + 858 tests pass.
- **`useMatchRuleAmountFilter` hook extraction from `BudgetMatchRuleModal.tsx`**
  (2026-05): the amount-filter sub-state machine (7 `useState` calls
  for `signMode` + 6 `(text, negative)` input fields, the reset-on-open
  arm that re-seeds them from `existing` rule or `seedEntry`, plus the
  3 derived `useMemo`s that resolve `amountMin` / `amountMax` /
  `amountExact` to signed numbers) lifted into a co-located
  `src/components/budget/useMatchRuleAmountFilter.ts` hook. The hook
  returns `{ state, setSignMode, setMinText, toggleMinNegative,
setMaxText, toggleMaxNegative, setExactText, toggleExactNegative,
derived }` where `derived` is a memoized bundle of
  `{ isRangeMode, isExactMode, amountMin, amountMax, amountSign,
rangeInverted, exactBlank }`. The parent's `useEffect` reset shrinks
  to just the pattern / description / type / company / transferFilter
  fields; the JSX FormSection rendering the amount filter reads from
  `amountFilter.state.*` and dispatches via the hook's setters. The
  `SignMode` type and the `parseSignedAmount` helper moved with the
  hook. `BudgetMatchRuleModal.tsx` drops from 771 → 648 lines; the hook
  is 230 lines including types and comments. Pure refactor — same
  behaviour, same i18n keys, same payload shape; `MatchRuleDraft` /
  `MatchRuleSeed` stay exported from the modal so external consumers
  (`useMatchRuleUi`, `BudgetModalHost`) are unchanged. The "tight
  coupling to `HistoryEntry`" half of the original rating was already
  obsolete — `MatchRuleSeed` is `{id, description, amount}` and doesn't
  reach into history fields. typecheck + lint + fmt-check + build +
  858 tests pass.
- **`BudgetPage.tsx` derived-state memo pyramid consolidation** (2026-05):
  the 13 overlapping `useMemo`s that derived the budget page's row
  pipeline (`dateCol`, `sortContext`, `synthesizedRows`, `mergedItem`,
  `decoratedItem`+`effectiveAmounts`, `balanceOverrides`, `sortedRows`,
  `balances`, `coveredSet`, `orphanCountByMonth`, `colWidths`,
  `monthGroups`, `sortedMonthGroups`) collapsed onto a single
  `computeBudgetState(inputs): ComputedBudgetState` factory at
  `src/data/budget/computed-state.ts`. `BudgetPage` now calls it
  through one `useMemo` and destructures the eight downstream
  consumers (`decoratedItem`, `balances`, `coveredSet`,
  `orphanCountByMonth`, `colWidths`, `monthGroups`,
  `sortedMonthGroups`) from the result. The taxonomy lookups
  (`typesById`, `companiesById`, `accountsById`) stay as their own
  narrow-dep memos because `budgetContextValue` reads them through —
  folding them into the consolidated memo would force a fresh context
  reference on every row edit and re-render every memoised descendant.
  The cascade isn't a perf regression at the hot path: every row edit
  already invalidates basically every memo in the old pyramid because
  `item` is the dominant dep, so the consolidated memo recomputes the
  same shape with the same frequency. The win is in **reusability**
  (future sheet types — savings, loans — can call into the same
  factory) and **dep-array surface** (one list instead of 13 hand-
  curated arrays). `handleUpdateCell` now closes over `item.columns`
  (identical to `decoratedItem.columns`, the synthesis pipeline only
  ever replaces `rows`) so the callback stays stable across row
  edits. `BudgetPage.tsx` drops from 1540 → 1326 lines; `useMemo`
  count drops from 21 → 12. Pure refactor — typecheck + lint +
  fmt-check + 858 tests + build pass. Architecture-doc tree updated
  in the same PR.
- **`BudgetEditEntryModal.tsx` tri-mode dispatcher split** (2026-05): the
  715-line modal's three mode-conditional branches (`isSeries` / `isHistory`
  / regular row) lifted into three sibling sub-form components. Each one
  owns its own state (`useState` calls + initial-value derivation from
  the row's cells), renders its own `<Modal.Body>` + `<Modal.Footer>`,
  and emits a single validated domain payload via its own `onSubmit`
  callback. The parent `BudgetEditEntryModal` becomes a 177-line
  dispatcher that owns the `Modal` shell + header title and routes to
  one of `BudgetEditSeriesForm` (scope / shift-days / until-date),
  `BudgetPromoteHistoryForm` (history-row promotion + historic-matches
  checklist), or `BudgetPromoteToSeriesForm` (regular row promote-to-
  series). Sub-forms are keyed by `row.id` so React handles state reset
  via re-mount (replacing the prior `useResetOnOpen` + manual reset
  closure that lived in the parent). `HistoryPromotePrefill` /
  `HistoryMatchPreview` / `HistoryPromotion` types moved to
  `BudgetPromoteHistoryForm.tsx` and are re-exported from
  `BudgetEditEntryModal.tsx` so the two existing consumers
  (`AppShell/hooks/usePromptDerivations.ts`,
  `AppShell/BudgetModalHost.tsx`) continue to import unchanged.
  Architecture-doc tree and dictionary entry updated in the same PR.
  Pure refactor — typecheck + lint + fmt-check + 846 tests + build
  pass; the modal's three submit handlers (`onEditSeries`,
  `onConvertToRecurring`, `onPromoteHistory`) and their payloads are
  byte-equivalent. Adding a new sheet-type series flow (loans,
  savings) is now: drop a new `Budget<flavour>Form.tsx`, add a branch
  to the dispatcher. Closes the severity-6 "recurrence/promotion
  form duplication" candidate.
- **Per-sheet-type item dispatcher via `SHEET_TYPE_REGISTRY`**
  (2026-05): the item-level dispatch tail moved from
  `src/data/reducers/item/index.ts` into the budget sheet-type
  descriptor (`src/data/sheet-types/budget.ts`) and is wired in as
  `BUDGET_SHEET_DESCRIPTOR.reduceItem`. The top-level reducer's tail
  in `src/data/reducer.ts` now walks `SHEET_TYPE_REGISTRY` and stops
  at the first descriptor whose `reduceItem(state, action)` returns
  a non-null result — mirroring the existing slice-reducer chain
  (`reduceCategoriesAndTypes`, `reduceMatchRules`, …) instead of
  hard-coding `i.type === "accountBudget"` in the dispatcher itself.
  `SheetTypeDescriptor` gained an optional `reduceItem` field;
  singleton flavours (Accounts) leave it undefined. The budget
  descriptor owns its own `isBudgetItemAction` predicate so the
  registry walker doesn't need to know which actions belong to which
  flavour. `src/data/reducers/item/index.ts` shrank from 595 to 447
  lines and is now the pure per-item reducer + helpers (no dispatch
  glue). Adding a new sheet type with item-level data — savings,
  loans, scenarios — is now: declare the per-item action union, write
  the per-item reducer, expose `reduceItem` on the descriptor.
  Closes the severity-6 "Reducer has no generic per-sheet-type
  dispatcher" candidate. Pure refactor: typecheck + lint + build +
  846 tests pass; behaviour is byte-equivalent to the prior chain
  because the budget descriptor is the only one with a `reduceItem`
  today.
- **Inline `todayIso` / `addMonthsIso` adoption of the shared
  `src/utils/date.ts` helpers** (2026-05): the seven inline copies of
  `todayIso()` (`BudgetPage.tsx`, `BudgetEditEntryModal.tsx`,
  `BudgetRecurrenceForm.tsx`, `BudgetRecurringCandidatesPanel.tsx`,
  `DatePickerModal.tsx`, `data/budget/recurring-detection.ts`,
  `data/budget/export.ts`) and two inline copies of `addMonthsIso(iso, n)`
  (`BudgetRecurrenceForm.tsx`, `BudgetRecurringCandidatesPanel.tsx`) all
  imported from `src/utils/date.ts` and the local definitions removed.
  Mechanical adoption pass: every removed local was byte-equivalent to
  the shared helper (modulo `BudgetRecurrenceForm`'s `isIsoDate(iso)`
  pre-guard, which short-circuits to the same `iso` the shared helper
  returns from the `Number.isFinite` fall-through). `DatePickerModal`
  kept its `toIso(y, m, d)` local because that helper builds an ISO
  from three numeric pieces rather than reading today's date — a
  different shape — and its `todayIso()` simply delegated to it.
  Reduces the drift surface for the next agent introducing a new ISO
  date helper and for the upcoming feature wave when new sheet types
  will need date-anchored seeding too. Pure refactor — typecheck +
  lint + 846 tests pass. The "Easy wins" entry in this file now
  reflects the consumed pattern.
- **`useGdriveAuth` extraction from `useStorageBackend.ts`**
  (2026-05): the final slice of the per-backend auth split. GDrive
  token state, the GIS popup-based OAuth flow (`connectGdrive`),
  the commit-on-link step (`commitGdriveLink`), the reauthorize-
  after-expiry path (`reauthorizeGdrive`, called from the outer
  `reconnectCloud`), the per-user auth-sync, the eager
  `applySignedInUser`, and the `markDisconnected` cleanup hook all
  lift into `src/storage/useGdriveAuth.ts`. The outer
  `reconnectCloud` switch becomes a two-arm dispatch — gdrive
  branch calls `reauthorizeGdrive`, dropbox branch calls
  `startDropboxAuth` — instead of inlining the GIS popup. The
  outer auth-sync effect drops its GDrive arm; the new hook
  installs a parallel auth-sync of its own. `useStorageBackend.ts`
  drops from 846 → 790 lines. **Closes the original severity-7
  per-backend split in full** — the outer hook is now a pure
  orchestrator over four per-backend cohorts (`useFolderHandle`,
  `useDropboxAuth`, `useGdriveAuth`, and the inline browser /
  IDB-backed default). Pure refactor — no behaviour change; the
  popup-blocked rethrow that lets Settings surface errors inline,
  the auth-flip cancellation checks, and the post-probe
  parking-on-pendingCloudLink for the dialog are all preserved
  verbatim. **Needs smoke-testing of the GDrive backend** (connect
  from Settings, edit, autosave, force token expiry, hit
  Reconnect, disconnect) before merge; IDB / Dropbox / Folder
  paths are unaffected.
- **`useDropboxAuth` extraction from `useStorageBackend.ts`**
  (2026-05): the second slice of the per-backend auth split lifts
  Dropbox-specific state, OAuth start / completion (URL-redirect
  path), the token-refresh-ref correctness pattern, and the
  commit-on-link step into `src/storage/useDropboxAuth.ts`. The
  outer hook keeps the shared cloud orchestration (the parked
  `pendingCloudLink` state, the cross-provider `resolveCloudLink`
  / `disconnectCloud` / `reconnectCloud` flows, `loadSourceText`)
  and receives Dropbox-specific callbacks from the hook
  (`commitDropboxLink`, `connectDropbox`,
  `markDisconnected: markDropboxDisconnected`,
  `applySignedInUser`) plus the token state
  (`dropboxToken`, `dropboxRefreshTokenRef`). The outer hook's
  auth-sync effect drops its Dropbox arms; the hook installs a
  parallel auth-sync effect of its own. The OAuth completion
  effect (~140 lines) — the URL-redirect handler that catches
  `?code=` on return, exchanges for tokens, probes both sides,
  and parks `pendingCloudLink` — moved verbatim into the hook.
  `useStorageBackend.ts` drops from 1018 → 846 lines. **Closes
  the `useDropboxAuth` arm of the original severity-7
  per-backend split**; only `useGdriveAuth` remains Pending,
  re-rated to severity 5. Pure refactor — no behaviour change;
  the OAuth completion's pending-verifier check, the
  on-refresh-token-missing fallback, the probe race window, and
  the URL cleanup are all preserved verbatim. **Needs
  smoke-testing of the Dropbox backend** (connect from Settings,
  edit a row, autosave, disconnect, reconnect, exercise the
  conflict modal from a second device) before merge; IDB /
  GDrive / Folder paths are unaffected.
- **`useFolderHandle` extraction from `useStorageBackend.ts`**
  (2026-05): the folder-backend lifecycle lifted into its own hook
  at `src/storage/useFolderHandle.ts` — the
  `FileSystemDirectoryHandle` state, the `folderHandleLoaded` /
  `folderReconnectNeeded` flags, the `pendingFolderLink` state, the
  boot-time IDB-restore + `queryPermission` probe effect, the
  `commitFolderLink` / `connectFolder` / `resolveFolderLink` /
  `cancelFolderLink` / `reconnectFolder` / `disconnectFolder`
  callbacks, plus a `markPermissionLost` callback the live adapter
  calls when an in-flight save hits a revoked grant.
  `useStorageBackend.ts` declares a `folderHandleRef` early and
  passes it to `useFolderHandle`, which keeps it synced with its
  state — this lets `buildSourceRawAdapter` (which has to be defined
  before the folder hook runs because `loadSourceText` depends on
  it) read the current handle without a circular hook-order
  dependency. The shared `wrapForActive` utility relocated to its
  own file (`src/storage/wrap-for-active.ts`) so per-backend hooks
  can call it without importing from the orchestrator (which would
  become circular once cloud hooks are extracted too).
  `useStorageBackend.ts` drops from 1253 → 1018 lines. **Closes
  the `useFolderHandle` arm of the original severity-8 per-backend
  split**; `useDropboxAuth` and `useGdriveAuth` remain Pending with
  a narrower scope (severity 7). Pure refactor — no behaviour
  change; the boot-time probe, the both-sides-have-data dialog,
  the post-revoke reconnect path, the disconnect-mirror-to-browser
  flow, and the permission-lost handler are all preserved verbatim.
  **Needs smoke-testing of the folder backend** (pick a folder,
  edit, reload, revoke permission via browser settings, reconnect)
  before merge; IDB / Dropbox / GDrive paths are unaffected.
- **`useSaveStateMachine` sibling-hook extraction from
  `useUserDataStorage.ts`** (2026-05): the save pipeline lifted into
  its own hook at `src/storage/useSaveStateMachine.ts` — the
  `performSave` callback (~180 lines), the debounced auto-save
  effect, the manual `saveNow`, the shrink-warning safeguard plus
  its `confirmShrinkSave` / `discardShrinkSave` resolutions, the
  conflict-exit callbacks (`resolveKeepLocal` / `resolveKeepRemote`),
  the `saveChainRef` save-serialiser, and the throttle / rate-limit
  resume timer with its `resumeNonce` re-trigger. The throttle
  timer's cleanup-on-adapter-unmount also moved here (off
  `useLoadState`'s back) so the timer's whole lifecycle is in one
  file. The `isBailStatus` predicate consolidated to a single
  exported function on `useUserDataStorage.ts` consumed by both
  sub-hooks — closing a latent gap where `useLoadState`'s private
  copy was missing the `auth-error` / `error` / `loading` cases.
  `useUserDataStorage.ts` drops from 871 → 484 lines and is now the
  thin composer the original plan envisioned: it owns `data` /
  `status` / `lastSavedData` / the straddle refs and the `dirty`
  memo, and threads the four pieces (`useUndoRedo`,
  `useSaveStateMachine`, `useLoadState`, plus the inline `dispatch`)
  together. **Closes the severity-7 sibling-hook plan in full** —
  the original god-hook (1310 LOC) now lives as four cohesive
  modules summing to 1683 lines with each concern clearly named.
  **Needs smoke-testing of all four backends (IDB, Dropbox, GDrive,
  Folder) before merging** because the save extraction touches
  `adapter.save()`, conflict surfacing, the shrink safeguard, and
  the throttle/cooldown machinery, all of which differ in behaviour
  per backend.
- **`useLoadState` sibling-hook extraction from `useUserDataStorage.ts`**
  (2026-05): the async-load effect (initial mount + adapter swap
  recovery), the manual `reload()` callback (pull-to-refresh +
  reload button), and the remote-watch subscription effect — three
  paths that share the same "parse adapter bytes, replace in-memory
  state, mark the parsed snapshot as the saved baseline, clear undo,
  dispatch the matching status transition" machinery — lifted into
  `src/storage/useLoadState.ts` as one hook. The shared refs
  (`lastSnapshot`, `skipNextSave`, `hasLoaded`, `pendingTimer`,
  `throttleResume`) still live in the outer hook because the save
  path also reads them; the hook takes them as parameters so both
  halves see the same instances. `useUserDataStorage.ts` drops
  from 1157 → 871 lines. **Closes the `useLoadState` arm of the
  original severity-7 sibling-hook plan; `useSaveStateMachine`
  remains Pending at severity 6 with a narrower scope.** Pure
  refactor — no behaviour change; the dirty pre-flush in
  `reload`, the conflict / auth-error surfacing paths, the
  `wasInitialLoad` branch that protects mount-time achievement
  dispatches, and the cleanup that cancels in-flight loads on
  adapter unmount are all preserved verbatim. **Needs
  smoke-testing of all four backends (IDB, Dropbox, GDrive,
  Folder) before merging** because the new hook is on the load
  hot path even if the moves are mechanical.
- **`useUndoRedo` sibling-hook extraction from `useUserDataStorage.ts`**
  (2026-05): the in-memory undo / redo / jump-to-history machinery
  (the `historyReducer`, `initialHistoryState`, `HistoryState` /
  `HistoryAction` types, the `useReducer(historyReducer, …)` slot,
  the `historyStateRef` mirror, the `undo` / `redo` /
  `jumpToHistory` / `resetHistory` callbacks, the `historyEntries`
  derivation, plus the `UNDO_HISTORY_LIMIT` / `INITIAL_ACTION_TYPE`
  constants) lifted into `src/storage/useUndoRedo.ts` as its own
  hook. The outer storage hook now calls `useUndoRedo({
initialSeed, setData })` and threads the returned `appendEntry`
  callback into `dispatch` (gated on `UI_ONLY_ACTION_TYPES` as
  before). `ActionHistoryEntry` moves with the hook and is
  re-exported from `useUserDataStorage.ts` so consumers don't
  chase the type. `useUserDataStorage.ts` drops from 1310 → 1157
  lines. **Closes the `useUndoRedo` arm of the original
  severity-8 sibling-hook plan; `useLoadState` and
  `useSaveStateMachine` remain Pending at severity 7 with a
  narrower scope.** Pure refactor — no behaviour change; the
  reducer / cursor semantics, the cap at `UNDO_HISTORY_LIMIT + 1`
  entries, and the redo-truncation-on-append rule are all
  preserved verbatim. **The extraction did not need cloud-backend
  smoke testing**: the new hook is a pure in-memory state machine
  that doesn't touch adapters, OAuth, or the save chain. The
  remaining `useLoadState` / `useSaveStateMachine` extractions
  still do.
- **`AppShell.tsx` modal-mount extraction → three hosts** (2026-05):
  the 553-line modal-mount JSX tail of `AppShell.tsx` lifted into
  three sibling host components — `AccountsModalHost`,
  `BudgetModalHost`, `UniversalModalHost` — each owning one cohesive
  cluster of modals. `BudgetModalHost` also absorbs the tightly-
  scoped inline callbacks AppShell had grown for budget-side modal
  flows (`onSplitSubmit`, `onSplitRevert`, `onEditSeries`,
  `onConvertToRecurring`, `onSaveEditRow`, `onDeleteRecurringRows`,
  plus the `deleteActions` / `correctionDeleteActions` memos), so
  the dispatch + setter closures travel with the modal that
  consumes them. The hosts receive sub-hook returns as bundled
  props (`accountDialog: ReturnType<typeof useAccountDialog>`, etc.)
  to keep per-host prop counts manageable. `AppShell.tsx` dropped
  from 1849 → 930 lines; the return JSX is now header + main +
  bottombar + three host mounts. Adding a new sheet type now lands
  a new `<SomethingModalHost>` file instead of another 200-line
  modal cluster in the AppShell tail. **Narrower than the original
  severity-8 plan claimed:** the registry-based "host owns the
  modal open-state" half is deferred — the sub-hooks still own
  prompt state and the hosts thread it through to the modals.
  That residual is now tracked as a smaller (severity-5) Pending
  item — see "AppShell.tsx modal-mount registry" above.
- **`<OrphanIndicator>` sibling extraction from `BudgetMonthTable.tsx`**
  (2026-05): the covered-month tfoot indicator (~30 lines of nested
  ternary: orphan-count > 0 + onTriage → orange triage button; else
  → green "history covers this month" line) moved into a sibling
  `src/components/budget/OrphanIndicator.tsx`. The component owns its
  own `useT()` call and the two `lucide-react` icons it uses
  (`AlertTriangle`, `Check`); `BudgetMonthTable` drops both imports
  and the tfoot becomes a two-arm ternary: covered ?
  `<OrphanIndicator orphanCount onTriage />` : `<BudgetAddEntryButton …>`.
  Pure refactor — same JSX, same i18n keys, same colour and aria
  semantics. The dictionary entry for "Covered-month footer" now
  points at the new file alongside its parent mount in
  `BudgetMonthTable`; the architecture-tree gained an `OrphanIndicator`
  line under `src/components/budget/`. Closes the second half of the
  original "BudgetMonthTable orphan-count + transfer-visibility logic
  scattered" candidate.
- **`conflicts.ts` relocated under `src/data/budget/`** (2026-05): the
  last unambiguously budget-only module sitting at the `src/data/`
  root moved to `src/data/budget/conflicts.ts`. Only consumer was
  `BudgetFindConflictsModal.tsx`; only test was `tests/conflicts_test.ts`.
  Internal relative imports rewired (`./budget/cells` → `./cells`,
  `./sheet` → `../sheet`, `./types` → `../types`). The architecture-doc
  data-layer tree gained a `conflicts.ts` entry (previously missed
  altogether) and the dictionary entry for the find-conflicts modal
  now points at the new path. Pure move, no behaviour change.
- **`AccountReconciliationModal` `useReducer` extraction** (2026-05): the
  five parallel `useState` setters in `AccountReconciliationModal.tsx`
  (`showInfo`, `checked`, `seriesRulesById`, `seriesExpansions`,
  `orphanDecisions`) collapsed onto a single `useReducer` driven by
  a `ReconciliationState` type and a named-action union. The big win
  is `applyToSeries`: it previously fired three sequential `setState`
  calls (rule + expansion candidates + implied checks) which meant
  three renders and a window where the three were out of agreement;
  now it's one atomic transition. The reducer + initial-state factory
  live in `src/components/accounts/account-reconciliation-reducer.ts`
  alongside the `OrphanDecision` and `candidateKey` helpers, so the
  modal file keeps a clean component-only export shape (Fast Refresh
  preserved) and the pure transitions are testable in isolation —
  seven unit tests landed in `tests/reconciliation_reducer_test.ts`
  to lock in the toggle / apply-to-series / setOrphan / setAllOrphans
  shapes. Mirrors the precedent set by `historyReducer` /
  `statusReducer` in `useUserDataStorage.ts` (same `kind`-discriminated
  action shape; side-effect-free reducer; helper lookups stay outside
  and feed the reducer pre-computed data).
- **`src/data/constants/` topical split** (2026-05): the 859-line
  `src/data/constants.ts` split into five sibling modules under
  `src/data/constants/` — `storage.ts` (namespacing helpers +
  `STORAGE_KEY` / `USERS_KEY` / `userDataKey` / `cloudMirrorKey` /
  device-local dev-mode + log keys + password params + `DEFAULT_USERNAME`),
  `defaults.ts` (`DEFAULT_SETTINGS` + persisted / device defaults +
  download prefs + `DEFAULT_RECURRENCE_MONTHS`), `format.ts`
  (`MAX_COLUMN_CHARS`, font-scale + session-timeout bounds/presets,
  `DATE_FORMATS` / `SHORT_DATE_FORMATS`), `currency.ts`
  (`SUPPORTED_LANGUAGES`, `CURRENCY_PRESETS`, `REGION_TO_CURRENCY_ID`),
  and `taxonomy.ts` (`CATEGORY_COLORS` / `SHEET_COLORS` /
  `DEFAULT_SHEET_GLYPH` / `DEFAULT_SHEET_COLOR` + the four glyph
  allowlists). All 47 importers (across `src/` and `tests/`) updated
  to point at the matching submodule — no barrel left behind, mirroring
  the `src/data/presets/` precedent. Pure refactor: typecheck +
  lint + 838 tests pass; the cross-references in `AGENTS.md`,
  `docs/architecture.md`, and `.agent/skills/update-docs/SKILL.md`
  followed in the same PR.
- **`styles.css` topical split into `src/styles/`** (2026-05): the
  1665-line `src/styles.css` split into five sibling modules under
  `src/styles/` plus a thin entry barrel — `theme.css` (Tailwind v4
  `@theme` tokens + `:root` custom-property defaults + reduce-motion
  guard + sticky-header height media queries + html/body type
  reset), `palettes.css` (the 8 colour themes + System + the pre-
  React Light fallback), `components.css` (the `@layer components`
  block — the bulk of project-defined component classes),
  `utilities.css` (unlayered Tailwind utility remaps:
  `.rounded`/`.border-{,t,r,b,l}`/`.field-input` density vars +
  `.border-0` + the `row-pulse` / `field-attention` keyframes),
  and `chrome.css` (app-shell layout via `data-*` selectors —
  bottom-bar / toast-stack offsets, centered-modal padding,
  budget-main bottom padding, landscape-phone overrides, and the
  installed-PWA standalone-mode block with its iOS workarounds).
  `src/styles.css` now contains only `@import "tailwindcss";`
  followed by the five module imports in cascade order, with a
  comment block documenting why that order matters at equal
  specificity. Diff is byte-equivalent (normalized rule multiset
  matches the pre-split file exactly; only difference is the
  `@import "tailwindcss";` line moved up into the entry barrel).
  Production build emits the same CSS surface (94 kB gzipped 28 kB)
  and all 838 tests pass.
- **`budget/formula.ts` tokenizer / parser / evaluator file split**
  (2026-05): the 702-line `src/data/budget/formula.ts` split into
  four sibling modules along the seams the file's own comment
  headers already advertised — `formula-ast.ts` (FormulaNode +
  Parse/Eval result types), `formula-tokenizer.ts` (Token / OpToken
  - `tokenize`), `formula-parser.ts` (Parser class + cached
    `parseFormula`), and `formula-evaluator.ts` (MonthAggregates,
    FormulaContext, `evaluateFormula`, `FORMULA_FUNCTION_NAMES`).
    The original `formula.ts` shrank to a public-barrel facade that
    re-exports the runtime types and entry points plus owns the two
    concerns that sit outside the tokenize→parse→eval pipeline (the
    name↔id transforms `formulaToDisplay` / `formulaToStored` and the
    editor's `FORMULA_VARIABLES` / `FORMULA_FUNCTIONS` suggestion
    tables). All seven external call sites
    (`BudgetComplexEntryModal`, `BudgetFormulaInput`,
    `BudgetFormulaVariableHelper`, `formula-resolve`, and the two
    test files) continue to import from `data/budget/formula` —
    unchanged. The function-registry half of the original plan stays
    pending (rated down to 3) until a concrete non-budget sheet type
    needs to register its own functions.
- **`AppShell.tsx` prop signature bundled** (2026-05): the 28
  individual props passed from `App.tsx` to `<AppShell>` (adapter +
  per-backend connection flags + encryption / cloud-offline state +
  16 callbacks) collapsed onto two typed bundles plus the existing
  `currentDataRef`. New types `AppShellAuth` (user / password /
  hasOtherUsers + 4 auth callbacks + getEncryptionPassword) and
  `AppShellStorage` (adapter / backend / 5 connection flags /
  encryption / cloud-offline + 11 backend callbacks) live in
  `src/components/AppShell/types.ts`; `App.tsx` builds them as
  local consts before the JSX, and `AppShell.tsx` re-destructures
  them at the top of the function body so every existing reference
  to `user` / `backend` / `dropboxConnected` / etc. inside the
  shell stays unchanged. The originally-suggested
  `useAuthAndBackend()` facade hook was rejected as the wrong shape
  — `useStorageBackend()` already returns most of the bundle, and
  introducing a wrapper hook to re-emit it wouldn't add anything
  the typed bundles don't. New backends or auth callbacks now widen
  the bundles rather than the AppShell signature.
- **`<BudgetContext>` provider + descendant consumption** (2026-05):
  the cross-cutting `types` / `typesById` / `categories` / `companies` /
  `companiesById` / `onCreateType` / `onCreateCategory` / `onCreateCompany` /
  `settings` props now flow through a memoised `BudgetContext`
  (`src/components/budget/BudgetContext.ts` + matching `.tsx` provider
  shim for the Fast Refresh boundary, mirroring the `useToast`
  pattern). `BudgetMonthTable.tsx`, `BudgetRow.tsx`, and `BudgetCell.tsx`
  consume the context and drop those props from their signatures —
  BudgetMonthTable's Props type shrinks from 50 fields to ~36, BudgetRow's
  from ~30 to ~21, BudgetCell's from ~30 to ~22. The
  taxonomy / settings references all flow through a single memoised
  value so descendant `memo`s still skip ordinary edits. The
  derived-state memo pyramid half of the original BudgetPage
  candidate is still pending (rated down to 5 — see Pending).
- **`historyReducer` extraction in `useUserDataStorage.ts`** (2026-05):
  the half of the severity-9 step-1 plan that consolidates the
  undo / redo / jumpToHistory / resetHistory transitions onto a
  single named-action `useReducer`. Action union is
  `reset | append | step-cursor | set-cursor`; the four call-sites
  in the hook now dispatch one of those rather than each carrying its
  own `setHistoryState((state) => …)` updater. A
  `historyStateRef` mirror lets the cursor-move callbacks read the
  current entry synchronously before dispatching, so the `setData`
  side-effect lives outside the reducer (which stays pure). No
  behaviour change — same cap, same UI-only-action filter, same
  truncate-on-append semantics.
- **`statusReducer` extraction in `useUserDataStorage.ts`** (2026-05):
  the second half of the severity-9 step-1 plan. The
  `useState<SaveStatus>` plus ~30 inline `setStatus(...)` call sites
  scattered across load / save / reload / watch / conflict /
  shrink-warning paths collapsed onto a single named-action
  `useReducer`. Action union is `load-start | save-start | save-success
| save-offline | idle | conflict | auth-error | throttled |
parse-error | shrink-warning | error`; the `Date.now()` timestamps
  for `saved` / `offline` now live in the reducer so each call site
  is one short dispatch instead of an inline `SaveStatus` literal.
  The `statusRef` mirror, the throttle-resume conditional check, and
  the bail-status helper all stay where they are — the reducer is
  the transition table, not the orchestration. No behaviour change;
  every code path now opts into the same vocabulary. Together with
  the `historyReducer` half above, this closes step 1 of the
  severity-9 god-hook plan; step 2 (sibling hook extraction)
  remains pending (now rated 8 — see Pending).
- **Hardcoded user-facing strings audit + fixes** (2026-05): the
  systematic `src/components/**/*.tsx` sweep called for in the
  severity-7 candidate landed and consumed the visible hits.
  Translated `SheetModal.tsx` ("No account" / "New account" /
  "Already exists"), `AppLoading.tsx` ("Loading budget…" → reused
  existing `app.loading` key), `budget/cells/AmountCellDisplay.tsx`
  ("Computed from a formula" `title` attribute), and
  `accounts/AccountTransferModal.tsx` ("Choose an account",
  "No accounts yet …"). PrivacyPage stays untranslated by design
  (AGENTS rule). New keys: `sheetModal.newAccount` /
  `.alreadyExists`, `formula.computedFromFormula`,
  `transfer.chooseAccount` / `.noAccountsYet`; English and Swedish
  catalogs updated together. The remaining drift surface (severity 3) sits in Pending — promoting the audit to an ESLint rule is
  the only thing keeping new violations from sneaking back in.
- **`TypePicker` `filterFn` escape hatch** (2026-05): the
  `amountSign` prop is now backed by an optional generic
  `filterFn?: (type: EntryType) => boolean` that takes precedence
  over the income/expense default — so future sheet flavours (loans,
  savings) can supply their own filter shape without the picker
  hard-coding every variant. Existing call sites are unchanged;
  `amountSign` stays as the budget-page default. Severity dropped
  from 5 to 3 — what remains is the (deferred) full registry idea.
- **`collectHiddenTransfersByAnchor` extraction from `BudgetMonthTable.tsx`**
  (2026-05): the 25-line `hiddenBefore` Map computation moved into
  `src/data/budget/synthesis.ts` next to its `isTransferRow`
  collaborator. `BudgetMonthTable.tsx` shrank by ~25 lines and the helper
  is now a pure function callable from tests / future render paths.
  The `<OrphanIndicator>` half of the original "BudgetMonthTable
  orphan-count + transfer-visibility logic scattered" candidate is
  still pending (rated down to 3 — opportunistic).
- **`resolveNoscriptBody(route)` helper** (2026-05): the build-time
  `<noscript>` splicer in `vite.config.ts` now always emits a body
  per route — explicit `noscriptBody` wins; otherwise a default is
  derived from `route.title` + `route.description` plus the
  standard "needs JavaScript" line. Fixes the silent inheritance
  bug where the inline 404 route (and any new route added without
  an explicit body) embedded the home-page noscript text verbatim.
  The PRIVACY route keeps its richer override.
- **`normalizeName` / `normalizeOptional` helpers** (2026-05): the
  recurring `name.trim().length > 0` + `text.trim() === "" ? undefined : text.trim()`
  patterns collapsed onto two helpers in `src/data/normalize.ts`.
  Adopted at `EntityCreatorForm`, `SheetModal` (sheet name + inline
  new-account name), `AccountModal`, `AccountTransferModal`, and
  `BudgetMatchRuleModal` (the `normalizeOptional` site). `CompanyPicker` /
  `CompaniesAdmin` kept their inline trim because the surrounding
  shape is `name.trim().toLowerCase()` for duplicate detection — a
  different concern.
- **`parseInt32(text): number | null` helper** (2026-05): the
  recurring `Number.parseInt(text, 10)` followed by `Number.isFinite`
  check collapsed onto a `parseInt32` helper in `src/utils/parse.ts`.
  Adopted at the four shift-day / anchor-day parsers in
  `BudgetEditEntryModal`, `BudgetEditEntryFullModal`, and `EditHistoryEntryModal`. The
  remaining inline `Number.parseInt` sites (`xlsx-reader.ts`,
  `semver.ts`) parse internal data, not user input — left inline so
  the call site retains its specific validation.
- **`StorageAdapter.capabilities` set** (2026-05): added
  `readonly capabilities: ReadonlySet<AdapterCapability>` to the
  adapter interface so UI surfaces gate on capability rather than
  `Boolean(adapter.backups)` checks. `SettingsModal` now reads
  `adapter?.capabilities.has("backups")` for the backup-button gate.
  `encrypting-adapter` and `cloud-mirror` forward the inner set
  minus `loadSync` (decryption / mirror reads are async); the four
  base adapters declare their own (IDB has no capabilities, folder /
  dropbox / gdrive each declare `backups`). The capability set
  duplicates the optional-field shape on purpose — a new backend can
  read one set instead of enumerating each optional field. Internal
  storage code keeps the existing optional-chain pattern
  (`adapter.loadSync?.()`, `adapter.watch?.(...)`) because the
  chained call already covers the missing case.
- **Shared `formatYearMonth(monthKey, lang)` helper** (2026-05): the
  duplicated `monthFormatCache` + `monthFormatFor` + `formatMonth`
  trio (one copy per file) collapsed onto a single
  `formatYearMonth(monthKey, lang)` in `src/utils/format.ts`. Six
  call sites — `BudgetMonthTable`, `BudgetViewerModal`,
  `BudgetMetadataModal`, `BudgetMoveCopyModal` (year-month half;
  short-month formatter stays inline), `HistoryModal`, `AccountsPage` —
  now share one Lang-keyed `Intl.DateTimeFormat` cache. The
  surrounding wrappers (`formatMonth(key, lang, t)` in BudgetMonthTable
  with the "undated" branch, `formatMonth(key, lang, undatedLabel)`
  in BudgetViewerModal) stay where they are because each one's
  pre-call branch differs.
- **`safeJsonParse<T>(text)` helper** (2026-05): the recurring
  `let parsed: unknown; try { parsed = JSON.parse(raw); } catch { return X; }`
  boilerplate collapsed onto a `safeJsonParse<T>(text): T | null`
  helper in `src/utils/json.ts`. Adopted at the 7 sites where the
  catch was unconditional (no error logging or message detail to
  preserve): `backup-index.ts`, `session.ts`, `users.ts`, `crypto.ts`,
  two `migrations/modern.ts` legacy readers, and `logger.ts`'s
  ring-buffer rehydration. Skipped at `file.ts` (the user-facing
  parse error message needs the `(err as Error).message` detail),
  `idb-adapter.ts`, and `dropbox-adapter.ts` (the catch logs a
  diagnostic warning that's useful for debugging).
- **`useResetOnOpen` adoption at three more modals** (2026-05):
  `AccountModal`, `BudgetSplitEntryModal`, and `EditHistoryEntryModal`
  switched from the manual `useEffect(() => { if (!open) return; ... }, [open, X])`
  pattern to the shared `useResetOnOpen(open, key, fn)` hook
  (previously used by `BudgetEditEntryModal` + `BudgetEditEntryFullModal`).
  `BudgetMatchRuleModal`, `BudgetBulkEditModal`, `BudgetComplexEntryModal`,
  `AccountTransferModal`, and `UpdateBalanceModal` weren't migrated because
  each one's reset-on-open effect carries a `settings` (or similar)
  prop in its dep array — preserving that semantic would require
  combining the keys into a composite resetKey, which obscures more
  than the hook saves.
- **`constants.ts` taxonomy / theme split** (2026-05): preset
  categories / entry types now live in `src/data/presets.ts`, theme
  presets in `src/data/themes.ts`.
- **`usePromptDerivations` extraction from `AppShell.tsx`** (2026-05).
- **`useBudgetLayoutState` hook for `BudgetPage.tsx`** (2026-05).
- **Shared `touch-gestures.ts` axis-discrimination helper** (2026-05).
  The remaining touch-gesture hooks were audited and deemed too
  divergent to merge further (React synthetic vs native events,
  damping, async, different gates).
- **`useHistoryEntryActions` + `useRowMutations` extractions from
  `AppShell.tsx`** (2026-05): saved ~110 lines. The page-routing
  switch (`activeSheet.type === ...`) and remaining dispatch-wiring
  glue stay in `AppShell.tsx` — that's the file's reason for
  existing. Re-survey for new seams before claiming a third
  extraction.
- **`<FormSection>` extraction** (2026-05): lives at
  `src/components/form/FormSection.tsx`, adopted by `SheetModal`,
  `AccountModal`, `AccountTransferModal`, `DownloadModal`, and
  `BudgetMatchRuleModal` (26 call sites collapsed). The other ~9
  candidate modals either wrap a styled container (rounded border +
  `bg-surface-*`) or use a tighter `gap-1` layout and weren't
  migrated. New modals should reach for `<FormSection>` from day
  one.
- **`useResetOnOpen` hook** (2026-05): the reset-on-open `useEffect`
  boilerplate has been hoisted into
  `useResetOnOpen(open, resetKey, reset)` in `src/hooks/`, used by
  `BudgetEditEntryModal` and `BudgetEditEntryFullModal`.
- **`SettingsModal.tsx` tab registry** (2026-05): the `TAB_REGISTRY`
  array lives in `SettingsModal/tabs/index.ts` and owns every tab's
  id + icon + visibility gate (devMode / captureLogs). The modal
  walks it to derive `tabIds` and `useTabDefs`. The `Component` slot
  wasn't unified into the registry because each tab takes a distinct
  prop shape; a generic `Component` would need a "god context" prop
  bag that obscures rather than helps. Adding a new tab is now:
  append one registry entry + author the tab component.
- **`validate/` createEnumValidator polish** (2026-05): the
  `validateEnum<T>(value, allowed, fallback)` helper lives at
  `src/data/validate/helpers.ts` and replaced the recurring
  `typeof raw.x === "string" && SET.has(raw.x as T) ? raw.x : default`
  pattern at 9 sites (settings.ts, theme.ts, sheet.ts, account.ts).
- **`storage/` → `components/` boundary fix** (2026-05):
  `PendingCloudLink` / `PendingFolderLink` types moved from
  `src/components/CloudLinkDialog.tsx` to
  `src/storage/cloud-link-types.ts`. `useStorageBackend.ts` and
  `CloudLinkDialog.tsx` now both import from the storage module;
  `src/storage/` and `src/data/` have no remaining imports from
  `src/components/`. Mirrors the inverse `data/action-payloads.ts`
  pattern.
- **i18n achievements split** (2026-05): `achievements.ts` (~400
  lines) has been split into `src/i18n/locales/{en,sv}/achievements/`
  with `shell.ts` (star button, unlock toast, four-tier tour) +
  `catalog.ts` (per-achievement entries — ~350 lines, the bulk of
  the file). The call-site shape
  (`t("achievements.catalog.firstSteps.name")`) is unchanged — the
  index spreads `shell` and nests `catalog`.
- **`src/data/budget/` + `src/data/accounts/` directories created**
  (2026-05): step 1 of the severity-9 "Budget-specific logic in the
  universal data layer" item. The already-prefixed `budget-rows.ts` /
  `budget-synthesis.ts` / `budget-export.ts` moved to
  `src/data/budget/{rows,synthesis,export}.ts`; `accounts-balance.ts` /
  `accounts-export.ts` moved to `src/data/accounts/{balance,export}.ts`.
  17 importers updated. The data-module map in `AGENTS.md` and the tree
  diagram in `docs/architecture.md` were updated in the same PR.
- **`src/data/sheet-types/` registry** (2026-05): the scattered
  sheet-type touchpoints (`SHEET_TYPES` array in `constants.ts`,
  `SHEET_TYPES` set in `validate/sheet.ts`, factory dispatch in
  `sheet.ts`, type-picker in `SheetModal.tsx`) collapse onto a single
  `SHEET_TYPE_REGISTRY` composed from one file per flavour
  (`sheet-types/{budget,accounts}.ts`). Adding a new flavour is now
  "drop a new file in `sheet-types/` + add one entry to the
  registry". The validator's enum set derives from the registry so
  it can't drift. The page-routing switch in `AppShell.tsx` and the
  per-type validators stay where they are — their per-type code
  shapes (validator dependency context, page prop signatures) differ
  enough that folding them into the descriptor would obscure more
  than it would consolidate; revisit either if they end up
  multiplied across 6+ flavours. The per-page i18n labels (still
  English-baked on the descriptors) remain part of the separate
  "Hardcoded user-facing strings in chrome" sweep.
- **`src/data/` per-page relocation, step 2** (2026-05): the
  unambiguously budget-only modules `row-cells.ts`, `formula.ts`,
  `formula-resolve.ts`, `pattern-derive.ts`, `pattern-apply.ts`, and
  `recurring-detection.ts` moved under `src/data/budget/` (with
  `row-cells.ts` renamed to `cells.ts`); `transfer-collapse.ts` —
  mis-categorised by the earlier sweep, since its mirror-pair
  detector operates purely on `HistoryEntry`s and is only used by
  `AppShell/hooks/useTransferFlow.ts` and the accounts modal —
  moved to `src/data/accounts/transfer-collapse.ts`. The
  cross-page modules `reconciliation.ts`, `recurrence.ts`,
  `merchant-hints.ts`, and `row-candidate.ts` stay at the
  `src/data/` root because they're used by both pages; the
  detailed reasoning lives in the `## Today` tree in
  `docs/architecture.md`. The data-layer inventory previously
  duplicated in `AGENTS.md` was consolidated into
  `docs/architecture.md` in the same PR, leaving AGENTS.md with
  just the placement rules.
- **`SettingsModal/admin.tsx` `<EntityForm>` extraction** (2026-05):
  the duplicated `CategoryEditor` / `TypeEditor` form-state + name
  - colour + icon + EditorButtons trio collapsed onto a shared
    `<EntityForm>` helper (local to `admin.tsx`, ~85 lines). Both
    editors became thin composers: `CategoryEditor` is 24 lines
    (passes its own `onSubmit` through directly); `TypeEditor` is 63
    lines (manages its own `categoryId` + `kind` state, slots the
    category dropdown + kind toggle between name and colour via
    `children`, maps the form's `icon` field onto the `EntryType.glyph`
    output shape). Same field order, same validation gate, same i18n
    keys — pure refactor with no user-visible delta. Net file size
    is unchanged (946 → 950 lines) because the shared helper carries
    its own type signature, but the duplication is gone. The
    `useAdminUIState()` half of the original plan stays in Pending
    (rated down to 4) until a third preset admin appears — extracting
    a hook for a two-call-site triple-`useState` pattern would
    obscure more than it consolidates.
- **`presets.ts` data / logic split** (2026-05): the 1080-line
  `src/data/presets.ts` split into three files under
  `src/data/presets/` — `types.ts` (PRESET_ENTRY_TYPES + entry-type
  helpers including `createSeedEntryTypes`, `visiblePresetTypes`,
  `isPresetTypeId`, `effectivePresetKind`, `effectiveTypeKind`),
  `categories.ts` (PRESET_CATEGORIES + DEFAULT_CATEGORY_ID +
  `isPresetCategoryId`, `visiblePresetCategories`), and `merge.ts`
  (`allTypes` / `allCategories`). 14 importers updated to point at
  the matching submodule. The `presetVersion` field + per-sheet-type
  registry parts of the original plan are deferred — both are
  speculative until a non-budget sheet type with its own preset list
  lands (same reasoning as the `forecasting/` skip below).

---

## Investigated and skipped

- **`useStorageBackend.ts` token state machine entangled with
  adapter selection** (2026-05, was severity 6): the candidate was
  rated 6 on the premise that "token refresh, OAuth completion,
  and adapter rebuilds share state" and that a future Reauth dialog
  couldn't easily trigger a refresh without reaching into the hook.
  On re-verification after the per-backend split fully landed
  (`useFolderHandle`, `useDropboxAuth`, `useGdriveAuth`), that
  premise no longer holds. Token state lives inside the per-backend
  hooks (each runs its own auth-sync effect against the active
  user). `reconnectCloud()` is exposed on the public hook return as
  a two-arm dispatch — gdrive → `reauthorizeGdrive`, dropbox →
  `startDropboxAuth` — so any "Reauth dialog" surface can call it
  without reaching into the implementation. The `pendingCloudLink`
  state is now the only cross-provider piece, and it exists for the
  link-confirmation dialog (which is a separate flow from refresh).
  The outer hook's adapter `useMemo` reads token state from its
  per-backend collaborators, not the other way around — there's no
  entanglement left to untangle. Re-create if a third cloud
  backend lands and the per-backend split's seams start to feel
  arbitrary.

- **`src/data/forecasting/` directory creation** (2026-05): the
  candidate was rated severity 9 on the premise that
  `src/data/budget/rows.ts` already contained "ad-hoc projection"
  logic that needed extracting into shared forecast primitives. On
  re-verification, that premise doesn't hold. `rows.ts` (478 lines)
  holds row sorting, running-balance computation, savability
  validation, transfer/history synthesis, series helpers, and a
  row-minter — none of which are financial primitives like
  compound interest, amortization, schedule generation, or
  seasonal-average. The named primitives (`compound.ts`,
  `amortise.ts`, `schedule.ts`, `seasonal-average.ts`) have zero
  call sites today; creating them now would be a speculative
  abstraction. `AGENTS.md`'s "Forecasting and planners" bullet
  and the `forecasting/ # TBD` line in `docs/architecture.md`
  are vision-document signposts for the feature wave, not
  observed-smell signals. Re-create this candidate when the
  first concrete loan/savings/scenario sheet type lands and the
  work to extract becomes concrete (the first sheet type can
  drop its primitive into `src/data/forecasting/` at that point,
  establishing the directory with a real call site).

- **Modal form-init pattern (full `useModalFormInit<T>`)**: the
  reset-on-open `useEffect` boilerplate has been hoisted (see
  `useResetOnOpen` above), but the full version that also owns the
  `useState` declarations was investigated and deferred — it would
  require renaming hundreds of JSX references from `description` to
  `values.description` across three large modals (700+ lines
  combined), which exceeds the boilerplate savings.
  `BudgetMetadataModal` has a per-entry-change reset (not on-open),
  so it doesn't fit `useResetOnOpen`; the stepping modal pattern
  was the right abstraction there but was also rejected (see
  below).

- **Step-through modal pattern**: only `AccountReconciliationModal` and
  `BudgetMetadataModal` are true stepping modals (`HistoryModal` is
  read-only; `EditHistoryEntryModal` is single-entry). The two
  stepping shapes diverge enough — Reconciliation manages orphan /
  candidate decisions via `setChecked` / `setOrphanDecisions` /
  `setSeriesRulesById`; BudgetMetadata walks `needsMetadata()`
  entries with grouping / month-header logic — that the
  extraction's risk exceeds its line savings. (Note: the
  Reconciliation modal's `useState` sprawl is still a real
  severity-6 smell; the fix is `useReducer` in-place, not a shared
  stepping abstraction.)

- **`<Amount value={n} settings={s} />` component**: only **3** call
  sites actually pair `withCurrency(formatNumber(…))`
  (`BudgetViewerModal`, `BudgetTransferSearchModal`, `format.ts`), not the
  ~20 originally claimed. A dedicated component doesn't earn its
  keep at three sites.

- **`useListboxKeyboard()` hook**: only **1** real call site
  (`form/SelectPicker.tsx:124–161`). `SettingsModal/admin.tsx` has
  icon buttons but no keyboard nav; `BudgetFormulaVariableHelper.tsx`
  uses plain `onClick` handlers. Premature at one call site —
  revisit when a second picker implements keyboard nav.

- **i18n `settings.ts` namespace split** (387 lines): the file is
  well-organized as one section per top-level key, so an 8–11 file
  split would add file churn without proportional discoverability
  gain. The navigation cost of opening one tab's section among 11
  sibling files exceeds the cost of scrolling to it inside the
  current monolith.

- **Cloud-adapter helpers (Dropbox 494 + GDrive 796)**: the parallel
  4xx semantics diverge intentionally (Dropbox 409 = path-not-found
  → return null; GDrive 412 = If-Match conflict → re-read remote)
  and the only genuinely shared surface is the bearer header.
  GDrive already has `authHeader()` at `gdrive-adapter.ts:148`;
  Dropbox repeats the one-line literal at 5 call sites. Extracting
  a `cloud-adapter-helpers.ts` module for one line of logic would
  obscure the divergence without simplifying call sites.

- **`AppShell.tsx` further hook splits** (beyond
  `usePromptDerivations`, `useHistoryEntryActions`,
  `useRowMutations`): the page-routing switch and remaining
  dispatch-wiring glue are the file's reason for existing.
  Re-survey for new seams before claiming a third extraction.
  (Note: the **modal-mount** decomposition is a separate
  severity-8 item above — that's not "another sub-hook", it's a
  `<ModalHost>` component.)

- **`<RowSearchForm>` extraction from `BudgetViewerModal.tsx` +
  `BudgetTransferSearchModal.tsx`** (2026-05, was severity 4):
  the original "duplicates ~200 lines" claim doesn't survive
  contact with the code. `BudgetTransferSearchModal` is 255 lines
  total — half of which is the highlighted-result rendering — so
  there were never 200 lines to share. The actual overlap is
  small: `useState("")` + the close-resets-query effect, plus the
  per-row pre-lowercasing pattern. The two modals diverge on
  match strategy (viewer does a plain `includes` over description /
  type name / formatted amount / ISO date; transfer modal calls
  `runSearch` from `src/data/search.ts`, which scores hits, ranges
  them for highlighting, and matches description / type name /
  category name / numeric-amount distance), on index source
  (viewer builds its index inline over a single `AccountBudget`'s
  rows that `BudgetPage` decorated upstream; transfer modal
  consumes a `SearchEntry[]` pre-built from the whole `UserData`
  via `buildSearchIndex`, which walks every sheet and re-runs
  `buildVisibleRows`), and on result rendering (viewer interleaves
  the filtered rows into its month-grouped budget table; transfer
  modal renders a flat result list with highlighted `<mark>`
  spans). A shared "build the index" helper would have to either
  fan into both call sites with different selectors and different
  output shapes, or collapse them — collapsing forces the viewer
  to depend on `UserData` instead of just its own decorated rows,
  which is the wrong direction. The search-input chrome itself
  (`ModalSearchBar` / `ClearableInput`) is already extracted and
  re-used at every other in-modal search surface. There's no
  remaining lever big enough to justify a shared `<RowSearchForm>`.
  Revisit only if a third sheet-type ships an inline filter with
  the same shape as the viewer's (single-sheet, includes-based,
  results interleaved into the page's own table).

- **Mass migration of reset-on-open `useEffect`s to `useResetOnOpen`**
  (2026-05): an Explore sweep flagged "18 sites, severity 7". On
  verification the list was mostly false positives and intentional
  non-migrations, so there is no batch worth doing. `Modal.tsx:135`
  / `:157` are the body-class and focus-management effects (not form
  reset-on-open); `SettingsModal.tsx:321` is the tab/changelog
  effect; several budget modals (`BudgetBulkEditModal`,
  `BudgetMatchRuleModal`, `BudgetComplexEntryModal`) already moved to
  `useReducer` or carry a `settings` dep that the hook can't model
  cleanly (documented in the `useResetOnOpen` Landed entry). The
  genuinely-convertible leftovers are a handful and stay an
  opportunistic drive-by (already in Easy wins), not a roadmap item.

- **Mass adoption of `normalizeName` / `normalizeOptional`** (2026-05,
  Explore sweep claimed "21 component files, severity 6"): the
  helpers landed and were adopted where the shape fits (see Landed).
  Most of the remaining `.trim()` sites are a _different_ concern —
  duplicate-detection `name.trim().toLowerCase()` (`CompaniesAdmin`,
  `TagsAdmin`, `CompanyPicker`) or per-field inline validation that
  doesn't return the helper's `string | null` / `string | undefined`
  shape. Forcing the helper onto them would obscure the duplicate
  check or change semantics. Adopt opportunistically when a real
  matching site is touched; not a batch.

- **Grouping the reducer `Action` union into nested discriminated
  unions** (2026-05, Explore sweep claimed severity 6): proposed
  wrapping budget actions as `{ type: "budgetAction"; payload: … }`
  so the central `Action` union in `src/data/reducer.ts` stops
  growing per sheet type. Rejected: the per-sheet-type `reduceItem`
  dispatcher already walks `SHEET_TYPE_REGISTRY` (see Landed), so
  dispatch is not the friction; the union being long is not itself a
  blocker, and a nesting layer would churn every existing call site
  and obscure the flat action shape the codebase reads cleanly today.
  Revisit only if exhaustiveness checking across 6+ flavours becomes
  genuinely unmanageable.

- **Per-sheet-type migration branching** (2026-05, Explore sweep
  claimed severity 6): proposed a `migrate?(raw, version)` descriptor
  field so future sheet types with divergent column/row schemas get
  their own version branches. Speculative — same reasoning as the
  `forecasting/` skip below. Migrations are forward-only and no
  sheet type with a divergent schema exists yet; building the seam
  now has nothing to migrate. Re-create when the first new
  row-bearing sheet type lands and actually needs a schema bump.

- **`JSON.parse` → `safeJsonParse` at the three remaining raw sites**
  (2026-05, re-confirmed): `file.ts:38`, `idb-adapter.ts:236`, and
  `dropbox-adapter.ts:259` are kept inline on purpose — each retains
  an error-detail message (`(err as Error).message`) or a diagnostic
  warning that `safeJsonParse`'s silent `null` would discard. The
  earlier "~9 sites" claim collapsed once the unconditional-catch
  sites were consumed (see Landed). Left alone.

- **Per-route `<noscript>` fallback drift** (2026-05, decayed to
  severity 2): the `resolveNoscriptBody` default-derivation landed
  (see Landed), so new routes can't inherit the home-page noscript.
  The PRIVACY route's richer override still risks drift against its
  own description, but at one custom override it isn't worth chasing
  until a second route grows one.

---

## Sources

- Original sweep notes lived inline in `AGENTS.md` under "Known
  refactoring opportunities" until 2026-05; that section now
  redirects here.
- 2026-05-27 sweep added the strategic-context section, the severity
  rubric, and ~25 new candidates discovered in three parallel
  Explore-agent audits of the largest files, the `src/data/` and
  `src/storage/` layers, and cross-cutting patterns. The notes from
  those audits seeded the severity-9 / severity-8 / severity-7 bands
  and the new severity-3–4 easy-win list.
- 2026-05-29 full refresh ("start over"): re-verified every Pending
  item against the current tree (line counts and smell shapes drift)
  and re-surveyed across five angles — largest files, the `src/data/`
  - `src/storage/` layers, cross-cutting patterns, type-safety holes,
    and direction-of-dependency. The type-safety (`as any` / `@ts-*`),
    import-direction (`components` → `data`/`storage`), and native
    `<select>` sweeps came back clean (zero real hits). New candidates:
    the sheet-type-registry coverage cluster (7), `useImportFlow`
    monolith (5), `BudgetComplexEntryModal` reset pyramid (4), the
    transfer-search filter extraction (4), and the cross-sheet row
    counters (3); the `indexById` adoption easy-win and the
    budget-only-module relocation were refreshed with new sites. Five
    Explore-agent over-ratings were filtered down and recorded in
    Investigated and skipped rather than inflating Pending. Decayed
    items were re-banded (the AppShell modal-host residual, the
    admin-state extraction, the modal-`useReducer` and hardcoded-string
    items all sit at their re-rated severities now).
