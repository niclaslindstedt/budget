---
name: refactor
description: "Use to work through the refactor backlog in docs/refactoring-roadmap.md or to extend it with newly-discovered code smells. Picks the highest-leverage pending item, re-verifies its severity against the current tree (line counts and the smell shape drift over time), and either lands the fix, skips it with a written reason, or extends the roadmap when exploration mode finds something new. Grounded in the roadmap — stops when the queue is empty rather than refactoring for its own sake."
---

# Working the refactor roadmap

`docs/refactoring-roadmap.md` is the single source of truth for what
this codebase considers a code smell worth fixing. It carries:

- a strategic-context section explaining why the smells matter
  (incoming feature wave: savings, investment, scenario, analysis,
  prognosis, loans sheets; more bank parsers; possible React Native
  / desktop wrappers);
- a **severity rubric** (1–10, with **3** as the fix threshold and
  an "easy wins" carve-out for mechanical zero-risk transforms);
- a **Pending** list grouped by severity band, with line counts and
  refactor plans;
- a **Landed** list of past fixes;
- an **Investigated and skipped** list of candidates rejected on
  prior sweeps, with the reasoning.

This skill is the operating procedure for that file. There are two
modes:

- **Work mode** — pick the highest-leverage pending item, verify,
  land it (or skip it with a reason).
- **Explore mode** — survey the codebase for smells the roadmap
  hasn't catalogued yet, rate them, and append them to **Pending**.

The skill is **grounded**: every action references a specific row in
the roadmap. Don't refactor code that isn't on the list — file a
finding under Explore mode first, get it rated, then land it on a
follow-up pass. **Don't keep going once Pending is empty.** A clean
roadmap means we're ready for the feature wave; the next session
will re-survey before adding anything new.

## Modes — pick one per invocation

Pick at session start; don't blend the two within one PR. Each PR
carries a single item from one mode.

- **Work mode** (default): user asked you to "work the refactor
  backlog", "do the next refactor", "land another item". Run the
  **Work-mode loop** below.
- **Explore mode**: user asked you to "find more refactor
  candidates", "do another sweep", "extend the roadmap". Run the
  **Explore-mode loop** below.

If the user is ambiguous ("can you clean up the codebase?"), ask
which mode they want before doing anything. The cost of guessing
wrong is a PR pointed at the wrong outcome.

## Work-mode loop

### 1. Open the roadmap and pick a candidate

```sh
$EDITOR docs/refactoring-roadmap.md
```

Look at **Pending**. Pick the **highest-severity** item the current
session can plausibly land in one PR. Tie-break:

1. **Architectural blockers first** (severity 9–10). These gate the
   feature wave; everything else can wait.
2. **Easy wins** at any severity (mechanical moves, helper
   extractions with N≥3 call sites, type-only edits). The roadmap
   has an explicit "Easy wins" list at the bottom of Pending.
3. **Severity 7–8 multipliers** next.
4. **Severity 5–6 friction** if the harder bands are blocked or
   already in flight on another branch.
5. **Severity 3–4** opportunistically — usually as a drive-by while
   touching the file for other reasons.

If you can't pick one — e.g. every remaining 9-band item requires
a smoke-test surface (cloud backends) you can't reach in this
environment — tell the user, surface the constraint, and ask
whether to drop to a lower band or do an Explore-mode sweep
instead.

### 2. Re-verify before touching code

The roadmap goes stale between sweeps. Confirm the candidate is
still real:

```sh
# Line counts shift; the severity rubric reads them as a proxy for
# "size of the affected surface". Refresh the count for any file
# the candidate names.
wc -l <files-the-candidate-touches>

# Grep for the exact smell shape — a candidate that called out
# "20 useState calls in the modal" can quietly evaporate if an
# earlier PR converted the modal to useReducer. Don't take the
# roadmap's word for it; re-read the file.
grep -n '<the-pattern>' <files>
```

If the smell has shrunk meaningfully (e.g. file dropped under 500
lines, the duplication is now at 2 call sites instead of 8),
**re-rate** before doing anything. A candidate that drifts from
7/10 to 3/10 may still be worth landing but the plan probably needs
updating too. If it drifts to 1/10, move it to **Investigated and
skipped** with "smell decayed naturally — re-evaluate if N call
sites grow again" and stop.

### 3. Land the refactor

Follow the per-candidate **Plan** in the roadmap as the starting
point, but the plan is allowed to be wrong — if you discover a
better seam while reading the code, use the better one and amend
the roadmap entry in the same PR so the next agent sees the
corrected shape.

Refactor rules:

- **No behaviour changes.** Pure refactors. A refactor PR that
  also adjusts UX is two PRs in a trench coat — split it.
- **Hold the line on size**: each refactor PR should aim for
  <500 lines of diff. The roadmap entry may describe a 2000-line
  end state; that's fine, but ship it as a sequence of small PRs
  each of which leaves the code working. The 2-PR plan on
  `useUserDataStorage.ts` (reducer split → sibling hook
  extraction) is the model.
- **Run the typechecker and tests.** `make lint && make test`
  before opening the PR. For storage-layer refactors also run
  `make e2e` if the harness is available.
