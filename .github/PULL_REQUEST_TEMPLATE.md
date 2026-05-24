<!--
Title: Conventional Commits, lower-case, imperative. Becomes the
squash-merge commit on `main`. Keep it under 70 characters so GitHub
doesn't truncate it. Examples:
  fix(pwa): stop bottom bar drifting on scroll in iOS 26
  feat(sheet): add "Shift days by" input to recurring editor
-->

## Summary

<!--
1–4 bullets describing the change for a reader with no chat context.

Bug fix:   symptom → root cause → fix (in user-visible terms).
Feature:   what you can now do → where it lives → data-shape impact.
Refactor:  invariant preserved → motivation → reviewer-visible cost.

Describe the state of the world the PR creates, not the journey there.
Don't restate the diff line-by-line — the reviewer reads the diff for
that. The Summary tells them _why_ those changes exist.
-->

## Linked issue

<!-- Closes #<issue-number>, or "no linked issue". -->

## Test plan

<!--
A checklist of what was verified and what the reviewer should re-run.

- [x] for things you ran successfully on this branch (specific `make`
      targets, Playwright specs, manual flows).
- [ ] for things that require a human (a real device, a cloud account,
      a side-by-side comparison). The reviewer ticks these.

Be specific. "Tested locally" is not a test plan; list the targets.
If a check is not applicable, say so explicitly — silence is ambiguous.
-->

- [ ]

## Checklist

- [ ] PR title follows Conventional Commits (becomes the squash-merge commit).
- [ ] Rebased on latest `origin/main`.
- [ ] `make fmt`, `make lint`, `make build`, `make test` pass locally.
- [ ] `.changes/unreleased/<unix-ts>-<slug>.md` added, or PR labelled `no-changelog`.
- [ ] `README.md`, `AGENTS.md`, or `docs/` updated if the change affects documented behaviour.

<!--
Optional sections — add only when genuinely needed:

  ## Changelog    — when the changeset story is interesting (e.g. the
                    fragment edits a parent fragment for an unreleased
                    feature; see the `write-changeset` skill).
  ## Screenshots  — for visual changes, one before / after pair per
                    affected screen.
  ## Related      — for prior PRs the reader needs to follow the
                    reasoning. Use `#123` references so GitHub renders
                    titles inline.

Do not add `## Implementation notes`, `## My approach`, or `## Trade-offs
considered`. If the diff design needs explaining beyond "the fix is X",
a code comment on the unusual line is the right home.
-->
