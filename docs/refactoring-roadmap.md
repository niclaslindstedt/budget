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

_Currently empty._ The persistence engine refactor (`useUserDataStorage.ts`)
dropped from 9 to 8 once step 1 of its plan landed (history +
status reducers — see Landed), and now lives in the 7-8 band. No
remaining candidate gates the feature wave on its own; the
multipliers below are still worth landing before adding the second
new sheet type, but feature work can ship through them.

### Severity 7–8 — multipliers (land before the second new sheet type)

- **`useUserDataStorage.ts` (1247 lines) is a god hook** — the
  persistence engine of the app. Braids load / save / conflict
  resolution / shrink-warning with parallel `useRef` variables and
  `useEffect` blocks whose dependency arrays each span 20+ entries.
  The `performSave` callback alone spans ~180 lines. Bugs here
  corrupt user data or leak auth tokens. **Severity: 8** (was 9 —
  dropped one band now that step 1 is complete; the remaining
  sibling-hook extraction is still high-leverage but no longer
  blocks the feature wave on its own).
  - Plan:
    1. ~~Split the remaining in-hook state into named slices~~ —
       **done.** The `historyReducer` half landed 2026-05; the
       `statusReducer` half landed 2026-05 (see Landed). Both
       SaveStatus transitions and history mutations now flow
       through named-action reducers.
    2. Extract `useLoadState`, `useSaveStateMachine`, and
       `useUndoRedo` as siblings; the outer hook becomes a thin
       composer that wires their outputs together. The
       reducer-first split is what makes this tractable — each
       sibling now has a self-contained state machine to lift
       out, not a setState braid threaded through three effects.
  - Risk: **high**. Storage hot path. Needs smoke-test of all four
    backends (IDB, Dropbox, GDrive, Folder) before merging plus a
    full Playwright regression run. The previous-roadmap note about
    "reducer split first, hook extraction as a consumer" still
    stands.

- **`useStorageBackend.ts` (1256 lines)** — split into
  `useDropboxAuth`, `useGdriveAuth`, `useFolderHandle`, leaving the
  main hook as an orchestrator. Natural seams at `buildInnerAdapter`
  lines 99–120 — each branch is ~15 lines with its own token-refresh
  / permission logic. Each sub-hook becomes <300 lines and testable
  in isolation. Token-refresh side channel
  (`dropboxRefreshTokenRef`) is a correctness hazard: a ref bypasses
  React state so the adapter `useMemo` doesn't rebuild on refresh.
  **Severity: 8.** Disentanglement caveats: `disconnectCloud` is
  shared between Dropbox + GDrive, `pendingCloudLink` flows through
  OAuth completion in two places, and `loadSourceText` is consumed
  by both `connectGdrive` and the Dropbox OAuth effect — sub-hooks
  must take injected callbacks for these orchestration points
  rather than owning them. Storage hot path — **needs smoke-testing
  all four backends before merging.**

- **`AppShell.tsx` (1826 lines) modal-mount + prop-drilling hub** —
  the component already extracted ~24 sub-hooks, but the JSX tail
  still mounts ~25 modals back-to-back, each fed 5–15 props
  threaded down from the AppShell prop interface (which itself
  takes ~30 props from `App.tsx`). 22 `useCallback`s. Adding a new
  sheet type means another modal cluster + more callbacks +
  more props on the AppShell signature. **Severity: 8.**
  - Plan: introduce a `<ModalHost>` component that owns the modal
    open-state and renders the registered modals from a registry.
    Each modal's open-args become a typed action. Keep
    `AppShell.tsx` as a routing switch (`activeSheet.type === …`)
    - a `<ModalHost>` mount; everything else is decomposed into
      per-page modal hosts (`<BudgetModalHost>`, `<AccountsModalHost>`).
  - Risk: medium. The shape itself is mechanical, but the long
    callback-chain on each modal needs careful preservation.

- **`BudgetPage.tsx` derived-state memo pyramid** — the prop-
  drilling half of the original "BudgetPage prop drilling + memo
  pyramid" candidate landed 2026-05 (see Landed: `<BudgetContext>`).
  What remains is the 15+ overlapping `useMemo`s that derive
  visible-month / sorted-month-groups / col-widths / balance-overrides
  / synthesised-rows / merged-item / decorated-item / coveredSet /
  orphanCountByMonth. One memo breaking cascades through the others;
  a planner sheet type that wants to reuse a subset of those derivations
  would have to fork the pyramid. **Severity: 5.**
  - Plan: derive a single `ComputedBudgetState` object (visible months,
    balances, synthesised rows, coveredSet) memoised once at the top
    of `BudgetPage`. The downstream JSX reads fields off that object
    instead of carrying 8 separate memos.
  - Risk: low — pure refactor with no observable behaviour change.
    Make sure each memo's dep array stays exact when consolidated so
    the budget table doesn't recompute on every keystroke.

