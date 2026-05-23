---
name: update-achievements-page
description: "Use when src/data/achievements/catalog.ts is stale relative to a newly-shipped user-facing feature — or when a fresh achievement needs to be added, a trigger predicate rewritten, or the AchievementsModal chrome touched. The achievements modal (src/components/AchievementsModal.tsx) is a fullscreen four-tier (Beginner → Intermediate → Pro → Expert) guided tour where every feature is also an unlockable trophy. This skill describes how to add a new achievement, how to slot it into the right tier, how to phrase it (in English AND Swedish), and how to wire its trigger so the unlock fires when the user does the thing."
---

# Updating the achievements catalog and modal

The achievements system lives in three places that must stay in
lockstep:

- **The catalog** at `src/data/achievements/catalog.ts` — `id`,
  `tier`, `glyph`, optional `hasLearnMore` flag, and the unlock
  `trigger`. No display strings here.
- **The i18n keys** under `achievements.catalog.<id>.{name,
condition, learnMore?}` in both `src/i18n/locales/en.ts` and
  `src/i18n/locales/sv.ts`. The renderer composes the lookup at
  render time as `t(\`achievements.catalog.${id}.name\` as
  MessageKey)`.
- **The modal** at `src/components/AchievementsModal.tsx` (and the
  short toast at `AchievementUnlockModal.tsx`) — both reach into
  the catalog by `id` and pull display strings via `t()`. New
  catalog entries appear automatically without touching either
  component.

When a user-facing feature ships and the catalog isn't updated, the
achievements list silently lies about what the app can do.

This skill brings the catalog and its i18n shadow back into sync
with the feature surface, and covers the "adding a fresh
achievement" case end to end.

Every catalog entry is fully translated. The Swedish catalog at
`src/i18n/locales/sv.ts` mirrors `en.ts` key-for-key; the runtime
catalog-parity test (`tests/i18n_catalog_test.ts`) fails the build
when an `en.ts` key is missing or empty in Swedish.

## Tracking mechanism

`.agent/skills/update-achievements-page/.last-updated` holds the git
commit hash of the last successful run. Empty means "never run" —
fall back to the repository's initial commit:

```sh
BASELINE=$(cat .agent/skills/update-achievements-page/.last-updated)
[ -z "$BASELINE" ] && BASELINE=$(git rev-list --max-parents=0 HEAD)
```

## Discovery process

The single best feature map remains `src/i18n/locales/en.ts`. Every
visible string flows through it, so reading it top-to-bottom is the
fastest way to enumerate the user-facing surface. Components, data
modules, and storage adapters fill in the _mechanics_ behind each
string.

1. Compute the diff range since the baseline and list which
   feature-carrying paths moved:

   ```sh
   git log --oneline "$BASELINE"..HEAD -- \
       src/i18n/locales/ src/components/ src/data/ src/storage/ \
       src/hooks/ CHANGELOG.md
   git diff --name-only "$BASELINE"..HEAD -- \
       src/i18n/locales/ src/components/ src/data/ src/storage/ \
       src/hooks/
   ```

2. For each changed path, decide whether it introduced, removed, or
   reshaped a user-facing feature. Use the mining order below to
   classify and slot it.

### Mining order

Work the sources in this order — each layer answers a different
question:

| Source                                                                                                                                                                                                                                                         | Answers                                                              |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `src/i18n/locales/en.ts`                                                                                                                                                                                                                                       | What is the feature called in the UI? What are the exact menu paths? |
| `src/components/*.tsx` (modal / picker / page filenames)                                                                                                                                                                                                       | Where does the user trigger it? What does the surface look like?     |
| `src/components/SettingsModal/` tabs                                                                                                                                                                                                                           | Which behaviours are user-configurable, and under which tab?         |
| `src/data/reducer.ts` actions                                                                                                                                                                                                                                  | What can actually change state? Each action is a potential trigger.  |
| `src/data/types.ts`                                                                                                                                                                                                                                            | What concepts (Sheet, Account, Entry, Rule, …) exist?                |
| `src/data/recurrence.ts`, `recurring-detection.ts`, `formula.ts`, `formula-resolve.ts`, `match-rules.ts`, `transfer-collapse.ts`, `reconciliation.ts`, `payday.ts`, `merchant-hints.ts`, `description-normaliser.ts`, `presets.ts`, `search.ts`, `coverage.ts` | The clever bits — what does the app _figure out_ on its own?         |
| `src/storage/bank-parsers.ts` + `bank-*.ts`                                                                                                                                                                                                                    | Which bank file formats are supported.                               |
| `src/storage/{local,folder,dropbox,gdrive}-adapter.ts`, `encrypting-adapter.ts`, `cloud-mirror.ts`, `backup-index.ts`                                                                                                                                          | What storage / sync / encryption / backup options exist.             |
| `src/hooks/useIdleSignOut.ts`, `useTheme.ts`, `useChangelogAutoOpen.ts`, `useDevMode.ts`, `useVirtualKeyboardInset.ts`                                                                                                                                         | Cross-cutting behaviours that aren't tied to one component.          |
| `CHANGELOG.md` + recent `git log`                                                                                                                                                                                                                              | The newest features — what landed since the last sweep.              |

