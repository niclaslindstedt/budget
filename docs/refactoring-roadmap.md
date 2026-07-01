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
clean (zero hits). The **sheet-type-registry coverage** cluster that
used to sit in the 7–8 band landed 2026-05 with the Items sheet (see
Landed), so the multiplier band is now empty too.

### Severity 7–8 — multipliers (land before the second new sheet type)

_(none pending — the sheet-type registry coverage cluster landed
2026-05 with the Items sheet; see Landed.)_

### Severity 5–6 — friction

- **`insights/networth.ts` hardcodes the per-collection asset walk three
  times** — 545 lines; `computeNetWorthSnapshot` (:227–:305),
  `earliestRelevantDate` (:343–:406), and `perCategoryAt` (:456–:496) each
  manually iterate every asset/liability collection (accounts, savings,
  items, investmentHoldings, investmentStocks, properties + their
  mortgages, standalone loans). The per-entity value resolvers are already
  clean named helpers (`savingBalanceAt`, `propertyValueAt`,
  `loanBalanceAt`, …), so the smell is precisely the three parallel
  walk-edits every new asset-tracking sheet type must make — and
  `AGENTS.md` step 7 makes that evaluation mandatory for every new sheet
  type, so the multiplier is structural, not hypothetical.
  - **Plan**: a contributor-registry seam — per asset/liability kind a
    `{ collection accessor, valueAt(entity, iso), datesOf(entity),
band/category key }` descriptor iterated by all three functions. Only
    hang it off `SHEET_TYPE_REGISTRY` if the shapes genuinely align —
    properties' merged-mortgage banding and the linked-loan dedup
    (`standaloneLoans`) need explicit contributor hooks; don't force
    uniformity where the domain diverges.
  - **Risk**: low — pure aggregation, behaviour pinned by
    `tests/insights_networth_test.ts`.
  - **Severity: 6.** The "every new sheet type bumps into it" rubric fits,
    but the cost per type is confined to one test-covered file, which
    keeps it out of the 7–8 band.

- **Four custom pickers reinvent the custom-dropdown shell instead of
  reusing a shared shell** — `salary/EmployerPicker.tsx` (358),
  `salary/MunicipalityPicker.tsx` (144), `salary/TaxProfilePicker.tsx`
  (152), and `properties/FileCategoryPicker.tsx` (291) each build their own
  `FloatingPanel` + `<ul role="listbox">` + `role="option"` buttons,
  duplicating the shell that `form/SelectPicker.tsx` (262) already provides
  with full keyboard nav. `FileCategoryPicker` (re-verified 2026-06:
  `FloatingPanel` at :123, `role="listbox"` at :129, `role="option"` at :155,
  its own `useRovingTabindex` at :89, plus a "create new category" footer) is
  the fourth re-derivation — it confirms the multiplier: the pattern is now
  spreading to new pages, not just the original three salary sites.
  - **Row-button styling slice landed 2026-06** (see Landed: shared
    listbox classes). The byte-identical row class
    (`EmployerPicker`/`MunicipalityPicker` `ROW_CLASS` + `FileCategoryPicker`
    option row) and the byte-identical "create new" footer class (Employer /
    FileCategory / TaxProfile) are now the shared `LISTBOX_OPTION_CLASS` /
    `LISTBOX_CREATE_OPTION_CLASS` constants in `form/listbox.ts`. That was the
    mechanical, zero-risk part of the plan; what remains is the
    component-level consolidation, which is the riskier piece.
  - **Plan (updated 2026-07): the design pass this row was waiting on has
    effectively landed.** `src/components/EntityPickerShell.tsx` (244) is
    exactly the thin presentational shell the prior plan sketched — trigger
    - `FloatingPanel` + listbox structure, type-ahead via an optional
      `getLabel`, roving tabindex, `renderTrigger` / `renderOption` /
      `renderHeader` / `renderCreator` slots, and a native none-sentinel
      (`selectedId: string | null` + a clear footer) — with two landed
      consumers (`CategoryPicker`, `CompanyCategoryPicker`;
      `TypePicker` declined it deliberately because its list is grouped, per
      the comment at `TypePicker.tsx:99`). The remaining work is adoption at
      the four pickers, not design: the bespoke creators map onto
      `renderCreator`, the per-option renders onto `renderOption`.
      Genuine leftovers to resolve per-site: Municipality's search-filter
      zone over its ~290-entry kommun list (the shell offers type-ahead, not
      a filter field — needs a search slot or that picker stays out), and
      the fact that Municipality/TaxProfile currently have **no keyboard nav
      at all**, so adopting the shell adds roving tabindex — an improvement,
      but still a behaviour change to smoke.
  - **Risk**: medium — keyboard-nav changes aren't smoke-testable in the
    agent environment (no real device). Smoke each picker's keyboard nav
    before landing; adopt one picker per PR.
  - **Severity: 5** (was 4; the "only once the design is worked out"
    qualifier is discharged — the shell exists in-tree with two landed
    consumers, so this is now concrete adoption work that removes four
    shell re-derivations before the next sheet type adds a fifth).

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
    **Re-verified 2026-07: `AppShell/AppShell.tsx` is now 1436 lines** —
    the growth since the 850-line slice-8 state is feature wiring, not
    regression: five new sheet-type arms (savings, loans, insights,
    investment, scenarios) plus their dialog hooks (`useLoanDialog` 472,
    `useSavingDialog` 204, `useTaxonomyCrud` 252, `useReceiptManager` 154,
    `useCoverTransferFlow` 141, `useSheetNav` 195, `useSheetUrlSync` 185)
    and three new hosts (`SavingsModalHost`, `LoansModalHost`,
    `AccountsModalHost` 292). The `useSearchModal` blocker is unchanged
    (AppShell still reads `scrollToRowRequest` at :304 and feeds it to
    `BudgetPage` at :1258); the new dialog hooks are the same
    cross-cutting shape (page-facing callbacks), so no new clean host-only
    relocation candidate surfaced. The severity holds on the trajectory:
    every new sheet type adds another hook call + host prop to the pile.
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

