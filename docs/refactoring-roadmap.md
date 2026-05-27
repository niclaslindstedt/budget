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

- **`src/data/forecasting/` is documented but does not exist** —
  `AGENTS.md` ("Forecasting and planners") and `docs/architecture.md`
  both promise pure functions in `src/data/forecasting/` consumed by
  sheet-type components. The directory was never created. The
  scenario / prognosis / loans sheet types each need forecast
  primitives (compound, amortise, schedule, seasonal-average); the
  budget page also already does ad-hoc projection inside
  `budget-rows.ts` that belongs in this module. **Severity: 9.**
  - Shape: create `src/data/forecasting/` with one file per pure
    primitive (`compound.ts`, `amortise.ts`, `schedule.ts`, …) plus
    an `index.ts` re-exporting them. Pure functions only, no React,
    no IO. Tests next to each primitive under
    `tests/forecasting/<name>_test.ts`.
  - Risk: low — additive. The danger is the opposite, landing the
    new sheet types first and embedding forecasting logic inside
    those component trees where it'll be impossible to reuse.

- **`useUserDataStorage.ts` (1139 lines) is a god hook** — the
  persistence engine of the app. Braids load / save / conflict
  resolution / shrink-warning / undo-redo with nine parallel `useRef`
  variables and three `useEffect` blocks whose dependency arrays each
  span 20+ entries. The `performSave` callback alone spans ~180 lines.
  Bugs here corrupt user data or leak auth tokens. **Severity: 9.**
  - Plan (two PRs, in order to keep each reviewable):
    1. Split the in-hook reducer state into named slices
       (`conflictResolutionReducer`, `authErrorReducer`,
       `shrinkWarningReducer`) — disentangling the braid before any
       file split, otherwise the split just relocates the braid.
    2. Extract `useLoadState`, `useSaveStateMachine`, and
       `useUndoRedo` as siblings; the outer hook becomes a thin
       composer that wires their outputs together.
  - Risk: **high**. Storage hot path. Needs smoke-test of all four
    backends (IDB, Dropbox, GDrive, Folder) before merging plus a
    full Playwright regression run. The previous-roadmap note about
    "reducer split first, hook extraction as a consumer" still
    stands.

- **Budget-specific logic in the universal data layer** —
  `src/data/budget-rows.ts` (478), `row-cells.ts`, `formula.ts`
  (680), `formula-resolve.ts` (477), `budget-synthesis.ts` (291),
  `reconciliation.ts` (546), `pattern-apply.ts` (308),
  `pattern-derive.ts`, `recurrence.ts`, `recurring-detection.ts`
  (292), `row-candidate.ts`, `merchant-hints.ts`,
  `transfer-collapse.ts` — all sit at the `src/data/` root but are
  hard-coupled to `AccountBudget` row schema. New sheet types
  (savings rows have probability fields; loans have schedules) will
  either copy this code or branch every callsite on `item.type`.
  **Severity: 9.**
  - Plan: introduce `src/data/budget/` and move budget-only modules
    under it. Mirror with `src/data/accounts/` for the few accounts-
    specific helpers currently at root. Leave only the universal
    primitives (`sheet.ts`, `types/`, `fiscal-month.ts`,
    `validate/`, `migrations/`, `reducer.ts`, `reducers/`,
    `constants.ts`, `presets.ts`, `themes.ts`, `settings.ts`,
    `achievements/`) at the root. The data-module map in `AGENTS.md`
    must be updated in the same PR.
  - Risk: medium — pure module relocation, but ~50 import paths
    update. Best landed as a sequence of small per-module moves
    each in their own commit, not one mega-PR.