- **`SettingsModal/admin.tsx` `useAdminUIState()` extraction** —
  half of the previous duplicated-editor item; the `<EntityForm>`
  half landed in 2026-05 (see Landed). What's left: the
  `creating` / `editingId` / `pendingDeleteId` triple-`useState`
  pattern appears verbatim in both `CategoriesAndTypesAdmin` (with
  a `Category` suffix) and `TypesSection` (without). Adding a new
  preset admin (loan types, savings goals) would re-derive it.
  **Severity: 4.** Easy win when a third call site materialises;
  premature at two — the pattern is three `useState` lines, not a
  whole sub-machine, so a hook today would obscure more than it
  consolidates. Re-rate up if a `<LoanTypeAdmin>` lands and the
  pattern shows up a third time.

- **Hardcoded user-facing strings in chrome** — investigated 2026-05
  and decayed to **severity 3**: the systematic audit landed (see
  Landed) and consumed the visible hits in `SheetModal.tsx`,
  `AppLoading.tsx`, `AmountCellDisplay.tsx`, and
  `accounts/AccountTransferModal.tsx`. The remaining drift surface is
  small — a handful of literals could still slip in via new
  components without a lint rule to catch them. Promoting the
  one-off audit script to an ESLint rule would be the next step,
  but it's a tooling change rather than a refactor and stays low
  priority until a missed string is found in production. Re-rate
  up if a second batch of hardcoded strings surfaces.

### Severity 5–6 — friction

- **`budget/formula.ts` function registry** — the tokenizer / parser
  / evaluator file split landed 2026-05 (see Landed); what remains
  of the original severity-6 candidate is the function-registry idea
  so new sheet types can register their own functions
  (`loanPayment(rate, years, principal)`). Deferred until a concrete
  non-budget sheet type with custom-formula needs lands — premature
  today because every existing function (`min`, `max`, `clamp`,
  `abs`, `round`, `categoryTotal`, `typeTotal`, `sheet`) is budget-
  scoped and the registry would have nothing to register against.
  **Severity: 3** — re-rate when the first loan/savings flavour
  needs a domain-specific function.

- **`AccountReconciliationModal.tsx` (729 lines) state machine in `useState`s** —
  the orphan-decision flow is tracked by ~6 parallel `useState`
  setters (`orphanDecisions`, `seriesRulesById`, `checked`, …) with
  no atomic transition between them. **Severity: 6.**
  - Plan: convert to `useReducer` with a `ReconciliationState` type.
    Business helpers (`inferSeriesRule`, `expandToSeries`) become
    reducer actions, testable without React.

- **`BudgetEditEntryModal.tsx` (720 lines) recurrence/promotion form
  duplication** — basic-row, recurring-edit, promote-to-series and
  promote-history are different modes sharing some machinery but
  not all. Loans / savings will want their own series semantics.
  **Severity: 6.**
  - Plan: extract `<BudgetRecurrenceForm>` and `<PromotionForm>` so each
    returns a validated domain object (not JSX). Drop the
    `HistoryEntry`-only assumption — accept a generic
    `{date, amount, description}` seed.

- **No `useReducer` in any of the ~20 modal state machines** —
  search for `useReducer` in `src/components/`: zero hits.
  `useState` pyramids in modals with 5+ fields (`BudgetMatchRuleModal`,
  `BudgetSplitEntryModal`, `BudgetBulkEditModal`, `BudgetMetadataModal`,
  `ImportHistoryModal`, …). **Severity: 5.** Per-modal value is
  moderate but the cumulative readability gain is significant.
  Apply opportunistically when a modal is otherwise being touched.

- **Reducer has no generic per-sheet-type dispatcher** — the
  item-level reducer (`src/data/reducers/item/index.ts:505`) matches
  on `i.type === "accountBudget"` directly. Each new sheet type will
  add an arm. **Severity: 6.**
  - Plan: introduce a `SheetItemReducer<T>` factory so each sheet
    type registers its own item reducer; `reduceItemDispatch`
    walks the registry instead of hard-coding the union.

- **`BudgetMatchRuleModal.tsx` (770 lines) state machine spread + tight
  coupling to `HistoryEntry`** — amount-mode toggles between
  "any / exact / range" with inline render branching; pattern
  derivation runs inside a `useEffect` and assumes a `HistoryEntry`
  seed. New sheet types with custom transaction sources need
  generic input. **Severity: 5.**
  - Plan: extract `<AmountModeSelector>` with its own state machine;
    move pattern derivation into a `usePatternDerivation(seed)`
    hook accepting `{description, amount}`.

- **`useStorageBackend.ts` token state machine entangled with
  adapter selection** — token refresh, OAuth completion, and
  adapter rebuilds share state. A future "Reauth dialog" can't
  easily trigger a refresh without reaching into the hook.
  **Severity: 6** (folds into the 8-rating split above; same PR
  family).

- **`useUserDataStorage.ts` save chain has no retry strategy** —
  network failures are caught into `RateLimitError` and pause
  autosave but there's no exponential backoff or budget. React
  Native / mobile networks will need it. **Severity: 5.**