- **Smoke-test the storage hot path** (`useStorageBackend.ts`,
  `useUserDataStorage.ts`, the adapters, `cloud-mirror.ts`)
  manually against IDB + Dropbox + GDrive + Folder before merging.
  The roadmap calls these out explicitly because automated tests
  don't cover the OAuth flow.

### 4. Update the roadmap in the same commit

Edit `docs/refactoring-roadmap.md` to reflect the new state:

- **Move the row from Pending to Landed.** One-line summary plus
  the date (`YYYY-MM`). If the change shipped as a multi-PR plan
  and only step 1 landed, leave the candidate in Pending with the
  scope narrowed (mark step 1 done, describe step 2's remaining
  shape).
- **If the smell decayed mid-refactor** — e.g. you discovered the
  problem is smaller than the roadmap claimed — drop the severity
  in the moved row and note "narrower than expected" in the
  Landed line.
- **If you discovered a related smell while reading the code**,
  add a Pending row in the right severity band. Don't fix it in
  the same PR.

The roadmap edit is **part of the refactor PR**, not a follow-up.
A PR that lands the code change without updating the roadmap will
silently re-propose the same work on the next sweep.

### 5. Write the changeset / changelog fragment

A refactor PR is rarely user-visible — by definition there should
be no behaviour change. Invoke the `write-changeset` skill anyway;
its decision tree handles "pure refactor with no user-visible
effect" by labelling the PR `no-changelog`. Don't try to write a
changelog entry for a refactor.

### 6. Stop when Pending is empty

If Pending has no rows left (across every severity band), the
refactor sweep is **done**. Don't invent new items to keep going.
Tell the user the backlog is empty and recommend either:

- starting the feature wave (the whole point of this sweep was to
  clear the runway for it); or
- running this skill in **Explore mode** to look for new smells
  that emerged since the last sweep.

## Explore-mode loop

This mode extends the roadmap. The cost of a bad refactor is high;
the cost of a bad roadmap entry is low (it just sits in Pending
until someone re-rates it). So Explore mode is more permissive
about flagging — but every entry gets a rating, a file path, and a
sentence explaining **why it blocks the feature wave**. No
ratings-by-vibe.

### 1. Read the roadmap first

Before exploring, skim the existing Pending / Landed / Investigated
lists so you don't re-propose what's already there. **Investigated
and skipped is especially important** — it tells you the smells
that look real but were rejected on closer reading, and the
reasoning that rejected them. Don't re-propose a skipped item
unless you can explain what changed (e.g. the call-site count
grew, the divergent semantics finally converged).

### 2. Pick a survey angle

You can't audit everything in one session. Pick a frame and stick
to it:

- **Largest files first.** `find src -type f \( -name "*.ts" -o
-name "*.tsx" -o -name "*.css" \) -exec wc -l {} + | sort -rn |
head -40` — read each ≥500-line file with the rubric in mind.
- **Per-layer audit.** Read every file in `src/data/`, or every
  file in `src/storage/`, or every file in `src/components/budget/`.
  Look for shape mismatches: budget logic in the universal layer,
  page-specific code in `src/components/` root, duplicated logic
  across siblings.
- **Cross-cutting patterns.** Grep for repeated boilerplate
  (reset-on-open `useEffect`, JSON `parse → cast` pairs, inline
  `parseFloat`, hardcoded user strings inside JSX, native
  `<select>`). For each pattern, report N≥3 example files with
  line numbers.
- **Direction-of-dependency check.** `grep -rn
"from.*components" src/storage src/data` — any hit is a real
  smell because `AGENTS.md` forbids it.
- **Type-safety holes.** `grep -rn "as any\|as unknown
as\|@ts-ignore\|@ts-expect-error" src/` — each hit is at least
  severity 3.