- **`storage/` imports from `components/`** — `useStorageBackend.ts:6-8`
  imports `PendingCloudLink` and `PendingFolderLink` types from
  `components/CloudLinkDialog.tsx`. Direct violation of the
  `AGENTS.md` dependency rule ("Nothing in `data/` or `storage/`
  imports from `components/`. Keep it that way.") The types are
  defined in the dialog file (CloudLinkDialog.tsx:18, 42) but
  consumed by the storage hook _and_ the dialog. **Severity: 8.**
  - Plan: move `PendingCloudLink` / `PendingFolderLink` into
    `src/storage/cloud-link-types.ts` (the conceptual owner — they
    represent in-flight OAuth state, not dialog UI). The
    `CloudLinkDialog` re-imports from there. Mechanical fix; the
    pattern `data/action-payloads.ts` already established for the
    inverse case is the template.
  - Risk: low. ~3 import paths change.

### Severity 7–8 — multipliers (land before the second new sheet type)

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

- **`AppShell.tsx` prop signature passed from `App.tsx`** — ~30
  props (adapter, user, password, hasOtherUsers, backend,
  dropboxConnected, gdriveConnected, folderConnected, …, plus 16
  callbacks). Every new backend / sheet type / cloud feature adds
  to this surface. **Severity: 7.**
  - Plan: introduce a `useAuthAndBackend()` facade hook that returns
    `{ user, backend, connections, encryption, callbacks }`; pass
    the bundle as `auth={…}`. Same for sync state. The shape stays
    a flat object, but the prop count drops from 30 to ~5 typed
    bundles.

- **Sheet-type routing is scattered across 15+ files** — adding a
  new `SheetType` requires edits in `data/types/sheets.ts` (literal),
  `data/constants.ts` (`SHEET_TYPES`), `AppShell.tsx` (routing
  switch), `data/validate/sheet.ts` (`SHEET_TYPES` set),
  `data/sheet.ts` (factory functions), `components/SheetModal.tsx`
  (type picker), `i18n/locales/{en,sv}/sheet.ts` (label), plus a
  per-type subdirectory under `components/`. There is no single
  registry. **Severity: 7.**
  - Plan: introduce `src/data/sheet-types/<type>.ts` modules each
    exporting `{ id, defaultItems, validate, i18nKey, glyph }`.
    Compose into a `SHEET_TYPE_REGISTRY` at module load. All the
    scattered files import from the registry. Adding a new type
    becomes "drop a new file in `sheet-types/`".

- **`BudgetPage.tsx` (1373 lines) prop drilling + memo pyramid** —
  threads `types`, `categories`, `companies`, `onCreateType`,
  `onCreateCategory`, `onCreateCompany`, `settings`, … through
  `MonthTable` (50+ props) → `BudgetRow` → `BudgetCell` →
  `TypePicker`. 15+ overlapping `useMemo`s build derived state; one
  memo broken cascades through the others. Porting to React Native
  or adding a savings/loans sibling page will copy this prop tree.
  **Severity: 7.**
  - Plan: a `<BudgetContext>` provider near the top of `BudgetPage`
    holding `{ types, categories, companies, settings, onCreate* }`
    so descendants `useContext`. Collapse the memo pyramid by
    deriving a single `ComputedBudgetState` object (months,
    balances, synthesised rows) memoised once at the top.
  - Caveat: a context for hot-path renders is fine as long as the
    object identity is memoised — re-creating it per render would
    re-render every descendant. Stabilise with `useMemo`.

- **`MonthTable.tsx` (682 lines) has a 50-property `Props` type** —
  symptom of the same disease as `BudgetPage.tsx`. Same fix:
  consume the context, drop the threaded props to ~5. **Severity:
  7** (folds into the above; same PR).

- **`presets.ts` (1080 lines) data + logic intertwined, no
  versioning** — preset categories / types ids use `preset-type-…`
  but there's no schema-version field. If a preset's structure
  changes (e.g. adding `loanTermMonths` to a type), there's no way
  to migrate stored user data that references the old shape. Merge
  logic (`effectivePresetKind`, `allCategories`, `allTypes`)
  cascades into pickers, settings, i18n, validation. New sheet types
  need their own category namespaces (loans don't share categories
  with the budget ledger). **Severity: 7.**
  - Plan: split into `src/data/presets/categories.ts`,
    `src/data/presets/types.ts`, `src/data/presets/merge.ts`. Add a
    `presetVersion` field. For each new sheet type, introduce a
    sibling registry (e.g. `src/data/presets/loan-types.ts`) rather
    than overloading the budget one.

- **`SettingsModal/admin.tsx` (944 lines) duplicated category/type
  editors** — `CategoryEditor` and `TypeEditor` both re-implement
  form-state + validation + colour/glyph picker. Adding a new sheet
  type's preset admin (loan types, savings goals) would duplicate
  this again. **Severity: 7.**
  - Plan: extract `<EntityForm>` shared between the two (and used
    by any future preset admin). Move section-expansion state into
    a single `useAdminUIState()` hook.

- **Hardcoded user-facing strings in chrome** — sample sweep found
  `SheetModal.tsx:348` and `:365` ("No account") rendering plain
  literals instead of `t("…")`. The AGENTS rule ("No hardcoded
  user-facing strings") is enforced by convention, not lint, so
  drift is invisible until a Swedish-speaking user opens the
  modal. Past ~6 component files have been spot-checked, so a
  systematic audit hasn't run. **Severity: 7.**
  - Plan: write a one-off audit script that greps every
    `src/components/**/*.tsx` for string literals inside JSX text
    nodes, `aria-label=`, `title=`, `placeholder=`, and modal
    titles, excluding allowlist (CSS classes, ids, dev-only
    `data-*` attributes). Fix the hits; promote the script to a
    lint rule once the baseline is clean.
  - Risk: low. Each fix is a one-line edit + a key in both
    `locales/en/<ns>.ts` and `locales/sv/<ns>.ts`.

### Severity 5–6 — friction

- **`styles.css` (1604 lines)** — break into imported sub-files:
  `_theme-vars.css`, `_tailwind-overrides.css`, `_components.css`,
  `_utilities.css`. Palette blocks (One Dark / Light / Dracula /
  Monokai / GitHub / Solarized / Quiet Light / System) stay
  together in `_palettes.css` since they share a
  `:root[data-theme]` pattern. Audit for unused rules via DevTools
  coverage while you're in there. **Severity: 6.** Pay attention to
  import order at the entry point because `@layer components` rules
  consume colour vars declared in `@theme`.

- **`useUserDataStorage.ts` reducer split (step 1 of the god-hook
  decomposition)** — same item as the severity-9 god hook, listed
  here because the **first PR** of the plan (reducer-state split
  only) is a moderate-risk friction fix on its own. The 9-rating
  applies to the full extraction including sibling hooks.

- **`formula.ts` (680 lines) parser/evaluator entanglement** —
  tokenizer + parser + evaluator share a module with no abstraction
  boundary. Adding a function (`min`, `max`, `loanPayment`) touches
  tokenizer, parser, evaluator. Cross-sheet variables resolved
  late: a typo on a variable name is a runtime error, not a parse
  error. **Severity: 6.**
  - Plan: split into `formula-tokenizer.ts`, `formula-parser.ts`,
    `formula-ast.ts`, `formula-evaluator.ts`. Introduce a function
    registry so new sheet types register their own functions
    (`loanPayment(rate, years, principal)`).

- **`ReconciliationModal.tsx` (729 lines) state machine in `useState`s** —
  the orphan-decision flow is tracked by ~6 parallel `useState`
  setters (`orphanDecisions`, `seriesRulesById`, `checked`, …) with
  no atomic transition between them. **Severity: 6.**
  - Plan: convert to `useReducer` with a `ReconciliationState` type.
    Business helpers (`inferSeriesRule`, `expandToSeries`) become
    reducer actions, testable without React.

- **`EditEntryModal.tsx` (720 lines) recurrence/promotion form
  duplication** — basic-row, recurring-edit, promote-to-series and
  promote-history are different modes sharing some machinery but
  not all. Loans / savings will want their own series semantics.
  **Severity: 6.**
  - Plan: extract `<RecurrenceForm>` and `<PromotionForm>` so each
    returns a validated domain object (not JSX). Drop the
    `HistoryEntry`-only assumption — accept a generic
    `{date, amount, description}` seed.

- **No `useReducer` in any of the ~20 modal state machines** —
  search for `useReducer` in `src/components/`: zero hits.
  `useState` pyramids in modals with 5+ fields (`MatchRuleModal`,
  `SplitEntryModal`, `BulkEditModal`, `BudgetMetadataModal`,
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

- **`MatchRuleModal.tsx` (770 lines) state machine spread + tight
  coupling to `HistoryEntry`** — amount-mode toggles between
  "any / exact / range" with inline render branching; pattern
  derivation runs inside a `useEffect` and assumes a `HistoryEntry`
  seed. New sheet types with custom transaction sources need
  generic input. **Severity: 5.**
  - Plan: extract `<AmountModeSelector>` with its own state machine;
    move pattern derivation into a `usePatternDerivation(seed)`
    hook accepting `{description, amount}`.

- **`constants.ts` (883 lines) god module** — storage namespacing,
  app defaults, currency / locale maps, font / session presets all
  in one file. Adding a new sheet type's defaults forces editing
  this file. **Severity: 5.**
  - Plan: split into `storage-constants.ts`, `app-defaults.ts`,
    `i18n-constants.ts`, `currency-constants.ts`. Each validator
    imports from the matching constants module.

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

- **Text-field trim + validate duplicated across ~10 form
  components** — `EntityCreatorForm`, `SheetModal`, `CompanyPicker`,
  `AuthScreen`, `MatchRuleModal` each implement
  `name.trim().length > 0 && …` inline; some also lowercase for
  duplicate-detection. **Severity: 5.**
  - Plan: extract `normalizeName(text)` / `normalizeOptional(text)`
    in `src/data/normalize.ts`. Adopt at the existing sites.

### Severity 3–4 — nits with leverage

- **OAuth refresh logic duplicated across dropbox/gdrive
  adapters** — Dropbox refreshes via `refreshDropboxAccessToken`
  (dropbox-adapter.ts:169); GDrive uses short-lived GIS tokens with
  no refresh path. Each adapter re-implements 401-handling.
  **Severity: 4.** Skipped previously (see Investigated below)
  because the 4xx semantics legitimately differ; revisit only if a
  third OAuth backend (e.g. iCloud Drive) lands.

- **`BudgetViewerModal.tsx` (816 lines) inline search filter**
  duplicates ~200 lines from `TransferSearchModal.tsx`. Module-scope
  `monthFormatCache` doesn't invalidate on language change.
  **Severity: 4.** Easy seam: extract `<RowSearchForm>`; move
  `monthFormatCache` into `useMonthFormatter(lang)`.

- **`MonthTable.tsx` orphan-count + transfer-visibility logic
  scattered** — orphan rendering coordinates between AppShell,
  MonthTable, and a footer subcomponent; transfer visibility is
  computed implicitly per row. **Severity: 4.** Easy seam: extract
  `<OrphanIndicator>` and `affectedByHiddenTransfer(rowId, hideSet,
balances)` utility.

- **`TypePicker.tsx` (716 lines) hardcoded `amountSign` filter** —
  branches on income-only / expense-only types inline. New sheet
  types with different category semantics (loans → only
  loan-payment types) will need their own filter. **Severity: 5**
  (overlap with the 7-rating registry idea; one fix lands both).
  - Easy partial fix at the 4-band: add a `filterFn?: (type:
EntryType) => boolean` prop so callers customise; default to
    the current `amountSign` behaviour.

- **JSON parse before validate, ~9 sites** — `file.ts:38`,
  `backup-index.ts:29`, `migrations/modern.ts:351,379`,
  `session.ts:41`. Validators run downstream so it's not a live
  bug, but the parse→cast window is a footgun. **Severity: 4.**
  Easy win: extract `parseAndValidate<T>(text, validator)` helper
  and adopt at the ~9 sites.

- **Backup logic per-adapter (Dropbox, GDrive, Folder)** — each
  hand-rolls the backup-index lifecycle (`backup-index.ts`,
  `backup-metadata.ts` per call). IDB has no backups. **Severity: 4.**
  - Plan: extract a `BackupManager` that accepts an adapter and
    drives the lifecycle. IDB skips backup operations cleanly.

- **`StorageAdapter.backups` is an optional field — no capability
  sniffer** — UI checks `adapter.backups !== undefined`. Adding a
  React Native backend would repeat the check. **Severity: 3.**
  Easy win: add an `adapter.capabilities` set returning
  `Set<"backups" | "watch" | "saveSync">`; UI gates on that.

- **Bank parser registry is global, no capability flags** — a
  React Native target can't unbundle parsers that depend on
  binary-decompression libs. **Severity: 4.** Defer until a target
  actually needs to drop a parser.

- **Per-route `<noscript>` fallback drift** — `src/seo/routes.ts`
  defines a fallback string per route, but the prerender plugin
  reads from it without a parity check. If a route's description
  changes in `routes.ts` but the fallback doesn't, search engines
  see stale content. **Severity: 3.** Easy win: derive the
  `<noscript>` body from `routes.ts` exclusively.

- **Inline `parseFloat` / `Number.parseInt` / `new Date(…)` at ~30
  call sites** — no shared `parseDecimal(text, lang)` /
  `parseInt32(text)` helpers. If thousands-separator support lands
  ("1 234,56" SV vs "1,234.56" EN), every site changes. **Severity: 4.** Easy win: extract `src/utils/parse.ts` with the two helpers
  and adopt at the sites currently using inline parses.

### Easy wins (mechanical, land regardless of rating)

- Move budget-only modules under `src/data/budget/` and
  accounts-only ones under `src/data/accounts/` (folds into the
  severity-9 item above; the directory move itself is the easy
  part).

- Replace remaining native-looking patterns: scan for any new
  `<select>` / `<option>` introduced since the last sweep (AGENTS
  rule forbids them; current count: 0).

- Replace `useState`-pyramid modals with `useReducer` as their
  surrounding file is otherwise touched. No batch PR — opportunistic
  drive-by.

- Extract `parseAndValidate<T>` JSON helper and adopt at the ~9
  sites (see severity-4 item above).

- Add `adapter.capabilities` set (see severity-3 item).

- Move `monthFormatCache` to `useMonthFormatter(lang)` hook
  (severity-4 item).

- Move `PendingCloudLink` / `PendingFolderLink` types out of
  `components/CloudLinkDialog.tsx` into a `storage/` module
  (severity-8 item — the boundary fix itself is mechanical).

- Extract `parseDecimal` / `parseInt32` helpers and adopt at the
  ~30 inline call sites (severity-4 item).

- Extract `normalizeName` / `normalizeOptional` helpers and adopt
  at the ~10 form-component sites (severity-5 item).

---

## Landed

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
  `AccountModal`, `TransferModal`, `DownloadModal`, and
  `MatchRuleModal` (26 call sites collapsed). The other ~9
  candidate modals either wrap a styled container (rounded border +
  `bg-surface-*`) or use a tighter `gap-1` layout and weren't
  migrated. New modals should reach for `<FormSection>` from day
  one.
- **`useResetOnOpen` hook** (2026-05): the reset-on-open `useEffect`
  boilerplate has been hoisted into
  `useResetOnOpen(open, resetKey, reset)` in `src/hooks/`, used by
  `EditEntryModal` and `EditRowModal`.
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
- **i18n achievements split** (2026-05): `achievements.ts` (~400
  lines) has been split into `src/i18n/locales/{en,sv}/achievements/`
  with `shell.ts` (star button, unlock toast, four-tier tour) +
  `catalog.ts` (per-achievement entries — ~350 lines, the bulk of
  the file). The call-site shape
  (`t("achievements.catalog.firstSteps.name")`) is unchanged — the
  index spreads `shell` and nests `catalog`.

---

## Investigated and skipped

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

- **Step-through modal pattern**: only `ReconciliationModal` and
  `BudgetMetadataModal` are true stepping modals (`HistoryModal` is
  read-only; `HistoryEntryEditModal` is single-entry). The two
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
  (`BudgetViewerModal`, `TransferSearchModal`, `format.ts`), not the
  ~20 originally claimed. A dedicated component doesn't earn its
  keep at three sites.

- **`useListboxKeyboard()` hook**: only **1** real call site
  (`form/SelectPicker.tsx:124–161`). `SettingsModal/admin.tsx` has
  icon buttons but no keyboard nav; `FormulaVariableHelper.tsx`
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
