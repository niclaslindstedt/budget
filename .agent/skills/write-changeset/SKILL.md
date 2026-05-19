---
name: write-changeset
description: "Use when about to open a PR (or just after pushing one) to decide whether the change needs a `.changes/unreleased/<unix-ts>-<slug>.md` fragment. Resolves the latest `v*` tag, walks commits and existing fragments since, classifies the current change against the rules in AGENTS.md, and either writes a new fragment, folds the substance into an existing fragment, or labels the PR `no-changelog`."
---

# Writing a changeset fragment

`.changes/unreleased/*.md` is the queue that the release workflow
collates into the next `## [X.Y.Z]` section of `CHANGELOG.md`. Every
fragment in the queue eventually surfaces in the in-app "What's new"
modal and on `/changelog/`. The CI `changeset` job
(`scripts/release/check-changeset.mjs`) enforces "one fragment per
user-visible PR", but it can't tell whether the change is a _new_
user-visible thing or a follow-up bug fix on something that hasn't
shipped yet — that judgement is on the contributor.

This skill is that judgement. It decides whether the current change
needs a new fragment, an edit to an existing one, or the
`no-changelog` opt-out label, by inspecting what is already queued
against what has actually shipped.

## When to invoke

Run this skill before opening a PR for any change to `src/`, or to
any other path not in the skip-list at
`scripts/release/check-changeset.mjs:39-55`. It is cheap to run and
catches both errors of omission (forgot to write a fragment) and
errors of commission (wrote a fragment for a fix to an unreleased
feature, which would surface a non-event in the changelog).

## Discovery process

1. **Resolve the baseline — the latest released commit.** Releases
   are tagged `vX.Y.Z`. If no tag exists yet, fall back to the
   repo's initial commit:

   ```sh
   BASELINE=$(git tag --list 'v*' --sort=-v:refname | head -1)
   if [ -n "$BASELINE" ]; then
       BASELINE=$(git rev-list -n 1 "$BASELINE")
   else
       BASELINE=$(git rev-list --max-parents=0 HEAD)
   fi
   ```

   This is the cut-off: anything on `main` after `BASELINE` is
   "since the last release" and its parent fragment, if any, is
   still sitting unreleased in `.changes/unreleased/`.

2. **List commits since the baseline.** This is what an in-flight
   release would ship:

   ```sh
   git log --oneline "$BASELINE"..HEAD
   ```

   Reading the conventional-commit subjects (`feat:`, `fix:`,
   `chore(scope):`, …) is usually enough to spot which commits
   introduced a feature and which polished or fixed it.

3. **List existing fragments.** These are the `Added` / `Changed`
   parents for any in-flight features:

   ```sh
   ls -1 .changes/unreleased/ | grep -v '^\.gitkeep$'
   for f in .changes/unreleased/*.md; do
       [ "$f" = ".changes/unreleased/.gitkeep" ] && continue
       printf '\n=== %s ===\n' "$f"
       cat "$f"
   done
   ```

4. **Pull the current change's diff and intent.** What did this PR
   change, and which previous commit (if any) introduced the
   codepath it touches?

   ```sh
   git diff "$(git merge-base HEAD main)"...HEAD --stat
   git log --follow --oneline -- <touched file(s)>
   ```

   `git log --follow` on each significantly-changed file usually
   points straight at the commit that introduced it. If that commit
   is newer than `BASELINE`, the feature is unreleased.

## Decision tree

Walk these in order; stop at the first match.

1. **Does the diff hit only paths in the skip-list at
   `scripts/release/check-changeset.mjs:39-55`?** (tests, `.github/`,
   `.agent/`, `.claude/`, `.changes/`, `docs/`, `scripts/`,
   `vite/`, `Makefile`, any `*.md`, `.nvmrc`, `.prettierrc*`,
   `.gitignore`, `.gitattributes`, `eslint.config.js`,
   `tsconfig*.json`, `package-lock.json`.) — **No fragment.** CI
   accepts this without the label.

2. **Is the change a refactor or perf improvement with no
   user-visible effect?** Behavioural identity, same UI, same
   storage, same outputs. — **No fragment**, label the PR
   `no-changelog`.

3. **Does the change touch a codepath introduced _after_ `BASELINE`
   (i.e. the parent commit is in the `git log "$BASELINE"..HEAD`
   listing from step 2 of discovery)?** Then the feature is in
   `.changes/unreleased/` somewhere, not in production.
   - **Bug fix on it →** Locate the parent fragment. If the fix
     changes how the feature reads to a user (different label, new
     toggle gating, different default), edit the parent fragment to
     describe the post-fix shape. If the fix is invisible from a
     user description (it just makes the feature work as the parent
     fragment already claims), leave the parent alone. **Do not
     write a new fragment.** Label the PR `no-changelog`.

   - **Extension or polish on it →** Same rule. Fold the new
     behaviour into the parent fragment's prose if it changes the
     user-visible shape; otherwise leave the parent alone. **Do not
     write a new fragment.** Label the PR `no-changelog`.

4. **The codepath existed at `BASELINE` (i.e. it shipped in the most
   recent `vX.Y.Z`) and the change is a genuine post-release fix,
   addition, or change.** — **Write a new fragment.** Follow the
   format below.

## Writing the fragment

