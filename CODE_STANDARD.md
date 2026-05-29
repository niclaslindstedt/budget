# Code standard

How code is written and structured in this project, the design
patterns it leans on, and the shapes to avoid. This is the
companion to `AGENTS.md`: that file tells you _where_ code goes and
_how to run the workflow_; this file tells you _what the code should
look like_ once you're in the right file.

It deliberately skips anything Prettier, ESLint, or `tsc` already
enforce (quotes, semicolons, import order, unused locals, column
width — see `.prettierrc.json` and `eslint.config.js`). Everything
here is a judgement the tooling can't make for you, and getting it
wrong is what later puts the file on the `refactor` skill's backlog.

---

## 0. The north star: design for the next sheet type

This codebase is local-first (no backend, no account, no third-party
service — see `AGENTS.md`) and it is mid-preparation for a feature
wave: new sheet types (**savings, investment, scenario, analysis,
prognosis, loans**), more bank parsers, and possibly React Native /
desktop wrappers. `docs/refactoring-roadmap.md` rates every smell by
one question:

> **"What would it cost to add the six new sheet types right now?"**

Make that question your design test too. The single most common way
code ends up needing a refactor here is **branching on a type literal
in a place that should have asked a registry.** When you find yourself
writing `if (item.type === "accountBudget")` or
`switch (sheet.type)` outside the one place that's allowed to, stop —
you're authoring the next roadmap entry.

**The seam to reach for: descriptors in a registry.**
`src/data/sheet-types/index.ts` holds `SHEET_TYPE_REGISTRY`, a list of
`SheetTypeDescriptor`s. Adding a sheet type is one new file exporting a
descriptor plus one entry in the array — `createDefaultItem`,
`reduceItem`, and any future per-type callback live _on the descriptor_,
and consumers walk the registry instead of branching:

```ts
// derived from the registry, so a new type can't leave a consumer behind
export const SHEET_TYPE_IDS: ReadonlySet<SheetType> = new Set(
  SHEET_TYPE_REGISTRY.map((d) => d.id),
);
```

Two places still legitimately hard-code per-type dispatch — the
validator (`src/data/validate/sheet.ts`) and the AppShell page-routing
switch — because their per-type shapes differ enough that folding them
in would obscure more than it consolidates. Those are documented
exceptions, tracked in the roadmap to land _with_ the first new sheet
type. Everywhere else, prefer the registry.

The same "gate on capability, not on identity" instinct shows up in the
storage layer: adapters advertise an `AdapterCapability` set and UI
gates on `capabilities.has("backups")` rather than
`Boolean(adapter.backups)` (`src/storage/adapter.ts`). A new backend
fills in the set; no call site changes.

---

## 1. State, reducers, and actions

### One reducer, a chain of pure sub-reducers

App state is a single `UserData` tree reduced by `reduce` in
`src/data/reducer.ts`. That root reducer is a thin walker over
domain-scoped sub-reducers (`reduceAccounts`, `reduceHistory`,
`reduceSheets`, the per-sheet-type `reduceItem`, …). Each sub-reducer
either claims an action (returns the next state) or defers (returns
`null`) so the next one gets a look.

- **Reducers are pure and immutable.** Return a new tree with shallow
  spreads (`{ ...state, foo }`); never mutate in place. For "field
  absent" prefer deleting the key from a spread copy over setting
  `undefined` — see §3 on the persisted shape.
- **Reducers are side-effect-free.** No `Date.now()`, no `newId()`, no
  logging, no dispatch-of-followups inside a reducer. Anything
  non-deterministic is computed at the call site and baked into the
  action payload (see below). The modal reducers make this explicit:
  the imperative side-effects (`onClose`, `onCreate`, `onDelete`) are
  computed by the dispatcher _outside_ the reducer.

### Actions are a discriminated union with fully-baked payloads

`Action` in `src/data/reducer.ts` is a `type`-discriminated union.
Each variant carries _everything the reducer needs_ — the reducer
never reaches outside its inputs to look something up or mint an id:

```ts
| { type: "addRow"; sheetId: string; itemId: string; date: string; id: string }
```

The new row's `id` and the `date` are generated/resolved at the call
site so the transition is deterministic and replayable (this is what
makes undo/redo and round-trip-safe persistence work). When an action
patches an entity, model it as `patch: Partial<Omit<T, "id">>` so a
future field drops in without a new action variant — see the
`updateCategory` / `updateType` / `updateCompany` actions.