- **AGENTS.md rule sweep.** Pick one rule (e.g. "No hardcoded
  user-facing strings" or "Always use custom dropdowns") and grep
  the codebase for violations.

Delegate broad sweeps to `Agent(subagent_type: "Explore")` with a
self-contained brief — Explore-mode surveys produce a lot of file
reads, and the parent context shouldn't carry every excerpt.

### 3. Rate each finding 1–10

Use the rubric in the roadmap:

| Band | What to look for                                                                                          |
| ---- | --------------------------------------------------------------------------------------------------------- |
| 9–10 | Architectural blocker. Persistence / correctness risk, or every new sheet type would bump into it.        |
| 7–8  | Multiplier. Local today; every new sheet type / parser / wrapper threads through it.                      |
| 5–6  | Friction. Slows iteration; readers stumble. Worth landing soon.                                           |
| 3–4  | Nit with leverage. Cheap to fix; alternative call-sites would multiply if left alone.                     |
| 1–2  | Cosmetic. Don't add to the roadmap; if it ever bothers anyone enough to want to fix it, it'll re-surface. |

For each finding ≥3, write a row into Pending with:

- **The file path(s)** with current line counts.
- **The smell shape** — one or two sentences, concrete enough that
  a future agent can re-verify by running a grep.
- **The plan** — what the fix looks like. Doesn't have to be the
  final answer; the next agent will re-evaluate. Just enough to
  show the work isn't unbounded.
- **The risk** — what could go wrong, what must be smoke-tested,
  whether it's a multi-PR plan.
- **The rating**, in bold, at the end of the prose: `**Severity:
N.**`

Place the row in the right severity band. If the row crosses
bands (e.g. a 7-rating that also contains a 4-rated "easy partial
fix"), keep it in the higher band but note the partial fix
inline.

### 4. Skip findings that fail the rubric

If a finding rates below 3, **don't** add it to Pending. It's
either:

- already there in spirit (re-read Pending and confirm), in which
  case do nothing;
- a real cosmetic concern, in which case mention it in the PR
  body and drop it.

If a finding rates 3 but you can't articulate why it blocks the
feature wave, the rating is probably wrong. Re-rate honestly.
A roadmap full of inflated 3s makes Work mode wander; a roadmap
with 10 honest items is more useful than one with 40
aspirational ones.

### 5. Don't fix in Explore mode

Explore mode opens a PR that **only** edits
`docs/refactoring-roadmap.md`. The code stays the same. Work mode
handles the code on a subsequent pass.

The reason: a fix landed in the same PR as the discovery means
the discovery wasn't peer-reviewed before someone acted on it.
The two-PR rhythm forces a sanity check.

### 6. Stop after one survey angle

Explore mode is a **bounded sweep**, not an open-ended scan.
Pick one survey angle (step 2), exhaust it, write the findings,
open the PR. Don't try to do every angle in one session — that's
how Pending lists accumulate redundant rows and lose focus.

If the codebase is rich enough that the chosen angle yielded 10+
findings, the PR is large enough; ship it and let a future
session pick the next angle. If the angle yielded zero
findings (the layer is clean), say so in the PR body and pick a
different angle next time.

## What this skill explicitly does NOT do

- **Doesn't refactor code that isn't on the roadmap.** If you see
  something during Work mode that looks like a smell but isn't on
  the list, switch to Explore mode behaviour for that finding:
  add it to Pending with a rating, then return to the original
  Work-mode candidate. Don't sneak in unrelated cleanup.
- **Doesn't introduce new abstractions speculatively.** "We might
  need this when loans land" is not a reason to extract an
  abstraction now. The roadmap captures **observed** smells with
  evidence; if the smell isn't visible yet, wait. AGENTS.md's
  "Don't add features beyond what the task requires" applies to
  refactors too.
- **Doesn't change persisted-shape semantics.** If a refactor
  touches `src/data/types/` or `src/data/migrations/`, it must be
  pure renaming / module-relocation; any actual change to the
  stored shape needs a migration step and is a feature, not a
  refactor. Put it in the PR description and stop.
- **Doesn't keep going past an empty Pending list.** When the
  backlog is clean, the next action is **starting the feature
  wave**, not inventing more refactors. Tell the user the
  backlog is empty and stop.
- **Doesn't bundle items.** Each PR carries one roadmap row. The
  one-row-per-PR discipline is what makes the rollback story
  cheap and the review surface small.

## Common pitfalls

- **Forgetting to re-verify line counts.** A candidate flagged at
  1800 lines may now be 900; the severity drops accordingly. The
  rubric reads line counts as a proxy for blast radius — refresh
  them at pickup, not at the original sweep.
- **Refactoring the easy win when the architectural blocker is
  on the same file.** If `useUserDataStorage.ts` needs both a
  reducer split (severity 9) and a comment cleanup (severity 1),
  do the reducer split. Bundling the comment cleanup into the
  same PR is fine; bundling 10 separate "easy wins" while
  leaving the blocker is a procrastination pattern.
- **Treating Investigated-and-skipped as a TODO list.** Those
  items were rejected for a reason. Re-read the reason before
  proposing them again. If the reason no longer applies, edit the
  Skipped entry to explain what changed and move it back to
  Pending.
- **Letting Explore mode become a refactor mode.** The PR opens,
  the rating gets written, and then the agent decides to "also
  fix it while it's here". That's a Work-mode PR, not an
  Explore-mode one. Discipline matters: one PR, one purpose.
- **Inflating severity to justify doing the work.** If the
  smell is a 3 and the rubric says "land opportunistically",
  resist the urge to round up to 5 to make it feel urgent. The
  ratings are how the next agent decides what's worth their
  time; inflating them devalues the signal.

## Skill self-improvement

After a run:

1. If a new survey angle was useful in Explore mode (e.g. "grep
   for `useState` pyramids in modals"), add it to the "Pick a
   survey angle" list above so the next agent doesn't have to
   reinvent it.
2. If a class of finding consistently rates the same (e.g. every
   monolithic admin form ends up at 7), capture the pattern in
   the roadmap's severity rubric so the next agent doesn't have
   to derive it.
3. If a refactor exposed an unexpected risk (broke a backend, a
   reducer slice, an i18n key), document the risk in the
   roadmap's plan column so the next agent following that plan
   knows what to smoke-test.
4. Commit the skill edit alongside the substantive PR — drift on
   the skill itself is the same kind of error this skill prevents.