- **Optional fields on persisted types — `undefined` vs `null`
  drift** — `src/data/types/accounts.ts` has ~15 optional fields
  (`description?`, `glyph?`, `color?`, `currency?`, `clearing?`,
  `accountNumber?`, `openingBalance?`, …). Convention isn't
  documented: some readers check `!= null`, others check `!==
undefined`, and the validator doesn't enforce. Adding a new
  per-account flag risks introducing a third convention.
  **Severity: 5.**
  - Plan: document the convention in `AGENTS.md` (default to
    `field?: T` for "absent / use global default"; reserve `field:
T | null` for "explicitly cleared by the user, distinct from
    never set"). Sweep `accounts.ts`, `settings.ts`, `rules.ts`
    once and stamp the validator to enforce.

### Severity 3–4 — nits with leverage

- **OAuth refresh logic duplicated across dropbox/gdrive
  adapters** — Dropbox refreshes via `refreshDropboxAccessToken`
  (dropbox-adapter.ts:169); GDrive uses short-lived GIS tokens with
  no refresh path. Each adapter re-implements 401-handling.
  **Severity: 4.** Skipped previously (see Investigated below)
  because the 4xx semantics legitimately differ; revisit only if a
  third OAuth backend (e.g. iCloud Drive) lands.

- **`BudgetViewerModal.tsx` (816 lines) inline search filter**
  duplicates ~200 lines from `BudgetTransferSearchModal.tsx`. **Severity: 4.**
  Easy seam: extract `<RowSearchForm>`. (The `monthFormatCache`
  consolidation half of this item landed 2026-05 — see Landed.)

- **`BudgetMonthTable.tsx` orphan-count + transfer-visibility logic
  scattered** — orphan rendering coordinates between AppShell,
  BudgetMonthTable, and a footer subcomponent. **Severity: 3** (was 4;
  the `hiddenBefore`-Map extraction half landed 2026-05 — see
  Landed). What's left is extracting the `<tfoot>` orphan-indicator
  JSX (~25 lines) into an `<OrphanIndicator>` sibling; opportunistic,
  not worth a dedicated PR.

- **`TypePicker.tsx` (716 lines) hardcoded `amountSign` filter** —
  branches on income-only / expense-only types inline. **Severity: 3**
  (was 5; the `filterFn?: (type: EntryType) => boolean` escape hatch
  landed 2026-05 — see Landed). The remaining `amountSign` branching
  is now opt-in default behaviour and stays put until a non-budget
  sheet type ships and demands a richer registry.

- **JSON parse before validate** — investigated 2026-05 and decayed
  to **severity 2**: the original "~9 sites" claim collapsed once
  `safeJsonParse` adoption landed (see Landed). Only three raw
  `JSON.parse` calls remain (`file.ts:38`, `idb-adapter.ts:232`,
  `dropbox-adapter.ts:259`), each intentionally kept inline so the
  caller retains an error-detail message or diagnostic warning. The
  parse-then-validate combo at the existing `safeJsonParse` sites is
  shaped differently per call (each one runs a bespoke
  `typeof parsed.x === "..."` validator) — no shared helper would
  consolidate them without obscuring the validation. Left alone.

- **Backup logic per-adapter (Dropbox, GDrive, Folder)** — each
  hand-rolls the backup-index lifecycle (`backup-index.ts`,
  `backup-metadata.ts` per call). IDB has no backups. **Severity: 4.**
  - Plan: extract a `BackupManager` that accepts an adapter and
    drives the lifecycle. IDB skips backup operations cleanly.

- **Bank parser registry is global, no capability flags** — a
  React Native target can't unbundle parsers that depend on
  binary-decompression libs. **Severity: 4.** Defer until a target
  actually needs to drop a parser.

- **Per-route `<noscript>` fallback drift** — investigated and
  partially landed 2026-05 (see Landed: `resolveNoscriptBody`).
  Routes that don't supply an explicit `noscriptBody` now get a
  body derived from `title` + `description` so new routes (and the
  build's inline 404 route) can't quietly inherit the home-page
  noscript. The PRIVACY route's richer override still risks drift
  against its own description; **severity 2** at this point, not
  worth chasing until a second route grows a custom override.

- **Inline `parseFloat` / `new Date(…)` at remaining sites** —
  `parseInt32` landed 2026-05 (see Landed) and was adopted at the
  shift-day / anchor-day parsers; the remaining `parseFloat` and
  `new Date(...)` sites are CSS-value parsing and date construction
  that don't share the user-input parsing shape `parseDecimal` would
  cover. Re-rate if thousands-separator support lands and an actual
  `parseDecimal(text, lang)` use case appears. **Severity: 3.**

### Easy wins (mechanical, land regardless of rating)

- Move the remaining unprefixed budget-only modules under
  `src/data/budget/` (folds into the severity-9 item above; the
  directory move itself is the easy part). The prefix-rename pass
  already landed; what's left is the naming-judgment pass.

- Replace remaining native-looking patterns: scan for any new
  `<select>` / `<option>` introduced since the last sweep (AGENTS
  rule forbids them; current count: 0).

- Replace `useState`-pyramid modals with `useReducer` as their
  surrounding file is otherwise touched. No batch PR — opportunistic
  drive-by.

---

## Landed

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
