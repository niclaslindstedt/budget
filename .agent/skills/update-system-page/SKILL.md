---
name: update-system-page
description: "Use when src/components/SystemPage.tsx may be stale relative to the user-facing feature set — or when the page does not yet exist and needs to be authored from scratch. The system page is a guided tour of every feature the app exposes, organised as a four-tier user journey (Beginner → Intermediate → Pro → Expert). This skill describes how to discover features from source, how to slot each one into the right tier, how to order them within a tier as a real user would discover them, and how to phrase the entry."
---

# Updating the system page

`src/components/SystemPage.tsx` renders at `/system` and is linked
from the burger menu next to Privacy and the changelog. It is a long-
form user guide — the only place inside the app where every feature
is explained in plain prose, in the order a real user would bump into
it. When new features ship and the page isn't updated, the page stops
matching the app the user is looking at.

This skill brings the system page back into sync with the feature
surface. It also covers the "first-time author" case: when the page
does not yet exist, follow the same discovery and authoring rules
top-to-bottom and write the file from scratch (mirroring
`src/components/PrivacyPage.tsx` for component shape and routing).

The page body is **intentionally not translated** (same treatment as
`PrivacyPage.tsx` per `AGENTS.md` → "What's intentionally not
translated"). Only chrome (page heading, "Got it" button, route
title) goes through `t()`. The instructional prose is English-only;
that keeps the page maintainable and avoids forcing a Swedish
rewrite every time a feature lands.

## Tracking mechanism

`.agent/skills/update-system-page/.last-updated` holds the git commit
hash of the last successful run. Empty means "never run" — fall back
to the repository's initial commit:

```sh
BASELINE=$(cat .agent/skills/update-system-page/.last-updated)
[ -z "$BASELINE" ] && BASELINE=$(git rev-list --max-parents=0 HEAD)
```

## Discovery process

The single best feature map in this codebase is
`src/i18n/locales/en.ts`. Every visible string flows through it, so
reading it top-to-bottom is the fastest way to enumerate the user-
facing surface. Components, data modules, and storage adapters then
fill in the _mechanics_ behind each string.

1. Compute the diff range since the baseline and list which feature-
   carrying paths moved:

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
   classify it.

### Mining order

Work the sources in this order — each layer answers a different
question:

| Source                                                                                                                                                                                                                                                         | Answers                                                              |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `src/i18n/locales/en.ts`                                                                                                                                                                                                                                       | What is the feature called in the UI? What are the exact menu paths? |
| `src/components/*.tsx` (modal / picker / page filenames)                                                                                                                                                                                                       | Where does the user trigger it? What does the surface look like?     |
| `src/components/SettingsModal/` tabs                                                                                                                                                                                                                           | Which behaviours are user-configurable, and under which tab?         |
| `src/data/reducer.ts` actions                                                                                                                                                                                                                                  | What can actually change state? Each action is a feature trace.      |
| `src/data/types.ts`                                                                                                                                                                                                                                            | What concepts (Sheet, Account, Entry, Rule, …) exist?                |
| `src/data/recurrence.ts`, `recurring-detection.ts`, `formula.ts`, `formula-resolve.ts`, `match-rules.ts`, `transfer-collapse.ts`, `reconciliation.ts`, `payday.ts`, `merchant-hints.ts`, `description-normaliser.ts`, `presets.ts`, `search.ts`, `coverage.ts` | The clever bits — what does the app _figure out_ on its own?         |
| `src/storage/bank-parsers.ts` + `bank-*.ts`                                                                                                                                                                                                                    | Which bank file formats are supported.                               |
| `src/storage/{local,folder,dropbox,gdrive}-adapter.ts`, `encrypting-adapter.ts`, `cloud-mirror.ts`, `backup-index.ts`                                                                                                                                          | What storage / sync / encryption / backup options exist.             |
| `src/hooks/useIdleSignOut.ts`, `useTheme.ts`, `useChangelogAutoOpen.ts`, `useDevMode.ts`, `useVirtualKeyboardInset.ts`                                                                                                                                         | Cross-cutting behaviours that aren't tied to one component.          |
| `CHANGELOG.md` + recent `git log`                                                                                                                                                                                                                              | The newest features — what landed since the last sweep.              |