### Dispatch directly — no thunks, no business logic in the reducer

Components call `dispatch(action)`. Business logic that produces the
payload (matching, coverage deltas, candidate detection) runs at the
call site or in a **pure pipeline function** in `src/data/`, which
returns a plain result the caller then dispatches. `stageHistoryImport`
in `src/data/import-staging.ts` is the model: a ~200-line pipeline
extracted out of a hook closure into a pure, unit-tested function that
takes `now` as a parameter so it's deterministic under test.

### Modal/form state: `useState` until it's a reset-together pyramid

A handful of independent `useState` calls is fine. Reach for
`useReducer` when a form grows a **5+-field pyramid that resets
together** on open, or a **mode discriminator** the loose setters let
drift. The landed pattern (see the many `*-modal-reducer.ts` files
under `src/components/budget/` and `src/components/accounts/`):

- State shape + a `kind`-discriminated action union live in a sibling
  `*-reducer.ts` file (e.g.
  `src/components/budget/budget-match-rule-modal-reducer.ts`).
- The reset-on-open effect becomes **one** `reset` dispatch instead of
  N sequential `setState` calls; the seed/blank branch and any input
  formatting move into a colocated `initial*State(seed)` factory used
  by `useReducer`'s lazy-init third argument.
- Actions that logically belong together fire atomically — e.g.
  `pickCompany` sets the company _and_ the auto-filled type in one
  transition, removing the intermediate render.
- The reducer stays **side-effect-free**; the component keeps the
  derivations (`parsedAmount`, `canSubmit`) and the `handleSubmit` glue.
- Ship a `tests/*_reducer_test.ts` that locks the seed snapshots, the
  atomic transitions, and "each setter only touches its own field."

Don't pre-emptively `useReducer` a 2–3-field modal; that's a noted
non-improvement in the roadmap.

### Derived state: pure selectors, memoized at the call site

There is no reselect layer. Derivations are pure functions
(`computeBalances`, the `ComputedBudgetState` factory in
`src/data/budget/`) memoized once per render with `useMemo` where the
inputs are stable. Don't scatter intermediate selector caches.

---

## 2. Components

- **Function components, named exports, inline prop types.** Declare
  `type Props = { … }` directly above the component. No default
  exports anywhere.
- **Decompose by responsibility, not by line count alone**, but a
  component pushing past ~500–600 lines is a signal: extract
  sub-components into sibling files (same directory) and lift cohesive
  state/effect clusters into a hook. The page-split rule in `AGENTS.md`
  governs _which directory_ — page-specific components carry the page
  prefix (`BudgetRow`, `AccountModal`) and live under
  `src/components/<page>/`; only the universal Sheet chrome stays at
  `src/components/` root.
- **Memoize leaves, not containers.** Per-row / per-cell components
  that re-render on every keystroke (`BudgetRow`, `BudgetCell`) are
  wrapped in `React.memo`; keep their prop surface small so the
  comparison stays cheap.
- **Don't prop-drill modal openers.** Opening a modal from deep in the
  tree (a row action, a header menu) goes through the
  **modal-dispatch context** (`src/components/modal-dispatch.ts`):
  `useModalDispatch()` returns a stable `dispatchModal`, and you add a
  `ModalCommand` kind + a handler rather than threading an
  `onOpenX` callback through every intermediate component. This is the
  established direction (three slices landed); follow it for new modal
  triggers.

### Hooks

- Reusable hooks live in `src/hooks/` (re-exported from
  `src/hooks/index.ts`); page- or shell-specific hooks live in a
  sibling `hooks/` directory (`src/components/AppShell/hooks/`,
  `src/components/budget/hooks/`).
- Extract a hook when it owns **real state or an effect/subscription**,
  or when the same cluster is reused — not per individual field. A
  component with several logically-coherent `useState` calls is fine.
- Standard React hygiene: explicit dependency arrays, cleanup in
  `useEffect`, stable identities (`useCallback`) for anything passed to
  a memoized child.

---

## 3. Types and the persisted shape

The persisted data model lives in `src/data/types/` (split by topic)
and is the contract everything else reads. Model it so new variants and
fields are additive.