- **Update-balance/value modal shape now duplicated at five sites** —
  `loans/LoanUpdateBalanceModal.tsx` (204),
  `savings/UpdateSavingBalanceModal.tsx` (201),
  `items/UpdateItemValueModal.tsx` (222),
  `properties/UpdatePropertyValueModal.tsx` (234), and
  `accounts/UpdateBalanceModal.tsx` (210). The first four are
  near-identical shells: the `value` / `date` / `importOpen` `useState`
  triple + focus ref + `useResetOnOpen` stamping today + parse/validate +
  `handleAdd` + date-desc-sorted history list with per-entry delete — and
  all four now also wire the same `BatchValueImportModal` import flow.
  The accounts modal still genuinely diverges (delta-prose UI). The prior
  row's recorded defer-trigger — "until a fifth balance-snapshot surface
  lands (e.g. an investment sheet type)" — fired 2026-06 with
  `UpdateItemValueModal` (#1047).
  - **Plan**: extract the shared shell (value+date form, history list,
    batch-import wiring) parameterised on labels + validate + commit;
    leave the accounts modal out. Settle the negative-snapshot asymmetry
    first and independently (loans rejects `parsed < 0`, savings / items /
    properties accept it) — that's a product decision, not a refactor;
    don't fold it into the extraction PR.
  - **Risk**: low (presentational; each site's commit dispatch stays
    local).
  - **Severity: 5** (was 4; the fifth site landed and an investment sheet
    type would be the sixth copy).

- \*\*Cloud-adapter factory closures bundle a growing private-function suite
  - mutable token/cache state\** (`src/storage/dropbox-adapter.ts` 610,
    `src/storage/gdrive-adapter.ts` 1153 — up from ~494 / 765 when first
    recorded, +34% / +51%). Each `create*Adapter()`wraps load / save /
backup / auth helpers in one closure that mutates`currentAccessToken`+`pendingRefresh` (Dropbox) / four cached folder-and-file ids (GDrive) in
    place — GDrive is now ~35 closure functions with no single owner of
    cache invalidation. The growth driver is per-kind sibling-file ops
    (backups, receipts, payslips, property files, exports) re-implemented in
    both adapters with near-identical read / upload / delete boilerplate, so
    every new attachment kind threads through both closures. Distinct from
    the already-skipped OAuth-refresh-dedup item: this is the _structure_,
    not the 401 semantics.
  * **Plan**: lift the private suite into a small stateful client object
    (`DropboxClient` / `DriveClient`) holding the token/cache as explicit
    fields; the adapter becomes a thin `StorageAdapter` wrapper over it.
    Once the clients exist, a shared `FileBackend`
    (read/write/delete-by-path) interface can absorb the per-kind
    sibling-op boilerplate as a follow-up slice.
  * **Risk**: HIGH and **not smoke-testable in this environment** — the
    OAuth + live-revision flows (silent token refresh mid-load, 404 →
    cache-bust → re-create) only exercise against real Dropbox/Drive.
    The storage hot path is production-critical. Don't land
    speculatively; slice it in when the adapters are next touched for a
    feature, with a maintainer smoke against both providers.
  * **Severity: 5** (was 4; the closure tangle is compounding with every
    attachment kind, so the trigger is no longer only "a third backend" —
    but the un-testable risk still caps how soon this should land).

### Severity 3–4 — nits with leverage

- **Discovery / candidate-walk pattern re-derived per page (UI + data)** —
  now **nine** UI surfaces: `salary/SalaryDiscoveryModal.tsx` (797 + its
  reducer), `properties/MortgageDiscoveryModal.tsx` (835),
  `items/ItemFinderModal.tsx` (427), `budget/BudgetFindConflictsModal.tsx`
  (384), `budget/BudgetRecurringCandidatesPanel.tsx` (459),
  `accounts/AccountTransferCollapseModal.tsx` (260),
  `accounts/AccountRenamePredictorModal.tsx` (256), and — added by the
  2026-07 sweep — the cross-account duplicate finder pair
  `accounts/AccountDuplicatesModal.tsx` (677) +
  `accounts/ImportDuplicatesModal.tsx` (198); six data engines:
  `salary/detection.ts` (244) + `salary/discovery.ts` (382),
  `property-mortgage/discovery.ts` (996, phase-decomposed — see Landed),
  `loans/candidates.ts` (140), `property-repairs/candidates.ts` (173),
  `items/find.ts` (145), and `accounts/duplicates.ts` (869). Each data
  engine re-derives its own "already consumed / ignored" tracking
  (`loans/candidates.ts:30` `consumedHistoryIds`,
  `property-repairs/candidates.ts:131` `usedSourceKeys`,
  `accounts/duplicates.ts` `buildIgnoreSet` + session-id sets, etc.).
  The duplicates engine is well-decomposed and pinned by two test suites
  (`tests/account_duplicates_*_test.ts`), so it adds evidence for the
  convention, not urgency; if its balance-fit core (`buildAccountIndex`,
  :195–:288 — the file's densest block) is ever touched, the natural seam
  is named forward-fit / backward-fit / merge phases, mirroring the
  `discoverMortgagePayments` decomposition.
  - **Re-verified 2026-06 — the `useCandidateSession` UI slice is dead.** The
    "every walk re-implements per-session `Set<string>` accepted/skipped
    state" framing failed contact with the code: only `SalaryDiscoveryModal`
    fully matches the proposed shape (`Map` accepted + `Set` skipped,
    reset-on-open, batch commit). `AccountTransferCollapseModal` has only a
    skipped-set with per-row immediate commits; `AccountRenamePredictorModal`
    keys a `Record<entryId, { accepted, text }>` of inline-editable drafts
    that resets on suggestion-list identity, not on open;
    `BudgetFindConflictsModal` and `BudgetRecurringCandidatesPanel` hold no
    session decisions at all (a threshold filter / a persistent panel, both
    committing per-row); `ItemFinderModal` tracks four specialized sets plus
    timer-deferred refs; `MortgageDiscoveryModal` is a nullable include-set.
    At ~1.5 genuine fits the hook fails the N≥3 bar (same precedent as the
    skipped `useListboxKeyboard` at one site). Don't re-propose it without a
    new walk that actually copies the salary shape.
  - **Plan (remaining)**: the data-side consumed-id convention/helper, and —
    only as a deliberate design pass, same as the pickers item — any shared
    walk shell. Do **not** force a kitchen-sink shell: the walks genuinely
    diverge (Salary is a 4-phase step-through state machine with per-month
    form edits; Mortgage has a tolerance slider; Conflicts has threshold
    preset pills; Rename has inline-editable drafts; commit cardinality
    differs everywhere).
  - **Risk**: medium for the data side — each engine's scoring is genuinely
    different (running-mean segments vs strictness tiers vs tolerance
    matching); any shared scan helper must be verified against each engine's
    existing tests with byte-identical output.
  - **Severity: 4** (was 5; the one named near-term slice — the session-state
    hook — evaporated on re-verify, leaving the data-side convention and the
    design-pass shell). Every new sheet type with a "Find X" walk still
    re-derives ~150–800 lines of engine today.

- **Cross-page consumers reaching into page-scoped `src/data/`
  directories** — four modules under page-named data dirs now have
  consumers in _other_ pages' component directories, the shape the
  placement rules say belongs at `src/data/` root (and the shape the
  `src/data/finance/` hoist fixed 2026-06):
  `data/budget/company-type-hints.ts` (423) ←
  `accounts/EditHistoryEntryModal.tsx:4`; `data/budget/synthesis.ts`
  (475) ← `items/ItemFinderModal.tsx:8`, `properties/PropertiesPage.tsx:8`,
  `scenarios/ScenarioMonthTable.tsx:7`; `data/budget/rows.ts` (575) ←
  `scenarios/ScenariosPage.tsx:14`; `data/accounts/cover-transfer.ts`
  (261) ← `budget/BudgetPage.tsx:15`, `budget/BudgetCoverInfoModal.tsx:4`.
  - **Plan**: per-module judgment, not a blanket move.
    `company-type-hints` and `cover-transfer` look genuinely cross-page
    (relocate to root: `git mv` + import updates + the
    `docs/architecture.md` inventory). `synthesis` / `rows` are consumed
    by scenarios _because scenarios is intrinsically a what-if layer over
    budget rows_ — decide on pickup whether that makes the helpers
    cross-page (relocate) or scenarios budget-coupled by design (document
    the exception on the import sites instead); the items / properties
    `synthesis` imports suggest relocation is the honest answer there.
  - **Risk**: low — mechanical `git mv` moves; the synthesis / rows
    decision is the only judgment call, and relocating them is churny
    (many budget-internal consumers), so it may want its own slice.
  - **Severity: 4** (easy-win flavoured for the two clear relocations).

- **`scenarios/ScenariosPage.tsx` re-grew the flat modal-selector pile**
  — 1032 lines with ~12 `useState` (:133–:157), of which ~9 are
  mutually-exclusive modal / staging selectors (`rowModal`,
  `modulateRowId`, `editModal`, `deleteTarget`, `diffOpen`, `chartOpen`,
  `addMonitorOpen`, `pendingSeriesApply`, `pendingRowDelete`,
  `pendingBaseSheetId`) — the exact shape the landed PropertiesPage
  discriminated-`modal`-union fix (2026-06, see Landed) was meant to be
  the template for the next sheet-type page.
  - **Plan**: copy the PropertiesPage template — one
    `useState<ScenarioModalState | null>` discriminated union for the
    mutually-exclusive selectors; keep genuinely co-open state
    (`activeScenarioId`, `showEarlierMonths`, `expandedTransferAnchors`)
    separate, and verify which staging dialogs intentionally stack before
    folding them in (the PropertiesPage re-verify caught exactly that).
    A size-decomposition pass (the render tree is ~430 lines) can ride
    along if it stays mechanical, or wait.
  - **Risk**: low-medium — the series-apply staging → confirm → reset
    flow must map 1:1; no persisted-shape impact.
  - **Severity: 4** (same rating the PropertiesPage instance carried).

- **Byte-layer wrapper skeleton duplicated across the encrypting /
  compressing adapters** — `storage/encrypting-adapter.ts` (252) and
  `storage/compressing-adapter.ts` (148) re-implement the same
  `StorageAdapter` transform-wrapper skeleton: a snapshot unwrap helper,
  a `rethrowDecoded` ConflictError-payload decode, `load` / `save` /
  `watch` with identical try/rethrow shapes, and verbatim passthrough of
  the sibling-op surfaces. `wrap-for-active.ts` (36) composes them in a
  documented-but-unenforced order (compression outside encryption —
  ciphertext doesn't compress).
  - **Plan**: a `withByteTransform(inner, { wrap, unwrap, canUnwrap })`
    factory owning the plumbing, with an order guard (phantom type or
    naming) riding along. Best landed **with** the segmentation
    integration — `storage/segments.ts` (217, currently test-only staging
    for per-segment saves; see Skipped) would be the third wrapper that
    makes the factory pay for itself.
  - **Risk**: moderate — the conflict-decode path is subtle; covered by
    the existing wrapper tests, but it sits on the storage hot path, so
    it wants the manual backend smoke.
  - **Severity: 3** — land when the third wrapper is wired in, not
    speculatively.

- **`useReducer` in remaining modal state machines (opportunistic)** —
  `useReducer` now has **seven** landed hits
  (`AccountReconciliationModal`, `RecurrenceForm`,
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
  drift through. Concrete pyramid sites surfaced in the 2026-06
  properties sweep, all reset together via one `useResetOnOpen` —
  counts refreshed 2026-07, all grown:
  `properties/MortgageEditorModal.tsx` (12 `useState`),
  `properties/RepairsEditModal.tsx` (9), `properties/ManualRepairModal.tsx`
  (8), `properties/PropertyEditorModal.tsx` (14), and
  `properties/NetSaleProfitModal.tsx` (11) — adopt `useReducer` opportunistically
  when one of these modals is otherwise touched. The 2026-06 cross-page sweep
  added three more: `loans/LoanModal.tsx` (**14** `useState`),
  `savings/SavingsModal.tsx` (9), and
  `salary/SalaryBulkEditModal.tsx` (7 — its three enabled/value toggle pairs
  reset together on open; `budget/BudgetBulkEditModal.tsx` already landed the
  reducer shape to mirror, `budget-bulk-edit-modal-reducer.ts`). The
  2026-07 scenarios sweep found no new pyramid — `ScenarioRowModal` (6,
  with `useResetOnOpen`) and `InsightsSettingsModal` (a single draft
  `useState`) follow the intended patterns.

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
  2026-07 at **911 lines** (the `filterFn?: (type: EntryType) =>
boolean` escape hatch is checked first at ~:177, `amountSign` is the
  opt-in default; the file deliberately does _not_ compose
  `EntityPickerShell` because its list is grouped, per the comment at
  :99). **Severity: 3.** Stays put until a non-budget sheet type ships
  and demands a richer registry.

- **Hardcoded user-facing strings drift** — the systematic audit
  landed 2026-05 (see Landed) and consumed the visible chrome hits.
  Re-verified 2026-05 and again 2026-07: no new native `<select>`
  (count: 0) and no obvious new hardcoded literals surfaced — the
  2026-07 agents specifically checked the scenarios / insights /
  duplicate-finder surfaces and found everything routed through `t()`. The remaining drift
  surface is small; promoting the one-off audit script to an ESLint
  rule is the next step but is a tooling change, not a refactor.
  **Severity: 3** — re-rate up if a second batch of hardcoded strings
  surfaces in production.

- **Inline `parseFloat` / `new Date(…)` at remaining sites** —
  `parseInt32` landed 2026-05 and was adopted at the shift-day /
  anchor-day parsers. Re-verified 2026-07: the lone `parseFloat`
  (`useScrollToToday.ts:93`, parsing a CSS computed value) and the
  ~46 `new Date(...)` sites are CSS-value parsing and date
  construction — none share the user-input parsing shape
  `parseDecimal(text, lang)` would cover. Re-rate if
  thousands-separator support lands. **Severity: 3.**

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

- **Adopt `form/FormSection.tsx` at inline label-stack sites** — the
  `<label className="flex flex-col gap-1.5"><span className="text-xs
text-muted">…</span>…</label>` label-stack is inlined at ~40
  component files while `form/FormSection.tsx` (used at 11 sites)
  already wraps exactly that pattern. Adopt opportunistically when a
  modal is otherwise touched; not a batch PR (the `gap-1*` grep is
  noisy, so confirm the `text-muted` label span per-site before
  swapping). The 2026-06 properties sweep confirmed the whole
  `src/components/properties/` layer (built after the helper) inlines this
  label-stack at ~50 sites and never adopts `FormSection` — a rich seam for
  drive-by adoption when those modals are next touched. Encouragingly, the
  2026-07 sweep found the newer scenarios / insights pages adopted
  `FormSection` from day one (zero inline label-stacks), so the seam is
  the properties backlog, not a spreading pattern (adopters now 21 files).

---

## Landed

- **`discoverMortgagePayments` ~395-line monolith → named module-level
  phases** (2026-06): the 2026-06 skip entry's ~350-line re-rate trigger
  fired (loan-linking growth pushed the main function from ~297 to ~395
  lines), so the decomposition landed, mirroring the `migrateV24ToV25`
  precedent. `discoverMortgagePayments`
  (`src/data/property-mortgage/discovery.ts`) now reads as a traceable
  sequence over named phases: `scanChargeGroups` (the one-pass history walk
  that buckets outflows into per-description / amount-salvaged charge groups
  and resolves tag / payment anchors, returning a `ChargeGroups` record and
  stamping the funnel counters on `diag`), `buildCandidateSeries` (the
  per-group judging funnel — ownership-window cut, typical-amount centring,
  cadence + window-coverage checks, amount band, plausibility gate — emitting
  the kept series plus the per-key diagnostic / target-index maps), and
  `promoteHighlyProbable` (the best-per-expected-figure second pass). The
  `nearestTargetKey` closure became a module function taking `targetAmounts`,
  and `anchorRank` hoisted alongside so both the promotion and the final sort
  share it; ranking + seed resolution stay in the main function. Pure
  decomposition — behaviour pinned by the 1,441-line
  `tests/property_mortgage_discovery_test.ts`; fast loop + build +
  icons-check green, all 1759 tests pass. **Was severity 3.**

- **Reducer `applyPatch` quintuplication → shared
  `src/data/reducers/patch.ts`** (2026-06): re-verify widened the "three
  reducers" framing — the byte-identical undefined-deletes-the-key patch
  loop lived at **five** sites, not three: the generic copies in
  `reducers/savings.ts` / `loans.ts` / `properties.ts`, the monomorphic
  `applyItemPatch` in `reducers/items.ts` (the roadmap's "inline `.map()`"
  claim was stale — it had a full helper), and the loop inside
  `reducers/salary.ts`'s `applySalaryPatch`. Hoisted one shared
  `applyPatch<T extends { id: string }>(entity, patch)` into
  `src/data/reducers/patch.ts` (carrying the WHY comment: explicit
  `undefined` deletes the key so the live record stays byte-identical to a
  storage round-trip); the first four sites now import it directly, and
  `applySalaryPatch` delegates the loop to it while keeping its
  salary-specific invariant (changing `employerId` without a `roleId` in
  the same patch drops the orphaned role reference). `reducers/item/hints.ts`'s
  `applyPatch` is a different row-patch shape (cell writes, formula /
  estimate-range / type-lock semantics) and stays, per the plan. Pure
  refactor — identical output at every site, covered by the existing
  reducer suites; fast loop + build + icons-check green, all 1759 tests
  pass. Added the new file to the `docs/architecture.md` inventory. **Was
  severity 3 (easy-win flavoured).** New sheet-type reducers import the
  helper instead of copying it.

- **Shared mortgage math hoisted from `src/data/property-mortgage/` to
  `src/data/finance/`** (2026-06): `data/loans/balance.ts` / `series.ts` and
  `data/insights/networth.ts` imported `balanceAt` / `resolveRateAt` /
  `resolveMonthlyInterestAt` / `resolveMonthlyPaymentAt` across the
  page-directory boundary — the live re-create condition of the skipped
  `src/data/forecasting/` candidate. `git mv`d `interest.ts`, `payment.ts`,
  **and `amortization.ts`** (their shared dependency, named in the plan's
  parenthetical but not its file list — moving only the first two would have
  left `finance/` reaching back into `property-mortgage/`) into
  `src/data/finance/`; mortgage-specific `discovery.ts` / `aggregate.ts` /
  `progress.ts` stay in `property-mortgage/` (aggregate now imports the
  finance modules — page-dir → root is the right direction). Same-depth move,
  so the moved files' own relative imports were untouched; updated the twelve
  consumer import sites (2 loans + insights + aggregate + 5 properties
  components + `useLoanDialog`), four test files' paths, the path-comment in
  `data/types/properties.ts`, and the `docs/architecture.md` inventory +
  `docs/overview.md` / `docs/dictionary.md` references in the same PR. Pure
  module relocation — covered by the existing interest / payment / discovery /
  amortization test suites. **Was severity 4 (easy-win flavoured).** Future
  savings-forecast / scenario math now has a real cross-page home.

- **`properties/date-input.ts` (`DATE_INPUT_CLASS`) hoisted to
  `form/date-input.ts`** (2026-06): the shared `<input type="date">` class
  landed under `src/components/properties/` when properties was its only
  consumer, but `loans/LoanUpdateBalanceModal.tsx`, `loans/LoanModal.tsx`,
  and `savings/UpdateSavingBalanceModal.tsx` had grown sibling
  page-directory imports (`"../properties/date-input"`), which `AGENTS.md`
  forbids. `git mv`d the module to `src/components/form/date-input.ts`
  (next to `form/listbox.ts` / `form/menu.ts`), kept the
  iOS-width-workaround comment, re-exported from `form/index.ts`, and
  merged the constant into each consumer's existing `../form` barrel import
  (five properties modals + the three loans/savings sites). Also consumed
  the two local re-declarations of the byte-identical string: the
  `DATE_INPUT_CLASS` const in `salary/SalaryAddModal.tsx` (named by the
  Pending row) and the `dateInputClass` local in `ItemEditorModal.tsx`
  (found on re-verify — it even carried its own copy of the iOS comment).
  Pure constant relocation; the resolved class is byte-identical at every
  site. Fixes a live import-direction rule violation. **Easy win.**

- **Eight per-page actions menus → shared `ActionsMenu` shell** (2026-06):
  slice 2 (final) of the eight-actions-menus item. The ~40-line structural
  shell every "…" menu re-derived — the `useRef` + `useState(open)` trigger
  wiring, the `pick(handler)` close-and-fire helper, the `FloatingPanel`
  mount, and the `role="menu"` list rendering — now lives in
  `src/components/form/ActionsMenu.tsx`. Each menu builds its `MenuItem[]`
  (item arrays, disabled predicates, `useActionsCompact` participation stay
  local) and composes the shell, which closes the panel and fires `onPick`
  (the swipe-dismiss `onAction`) before each item's handler. The slice-1
  divergences are props: `placement` (`AccountActionsMenu`'s 200px),
  `triggerClassName` + the now-shared `MENU_ITEM_DANGER_CLASS` row variant
  (`PropertyActionsMenu`), `triggerTitle` (accounts), and a single
  `stopPropagation` knob covering both trigger and item clicks for menus
  inside rows with their own tap action. The empty-items `null` return
  (items / salary / repairs) moved into the shell. One deliberate
  unification: items / salary / repairs item clicks now also stop
  propagation (previously only their triggers did) — verified harmless,
  those rows' tap handlers only retract a swipe the menus' `onAction`
  already dismisses. `SheetTitleMenu` keeps its own renderer as planned.
  Each menu dropped ~45 lines; every new sheet type now writes only its
  item array.

- **Actions-menu shared constants hoisted into `form/menu.ts`** (2026-06):
  slice 1 of the eight-actions-menus item. The byte-identical pieces every
  "…" menu re-declared — the `MenuItem` type (now one shared type whose
  optional `disabled` / `title` / `danger` flags cover the full
  budget/accounts/loans/savings shape, the minimal items/salary/repairs
  shape, and the properties `danger` variant), the 224px right/document
  `ACTIONS_MENU_PLACEMENT` (7 of 8 menus; `AccountActionsMenu` keeps its
  drifted local 200px placement unchanged), the swipe-strip "…"
  `ACTIONS_MENU_TRIGGER_CLASS` (7 sites; `PropertyActionsMenu`'s
  card-header trigger genuinely differs and stays local), the plain
  `MENU_ITEM_CLASS` row (items / salary / repairs / `SheetTitleMenu`), and
  the disabled-conditional `menuItemClass(disabled)` helper (budget /
  accounts / loans / savings, previously a byte-identical ternary) — now
  live in `src/components/form/menu.ts` (mirroring the `form/listbox.ts`
  precedent), re-exported from `form/index.ts`. `SheetTitleMenu` keeps its
  own exported minimal `SheetTitleMenuItem` type (public API for pages
  building item arrays; widening it to the flagged shape would imply
  support its renderer doesn't have) and its deliberate 180px placement.
  `PropertyActionsMenu`'s danger-tinted row class stays local likewise.
  Pure constant/type hoist — every resolved class and placement is
  byte-identical at every site; fast loop + build + icons-check green, all
  1723 tests pass. **Slice 2 (the structural shell) landed 2026-06 — see
  the `ActionsMenu` shell entry above.**

- **Row-swipe action strip duplicated across seven tables → shared
  `swipe-table` / `swipe-action-cell` CSS + `useRowSwipeAndClaim` hook**
  (2026-06): the ~40-line mobile swipe block (the absolute 128px action
  overlay, the `translateX` reveal transforms, and the
  `action-btn-pen` / `-delete` / `-more` colours) was copy-pasted
  byte-for-byte under seven different table classes — `budget-table`,
  `accounts-table`, `items-table`, `salary-table`, `transfers-table`,
  `mortgage-payments-table`, `repairs-table`. Collapsed into one shared
  block keyed on two opt-in classes (`swipe-table` on the `<table>`,
  `swipe-action-cell` on the action `<td>`/`<th>` alongside the kept
  per-table class), with the only two real variations parameterised: the
  strip width is a `--swipe-strip-width` custom property (128px default,
  64px for the single-button transfer log), and budget's centred strip
  is a one-rule override. The per-table classes stay on the elements
  because a few non-swipe rules and one JS `closest(".action-cell")`
  guard still target them. On the JS side, every `*Row` component made
  the identical `useRowSwipe(opts)` + `useClaimActiveRow(id, swiped, …)`
  pair; folded into one `useRowSwipeAndClaim(rowId, opts)`
  (`src/components/`, next to `useClaimActiveRow` since it needs the
  `ActiveRowProvider` context). Pure refactor — swipe verified visually
  on all four sheet tables (3-button and 2-button strips, centre vs
  stretch); fast loop + build + icons-check green, all 1522 tests pass.
  A new swipe table now needs only the two classes, no new CSS. Found by
  the cross-sheet table audit; never sat in Pending.

- **Custom-dropdown listbox row/footer classes duplicated across four
  pickers → shared `LISTBOX_OPTION_CLASS` / `LISTBOX_CREATE_OPTION_CLASS`**
  (2026-06): the roving-focus `role="option"` row class
  (`flex w-full … px-3 py-1.5 … focus-visible:outline …`) was re-declared
  byte-identically as a local `ROW_CLASS` in `salary/EmployerPicker.tsx` +
  `salary/MunicipalityPicker.tsx` and inline in `properties/FileCategoryPicker.tsx`;
  the accent "create new" footer button class (`… px-3 py-2 … text-accent …`)
  was inline-duplicated across `EmployerPicker`, `FileCategoryPicker`, and
  `salary/TaxProfilePicker`. Hoisted both into a new
  `src/components/form/listbox.ts` (mirroring the `DATE_INPUT_CLASS`
  precedent), re-exported from `form/index.ts`, and routed every
  byte-identical site through them. Left inline the rows that genuinely
  differ — `FileCategoryPicker`'s `text-muted` "none" button and
  `TaxProfilePicker`'s `py-2` + Receipt-icon `ProfileOption` rows — so no
  resolved class changed at any site. This is the mechanical, zero-risk
  "lift the row-button styling to a single shared class" slice of the
  four-pickers consolidation item (which stays Pending for the riskier
  component-level merge). Pure refactor — identical render; fast loop +
  build + icons-check green, all 1510 tests pass. **Was severity 5 (slice
  landed; remainder re-rated to 4).**

- **`properties/PropertiesPage.tsx` 17 modal selectors → one discriminated
  `modal` router + 3 kept-separate stacked sub-editors** (2026-06): the page
  declared 17 independent modal open/close `useState`s. Collapsed the
  **mutually-exclusive** property-/mortgage-action selectors
  (`editingProperty` / `creatingProperty` / `valueProperty` /
  `paymentsProperty` / `repairsProperty` / `filesProperty` / `saleProperty` /
  `exportingProperty` / `importOpen` / `editingMortgage` / `creatingMortgageFor`
  / `findOpen` / `pendingDeleteProperty` / `pendingDeleteMortgage`) into one
  `useState<PropertyModalState | null>` discriminated union (14 `kind`s, each
  carrying its own `Property` / `MortgageRef` payload), so only one of those
  modals can be open at a time by construction. **Re-verify corrected the
  roadmap's "single union, mutually exclusive by construction" plan**: the
  three repair sub-editors (`addingRepairsFor`, `repairEditor`,
  `manualRepairEditor`) are opened from _inside_ the `RepairsModal` and
  intentionally **stack on top of** it (the list stays open behind the
  editor), so they are genuinely co-open with `modal.kind === "repairs"` and
  were kept as their own state — the seam is two-layer, not one flat union.
  The `liveXProperty` re-resolution (held-by-id lookup against `data` so an
  edit reflects immediately) is preserved, now keyed off `modal.kind`. Pure
  refactor — every modal's open condition / payload / close maps 1:1 to the
  old setter; no persisted-shape impact, no behaviour change. Fast loop +
  build + icons-check green, all 1510 tests pass. **Was severity 4.** The
  discriminated-`modal`-state shape is the template the next sheet-type page
  (savings, loans) copies instead of re-growing a flat selector pile;
  per-page in-file unions stay non-speculative (a shared `useModalRouter`
  helper waits for a second consumer).

- **Date-input class string duplicated across five properties modals →
  shared `DATE_INPUT_CLASS`** (2026-06): the `w-full`-less
  `<input type="date">` Tailwind string (`field-input rounded border
border-line bg-surface-2 px-2 py-1.5 text-sm text-fg`) was re-declared
  verbatim at five sites — a local `const` in `MortgageEditorModal`
  (with the iOS-workaround comment), `ManualRepairModal`,
  `UpdatePropertyValueModal`, `PropertyEditorModal`, and inline at
  `MortgagePaymentEditModal`. Hoisted to a single exported
  `DATE_INPUT_CLASS` in a new `src/components/properties/date-input.ts`,
  carrying the iOS WebKit width-workaround comment, and routed all five
  sites through it. The lone `py-1 text-xs` variant in
  `RepairReceiptsModal` (a deliberately different size) stays inline per
  the plan. Pure constant extraction — the resolved class is
  byte-identical at every site; fast loop + build + icons-check green,
  all 1504 tests pass. **Was severity 3 (easy-win-flavoured).**

- **`RepairsEditModal` + `ManualRepairModal` shared subtype/company/tags
  field trio → `<RepairFields>` presentational component** (2026-06): both
  repair editors rendered a byte-identical `SubtypePicker` + `CompanyPicker`
  (`variant="field"`) + `TagsPicker` stack — same labels
  (`repairSubtypeLabel` / `repairCompanyLabel` / `repairTagsLabel`), same
  `repairSubtypePlaceholder` — while their commit sides genuinely diverge
  (`RepairsEditModal` diffs against `seedCompanyId` / `seedTagIds` to emit
  `userCompanyId` / `userTagIds` overrides on the primary transaction;
  `ManualRepairModal` writes the fields straight onto the repair). Extracted
  `src/components/properties/RepairFields.tsx` owning the three pickers + all
  their i18n (labels, placeholder, and the company / tags hints), keyed off
  value/onChange props. Two divergences became props: `fixedParentTypeId`
  (`typeId ?? undefined` in the transaction editor where the primary may be
  unresolved, the always-set `typeId` in the manual editor) and
  `showEntryHints` (the `repairCompanyHint` / `repairTagsHint` spans render
  only for the transaction-backed editor, where company / tags live on the
  underlying charge). Both modals keep their own `subtypeId` / `companyId` /
  `tagIds` state, reset logic, and commit handlers; only the field JSX moved.
  Dropped the now-unused `SubtypePicker` / `CompanyPicker` / `TagsPicker`
  imports from both. Pure presentational refactor — identical render at both
  sites; fast loop + build + icons-check green, all 1504 tests pass. **Was
  severity 4.**

- **Page-specific `usePropertyAttachments.ts` relocated to
  `src/components/properties/`** (2026-06): the properties-only
  attachment hook (752 lines — repair-receipt + uploaded-file write
  plus the data commit for each) lived under
  `src/components/AppShell/hooks/`, the same placement smell the landed
  `useSalaryBulkSelection` relocation fixed. Its exported
  `PropertyAttachments` / `PropertyFileMeta` types were imported
  _upward_ by `properties/PropertiesPage.tsx` and
  `properties/PropertyFilesModal.tsx`. Re-verified the
  standalone-vs-host-consumed question first: AppShell only _wires_ the
  hook (`usePropertyAttachments({ data, adapter, dispatch })`) and
  threads its result straight into `PropertiesPage` via the
  `attachments` prop — it's a standalone page hook the shell routes, not
  a host-owned collaborator like `useComplexEntry` / `useMatchRuleUi`,
  so it moves. `git mv`d it into `src/components/properties/`, fixed the
  15 internal `../../../` → `../../` import paths, pointed AppShell's
  import at `../properties/usePropertyAttachments` (mirroring the
  existing `../salary/useSalaryBulkSelection` line in the same block),
  and switched the two type-import consumers to `./usePropertyAttachments`.
  The `useReceiptManager` / `data/receipts/target.ts` references were
  comment-only (no import), so there was no shared-hook entanglement.
  Updated the path references in `docs/dictionary.md` +
  `docs/overview.md`. Pure module relocation, no behaviour change. **Was
  severity 4 (easy-win-flavoured).**

- **Page-specific `useSalaryBulkSelection.ts` relocated to
  `src/components/salary/`** (2026-06): the salary-only bulk-selection
  hook lived under `src/components/AppShell/hooks/` next to the budget
  `useBulkSelection.ts`, violating the `AGENTS.md` rule that
  page-specific code belongs in the per-page directory with the
  page-name prefix. `git mv`d it into `src/components/salary/`
  (AppShell already imports `SalaryPage` from there as the router, so
  the import direction is consistent), fixed the four internal relative
  imports (`../../data/achievements`, `../../data/reducer`,
  `../../data/types`, `./SalaryBulkEditModal`), and pointed AppShell's
  import at `../salary/useSalaryBulkSelection`. The `isSalarySheet`
  swap stays in AppShell — the BottomBar that owns the select toggle is
  rendered there. Pure module relocation, no behaviour change; fast
  loop + build + icons-check green, all 1267 tests pass. **Was
  severity 4 (easy-win-flavoured).** The other budget-only
  `AppShell/hooks/` members (`useComplexEntry`, `useMatchRuleUi`,
  `useTransferFlow`, `useRowMutations`) stay put — they're consumed by
  the budget modal host the shell already owns, not standalone
  misplacements.

- **Inlined pointer long-press state machine → `useLongPress` hook**
  (2026-06): the `LONG_PRESS_MS = 450` constant + the
  `timer` / `triggered` / `startX` / `startY` ref quartet + the
  pointerdown (arm-timer) / pointermove (cancel-past-tolerance) /
  pointerup (cancel) / contextmenu (fire-immediately) choreography +
  the read-and-reset `triggered` flag that swallows the trailing click
  were inlined byte-for-byte at four sites: `BottomBar` (sheet tab →
  edit), `BudgetAddEntryButton` (hold → complex-entry modal),
  `BudgetRow` (hold → edit-row modal), and `DescriptionCell` (hold the
  company / item pill → edit modal). Extracted
  `useLongPress({ onLongPress, enabled?, ms?, moveTolerancePx?,
shouldSkip? })` into `src/hooks/useLongPress.ts` (re-exported from
  `src/hooks/index.ts`), returning stable
  `{ onPointerDown, onPointerMove, onPointerUp, onContextMenu,
consumeTriggered, cancel }`. The `enabled` flag carries `BudgetRow`'s
  synthesized-/correction-/select-mode eligibility gate and
  `DescriptionCell`'s `longPressKind !== null` gate; the optional
  `shouldSkip(e)` predicate carries `BudgetRow`'s action-cell /
  select-cell / interactive-control target guard (run for both
  pointerdown and contextmenu, matching the original). `consumeTriggered`
  is read-and-reset so each site's trailing-click swallow is one call —
  `BudgetRow` keeps its capture-phase `stopPropagation` + `preventDefault`
  (the click target is a descendant cell), the others their plain
  early-return. The defaults (`ms = 450`, `moveTolerancePx = 8`) covered
  all four sites so none override them. Pure refactor — identical pointer
  behaviour; `BudgetRow`'s `onPointerMove` still only reads coordinates
  (never `preventDefault`s) so it doesn't swallow the `useRowSwipe`
  touch-handler gesture it coexists with. Fast loop + build + icons-check
  green, all 1267 tests pass. Net −199 lines across the four call sites.
  **Was severity 4 (easy-win-flavoured).**

- **CRUD-admin `creating` / `editingId` / `pendingDeleteId` triple +
  delete-confirmation derived state → `useCrudAdminState<T>(items)`**
  (2026-06): the identical add / edit / delete-confirm UI-state block —
  `const [creating] / [editingId] / [pendingDeleteId]` plus the derived
  `pendingDeleteId !== null ? items.find(…) ?? null : null` confirmation
  target — was inlined at four `SettingsModal` admin sites
  (`admin.tsx` `TypesSection`, `TagsAdmin`, `CompaniesAdmin`,
  `CompanyCategoriesAdmin`). Extracted `useCrudAdminState<T extends
{ id: string }>(items)` into `src/hooks/` (re-exported from
  `src/hooks/index.ts`) returning `{ creating, setCreating, editingId,
setEditingId, pendingDeleteId, setPendingDeleteId, pendingDelete }`;
  the hook exposes both the resolved `pendingDelete` object and the raw
  `pendingDeleteId` because the four sites split on which they read in the
  confirm-dialog `onSelect` (`admin.tsx` / `CompanyCategoriesAdmin` call
  `onDelete(pendingDeleteId)`; `TagsAdmin` / `CompaniesAdmin` call
  `onDelete(pendingDelete.id)`). The `find` resolves against each section's
  full collection (`types` / `tags` / `companies` / `companyCategories` —
  not the sorted view, and `companyCategories` excludes the immutable
  presets), so a concurrent rename / removal stays reflected in an open
  dialog. The `admin.tsx:128` `creatingCategory` toggle and the
  `CategoryDropdown`'s own `:829` `creating` are genuinely separate single
  flags and were left inline. Pure state-shape refactor — identical UX at
  every site; fast loop + build + icons-check green, all 1267 tests pass.
  **Was severity 5.** Every future preset admin (loan types, savings goals)
  can adopt the hook from day one instead of re-deriving the triple.

- **Sheet-type registry now covers validation, item-action
  discrimination, and cross-sheet row traversal** (2026-05): landed
  with the Items sheet as the real second consumer, discharging the
  whole severity 7–8 cluster. `SheetTypeDescriptor`
  (`src/data/sheet-types/index.ts`) grew three fields — `validate(raw,
path, ctx)`, `itemTypes: readonly SheetItem["type"][]`, and
  `rowsForItem?(item)` — plus a fourth, `itemActionTypes`, exposing the
  budget descriptor's owned action list. The per-flavour leaf
  validators moved out of `validate/sheet.ts` into a new cycle-free
  `validate/sheet-items.ts` (column/row/budget/accountsView/itemsView)
  so the descriptors can import them without forming a
  `sheet-types → validate/sheet → sheet-types` cycle; `validateSheetItem`
  now resolves the descriptor by `raw.type` via `descriptorForItemType`
  and delegates, replacing the literal if-chain. `isBudgetItemAction`
  (`sheet-types/budget.ts`) is now a `Set.has` over the single
  `BUDGET_ITEM_ACTION_TYPES` tuple that also feeds `itemActionTypes`, so
  the dispatch guard and the registry view can't drift. The three
  cross-page traversals route through registry helpers: `eachRow` in
  `achievements/catalog.ts` and `entryCount` in
  `storage/backup-metadata.ts` call `someSheetItemRow` /
  `countSheetItemRows`, so a future row-bearing flavour is counted
  automatically (this also absorbs the separate severity-3 "cross-sheet
  row counters" nit). `search.ts`'s budget projection stays
  budget-scoped — it reads date/description/amount columns + bank
  history, which is intrinsically ledger-shaped, not a generic row
  walk. Covered by `tests/items_sheet_test.ts` (round-trip + dispatch +
  count) on top of the existing validator suite. Pure refactor — no
  persisted-shape change.

- **`migrateV24ToV25` 284-line monolith → named phases + characterization
  test** (2026-05): decomposed the single forward-only v24 → v25 migration
  (`src/data/migrations/legacy.ts`) into module-level named phases —
  `computeV24TypeUsage` (usage counts + orphan-row collection),
  `pickV24CategoryForType`, a `createV24GenericTypeMinter` factory that
  replaces the closure-captured `ensureGenericTypeFor`, `rewriteV24Sheets`,
  and `rewriteV24Transactions` / `rewriteV24MerchantHints` /
  `rewriteV24MatchRules` — so the main function reads as a traceable
  sequence (compute usage → stamp categoryIds → mint orphan generics →
  rewrite each surface). `PRESET_CAT_NAMES` lifted to module scope. The
  minter's invocation order (orphan rows → transactions → hints → rules)
  is preserved so the appended-type / `newId()` sequence stays
  deterministic. The roadmap demanded a before/after fixture; landed a new
  `tests/migration_v25_test.ts` that pins every observable branch
  (most-popular-category pick, preset-name + default fallbacks, orphan
  generic minting, per-category dedup, category-column/cell removal,
  transaction / hint / rule rewrites) through the public `migrate()` chain
  — green before and after the refactor. Pure restructure, no behaviour
  change; fast loop + build + icons-check green, all 1113 tests pass. **Was
  severity 3.** (Note the v39 → v40 rename of top-level `transactions` →
  `transfers` is asserted under the final name.)

- **Full-width table `colSpan` arithmetic → one hoisted `const` per
  file** (2026-05): within-file dedup only — the two tables use genuinely
  different formulas (no shared helper). `BudgetMonthTable.tsx` had two
  identical consts (`correctionColSpan`, `placeholderColSpan` =
  `columns.length + 1 + (selectMode ? 1 : 0)`) plus a third inline tfoot
  recompute written `columns.length + (selectMode ? 2 : 1)` (arithmetically
  the same value) — collapsed to one `fullWidthColSpan` const used at all
  three sites (correction divider, lazy placeholder, tfoot orphan
  indicator). `BudgetViewerModal.tsx` wrote
  `2 + (typeCol?1:0) + (amountCol?1:0) + (balanceCol?1:0)` three times (two
  `ShowFutureEntriesRow` sites + a `.map`-scoped local the future sites
  couldn't reach) — hoisted to one `fullSpanColSpan` const above the column
  destructure so all five JSX sites (month header, empty-month, correction,
  both show-more rows) share it. Pure arithmetic, no layout change; fast
  loop + build green, all 1101 tests pass. **Was severity 3.**

- **Paired `typeId` / `typeIdLocked` set/clear → `setRowType` /
  `clearRowType` helpers** (2026-05): the "set `typeId` +
  `typeIdLocked: true`, clear by deleting both" lockstep was inlined at
  five sites — `applyPatch` (`src/data/reducers/item/hints.ts`) plus four
  arms in `src/data/reducers/item/index.ts` (`updateCell` type-column
  set/clear, `addRowsFromComplex` set, `convertToRecurring` new-rows set,
  `convertToRecurring` anchor set/clear). Extracted two mutate-and-return
  helpers into `hints.ts` (already imported one-directionally by
  `index.ts`, and home of `applyPatch`, the canonical set/clear site, so
  no new file / no circular import / no `docs/architecture.md` inventory
  churn): `setRowType(row, typeId)` stamps the id + lock together,
  `clearRowType(row)` drops both. Re-verify caught the prior framing as
  **stale**: the `bulkUpdate` arm (`index.ts` ~344) writes `typeId`
  **without** touching `typeIdLocked`, so it is _not_ part of the
  lock-paired set and was left inline — folding it in would have been a
  behaviour change (a bulk type write would start locking the row).
  Pure refactor — identical output at every adopted site; fast loop +
  build + icons-check green, all 1101 tests pass (incl.
  `match_rule_tags_test` / `tags_reducer_test` covering the lock
  semantics). **Was severity 4.**

- **Duplicated local `formatMonth` helper → `formatMonthKey` in
  `src/utils/format.ts`** (2026-05): the
  `key === "undated" ? label : formatYearMonth(key, lang)` body was a
  private function in both `BudgetMonthTable.tsx` (which took `t` and
  resolved the label internally) and `BudgetViewerModal.tsx` (which took
  a pre-resolved `undatedLabel` string). Lifted to a shared
  `formatMonthKey(key, lang, undatedLabel)` exported next to
  `formatYearMonth`; both call sites now pass `t("budget.undated")`. The
  string-label signature (over passing `t`) keeps `src/utils/` free of an
  i18n dependency. Dropped the now-unused `formatYearMonth` import from
  both components and the `TFunction` / `Lang` imports from
  `BudgetMonthTable`. Pure refactor — identical output; fast loop + build
  - icons-check green, all 1101 tests pass. **Was severity 3 (easy win).**

- **`autoTypeForCompany` pick-company callback wrapper → `useAutoTypeForCompany`
  hook** (2026-05): the "on company pick, compute
  `autoTypeForCompany(typeId, next, companyTypeSuggestions)` then dispatch /
  set state" wrapper — flagged at 3 sites, **re-verified at 7** entry-edit
  modal `handlePickCompany` callbacks (`BudgetMetadataModal`,
  `BudgetEditEntryFullModal`, `BudgetComplexEntryModal` dispatch a reducer
  action; `BudgetPromoteHistoryForm`, `BudgetEditSeriesForm`,
  `BudgetPromoteToSeriesForm`, `accounts/EditHistoryEntryModal` set local
  state) — now routes through a `useAutoTypeForCompany(typeId,
companyTypeSuggestions)` hook (`src/hooks/`) returning a memoised
  `(companyId) => autoTypeId` mapper. Each callback drops its
  `company-type-suggestions` import and keys its `useCallback` on the stable
  mapper instead of `[typeId, companyTypeSuggestions]` (identical
  re-creation timing). The "fold into each reducer's `pickCompany`" plan
  alternative was rejected: the reducers are pure and don't hold
  `companyTypeSuggestions`, which is exactly why the type is computed
  outside. `useRowMutations.ts`'s `setTypeForRowsWithCompany` was left out —
  it calls `autoTypeForCompany` with a **per-row** `current` typeId inside a
  loop, not a single modal-level `typeId`, so the hook doesn't fit. Pure
  refactor; fast loop + build + icons-check green. **Was severity 4.**

- \*\*`pattern-apply.ts` rule→row label-patch boilerplate → `patchBudgetRowLabels`
  - `resolveRuleCompanyId` helpers\*_ (2026-05): the `rule.companyId !==
undefined && !== null ? : undefined` null-collapse ternary (3 identical
    sites: the two budget appliers + the history applier) became
    `resolveRuleCompanyId(rule)`. The type/company/tags "set-if-changed"
    block shared by the two budget appliers (`reapplyPatternsToBudget`,
    `applyMatchRuleOnceToBudget`) became `patchBudgetRowLabels(row, rule,
lockType)` — the `lockType` flag is the only divergence (reapply stamps
    the type unlocked; the deliberate one-shot stamps `typeIdLocked: true`),
    so both appliers now reduce to "match guard → call helper → detect change
    via `!== row`". The history applier stayed separate (it overwrites
    `user_`-prefixed fields and carries a description, a genuinely different
shape) but adopted `resolveRuleCompanyId`. Pure refactor — verified the
helper reproduces both appliers' per-field predicates exactly (including
the locked-type satisfied check); `make lint && typecheck && build`green,
all 1101 tests pass incl.`match_rule_tags_test`. Net −22 lines.

- **`findColumnByType` standard-column cluster → `useStandardColumns`
  hook / extended `getStandardColumns`** (2026-05): the per-file
  `useMemo(() => findColumnByType(columns, "…"), [columns])` clusters were
  hoisted. Extended the existing `getStandardColumns` selector (and its
  `StandardColumns` type) in `src/data/sheet.ts` to return all six
  standard columns (`dateCol` / `descCol` / `amountCol` / `balanceCol` /
  `completedCol` / `typeCol`) — it previously returned only four — and
  added a memoized `useStandardColumns(columns)` React wrapper in
  `src/hooks/` (re-exported from `src/hooks/index.ts`). Adopted at the
  N≥3-lookup sites: `BudgetViewerModal` (6 lookups),
  `BudgetEditEntryFullModal` + its reducer (4 each),
  `BudgetPromoteHistoryForm` / `BudgetEditSeriesForm` (3 each), and the
  two identical 3-lookup blocks in `AccountReconciliationModal`. Non-React
  reducer sites call `getStandardColumns` directly; React components use
  the hook. Single- and double-lookup sites (`BudgetMonthTable`,
  `BudgetPage`, `BudgetSplitEntryModal`, `BudgetBulkEditModal`, the
  `AppShell` hooks, and the one standalone lookup left in
  `AccountReconciliationModal`) stay on inline `findColumnByType` per the
  plan. Pure refactor — identical lookup results; fast loop + build green.

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

- **`ScenarioRow` ↔ `BudgetRow` unification** (2026-07, Explore sweep
  rated it 5): flagged as "80% duplicated row rendering". Rejected on
  re-read: the shared infrastructure is already extracted and adopted by
  both — `useRowSwipeAndClaim`, `monthColorVar`, the shared
  `CompanyPill` / `TypeBadge` from `Pills`, `useAmountColumns` — so what
  remains divergent is the domain affordances (modulation / exclude
  toggles vs push-to-month / edit / complete) and the column model. Same
  reasoning as the `LoanRow` vs `SavingsRow` skip: the divergence _is_
  the domain. Revisit only if a third row-rendering sheet type re-derives
  the base cells instead of composing the shared pieces.

- **Scan-cost findings in cover-transfer / transfer-collapse / GDrive
  property folders** (2026-07, Explore sweep rated them 6): the
  `data/accounts/cover-transfer.ts:199–261` O(transfers × entries)
  best-match walk, the `transfer-collapse.ts:46–56` `hasCollapsedHistory`
  full-history scan per transfer-modal open, and the GDrive per-property
  folder walk per upload. These are **performance** questions, not
  refactors — same routing as the `modalHandlers` re-mint skip: they
  belong to the `find-optimizations` skill with a profile in hand, not
  this roadmap.

- **Silent watch-error drop in the byte-layer wrappers** (2026-07,
  Explore sweep rated it 4): `encrypting-adapter.ts:243–248` /
  `compressing-adapter.ts:142–144` log-and-drop a remote update whose
  decrypt / decompress fails. Deliberate, documented staging ("surface
  this in a future iteration"); the fix is a UX affordance (soft-error
  sync status + retry), i.e. a **feature** with i18n and a changelog
  fragment, not a refactor. Don't fold it into a wrapper-factory PR.

- **`storage/segments.ts` unused-scaffolding deletion** (2026-07, Explore
  sweep rated it 3): every export is test-only today. Intentional staging
  for per-segment cloud saves (#1108), byte-for-byte pinned by
  `tests/segments_test.ts`, and its `:145` `as unknown as UserData` cast
  is contained (the merge output is round-trip-verified by the suite).
  Neither delete nor wire it speculatively — the byte-layer wrapper row
  in Pending names it as the third-wrapper trigger.

- **Generic discovery-walk scaffold (`discoveryCandidates<T>`)** (2026-07,
  Explore sweep proposal): don't add a second row — the existing
  discovery-walk Pending row already records that any shared shell is a
  deliberate design pass (and that the session-state-hook slice
  evaporated once on re-verify). The duplicate finder joining as the
  eighth engine strengthens the data-side consumed-id convention half of
  that row; it doesn't justify a parallel abstraction row.

- **Registry-based sheet-type router replacing AppShell's
  `activeSheet.type === …` switch** (2026-06, Explore sweep rated it 8):
  the proposal was to replace AppShell's page-routing chain with a
  `SHEET_TYPE_REGISTRY[type]`-driven `<DynamicPage {...commonProps} />`
  so a new sheet type doesn't add an arm. Rejected: `AGENTS.md`
  documents the switch as the **intended** pattern — "Add a new arm to
  the routing switch in `AppShell.tsx` … This is the only place that
  knows about every page" — and the existing "AppShell further hook
  splits" skip already records the routing switch as the file's reason
  for existing. Each page's props are genuinely different
  (bulk-selection shape, page-specific callbacks), so a generic
  `{...commonProps}` router would either lose type-safety or re-grow the
  per-type threading inside the registry. Speculative until a page with
  a uniform prop contract actually exists. (Note: the registry already
  covers validation / item-action discrimination / row traversal — see
  Landed — so the data-layer half of "registry coverage" is done; this
  rejected item is specifically the **component-router** half.)

- **AppShell `modalHandlers` `useMemo` re-mint on data mutation**
  (2026-06, Explore sweep rated it 6): flagged as a per-keystroke
  re-render tax because the base-slice `useMemo` (`AppShell.tsx:737`)
  depends on ~14 `onXRequest` callbacks. This is a **performance**
  question, not a refactor — it belongs to the `find-optimizations`
  skill, and the AppShell modal-host item above already records that the
  _dispatch itself_ was stabilised to read refs (so memoised chrome /
  rows no longer re-render on a column reorder). Re-measure under
  `find-optimizations` if a profile shows the base-slice memo is hot;
  don't restructure it as a refactor.

- **`useAmountInput` hook for the parse → sign → apply cycle** (2026-06,
  Explore sweep rated it 5): flagged as repeated across ~20 cell/modal
  sites. Skipped: `form/SignedAmountInput.tsx` already exists and
  abstracts the signed-amount input chrome, and most remaining sites run
  the parse through their own per-modal `*-reducer.ts` (where the sign
  semantics differ — blur-commit vs onChange, formula-toggle modes). The
  earlier `<Amount>` display-component idea was likewise skipped at three
  sites. Adopt `SignedAmountInput` opportunistically where a raw inline
  parse+sign block is touched; a second shared hook on top of it would
  overconstrain the diverging commit timings.

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
  **Superseded 2026-06-11**: the loans sheet type landed and consumed
  `property-mortgage/interest.ts` / `payment.ts` across the page-directory
  boundary — the concrete version of this candidate became the
  "shared financial math" row, which landed 2026-06 as the
  `src/data/finance/` hoist (see Landed).

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

- **`Property.accountId: ?: string | null` "inconsistency"** (2026-06,
  Explore sweep rated it 4): flagged because `Property.accountId`
  (`src/data/types/properties.ts:299`) uses `?: string | null` while the
  sibling `accountId?: string` at `:192` doesn't. Rejected on re-read: the
  two are **different fields with different semantics**, both correctly
  encoded per the `AGENTS.md` "Optional fields" contract. Line 299 is the
  documented `?: T | null` "explicitly cleared vs never set" case — its own
  comment says "Nullable until the user picks one (mirrors
  `SalaryView.accountId`); a dangling reference … is dropped to `null` on
  load rather than rejecting the file." Line 192 is the repair-source
  locator (paired with `sourceHistoryId`, "always set or cleared together",
  best-effort across re-imports) where absent is the right "not set". The
  agent misread the convention; there is nothing to fix.

- **`property-mortgage/discovery.ts` "monolith"** (2026-06, Explore sweep
  rated it 1–2; **re-opened 2026-06-11**): `discoverMortgagePayments()` was
  ~297 lines (`discovery.ts:335`–`:632`) and a clean linear funnel, below the
  fix threshold, with a recorded trigger: "re-rate only if it crosses ~350
  lines, at which point the candidate-building phase is the natural
  extract." The trigger fired — loan-linking growth pushed the function to
  ~395 lines — so the candidate moved back to **Pending** (severity 3) on
  the 2026-06-11 sweep, and the decomposition **landed 2026-06** (see
  Landed).

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
- 2026-06 sweep (Explore mode): single **component-layer audit** angle
  (three parallel Explore agents over `src/components/AppShell/` + the
  universal chrome, `src/components/budget/`, and
  `src/components/accounts|salary|items` + `SettingsModal`). Re-confirmed
  the cross-cutting greps stay clean (native `<select>`,
  `data`/`storage` → `components` imports, type-safety holes — the only
  `as unknown as` pocket is four contained generic-key casts in
  `data/action-summary.ts`, sev 2, left alone). Added four candidates:
  `useLongPress` extraction (4 sites — `BottomBar`, `BudgetAddEntryButton`,
  `BudgetRow`, `DescriptionCell`), the `useSalaryBulkSelection`
  misplacement, the salary custom-picker shell duplication (5), and the
  `FormSection` adoption easy-win. **Corrected the stale
  `useAdminUIState` row**: the triple-`useState` is at **four** admin
  sites, not the one the last sweep recorded — re-rated 4 → 5 and moved
  to the friction band. Filtered the Explore over-ratings into
  Investigated-and-skipped: the registry-based sheet-type router (rated 8,
  contradicts the documented routing-switch intent), the `modalHandlers`
  re-mint (rated 6, a `find-optimizations` concern), and the
  `useAmountInput` hook (rated 5, largely pre-empted by the existing
  `form/SignedAmountInput.tsx`). Several cosmetic non-starters were
  dropped without a row (Tailwind `h-7 w-7` sizing and `duration-200` are
  not theming-token violations; splitting the modal hosts further inverts
  the in-progress host-colocation item).
- 2026-06 sweep (Explore mode): single **properties-subsystem audit** angle
  (two parallel Explore agents over `src/components/properties/` + the
  root-level `AttachmentUploadModal.tsx`, and over
  `src/data/property-mortgage/` + `usePropertyAttachments.ts` + the
  properties registry/validator wiring) — the whole ~7.5k-line properties
  page tree and ~1k-line property-mortgage data layer landed after the prior
  sweeps and had never been catalogued. The data layer came back **clean**:
  no data→components imports (the `usePropertyAttachments` mentions in
  `useReceiptManager` / `data/receipts/target.ts` are comments, not
  imports), the `PROPERTIES_SHEET_DESCRIPTOR` participates fully in the
  sheet-type registry (validate / itemTypes / createDefaultItem; `reduceItem`
  / `rowsForItem` correctly omitted since properties are global, not
  row-shaped), financial primitives (interest / amortization / payment /
  progress) are isolated and non-duplicated, and the type-safety /
  native-`<select>` / hardcoded-string / hardcoded-hex greps were all clean.
  Added four candidates: the `usePropertyAttachments` + `PropertyFileMeta`
  placement (4, easy-win-flavoured), `PropertiesPage` modal-state
  fragmentation (4, 18 `useState`), the `RepairsEditModal` / `ManualRepairModal`
  field-trio duplication (4), and the six-site date-input class string (3).
  Folded the rest into existing rows rather than inflating Pending:
  `FileCategoryPicker` is a fourth site on the salary-pickers
  shell-consolidation item (re-titled "four custom pickers"); the five
  property editor-modal `useState` pyramids are named sites on the
  opportunistic `useReducer` item; the un-adopted `FormSection` label-stack
  is a rich seam noted on the existing easy-win. Filtered two Explore
  over-ratings into Investigated-and-skipped: the `Property.accountId`
  `?: string | null` "inconsistency" (rated 4 — actually the documented
  `?: T | null` convention) and the `discovery.ts` "monolith" (rated 1–2 — a
  well-decomposed linear funnel). `AttachmentUploadModal.tsx` confirmed
  correctly placed at root (imported by salary / items / properties — genuinely
  universal).
- 2026-07-01 sweep ("clear and explore"): full Pending re-verify plus a
  single **post-v1.4→v1.6 new-subsystems** survey angle (three parallel
  Explore agents over scenarios + insights, the cross-account duplicate
  finder + suggestion surfaces, and the new storage modules — 139 commits
  had landed since the 2026-06-11 sweep). Re-verify outcomes: the
  four-pickers row's design-pass blocker was discharged by the landed
  `EntityPickerShell` (re-rated 4 → 5); the update-balance quartet's
  fifth-surface trigger fired via `UpdateItemValueModal` (re-rated 4 → 5,
  moved to the friction band); the cloud-adapter closures re-rated 4 → 5
  on +34% / +51% adapter growth from per-kind sibling-file ops; AppShell
  refreshed at 1436 lines (feature wiring — five new sheet-type arms —
  with the `useSearchModal` blocker unchanged); the discovery-walk row
  gained the duplicate finder as its eighth walk / sixth engine; the
  `useState`-pyramid counts refreshed (all grown: `PropertyEditorModal`
  14, `MortgageEditorModal` 12, `NetSaleProfitModal` 11). Cross-cutting
  greps stayed clean (native `<select>` 0, `as any` / `@ts-*` 0 real,
  data→components import direction 0 real; the one new `as unknown as`
  is the contained `segments.ts:145` cast). New candidates: the
  `networth.ts` contributor walk (6), the cross-page data-module
  placement drift (4), the `ScenariosPage` modal-selector union (4), and
  the byte-layer wrapper factory (3). Filtered into Investigated and
  skipped: `ScenarioRow`/`BudgetRow` unification (rated 5 — divergence is
  the domain), three scan-cost findings (rated 6 — `find-optimizations`
  territory), the silent watch-error drop (rated 4 — a feature, not a
  refactor), the `segments.ts` dead-code deletion (rated 3 — intentional
  staging), and a generic discovery-scaffold re-proposal. Scenarios /
  insights otherwise came back structurally clean: full
  `SHEET_TYPE_REGISTRY` participation, pure data layer, `FormSection`
  adopted from day one.
- 2026-06-11 sweep (Explore mode): single **cross-page duplication** angle
  (three parallel Explore agents — the never-catalogued loans + savings
  subsystems, cross-page UI patterns across all seven page directories, and
  the new data-layer subsystems `loans` / `savings` / `items` / `receipts` /
  `property-repairs` / `property-transfer` / `property-value`). The new
  loans/savings pages came back **structurally clean**: full
  `SHEET_TYPE_REGISTRY` participation, correct adoption of
  `useRowSwipeAndClaim` / `useResetOnOpen` / `SelectPicker`, reducers with
  correct cascade semantics, and zero hits on the type-safety /
  native-`<select>` / hardcoded-string / hardcoded-hex / data→components
  greps. Validators, export builders, and value-series math also clean (the
  loans / savings / property-value series builders diverge intentionally).
  Added five Pending rows: the eight-site actions-menu shell (5), the
  discovery / candidate-walk cluster (5), the update-balance modal quartet
  (4), the shared-financial-math hoist (4, re-opening the `forecasting/`
  skip on its own stated condition), and the reducers `applyPatch`
  triplication (3); plus the `date-input.ts` → `form/` easy win (which fixes
  a live sibling-import rule violation at three loans/savings sites) and
  three new named sites on the opportunistic `useReducer` row (`LoanModal`
  14, `SavingsModal` 9, `SalaryBulkEditModal` 7). Moved the
  `discoverMortgagePayments` skip back to Pending — its recorded ~350-line
  re-rate trigger fired (now ~380 lines). Filtered the Explore over-ratings:
  the shared discovery-scan engine (rated 7 — kept at 5 as a design pass;
  the scoring genuinely diverges per engine), the chart-modal trio and
  import-modal pair (rated ≤2 — domain divergence is fundamental), the
  page-root scaffold and month/year grouping tables (1–2 — not
  genericisable), `LoanRow` vs `SavingsRow` (2 — divergence is the domain),
  and the `EMPTY_STATE_CLASS` constant (over-claimed — 4 hits in 2 files,
  dropped as cosmetic).
