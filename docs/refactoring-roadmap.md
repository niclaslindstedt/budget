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

- **`findColumnByType` standard-column lookup cluster → `useStandardColumns`
  hook** — `findColumnByType(columns, "date" | "description" | "amount" |
"balance" | "completed" | "type")` is called at **~18 files / 60+ sites**
  (grep `findColumnByType src/components` 2026-05). Most are the same
  cluster of 2–7 `useMemo(() => findColumnByType(columns, "…"), [columns])`
  lookups re-derived per file: `BudgetViewerModal.tsx` (7),
  `BudgetEditEntryFullModal.tsx` (5) + its reducer (5),
  `BudgetPromoteHistoryForm.tsx` (4), `BudgetEditSeriesForm.tsx` (4),
  `BudgetBulkEditModal.tsx` (3), `BudgetSplitEntryModal.tsx` (3),
  `AccountReconciliationModal.tsx` (8), plus the AppShell hooks
  (`useRowMutations`, `useMatchRuleUi`, `useImportFlow`,
  `usePromptDerivations`). Every site that wants the date/amount column
  re-derives it, and every **new column type** (tags, attachments) or
  **new modal** re-pastes the cluster.
  - **Plan**: add a `useStandardColumns(columns)` hook (or a plain
    `standardColumns(columns)` selector for the non-React call sites in
    `src/data`/reducers) returning a single memoized
    `{ dateCol, descCol, amountCol, balanceCol, completedCol, typeCol }`.
    Adopt at the N≥3-lookup sites first; leave single-lookup sites inline.
    Pure refactor — same `findColumnByType` results, just hoisted.
  - **Risk**: low. Watch the `useMemo` dep arrays (all key on `[columns]`)
    so the consolidated memo doesn't widen a dependency and re-run more
    often. No persisted-shape impact.
  - **Severity: 5.** Multiplier: a column-type addition or a new
    row-bearing sheet type threads a new lookup through every one of the
    ~18 files; consolidating now caps that at one hook.

- **`pattern-apply.ts` rule→row label-patch boilerplate duplicated across
  three appliers** (`src/data/budget/pattern-apply.ts`, 492 lines) — the
  same "resolve `ruleCompanyId` via the `!== undefined && !== null ? :