Anything purely internal (validators, adapter interfaces, the
reducer plumbing itself, build-time plugins) does **not** get an
achievement. The rule is: if a user can't see it, name it, or
trigger it, leave it out.

## The tier rubric

Every achievement belongs to one of four tiers. The tier is decided
by _what the user already had to understand_ to reach it — not by
how complex the feature is internally.

| Tier             | The user is …                                                    | Slot an achievement here when it …                                                                                                                                                                              |
| ---------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Beginner**     | New. Knows nothing. Just opened the app.                         | Is required to use the app at all, needs zero setup beyond a click, and works on a single empty sheet without any external data, accounts, or sync.                                                             |
| **Intermediate** | Has a working ledger. Wants it to match real finances.           | Adds _structure_ to the budget: real accounts, multiple sheets, recurring patterns, custom categories, bulk operations, search. Still pure-manual entry — no external data, no automation.                      |
| **Pro**          | Has a structured budget. Wants the app to do the boring work.    | Reaches outside the manual loop: imports bank files, learns patterns, auto-labels, reconciles forecasts against actuals, syncs to the cloud, encrypts, takes backups. Each one makes a tidy budget self-tidy.   |
| **Expert**       | Trusts the data model. Wants to bend the app to a specific case. | Is _not required_ for a healthy budget but unlocks edge cases: formulas, cross-sheet references, custom-interval recurrence, custom themes / fonts / motion settings, multi-user, developer mode / logs viewer. |

Points are tier-uniform: Beginner 10 · Intermediate 25 · Pro 50 ·
Expert 100. New achievements inherit their tier's value
automatically through `TIER_POINTS`; don't define per-achievement
overrides.

Tie-breakers:

