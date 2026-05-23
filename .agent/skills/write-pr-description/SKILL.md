---
name: write-pr-description
description: "Use when about to open a PR (or revising one already pushed) to draft a title and body that stand on their own. Derives the description from the diff, the commit log, and the source tree — never from the chat that produced the change. Yields a Conventional-Commits title and a `## Summary` + `## Test plan` body that describe the problem and the fix in the voice of someone reading the PR cold."
---

# Writing a PR description

The PR title becomes the squash-merge commit on `main` (the only
permitted merge strategy in this repo — see `AGENTS.md` §"PR
conventions"). The body is what a future maintainer reads when
`git log --grep=<bug>` lands them on this commit six months later,
or what a reviewer reads before they look at the diff. Both have
to make sense to a reader who has zero context: no access to the
chat that produced the change, no memory of the back-and-forth,
no idea which agent ran which tool.

This skill exists because agent-driven PRs tend to leak chat
artefacts into the description — "as discussed above", "per your
earlier message", "the user wanted X", "I tried Y first then
switched to Z". None of that has any meaning to the reader of the
PR. The skill is the discipline that strips it out.

## When to invoke

Run this skill:

- Before calling `mcp__github__create_pull_request` for a new PR.
- Before calling `mcp__github__update_pull_request` to revise an
  existing one (e.g. after addressing review feedback that
  changed the shape of the change).
- When the user pastes a draft PR body and asks for a review or
  rewrite.

Skip it for trivial single-file typo fixes where the title alone
(`docs: fix typo in README`) is the whole description.

## Source-of-truth rule

**Everything in the PR description must be derivable from the
repository state.** That is: the diff, `git log`, the source tree,
the linked issue (if any), and the project's `AGENTS.md` /
`docs/` / `CHANGELOG.md`. If a sentence cannot be re-derived by a
reader who only has `git clone` and the PR number, it does not
belong in the body.

Things that fail this test and must **never** appear:

- References to the chat: "as you asked", "per the conversation",
  "the user said", "we decided to", "after some back-and-forth".
- References to the agent or the session: "Claude", "Claude
  Code", "this session", "I", "the assistant", `session_…` URLs
  in prose. (The generator footer that wraps the body is a
  separate concern — see "Footer" below.)
- References to abandoned approaches the diff doesn't show: "I
  first tried X then switched to Y". The reader sees Y; X is
  noise unless Y's design choice is non-obvious without it.
- Time-of-day or workflow narration: "took a few iterations",
  "after running the tests a few times", "had to refresh the
  preview".
- Praise or self-evaluation: "this is a clean fix", "much better
  now", "elegant solution".

The body describes the **state of the world the PR creates**, not
the journey that got there.

## Discovery process

1. **Read the diff against the merge base with `main`.** This is
   the entire scope of the change:

   ```sh
   BASE=$(git merge-base HEAD origin/main)
   git diff --stat "$BASE"...HEAD
   git diff "$BASE"...HEAD
   ```

   Skim the stat first to spot the centre of mass; read the full
   diff for any file that materially changes behaviour. Generated
   files (`src/generated/`, `package-lock.json`, image binaries)
   can be acknowledged in one line if they bulk up the stat.

2. **Read the commit log.** Conventional-commit subjects are a
   first-pass outline of the change:

   ```sh
   git log --oneline "$BASE"..HEAD
   ```

   On a multi-commit branch, each `feat:` / `fix:` subject is a
   candidate bullet for the Summary. On a single-commit branch
   (the common case), the one subject is the seed of the PR
   title.

3. **Identify the problem.** For a `fix:`, this is the bug the
   diff repairs. Find it by:

   ```sh
   git log --follow --oneline -- <touched file>
   ```

   The commit that introduced the broken codepath is usually the
   one to read for context. For a regression on a shipped
   feature, that commit's PR is worth linking. For a `feat:`,
   the "problem" is the missing capability — frame it as what
   the user couldn't do before.

4. **Identify the fix.** What did the diff change, in
   user-visible terms? Strip the implementation noise: the reader
   doesn't care that you added a hook unless the hook _is_ the
   change.

5. **Identify the verification.** Which `make` targets ran clean
   locally? Which manual flows did you exercise? The Test plan
   section is a checklist the reviewer (or you, on a re-read)
   walks before merging.

## Title

The title becomes the squash commit. It must follow Conventional
Commits exactly:

```
<type>(<scope>): <imperative subject>
```

- `<type>` ∈ `feat | fix | chore | docs | refactor | perf | test |
  build | ci | style | revert`. Match the type to the user-facing
  framing — a refactor that ships no behaviour change is `refactor`
  even if the diff touches a `feat`-shaped file.
- `<scope>` is optional but encouraged; pick a short tag that
  matches an existing scope in the log
  (`git log --oneline | grep -oE '^[a-f0-9]+ [a-z]+\([a-z-]+\):' | sort -u`).
  Common scopes here: `pwa`, `settings`, `sheet`, `i18n`, `auth`,
  `dropbox`, `gdrive`, `release`.
- `<imperative subject>` is present-tense, lower-case, no
  trailing period. Under 70 characters total including type and
  scope so GitHub doesn't truncate it.

Good:

```
fix(pwa): stop the bottom bar walking on scroll in iOS 26 PWA
feat(edit-recurring): add "Shift days by" input to nudge series dates
fix(settings): drop heavy active styling on tab list
```

Bad:

```
Fixed a bug                                   ← no type, no scope, no subject
fix: Updates                                  ← non-imperative, vague
feat(sheet): Added a really cool new feature  ← past-tense, evaluative
```

## Body

Two sections, in this order. Use Markdown headings exactly as
shown; the GitHub PR template (`.github/pull_request_template.md`,
if present) and existing repo PRs follow this shape.

### `## Summary`

A 1–4 bullet description of what the PR changes. Frame it as
**problem → fix** when fixing a bug; as **capability → shape** when
adding a feature.

**Bug-fix shape:**

- Lead with the symptom the user (or reviewer) would see.
- Follow with the root cause, in one clause.
- Then the fix, in user-visible terms.
- If the cause is non-obvious (a spec violation, a platform
  quirk, an interaction between two features), spell it out. The
  reader cannot run the failing scenario, so the body has to
  carry the diagnosis.

Example (compressed from PR #371):

```
- iOS 26 PWAs fire `visualViewport.scroll` on layout-viewport
  scroll (against spec), and `vv.offsetTop` tracks page-scroll
  position — together they made the bottom bar drift downward
  on every scroll after the cold-launch fix in #367.
- Drop the `vv.scroll` listener; derive `--vv-bottom` from
  `vv.height` alone, clamped against `window.innerHeight`.
- Cold-launch behaviour from #367 (viewport-fit wake +
  scrollBy round-trip) is unchanged.
```

**Feature shape:**

- Lead with what the user can now do that they couldn't before.
- Follow with where it lives (which screen / modal / setting).
- Mention the data-shape impact if any (new persisted field,
  new migration, new export-format field). Do not enumerate
  internal prop names or file paths unless the reviewer needs
  them to navigate the diff.

Example (compressed from PR #368):

```
- Adds a "Shift days by" numeric input to the Edit recurring
  entry modal. Lets the user nudge every entry in the chosen
  scope (just this / this + all future) by a signed N days.
- Use case: a recurring booked on the 24th that should be on
  the 25th — open the entry, type `1`, pick the future scope,
  the whole series shifts forward.
- New `dateShiftDays` field on `EditPatch`; no persisted-shape
  change (the shift mutates row dates in place).
```

**Refactor / chore shape (rare; usually no PR description is
needed beyond the title):**

- State the invariant the refactor preserves ("behaviour
  identical to `<before-sha>`").
- State the motivation in one clause ("preparing for sheet
  types — see `AGENTS.md` §Vision").
- Note any reviewer-visible cost (bundle-size delta, test count
  change, generated-file churn).

### `## Test plan`

A markdown checklist of what was verified and what the reviewer
should re-run. Two kinds of lines:

- `- [x]` for things you ran successfully on your branch —
  `make typecheck`, `make lint`, `make test`, `make build`,
  `make fmt-check`, specific Playwright specs, the changeset
  collator dry-run.
- `- [ ]` for things that require a human (a real device, a
  cloud account, a side-by-side comparison). The reviewer ticks
  these as they go.

Be specific about what to look for. "Test the bottom bar" is
useless; "open the installed PWA, scroll the budget for ten
seconds, confirm the bar stays pinned to the screen edge with no
visible drift" is what the reviewer needs.

If a check is **not** applicable (no UI in the diff, no test
suite that exercises this surface), say so explicitly — silence
is ambiguous:

```
- [x] `make test` (no new tests; this is a styles-only change)
```

### Optional sections

Add these only when the content is genuinely needed.

- **`## Changelog`** — if the PR has an interesting changelog
  story (e.g. the fragment edits a parent fragment because the
  fix is on an unreleased feature; see the `write-changeset`
  skill). Otherwise the changeset CI job speaks for itself and
  the section is noise.
- **`## Screenshots`** — for visual changes. One before / after
  pair per affected screen. GitHub renders dropped image URLs
  inline. Don't paste binary blobs into the body.
- **`## Related`** — links to issues or prior PRs the reader
  needs to follow the reasoning. Use `#123` references rather
  than full URLs so GitHub renders the title inline. Skip the
  section entirely when nothing is related.

Do **not** add sections like `## Implementation notes`,
`## My approach`, `## Trade-offs considered`. If the diff design
needs explaining beyond "the fix is X", a comment on the PR
itself (or a code comment on the unusual line) is the right
home.

### Footer

GitHub PRs opened by the harness append a `Generated by Claude
Code` footer automatically. The footer is the **only** mention
of the agent that's allowed to appear in the PR — it's metadata,
not body content. Don't repeat it inside the body, and don't
reference it from the prose.

## Voice

- **Past-tense for what the diff already does**: "drops the
  `vv.scroll` listener", "adds a 'Shift days by' input". Not
  "will drop", "would add".
- **Second-person, user-centric, for behaviour**: "you can now
  shift the whole series", not "we added a way to shift the
  whole series".
- **Active voice**: "the bar walks down the screen" beats "the
  bar is observed to walk down the screen".
- **No hedging**: "should fix" / "might address" / "hopefully
  resolves" mean you haven't verified. Verify, then write
  declaratively. If you genuinely can't verify a path (e.g. iOS
  PWA behaviour on a Linux dev box), say so in the Test plan as
  an unchecked box, not as hedge-words in the Summary.
- **No marketing**: "robust", "elegant", "comprehensive",
  "powerful" are review-bait. The Summary describes _what_, not
  _how good it is_.

## Verification

Before posting:

1. **Re-read the body cold.** Pretend you opened the PR from a
   GitHub notification with no other tabs open. Does the
   Summary make sense? Does any sentence rely on something only
   the chat saw?
2. **`grep` your draft for forbidden tokens.** A quick sanity
   pass:

   ```sh
   echo "$BODY" | grep -nEi 'as (you|we) (asked|said|discussed)|per (the|your|our) (conversation|earlier|chat)|the user (asked|wanted|said)|I tried|claude|the assistant|in this session'
   ```

   Any hit → rewrite that line.
3. **Walk the Test plan boxes.** Every `- [x]` should correspond
   to a command you actually ran in this branch; every `- [ ]`
   should be a real action a reviewer can perform.
4. **Title length.** `printf '%s' "$TITLE" | wc -c` ≤ 70.
5. **Title type.** `printf '%s' "$TITLE" | grep -qE '^[a-z]+(\([a-z0-9-]+\))?: '` — exits 0 if Conventional Commits.

## Posting the PR

After the body is ready:

```
mcp__github__create_pull_request
  owner=niclaslindstedt
  repo=budget
  base=main
  head=<your-branch>
  title=<conventional-commits title>
  body=<the body you drafted>
  draft=false   # AGENTS.md: PRs open ready for review, not as drafts
```

For an update to an existing PR, use
`mcp__github__update_pull_request` with the same `title` / `body`
parameters; passing only the changed fields is fine.

## Common pitfalls

- **Restating the diff line-by-line.** "Adds `addDaysIso` to
  `src/utils/date.ts`. Adds `dateShiftDays` to `EditPatch`.
  Wires `dateShiftDays` through the reducer." — the reviewer
  reads the diff for this. The Summary tells them _why_ those
  changes exist, in one user-facing frame.

- **Burying the headline.** Putting the user-visible effect
  three bullets down behind setup paragraphs. The first bullet
  must answer "what does this PR do for the user".

- **Treating the body as a worklog.** "First I tried updating
  the listener. That didn't work. Then I added a clamp. That
  partially worked. Finally I removed the listener entirely."
  The reviewer needs the final design, not the autobiography.

- **Hand-waving the verification.** "Tested locally" is not a
  test plan. List the targets, the specs, the manual flows.

- **Linking sessions.** `https://claude.ai/code/session_…` URLs
  resolve only for the original author; for everyone else they
  404. The harness-appended footer is fine because GitHub
  collapses it; do not duplicate it in the body prose.

- **Forgetting the PR template.** If `.github/pull_request_template.md`
  exists, the headings it defines are the contract. Match them
  rather than inventing new ones; missing headings are easier
  for tooling to handle than extra ones.

## Skill self-improvement

After a run:

1. If a new forbidden-token pattern keeps slipping into drafts
   (a new agent footer, a new chat platform's URL shape),
   extend the `grep` regex in the Verification section.
2. If a recurring PR shape lacks a template (e.g. a release-PR
   body, a dependency-bump body), add a "Shape" subsection
   under `## Body` describing the canonical bullets.
3. Commit the skill edit alongside the PR it improved — same
   rule as every other skill in this repo.