undefined` ternary, `mergeTagIds(row.tagIds, rule.tagIds)`, then
  set-the-field-if-it-changed" block is hand-rolled in
  `reapplyPatternsToBudget` (lines ~66–86), `applyMatchRuleOnceToBudget`
  (~226–262), and the history applier (~454–492), each with subtly
  different null-check flavours for `typeId` / `companyId` / `tagIds`.
  - **Plan**: extract a `patchRowLabels(row, rule)` (and a history-entry
    sibling, or one generic over the label-bearing shape) that owns the
    set/delete-per-field decision once; the three appliers call it after
    their own guard (`typeIdLocked`, match-test).
  - **Risk**: medium. Each applier honours a different guard
    (`typeIdLocked` skip vs. locked-row stamp) and `null`-vs-absent
    semantics — the helper must take the resolved values and not bake in
    the guard. The `MatchRule.typeId`/`companyId` `null`-means-cleared
    contract (see AGENTS.md) must round-trip unchanged. Validate against
    the reapply/match-rule unit coverage.
  - **Severity: 5.** Multiplier: a new rule-applied label field (beyond
    type/company/tags) is a fourth copy of the block at three sites today.

- **`AppShell.tsx` modal-mount state-ownership shift** — the
  JSX-relocation half of the original severity-8 modal-host item
  landed 2026-05 (see Landed: three modal hosts), and the
  host-only-hook relocation slice landed 2026-05 (see Landed:
  `usePromptDerivations` + `useHistoryEntryActions` into
  `BudgetModalHost`), dropping `AppShell.tsx` to 852 lines — though
  the three modal-dispatch slices (1–3, see Landed) then wired the
  `modalHandlers` `useMemo` + `dispatchModal` back into `AppShell`,
  so it sat at 898 lines; the first per-host hook relocation (slice 5,
  `useAchievementsModal` → `UniversalModalHost`, see Landed) then dropped
  it to 878 lines, slice 6 (`useChangelogState` →
  `UniversalModalHost`, see Landed) dropped it to 868 lines, slice 7
  (`useSyncAutoOpens` → `UniversalModalHost`, see Landed) dropped it to
  859 lines, and slice 8 (`useSettingsModal` +
  `useAppearanceProjection` → `UniversalModalHost`, see Landed) dropped it
  to **850 lines**. Re-verified 2026-05: the "10/14
  setters as props" framing was
  **stale** — the hosts already receive _grouped hook-result
  objects_ (`editPrompts`, `deletePrompts`, `complexEntry`,
  `matchRuleUi`, `bulkSelection`, the account / import / transfer
  flows, etc.), not 24 individual setters. The real remaining smell
  is that AppShell still _calls_ every modal hook and forwards the
  whole result, even though most hooks' state is consumed by both a
  host (to render) and chrome / page callbacks (to open). The clean
  host-only hooks were the only ones movable without rewiring; the
  rest are genuinely cross-cutting (open-trigger in the header /
  bottom bar / page, state + render in the host). **Severity: 5.**
  - **Slice 1 — the modal-dispatch bridge for universal chrome —
    landed 2026-05** (see Landed: `ModalDispatchProvider`). The
    `src/components/modal-dispatch.ts` context now carries the seven
    chrome-only modal opens (settings, changelog, search,
    action-history, achievements list / unlock, sync-details), so
    `HeaderMenu` / `BottomBar` / `HeaderStar` / `SyncStatus` no longer
    take opener-callback props. The bridge the remaining slices need
    now exists.
  - **Slice 2 — the sheet-meta / download page-triggers — landed
    2026-05** (see Landed: sheet-meta dispatch commands). The dispatch
    context gained `open-new-sheet` / `open-edit-sheet` /
    `open-download-sheet` (the latter two carrying `sheetId`), so
    `BottomBar` (−2 props), `BudgetPage` (−2), and `AccountsPage` (−2)
    drop their `onEditSheet` / `onDownloadSheet` / `onAddSheet` props
    and call `useModalDispatch()` instead. AppShell wires the existing
    `sheetMetaDialog` / `downloadFlow` openers into the
    `ModalCommandHandlers`.
  - **Slice 3 — the deep budget-row triggers — landed 2026-05** (see
    Landed: budget-row dispatch commands). The `ModalCommand` union
    gained nine `Row`-carrying kinds (`open-edit-entry` / `open-edit-row`
    / `open-delete-row` / `open-split-row` / `open-transfer-row` /
    `open-match-rule` / `open-edit-history` / `open-copy-row` /
    `open-correction-delete`), so `BudgetRow`, `BudgetMonthTable`, and
    `BudgetEntryActionsMenu` call `useModalDispatch()` and the
    `BudgetPage → BudgetMonthTable → BudgetRow → BudgetEntryActionsMenu`
    chain drops all nine opener props. The AppShell handlers keep their
    guards (savable-row discard, synthesized-row suppression). The
    decision to extend the **universal** union (rather than spin up a
    budget-scoped context) followed the file's own documented intent and
    reused the tested `applyModalCommand` dispatcher — splitting the
    union per-page is non-speculative only once a **second** row-bearing
    sheet type exists.
  - **Slice 4 — the handler-registration seam — landed 2026-05** (see
    Landed: handler-registration seam). This removed the blocker the
    earlier "Plan (remaining)" called out: a host couldn't own a hook's
    state because the dispatch handler had to live on AppShell (the
    `ModalDispatchProvider` wraps the shell _above_ the hosts, so the
    provider value was fixed at AppShell render time). The provider now
    merges a **base slice** (AppShell's remaining handlers) with **slices
    hosts register** via the new `useRegisterModalHandlers(slice)` hook,
    looked up at dispatch time against refs — so a handler can travel with
    the state it opens. `modal-dispatch.ts` stays component-free (pure
    types + `applyModalCommand` + `mergeHandlerSlices` + context + hooks);
    the provider component moved to `src/components/ModalDispatchProvider.tsx`
    (matches the `ActiveRowProvider.tsx` / `useClaimActiveRow.ts` split).
    The first host-owned move rode along as the proof: `actionHistoryOpen`
    (a plain `useState` opened only via the dispatch, rendered only in
    `UniversalModalHost`) moved into the host, which registers
    `{ openActionHistory }` — dropping the AppShell `useState`, the
    `openActionHistory` base-slice entry, and the two
    `actionHistoryOpen` / `setActionHistoryOpen` props on the host.
  - **Slice 5 — `useAchievementsModal` into `UniversalModalHost` —
    landed 2026-05** (see Landed: `useAchievementsModal` relocation). The
    first full per-host hook relocation following the slice-4 pattern: the
    hook's two `useState`s (unlock-notification + full-list opens) are
    consumed only by `UniversalModalHost` (render) and were called on
    AppShell purely to forward the result and wire the two opens into the
    base slice. The hook call moved into the host, which extends its
    existing `useRegisterModalHandlers` call with `openAchievementsList` /
    `openAchievementsUnlock`; AppShell dropped the hook call + destructure,
    the two base-slice entries + their deps, the import, and the
    `achievementsModal` prop on the host (878 lines).
  - **Slice 6 — `useChangelogState` into `UniversalModalHost` —
    landed 2026-05** (see Landed: `useChangelogState` relocation). The
    second per-host hook relocation following the slice-4/5 pattern: the
    hook owns one `useState` (the header-menu manual open) plus the
    per-version auto-open on upgrade, both consumed only by
    `UniversalModalHost` (render) and opened only via the dispatch
    (`open-changelog`). Its inputs (`data.settings.lastSeenChangelogVersion`,
    `dispatch`) are already host props, so the call moved in cleanly; the
    host extends its `useRegisterModalHandlers` call with `openChangelog`.
    AppShell dropped the hook call + `setChangelogManualOpen` destructure,
    the `openChangelog` base-slice entry + its dep, the import, and the
    `changelog` prop on the host (868 lines).
  - **Slice 7 — `useSyncAutoOpens` into `UniversalModalHost` —
    landed 2026-05** (see Landed: `useSyncAutoOpens` relocation). The
    third per-host hook relocation following the slice-4/5/6 pattern: the
    hook owns two `useState`s (sync-details + reconnect-cloud opens) plus
    the status-driven auto-opens (sync-details on `shrink-warning` /
    `parse-error`, reconnect on `auth-error` gated on `cloudReauthAutoOpen`),
    all consumed only by `UniversalModalHost` (render) and opened from chrome
    only via the dispatch (`open-sync-details`). Its inputs
    (`storageState.status`, `data.settings.cloudReauthAutoOpen`) are already
    host props, so the call moved in cleanly; `reconnectCloudOpen` had no
    AppShell reader (confirmed — AppShell only destructured `setSyncDetailsOpen`
    to wire `openSyncDetails`). The host extends its `useRegisterModalHandlers`
    call with `openSyncDetails`. AppShell dropped the hook call + destructure,
    the `openSyncDetails` base-slice entry + its dep, the import, and the
    `syncAutoOpens` prop on the host (859 lines).
  - **Slice 8 — `useSettingsModal` + `useAppearanceProjection` into
    `UniversalModalHost` — landed 2026-05** (see Landed: `useSettingsModal`
    relocation). The slice-7 note called this candidate "blocked" because
    `previewSettings` (from `useSettingsModal`) was read by AppShell's
    `useAppearanceProjection`. The unblock was to relocate **both** hooks
    together: the projection's only other inputs (`effectiveSettings`,
    `data.settings.language`) are already host props, so it moved into the
    host alongside the settings-preview state it overlays. `setSettingsInitialTab`
    was confirmed to have no external launcher (only the host's own close
    handler sets it), so the whole `useSettingsModal` state is host-internal.
    The host extends its `useRegisterModalHandlers` call with `openSettings`;
    AppShell dropped both hook calls + the `appearanceSettings` line, the
    `settingsModal` / `previewSettings` / `setSettingsOpen` destructure, the
    `openSettings` base-slice entry + its dep, the two imports, and the
    `settingsModal` prop on the host (850 lines).
  - Plan (remaining): repeat the slice-4/5 pattern per host for each modal
    hook whose open path is now _only_ the dispatch (no chrome / page
    caller left): move the hook call (and its `useState` / `useReducer`)
    into the colocated host and have the host register its open slice via
    `useRegisterModalHandlers`. AppShell drops the hook call, the base-slice
    handler entry, and the forwarded prop in the same move. With slice 8 the
    last clean universal-chrome candidate landed; the remaining AppShell hooks
    are genuinely cross-cutting — `useSearchModal` is blocked because AppShell
    reads `scrollToRowRequest` and feeds it to `BudgetPage` (a sibling the host
    can't reach), and the rest (`useEditPrompts`, `useRowMutations`,
    `useTransferFlow`, `useBulkSelection`, …) produce page-facing callbacks, so
    their state is read by a page, not just opened by chrome. Hooks whose state
    AppShell or a page still _reads_ (not just opens) stay put until that read
    is untangled (the search→scroll bridge would need a different mechanism
    than a host move). AppShell collapses toward a routing switch + host
    mounts. Slice per host so each PR leaves the app working.
  - Risk: low. The seam is a pure refactor — AppShell registers the same
    complete handler set as a base slice, so the merged table dispatched is
    identical. Not on a cloud-OAuth hot path; modal opens have no
    persisted-shape impact. The open-side achievement unlocks (search
    "detective", undo "secondThoughts") stay on the AppShell handler side.
    One incidental win: the dispatch is now fully stable (it reads refs, no
    `[modalHandlers]` dep), so the earlier "`dispatchModal` identity changes
    on a column reorder" re-render cost is gone — the memoized chrome / rows
    no longer re-render on reorder. Each future host move must confirm the
    hook it relocates has no remaining AppShell / page _reader_ (only the
    dispatch opener) before moving it.

### Severity 3–4 — nits with leverage

- **Full-width table `colSpan` arithmetic duplicated across the budget
  tables** — the "sum the visible optional columns + a fixed offset"
  expression that sizes a full-width footer / divider row is recomputed
  inline ~6 times across `BudgetMonthTable.tsx` (573 lines, ~214–241) and
  `BudgetViewerModal.tsx` (918 lines, ~611–638, 714–720). Each copy reads
  the same `2 + (typeCol?1:0) + (amountCol?1:0) + (balanceCol?1:0)` shape.
  - **Plan**: extract `tableColSpan(columns, { selectMode, hasActions })`
    next to the other budget-table helpers and call it at all six sites.
  - **Risk**: low — pure arithmetic; verify no layout shift on the
    optional-column toggles in both the live table and the viewer.
  - **Severity: 4.** Cheap, and any future column toggle (select-all,
    a new optional column) otherwise edits six call sites in lockstep.

- **`autoTypeForCompany` pick-company callback wrapper duplicated across
  the entry-edit modals** — the "on company pick, compute
  `autoTypeForCompany(typeId, next, companyTypeSuggestions)` then dispatch"
  wrapper is hand-rolled in `BudgetEditEntryFullModal.tsx`,
  `BudgetMetadataModal.tsx`, and `BudgetComplexEntryModal.tsx` with the
  same `[typeId, companyTypeSuggestions]` dependency. (Re-verify the exact
  call sites with `grep -rn autoTypeForCompany src/components` at pickup —
  flagged from an Explore survey, line numbers not re-checked.)
  - **Plan**: a `useAutoTypeForCompany(typeId, companyTypeSuggestions)`
    hook returning the `(companyId) => autoTypeId` mapper, or fold the
    derivation into each modal reducer's `pickCompany` action.
  - **Risk**: low — pure computation. Confirm each modal keys on the same
    `typeId` snapshot (a stale-closure mismatch would mis-suggest a type).
  - **Severity: 4.** Leverage: a change to the company→type suggestion
    rule ripples through three identical wrappers today.

- **Paired `typeId` / `typeIdLocked` set-and-clear in the item reducer**
  (`src/data/reducers/item/index.ts`, 474 lines) — picking a type stamps
  both `typeId` and `typeIdLocked: true`; clearing deletes both. The
  move-both pattern recurs across the type-pick, `convertToRecurring`, and
  `bulkUpdate` arms (re-verify with `grep -n typeIdLocked