- **Discriminated unions for multi-variant data.** `SheetItem` is
  discriminated on `type`; the budget `Row` union (`UserRow` /
  `CorrectionRow` / `HistoricRow` / `TransferRow`) on `kind`
  (`src/data/types/budget.ts`). Add a variant, don't widen one variant
  with a grab-bag of optional fields meant for another.
- **Literal unions, not loose strings.** `ColumnType`,
  `SheetType`, `LogLevel`, `AdapterCapability` are closed unions — the
  compiler enforces exhaustiveness. Don't pass these around as bare
  `string`.
- **Collections keyed by id.** Entities are stored with stable string
  `id`s; cross-references hold the id, never an array index or a
  display name. `Row.cells` is `Record<columnId, CellValue>`;
  `amountFormula` holds the target **sheet's id, not its mutable
  name**, so renames don't break formulas. When a downstream loop would
  otherwise rescan an array per lookup, build a `Map` once with
  `indexById()` (`src/utils/indexById.ts`) and key on `item.id`.
- **`ReadonlyMap` / `readonly` for derived lookups** threaded into pure
  functions (`typesById: ReadonlyMap<string, EntryType>`) — signals
  "don't mutate this" and keeps the data layer honest.
- **Optional fields: `field?: T` vs `field: T | null`.** The de-facto
  convention (and the direction the roadmap wants documented and
  enforced):
  - `field?: T` means **"absent / fall back to the global default."**
    This is the default choice. Treat absent and "use default" as the
    same thing; check with `!== undefined`.
  - `field: T | null` means **"explicitly cleared by the user, which is
    distinct from never having been set."** Reserve it for that real
    distinction.

  Don't introduce a third convention. When a field is absent, prefer
  deleting the key over writing `undefined`, so the serialized JSON
  stays clean and the validator's no-trailing-`undefined` expectation
  holds.

### Changing the persisted shape

Follow the strict order in `AGENTS.md` → "Changing the persisted
shape":

1. Update `src/data/types/` and `src/data/validate/` first.
2. Add a **forward-only** migration in `src/data/migrations/` and bump
   `LATEST_VERSION` + the `UserData.version` literal together in the
   same commit.

New fields start optional and are backfilled on load by the migration.
Migrations are pure `(versioned) → versioned` steps chained N → N+1
(see `legacy.ts` / `modern.ts`). Validation runs **after** migration on
every load _and_ import — no unvalidated data ever reaches state — and
checks referential integrity (no dangling ids), not just shape. Update
`docs/architecture.md`'s persisted-shape section in the same PR.

---

## 4. The data layer (`src/data/`)

- **Everything here is pure.** No `localStorage`, no `fetch`, no
  `Date.now()` baked in (take `now` as a parameter), no React. The
  dependency rule from `AGENTS.md` is one-way: `components/` and
  `storage/` import from `data/`, never the reverse.
- **Name by intent.** `compute*`, `resolve*`, `build*`, `synthesize*`
  for derivations; reserve `get*` for cached/memoized accessors. Sort
  and balance helpers copy and return new arrays — never sort in place.
- **Placement (full rules in `AGENTS.md`):** universal sheet primitives
  in `src/data/sheet.ts`; budget-only helpers under `src/data/budget/`;
  accounts-only under `src/data/accounts/`; genuinely cross-page modules
  (reconciliation, recurrence, search) at `src/data/` root. A
  budget-only helper sitting at root that only ever filters to
  `item.type === "accountBudget"` is misplaced — move it under
  `budget/`. Update the `docs/architecture.md` inventory when you add or
  move a file here.
- **Module-scope caches for hot paths** (e.g. the `Intl.Collator` cached
  at module scope in `src/data/budget/rows.ts`) are fine and encouraged
  — just keep them stateless w.r.t. the inputs.

---

## 5. Storage adapters (`src/storage/`)

- **Adapters speak bytes, not `UserData`.** Migration, validation, and
  serialization all live in `src/storage/file.ts` and run on every load
  and save regardless of backend. A new adapter implements the
  `StorageAdapter` interface (`src/storage/adapter.ts`) and stays small;
  it must **never** bypass the parse → migrate → validate pipeline.
- **Optimistic concurrency via opaque `revision`.** `save(text,
baseRevision?)` throws `ConflictError` (carrying the newer snapshot)
  when the remote has moved past `baseRevision`. The conflict surfaces
  as a "keep mine / keep theirs" modal, not a crash.