- An action that exists in multiple tiers conceptually (e.g. "edit a
  recurring entry") lives in the tier where it is first _needed_,
  not where it is first _possible_.
- If you can't decide between two tiers, pick the lower one.
- Skip any feature that doesn't have a clean unlock trigger
  (passive observations like "noticed the today pill"; meta-state
  like "opened the burger menu"). The catalog should never include
  ids the user can't actually earn.

## Achievement naming and phrasing

Each entry carries three text fields:

- **`name`** — playful, game-style, 1–3 words: _First Steps_,
  _Local Hero_, _Cloud Walker_, _Spellbinder_, _Paranoid Mode_.
  Capitalised as a proper noun. Lives in the achievement-card
  header and in the unlock modal.
- **`condition`** — descriptive sentence in the user's voice,
  ending with a period: "Add your first row.", "Write your first
  amount formula.", "Connect a cloud backend (Dropbox, Google
  Drive, or Folder).". Read aloud, it answers "how do I unlock
  this?".
- **`learnMore`** _(optional)_ — one short paragraph (two at most)
  expanding the why or naming adjacent features. Same shape as the
  Learn-more body on the legacy SystemPage. Leave undefined when
  the condition is genuinely self-explanatory.

Voice rules:

- **Second person, present tense, active verbs.** "Click", "tap",
  "tick" — never "the user can".
- **No code references in user-visible text** beyond user-typed
  tokens (`salary`, `endOfMonthBalance`, `.xlsx`, `budget.json`).
- **No tier-leaks.** A Beginner condition must not assume
  Intermediate context.
- **No emojis** unless the codebase already shows them (`+ / − / ◆`
  type direction markers are fine).

## How a new achievement gets added

When a freshly-shipped feature lands and you're updating the
catalog, follow these four steps:

1. **Author the entry** in `src/data/achievements/catalog.ts`. Pick
   a stable `id` (camelCase, never reused once shipped), drop it
   into the right tier section (Beginner/Intermediate/Pro/Expert),
   import the lucide glyph at the top of the file, and — if you
   want an expanded body — set `hasLearnMore: true`. The catalog
   entry holds no display strings; just the structural fields.

   Then add the matching i18n keys in **both** locales:

   ```ts
   // src/i18n/locales/en.ts under `achievements.catalog`
   newAchievementId: {
     name: "Pithy Name",
     condition: "Imperative one-liner answering 'how do I unlock?'",
     learnMore: "Optional expanded body (omit the key entirely when
       hasLearnMore is false on the catalog entry).",
   },
   ```

   Mirror the same three keys in `src/i18n/locales/sv.ts` with the
   Swedish translation. The `Catalog` type widens `en.ts`, so a
   missing Swedish key is a compile error (`make typecheck`); the
   runtime catalog test (`tests/i18n_catalog_test.ts`) catches any
   empty placeholder strings on top of that.

2. **Pick the trigger kind:**
   - `derived` — the achievement unlocks when a predicate over
     `(prev, next)` UserData flips from false to true. Use this
     whenever the feature mutates persisted state. Helper
     functions at the top of the catalog (`hasAnyUserRow`,
     `hasFormulaRow`, …) cover most needs; add a new one in the
     same style if your achievement needs a new state inspector.
     The watcher in `src/data/achievements/useAchievementWatcher.ts`
     picks it up automatically.
   - `manual` — the trigger is an imperative event outside the
     reducer (cloud connect, encryption toggle, button click,
     modal submit). The achievement won't fire by itself; you
     must add a call to `unlock("<id>")` at the chokepoint that
     fires the user's gesture. See examples in
     `src/components/BudgetView.tsx` (search, undo, history
     jump), `src/storage/useStorageBackend.ts` (cloud connects,
     encryption), and `src/App.tsx` (account creation).

3. **Wire the trigger:**
   - For `derived` triggers: write the predicate inside the
     catalog entry's `trigger` field. Two patterns dominate:
     `(prev, next) => !hasX(prev) && hasX(next)` for "first
     time" transitions, and
     `(prev, next) => prev.settings.foo !== next.settings.foo`
     for "the user changed a setting".
   - For `manual` triggers: add `import { unlock } from
"../data/achievements";` (or relative equivalent) and call
     `unlock("<id>")` at the chokepoint. The bus dedupes, so
     accidental double-fires are safe.

4. **Test:**
   - Add a case to `tests/achievements_derive_test.ts` for derived
     triggers. The helpers in that file (`withItem(rows)`,
     `baseState()`) keep the boilerplate manageable.
   - For manual triggers, the dispatch path is exercised in
     `tests/achievements_reducer_test.ts`; a tested chokepoint
     gives high confidence without a per-id test.
   - Run `make typecheck && make test`.

## Modal shape

`src/components/AchievementsModal.tsx` exports the modal and two
internal components — `<TierSection>` and `<AchievementRow>` — that
render the catalog. New entries appear automatically without
touching the modal itself.

- **`<TierSection>`** — one per tier (Beginner / Intermediate /
  Pro / Expert). Reads the tier glyph from `TIER_GLYPH` inside the
  file (`Sprout` / `Compass` / `Workflow` / `Wand2`) and pulls the
  title, subtitle, and "Tier mastered when:" graduation line via
  `t(\`achievements.modal.tier.${tier}.{title,subtitle,
  graduation}\`)`. The header also shows running
`tierEarned / tierMax pts` so users see their tier progress at a
  glance.
- **`<AchievementRow>`** — one per catalog entry. Pulls `name`,
  `condition`, and (when `hasLearnMore`) `learnMore` from the i18n
  catalog. Renders as a `<details>` element with two visual states:
  - **Locked** — greyed-out border + lock icon, muted text,
    points pill still visible so the user knows what's on offer.
  - **Unlocked** — colored border + tier glyph, bright text,
    points pill, and a checkmark.
  - If `hasLearnMore` is true, the row shows a "Learn more"
    chevron in the summary; clicking expands the body.
- **`<HeaderStar>`** lives in the BudgetView header. Empty
  (outline) star → opens `AchievementsModal`. Filled (yellow)
  star → opens `AchievementUnlockModal`. The star reads
  `data.settings.unseenAchievements.length` to decide its mode.
  Both modals live in the BudgetView subtree so they read straight
  from React state — no localStorage scraping.
- **`<AchievementUnlockModal>`** — short `centered` modal that
  lists the unseen unlocks (also pulls names + conditions from
  i18n). On close, dispatches `clearUnseenAchievements`; the star
  then empties.

The `LucideIcon` type rule (`import type { LucideIcon } from
"lucide-react"`) is shared across the catalog and the modal.

## Source → tier slotting cheatsheet

A starting map for the most common code surfaces. Use this as a
default; override it when the achievement is genuinely closer to
the tier above or below.

| Source area                                                                                                                                                 | Default tier |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| `App.tsx` (auth screen, guest mode, switch user), `SheetView.tsx` row / cell editing, `SheetRow.tsx` completed checkbox, `MonthTable.tsx` today pill        | Beginner     |
| `TypePicker.tsx`, `CategoryPicker.tsx`, `GlyphPicker.tsx`, `ColorPalette.tsx` (basic uses — assigning a type to a row)                                      | Beginner     |
| `ImportExportControls.tsx` JSON export / import, theme + language settings, changelog modal, privacy page link                                              | Beginner     |
| `AccountModal.tsx`, `AccountsSheetView.tsx`, `SheetModal.tsx`, `TransactionModal.tsx`, `UpdateBalanceModal.tsx`                                             | Intermediate |
| `BulkEditModal.tsx`, `MoveCopyModal.tsx`, `SplitEntryModal.tsx`, `EditEntryModal.tsx`, `ApplySeriesEditDialog.tsx`, `RecurrenceForm.tsx`                    | Intermediate |
| `EntityCreatorForm.tsx`, Settings Numbers tab, column picker, hide-transfers, `TransactionSearchModal.tsx`, `SheetViewerModal.tsx`                          | Intermediate |
| `ImportHistoryModal.tsx`, `bank-*.ts` parsers, `MatchRuleModal.tsx`, `HistoryModal.tsx`, `RecurringCandidatesPanel.tsx`, `ReconciliationModal.tsx`          | Pro          |
| `ActionHistoryModal.tsx`, `DownloadModal.tsx` (CSV / Excel), encrypted JSON export                                                                          | Pro          |
| `BackendPicker.tsx`, cloud adapters, `encrypting-adapter.ts`, `cloud-mirror.ts`, `CloudBackupModal.tsx`, `ConflictResolutionModal.tsx`, `useIdleSignOut.ts` | Pro          |
| `FormulaInput.tsx`, `FormulaHelpButton.tsx`, `FormulaVariableHelper.tsx`, `data/formula.ts`, `formula-resolve.ts`, `ComplexEntryModal.tsx`                  | Expert       |
| Recurrence edge cases (last-day, custom interval), `coverage.ts`, match-rule amount/transfer filters                                                        | Expert       |
| Custom theme tokens, font family, reduce motion, multi-user, `useDevMode.ts`, logs viewer, backend switcher version-preview, account deletion               | Expert       |

When a new feature lands that doesn't fit any row, decide using the
tier rubric and add a row.

## Update checklist

- Read `BASELINE` and run the discovery commands above.
- Walk the changed paths. For each one, ask: _does this introduce a
  feature worth an achievement?_ If yes, follow the four-step add
  process above. If a shipped feature no longer exists, remove its
  catalog entry AND drop the matching `achievements.catalog.<id>.*`
  block from both `en.ts` and `sv.ts` (stable ids are write-once,
  so removal is the right move — never repurpose).
- Cross-check chrome strings against `src/i18n/locales/en.ts` /
  `sv.ts` — every visible label in the modal flows through `t()`.
- Run `make fmt`, `make lint`, `make typecheck`, and `make test`.
- Rewrite the tracking file:

  ```sh
  git rev-parse HEAD > .agent/skills/update-achievements-page/.last-updated
  ```

## Verification

1. Every changed source path from the discovery run is reflected in
   the catalog, or has been intentionally skipped because it isn't
   user-facing.
2. Every catalog entry's `trigger` is wired: derived predicates
   have a corresponding state inspector or settings comparison;
   manual triggers have an `unlock("<id>")` call somewhere
   reachable from the user gesture.
3. `make fmt-check`, `make lint`, `make typecheck`, and `make test`
   pass.
4. `make build` succeeds; the modal opens in `make preview-serve`
   from the outline header star; adding a row in the preview fills
   the star yellow and the unlock toast lists the new entry.
5. `.agent/skills/update-achievements-page/.last-updated` contains
   the current `HEAD`.

## Skill self-improvement

After a run:

1. **Grow the slotting cheatsheet** whenever a new component / data
   module lands that doesn't fit an existing row. The cheatsheet is
   the institutional memory.
2. **Grow the predicate helpers** in `catalog.ts` whenever a new
   "first time" detection needs a state inspector that doesn't yet
   exist. Helpers are pure functions, easy to add, and reused
   across multiple catalog entries.
3. **Record naming rulings** that came up during the run (when a
   playful name took longer than a minute to pick, write a
   one-liner here so the next run inherits it).
4. **Commit the skill edit** alongside the catalog edits.