src/data/reducers/item/index.ts`). Forgetting one half is a silent
  locked-vs-unlocked inconsistency.
  - **Plan**: extract pure `setRowType(row, typeId)` / `clearRowType(row)`
    helpers that always move the pair together; adopt at the three arms.
  - **Risk**: low — pure functions; the existing reducer tests cover the
    lock semantics. No persisted-shape change.
  - **Severity: 4.** Leverage: a third paired field (`typeIdSource` or a
    future per-sheet-type lock flag) would otherwise add a fourth lockstep
    site.

- **`migrateV24ToV25` 284-line monolith** (`src/data/migrations/legacy.ts`,
  774 lines; the function spans lines 490–774) — a single forward-only
  migration that walks the sheet tree three times (count type usage →
  extract orphans → rewrite) with a closure-captured `ensureGenericTypeFor`
  helper. Far larger than every other step in the ladder (next biggest is
  ~45 lines).
  - **Plan**: decompose into named phases (`computeTypeUsage`,
    `findOrphanRows`, `ensureGenericTypes`, `rewriteSheets`) returning
    intermediate maps so the flow is traceable. **Pure restructure only —
    the migration is frozen historical code; the output for any pre-v25
    input must be byte-identical.**
  - **Risk**: medium-HIGH despite the low severity: this is the one place
    a refactor can silently corrupt an old user's import on load, and it
    has no automated round-trip fixture. Reward is low (read only when
    debugging a legacy import). Land only with a recorded before/after
    snapshot test over a real pre-v25 export.
  - **Severity: 3.** Readability nit, not a multiplier — new sheet types
    add _new_ migration steps, they don't touch v24→v25. Land
    opportunistically, or skip if the round-trip fixture isn't worth it.

- **Local `formatMonth(key, lang, undatedLabel)` helper duplicated** —
  the "`if (key === "undated") return label; return formatYearMonth(key,
lang)`" shape is defined as a private function in both
  `BudgetMonthTable.tsx:95` and `BudgetViewerModal.tsx:69`. (Also flagged
  as an easy win below.) Lift to `src/utils/format.ts` as
  `formatMonthKey(key, lang, undatedLabel)`. **Severity: 3** — pure
  easy-win extraction; two call sites today, a third lands with any new
  month-grouped view.

- **Cloud-adapter factory closures bundle ~15–20 private functions +
  mutable token/cache state** (`src/storage/dropbox-adapter.ts`,
  `src/storage/gdrive-adapter.ts` 765 lines) — each `create*Adapter()`
  wraps load / save / backup / auth helpers in one closure that mutates
  `currentAccessToken` (Dropbox) / `cachedFileId` (GDrive) in place, so
  the reader must track closure scope + mutation order across a sprawling
  body. Distinct from the already-tracked OAuth-refresh-dedup item: this
  is the _structure_, not the 401 semantics.
  - **Plan**: lift the private suite into a small stateful client object
    (`DropboxClient` / `DriveClient`) holding the token/cache as explicit
    fields; the adapter becomes a thin `StorageAdapter` wrapper over it.
  - **Risk**: HIGH and **not smoke-testable in this environment** — the
    OAuth + live-revision flows (silent token refresh mid-load, 404 →
    cache-bust → re-create) only exercise against real Dropbox/Drive.
    The storage hot path is production-critical. Defer unless a third
    cloud backend forces the shared structure.
  - **Severity: 4.** Multiplier in principle (the next backend re-derives
    the closure tangle), but the un-testable risk caps its near-term
    priority — land it _with_ the third backend, not speculatively.

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
  landed 2026-05 (see Landed), the `search.ts` four-indexer cluster
  was consumed 2026-05 (see Landed), and the genuine `id → item`
  sites in `src/data/budget/export.ts` (`typesById` / `categoriesById`)
  and `formula-resolve.ts` (`typesById` / `sheetsById`) were consumed
  2026-05 (see Landed). The remaining sites the prior sweep named —
  `formula.ts`, `accounts/AccountTransferCollapseModal.tsx`,
  `AppShell/hooks/useDownloadFlow.ts` — are **not** adoptable: they
  build `Map<id, name>` / `Map<id, number>` projections, not the
  `Map<id, fullItem>` shape `indexById` returns, so they stay inline.
  Future `Map<string, T>` indexers keyed by `item.id` (storing the
  whole item) should reach for it from day one.

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

- **Lift the duplicated `formatMonth(key, lang, undatedLabel)` helper**
  to `src/utils/format.ts` — defined privately in both
  `BudgetMonthTable.tsx:95` and `BudgetViewerModal.tsx:69` with the same
  `"undated"`-label-else-`formatYearMonth` body (also tracked in the 3–4
  band). Mechanical two-site extraction.

---

## Landed

- **`color-mix` entity-tint percentages → `tintFill` / `tintBorder`
  helpers** (2026-05): the `color-mix(in srgb, ${color} 18%/55%,
  transparent)` literal was inlined at 28 sites across 12 components
  (the prior sweep's "~14 files / 30+ sites" estimate). Extracted
  `tintFill(color)` / `tintBorder(color)` into `src/utils/tint.ts`,
  each reading its strength from a new CSS var
  (`--tint-fill-strength: 18%`, `--tint-border-strength: 55%`) added to
  `:root` in `src/styles/theme.css` so the tint is now themeable in one
  place. Pure refactor — the resolved `color-mix()` output is
  byte-identical (CSS resolves the var to the same percentage). Shipped
  as one PR (well under 500 lines); the "2–3 batched PRs" caveat was
  unnecessary once the call sites turned out uniform.

_Reset 2026-05 — prior landed history cleared to start the roadmap fresh._

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
- 2026-05-30 sweep (Explore mode): **cleared the entire Landed
  section** at the user's request to start the roadmap fresh (the
  per-slice landing history is gone; Pending / Investigated /
  Sources retained). Note this orphans the "(see Landed)" references
  scattered through Pending — they now point at an empty section;
  leave them as breadcrumbs or prune on the next Pending re-verify.
  Then ran a single **largest-files** survey angle (three parallel
  Explore agents over the top ~30 files in `src/data`, `src/components`,
  `src/storage`). Added nine verified candidates: the
  `findColumnByType` standard-column cluster (5, ~18 files),
  the `color-mix` 18%/55% tint-percentage duplication (5, ~14 files),
  the `pattern-apply.ts` rule→row label-patch boilerplate (5), the
  full-width `colSpan` arithmetic (4), the `autoTypeForCompany`
  callback wrapper (4), the paired `typeId`/`typeIdLocked` set/clear
  (4), the `migrateV24ToV25` 284-line monolith (3, frozen-code risk),
  the cloud-adapter factory-closure structure (4, un-smoke-testable
  here), and the `formatMonth` easy-win extraction (3). Filtered out
  the Explore over-ratings: the `useStorageBackend` "two jobs" reframe
  (re-treads the already-skipped token-state-machine item), the
  `useSaveStateMachine` ref/status density (correct-and-careful on the
  hot path, low reward), the `SegmentedRadio` single-site promotion and
  safe-area-padding magic numbers (speculative / cosmetic).
