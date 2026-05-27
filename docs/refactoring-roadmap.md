# Refactoring roadmap

Running ledger of refactor candidates for this codebase. Notes were
last touched in a 2026-05 readability sweep and verified against the
tree at that point. Pick one at a time; do not bundle. **Verify the
line counts and "still pending" status when you pick one up — this
list has gone stale before.**

`AGENTS.md` used to embed this list inline; it now lives here so the
core agent guidance stays scannable.

## How this file is organised

- **Pending** — candidates worth doing, with notes on shape and risk.
- **Landed** — short summaries with file paths so a new agent can
  see what already shipped before proposing a duplicate.
- **Investigated and skipped** — candidates the sweep rejected, with
  the reasoning so they aren't proposed again on the next pass.

When you complete an item, move it from **Pending** to **Landed**
with a one-line summary. When you reject one, move it to
**Investigated and skipped** with the concrete call-site count or
behavioural reason that made it net-negative.

## Pending

- **`useStorageBackend.ts` (1256 lines)**: split into `useDropboxAuth`,
  `useGdriveAuth`, `useFolderHandle`, leaving the main hook as an
  orchestrator. Natural seams at `buildInnerAdapter` lines 99–120 —
  each branch is ~15 lines with its own token-refresh / permission
  logic. Each sub-hook becomes <300 lines and testable in isolation.
  Storage hot path — **needs smoke-testing all four backends (IDB,
  Dropbox link/load/save, GDrive link/load/save, Folder
  link/load/save) before merging.** Disentanglement caveats: the
  `disconnectCloud` helper is shared between Dropbox + GDrive,
  `pendingCloudLink` flows through OAuth completion paths in two
  places, and `loadSourceText` is consumed by both `connectGdrive`
  and the Dropbox OAuth effect — sub-hooks must take injected
  callbacks for these orchestration points rather than owning them.

- **`useUserDataStorage.ts` (1104 lines)**: extract
  `useConflictResolution` and `useDeviceAuth` hooks to leave a
  leaner main hook. The hook uses a flat action-reducer pattern with
  debounce, revision, and undo-stack state braided together —
  disentangle the reducer first (e.g. `conflictResolutionReducer`,
  `authErrorReducer`) before splitting into sibling hooks, otherwise
  the split just moves the braid. Plan as two PRs: reducer split
  first, hook extraction as a consumer of the slimmer reducer.

- **`styles.css` (1604 lines)**: break into imported sub-files —
  `_theme-vars.css`, `_tailwind-overrides.css`, `_components.css`,
  `_utilities.css` — and audit for unused rules via DevTools
  coverage. Palette blocks (One Dark / Light / Dracula / Monokai /
  GitHub / Solarized / Quiet Light / System) should stay together
  in a single `_palettes.css` since they share a `:root[data-theme]`
  pattern. CSS split is a distinct skill from TS module splits;
  pay attention to import order at the entry point because
  `@layer components` rules consume color vars declared in `@theme`.

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
  extraction's risk exceeds its line savings.

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

## Sources

- Original sweep notes lived inline in `AGENTS.md` under "Known
  refactoring opportunities" until 2026-05; that section now
  redirects here.
- The full execution plan a session used to drive the 2026-05 sweep
  lived at `/root/.claude/plans/find-great-refactoring-possibilities-dreamy-llama.md`
  inside that session's container — not committed, but the relevant
  bullets are reproduced above.