Filename: `.changes/unreleased/<unix-ts>-<slug>.md`. The `<unix-ts>`
keeps the lexical sort roughly in commit order; the `<slug>` is a
short kebab-case label for humans skimming the directory.

```sh
TS=$(date +%s)
SLUG=short-kebab-case-summary    # e.g. delete-confirms, gdrive-app-folder
$EDITOR ".changes/unreleased/${TS}-${SLUG}.md"
```

Body:

```
---
type: Added
---

One-line description users will read in the "What's new" popup.
Multi-line bodies are fine; every line becomes part of the same
bullet under the chosen type heading.
```

`type:` is exactly one of `Added | Changed | Fixed | Removed |
Security | Deprecated` (Keep a Changelog). Pick the one that matches
the user-facing framing:

- **Added** — new feature, new affordance, new setting, new file
  format support.
- **Changed** — visible behaviour change to an existing feature
  (rearranged UI, different default, renamed control).
- **Fixed** — bug fix on a feature that shipped in the most recent
  `vX.Y.Z`. **Not** for fixes on unreleased features — those don't
  get a fragment (see step 3 of the decision tree).
- **Removed** — feature that no longer exists. Always pair with a
  short note about what replaces it, if anything.
- **Security** — vulnerability disclosure or hardening.
- **Deprecated** — feature still works but will be removed in a
  future release; tell the user the date and the replacement.

Voice: second-person, present tense, user-centric ("Settings now
ends with a Donate button"), not implementation-centric ("Wired
`VITE_PAYPAL_URL` into the settings footer"). The fragment is read
in the "What's new" modal by someone who has never read the source
tree — the diff is somewhere else.

## Editing a parent fragment

When step 3 of the decision tree fires, the contributor's job is to
update the parent fragment, not to add a sibling. Two cases:

- **The post-fix shape is identical to what the parent already
  claims.** Leave the fragment alone — its prose is still accurate.
  Label the PR `no-changelog`.

- **The post-fix shape differs from what the parent claims.** Open
  the parent fragment and edit the body so it reads correctly for
  the _final_ shape the user will see when the release ships. Keep
  the same `<unix-ts>` prefix and `type:` — a polish on an `Added`
  feature is still under `Added`. The squash-merge title for the
  current PR should still be Conventional Commits (`fix: …`,
  `feat: …`) — only the fragment is affected.

  If the parent fragment was already merged on a previous PR, the
  current PR's diff will include the parent fragment edit alongside
  the source change. CI's `changeset` job sees the fragment file
  appear in the diff and accepts the PR without a new fragment.

## Verification

Before opening the PR:

1. **The skip-list path question is settled.** Run
   `node scripts/release/check-changeset.mjs` locally against your
   branch (set `BASE_SHA=$(git merge-base HEAD origin/main)` first)
   and confirm the verdict matches your decision-tree outcome.

2. **The fragment (if any) parses.** Dry-run the collator in a
   scratch directory:

   ```sh
   TMP=$(mktemp -d)
   cp -r . "$TMP/"
   cd "$TMP" && node scripts/release/collate-changelog.mjs 9.9.9
   head -40 CHANGELOG.md
   ```

   The new bullet should appear under the right heading. If the
   collator fails, the front-matter is malformed.

3. **The fragment reads correctly to a stranger.** Re-read it after
   a coffee. If the description is full of internal terminology
   (`StorageAdapter`, `ConflictError`, file paths), rewrite it in
   the voice of someone discovering the feature in the app.

4. **No stale sibling fragments.** If you edited a parent fragment,
   `git diff` should show exactly one fragment touched — your
   parent — and no new fragment for this PR. If you wrote a new
   fragment, `git status` should show exactly one new file under
   `.changes/unreleased/`.

## Common pitfalls

- **Writing `type: Fixed` for a fix on an unreleased feature.** The
  release notes would then say "Fixed: the new picker no longer
  flickers on the first frame" — but the picker has never been in
  production, so no user ever saw the flicker. Fold it into the
  picker's `Added` fragment instead, or label the PR `no-changelog`
  if the prose doesn't need to change.

- **Writing a separate fragment for each commit in a multi-PR
  feature.** A single feature that lands across three PRs needs
  exactly one fragment. The first PR writes it; the next two edit
  it (if the shape changes) or skip it (with `no-changelog`).

- **Skipping the fragment on a `feat:` commit because "the diff is
  small".** Diff size is irrelevant — the question is whether a
  user sees a difference. A two-line patch that toggles a default
  _is_ user-visible.

- **Padding a fragment with implementation detail.** "Wired the new
  toggle through `Settings.alwaysAbbreviateBalance` and re-rendered
  the column …" — none of that belongs in the changelog. The user
  cares about what the column looks like, not the prop name.

## Skill self-improvement

After a run:

1. If a new path consistently turns out to be "obviously not
   user-visible" (a new generated directory, a new tooling dotfile),
   add it to `SKIP_PATTERNS` in
   `scripts/release/check-changeset.mjs` and note the change in this
   skill's "Discovery process" section.
2. If the decision tree missed a recurring shape (e.g. a feature
   that's gated behind a per-user setting and only shipped to a
   subset of users), add a row to the tree above describing the
   shape and the verdict.
3. Commit the skill edit alongside the substantive PR — drift on
   the skill itself is the same kind of error this skill prevents.