Anything purely internal (validators, adapter interfaces, the
reducer plumbing itself, build-time plugins) does **not** get a
system-page entry. The rule is: if a user can't see it, name it, or
trigger it, leave it out.

## The tier rubric

The page organises every feature into four tiers. The tier of a
feature is decided by _what the user already had to understand_ to
reach it — not by how complex the feature is internally.

| Tier             | The user is …                                                    | Slot a feature here when it …                                                                                                                                                                                   |
| ---------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Beginner**     | New. Knows nothing. Just opened the app.                         | Is required to use the app at all, needs zero setup beyond a click, and works on a single empty sheet without any external data, accounts, or sync.                                                             |
| **Intermediate** | Has a working ledger. Wants it to match real finances.           | Adds _structure_ to the budget: real accounts, multiple sheets, recurring patterns, custom categories, bulk operations, search. Still pure-manual entry — no external data, no automation.                      |
| **Pro**          | Has a structured budget. Wants the app to do the boring work.    | Reaches outside the manual loop: imports bank files, learns patterns, auto-labels, reconciles forecasts against actuals, syncs to the cloud, encrypts, takes backups. Each item makes a tidy budget self-tidy.  |
| **Expert**       | Trusts the data model. Wants to bend the app to a specific case. | Is _not required_ for a healthy budget but unlocks edge cases: formulas, cross-sheet references, custom-interval recurrence, custom themes / fonts / motion settings, multi-user, developer mode / logs viewer. |

Tie-breakers:

- A feature that exists in multiple tiers conceptually (e.g. "edit a
  recurring entry") lives in the tier where it is first _needed_, not
  where it is first _possible_. The Intermediate user must edit
  recurring entries; the Pro user already does it by reflex.
- If you can't decide between two tiers, pick the lower one and
  rewrite the entry so it doesn't assume knowledge from the higher
  tier.
- Pure automatic safety nets (shrink guard, description normaliser,
  mobile keyboard inset) belong in the tier _where the user first
  benefits_ from them, with an "_(automatic — no action needed)_"
  parenthetical so the reader doesn't go hunting for a button.

## Ordering within a tier

Inside each tier, features are listed in the order a real user
discovers them. Imagine a single user passing through the tier and
ask: "what would they bump into next?" The answer determines the
position.

Practical sequencing heuristics:

1. **Start with the trigger that drops you into the tier.** Beginner
   opens with "use it as a guest, or sign up", because that's
   literally the first decision. Intermediate opens with "create a
   real account", because that's the move that converts a play
   ledger into a real one. Pro opens with the first bank import.
   Expert opens with formulas.
2. **Follow the natural causal chain.** Each feature should make the
   _next_ feature feel obvious. Creating an account → linking the
   sheet → setting payday → adding more sheets → using the accounts
   overview. Don't list the dashboard before the user has accounts.
3. **Group features that share a setup.** Cloud sync (Folder /
   Dropbox / Drive) goes together; encryption immediately follows
   because the user just picked a cloud and is now thinking about
   trust. Backups follow encryption because they ride on the cloud
   the user just connected.
4. **Tail-end each tier with the "you have this but rarely need it"
   features.** Encrypted JSON export at the end of Pro; account
   deletion at the end of Expert. They're real features but they're
   not part of the journey forward.

End every tier with a single-line "_You've graduated when:_"
callout that names the observable state the user reaches when the
tier is complete. The callout is the bridge to the next tier.

## Voice and formatting conventions

The system page is the friendliest text in the app. Match the tone
to a curious friend explaining one feature at a time.

- **Second person, present tense, active verbs.** "Click", "drop",
  "tick", "tap" — never "the user can" / "it is possible to".
- **Open each entry with the user's situation, not the feature's
  name.** "Made a mistake? ⌘Z walks back the last action." not
  "**Undo** — pressing ⌘Z reverses an action."
- **Bold the feature name inline** so the page is skimmable as a
  list of bolded headwords with prose tails.
- **Name the concrete trigger.** Menu path (`Settings → Storage →
Encrypt`), gesture (long-press a sheet tab), or shortcut (⌘Z,
  ⌘⇧Z). Pull menu labels verbatim from `src/i18n/locales/en.ts` so
  the page matches what the user is looking at.
- **One or two sentences per feature.** First sentence states the
  mechanic; second sentence (optional) explains _why a tidy
  budgeter reaches for it_. Don't pad — the catalog is long and
  every padded sentence taxes the next one.
- **No code references in user-visible text.** Never mention file
  names, types, hooks, reducer action names, or feature flags. The
  system page is for users, not for agents reading the source.
- **No tier-leaks.** A Beginner entry must not assume the user has
  done anything from Intermediate. If you need to mention a
  higher-tier concept ("once you've imported a bank statement…"),
  the entry belongs in the higher tier.
- **No emojis** unless they were already in the codebase (e.g. the
  `+ / − / ◆` type-direction markers stay because the type picker
  shows them literally).
- **Headings**: one `<h2>` per tier. Numbered list inside. The
  per-tier graduation callout is a `<blockquote>` or a styled
  `<aside>`, whichever the existing component shape supports.

## Source → tier slotting cheatsheet

A starting map for the most common code surfaces. Use this as a
default; override it when the journey ordering inside a tier
disagrees.

| Source area                                                                                                                                                                                                                                                   | Default tier |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| `App.tsx` (auth screen, guest mode, switch user), `SheetView.tsx` row / cell editing, `SheetRow.tsx` completed checkbox, `MonthTable.tsx` today pill                                                                                                          | Beginner     |
| `TypePicker.tsx`, `CategoryPicker.tsx`, `GlyphPicker.tsx`, `ColorPalette.tsx` (consumed at the basic level — assigning a type to a row)                                                                                                                       | Beginner     |
| `ImportExportControls.tsx` JSON export / import, theme + language settings, changelog modal, privacy page link                                                                                                                                                | Beginner     |
| `AccountModal.tsx`, `AccountsSheetView.tsx`, `SheetModal.tsx` (creating real accounts, linking sheets, payday), `TransactionModal.tsx`, `UpdateBalanceModal.tsx`                                                                                              | Intermediate |
| `BulkEditModal.tsx`, `MoveCopyModal.tsx`, `SplitEntryModal.tsx`, `EditEntryModal.tsx`, `ApplySeriesEditDialog.tsx`, `RecurrenceForm.tsx` (recurring entry basics)                                                                                             | Intermediate |
| `EntityCreatorForm.tsx`, category / type visibility, `SettingsModal/` Numbers tab, column picker, hide-transfers, `TransactionSearchModal.tsx`, `SheetViewerModal.tsx`                                                                                        | Intermediate |
| `ImportHistoryModal.tsx`, `bank-*.ts` parsers, `MatchRuleModal.tsx`, `HistoryModal.tsx`, `RecurringCandidatesPanel.tsx`, `ReconciliationModal.tsx`, `TransferCollapseModal.tsx`                                                                               | Pro          |
| `ActionHistoryModal.tsx`, `DownloadModal.tsx` (CSV / Excel), encrypted JSON export                                                                                                                                                                            | Pro          |
| `BackendPicker.tsx`, `CloudLinkDialog.tsx`, `folder-adapter.ts`, `dropbox-adapter.ts`, `gdrive-adapter.ts`, `encrypting-adapter.ts`, `cloud-mirror.ts`, `CloudBackupModal.tsx`, `ConflictResolutionModal.tsx`, `ReconnectCloudModal.tsx`, `useIdleSignOut.ts` | Pro          |
| `FormulaInput.tsx`, `FormulaHelpButton.tsx`, `FormulaVariableHelper.tsx`, `data/formula.ts`, `formula-resolve.ts`, `ComplexEntryModal.tsx`                                                                                                                    | Expert       |
| Recurrence edge cases (last-day-of-month, custom interval), `coverage.ts`, match-rule amount-range / transfer-flag filters                                                                                                                                    | Expert       |
| Custom theme tokens, font family, reduce motion, multi-user, `useDevMode.ts`, logs viewer, backend switcher version-preview, account deletion                                                                                                                 | Expert       |

When a new feature lands that doesn't fit any row, decide using the
tier rubric and add a row.

## Update checklist

- Read `BASELINE` and run the discovery commands above.
- Walk the changed paths. For each one, ask: _does this change the
  user-facing feature surface?_ If yes, classify it with the tier
  rubric and slot it into the journey using the ordering heuristics.
- Open `src/components/SystemPage.tsx` (create it if it doesn't
  exist yet, mirroring `PrivacyPage.tsx` for component shape and
  `main.tsx` routing wiring). Apply the diff:
  - Add new features as new numbered list items at the right tier
    position. Don't append to the end of a tier by reflex — find the
    causal-chain spot where the new feature would naturally surface.
  - Rewrite an existing entry when the underlying mechanic changed
    (a button moved, a shortcut changed, a setting was renamed).
    Pull the new wording from `src/i18n/locales/en.ts` verbatim.
  - Remove an entry when the feature was removed from the app.
  - Update the "_You've graduated when:_" callout if the tier's
    observable end-state moved.
- Cross-check menu paths against `src/i18n/locales/en.ts` — the
  literal label in the catalog beats whatever the previous draft
  said.
- If the page itself was just created, wire it up:
  - Add a route in `src/main.tsx` (or wherever `PrivacyPage.tsx` is
    routed) and an alias entry in the SEO route table at
    `src/seo/routes.ts`.
  - Add a link to the burger menu (`HeaderMenu.tsx`) next to
    Privacy / Changelog.
  - Add a link from the Settings footer.
  - Mirror `PrivacyPage.tsx`'s `LAST_UPDATED` constant pattern so
    readers see when the page last moved.
- Run `make fmt`, `make lint`, `make typecheck`, and `make test`.
- Rewrite the tracking file:

  ```sh
  git rev-parse HEAD > .agent/skills/update-system-page/.last-updated
  ```

## Verification

1. Every changed source path from the discovery run is reflected in
   the system page, or has been intentionally skipped because it
   isn't user-facing.
2. Every menu path / button label / setting name in the page appears
   verbatim somewhere in `src/i18n/locales/en.ts`.
3. No tier-leak: Beginner entries do not reference Intermediate
   concepts, Intermediate does not reference Pro, Pro does not
   reference Expert. The page reads top-to-bottom without ever
   forward-referencing.
4. Each tier ends with a "_You've graduated when:_" callout.
5. `make fmt-check`, `make lint`, `make typecheck`, and `make test`
   pass.
6. If the page is reachable in a `make preview-build`, the route
   loads and the burger-menu link resolves.
7. `.agent/skills/update-system-page/.last-updated` contains the
   current `HEAD`.

## Skill self-improvement

After a run:

1. **Grow the slotting cheatsheet** whenever a new component / data
   module lands that doesn't fit an existing row. The cheatsheet is
   the institutional memory — it's how the next run knows where a
   feature should go without re-deriving the tier rubric.
2. **Record sequencing decisions you had to think about** as a
   one-line note. If you spent a minute deciding "encryption goes
   before backups, not after", add it so the next run inherits the
   ruling.
3. **Refine the tier rubric** if a feature genuinely doesn't fit any
   of the four buckets and you had to invent a fifth criterion to
   place it. Don't add a fifth tier — refine the existing rubric so
   the feature lands cleanly.
4. **Commit the skill edit** alongside the system-page edits.