- **Capabilities over `!== undefined` probing** (see §0).
- **Namespacing is mandatory.** Every persisted key/path/DB name routes
  through `nsKey` / `nsCloudPath` / `nsIdbName` in
  `src/data/constants/storage.ts` so the `/preview/` and `/branch/`
  slots can't touch production data. Wire a new persisted surface
  through the right helper from day one — forgetting is a silent
  data-isolation break.

---

## 6. Errors and logging

- **No `console.*`.** The app runs in a browser tab (often mobile, no
  devtools). All diagnostics go through the in-app logger:
  `const log = createLogger("scope")` at module scope, then
  `log.info / warn / error` (`src/utils/logger.ts`). It feeds the Logs
  settings tab and a bounded ring buffer.
- **try/catch at async boundaries** (storage ops, imports, sync, OAuth).
  Log the failure with context and surface it to the user — a **toast**
  for transient/recoverable issues, a **modal** for ones that need a
  decision (conflicts). Never swallow silently into a `console.error`.
- **Degrade gracefully.** Storage falls back to offline mode; an import
  skips a bad entry and logs why rather than aborting the batch.
  Errors in best-effort middleware (merchant-hint learning, achievement
  detection) are caught and logged — they must never crash the reducer
  or render path.

---

## 7. Constants and magic values

Constants live by topic in `src/data/constants/` (`currency`,
`defaults`, `format`, `storage`, `taxonomy`). Named exports, commented
with intent.

- **Index-referenced sets are append-only.** Palettes and glyph lists
  (e.g. `CATEGORY_COLORS` in `taxonomy.ts`) are referenced by index from
  presets and migrations — reordering them silently rewrites users'
  data. Append; don't reorder or delete.
- **No bare magic strings** for anything that has a literal-union type
  (column types, sheet types, log levels) — use the type.
- **Theme tokens, not literals.** Every colour, radius, border width,
  transition, and font-family reads through a CSS custom property (see
  the "Theming and tokens" section in `AGENTS.md`). A hardcoded hex or
  `200ms` silently ignores the user's Custom theme.

---

## 8. User-facing strings

Every visible string (labels, `placeholder`, `aria-label`, `title`,
modal titles, toasts) goes through `t("namespace.key")` from `useT()`;
date/month rendering goes through the `lang`-aware helpers in
`src/utils/format.ts`. English is canonical, Swedish is compile-time
enforced. Full workflow is in `AGENTS.md` → "Translations". Also: build
custom button+listbox pickers, never native `<select>`/`<option>`.

---

## 9. Anti-patterns — the checklist that keeps code off the refactor backlog

- ❌ Branching on `sheet.type` / `item.type` outside the validator and
  the AppShell routing switch. ✅ Add a descriptor field to
  `SHEET_TYPE_REGISTRY` and walk the registry.
- ❌ Side effects (`Date.now()`, `newId()`, dispatch, logging) inside a
  reducer. ✅ Compute at the call site, bake into the action payload;
  let the dispatcher run side-effects outside the reducer.
- ❌ Mutating state (`state.foo.push(...)`, `delete state.x`). ✅ Spread
  to a new object/array.
- ❌ A modal with a 10-`setState` reset-on-open effect. ✅ One `reset`
  dispatch into a `kind`-discriminated `useReducer` with a colocated
  factory.
- ❌ Threading an `onOpenX` callback through five components. ✅ A
  `ModalCommand` + `useModalDispatch()`.
- ❌ Storing a display name, array index, or `EntryType` object where an
  id belongs. ✅ Store the id; resolve through a `ReadonlyMap`.
- ❌ A page directory importing from a sibling page directory. ✅ Go
  through a universal helper in `src/data/`.
- ❌ A new persisted key written straight to `localStorage`. ✅ Route
  through `nsKey` and add it where `AGENTS.md` says.
- ❌ `console.log` / a hardcoded hex / a hardcoded English string. ✅
  `createLogger`, a CSS token, `t()`.
- ❌ A backend, remote API, or analytics call. ✅ It stays local-first —
  that needs an explicit spec change, full stop.

When in doubt, ask the §0 question: _would this survive six new sheet
types without an edit here?_ If not, find the seam first.
