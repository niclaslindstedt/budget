---
name: update-readme
description: "Use when README.md may be stale relative to package.json scripts, Makefile targets, .nvmrc, or the user-visible UI. Discovers commits that touched those sources of truth since the skill last ran and merges the current values back into README.md."
---

# Updating README.md

`README.md` mirrors several pieces of state that live elsewhere in the
repo — the `make` target table, the Node prerequisite, the live-site
URL, the list of UI behaviours described under "Examples", the
"Documentation" link list, and the badge row. When any of those move
without README.md moving with them, the README starts lying.

This skill brings README.md back into sync with its sources of truth.

## Tracking mechanism

`.agent/skills/update-readme/.last-updated` holds the git commit hash
of the last successful run. Empty means "never run" — fall back to the
repository's initial commit:

```sh
BASELINE=$(cat .agent/skills/update-readme/.last-updated)
[ -z "$BASELINE" ] && BASELINE=$(git rev-list --max-parents=0 HEAD)
```

## Discovery process

1. Compute the diff range since the baseline and inspect the files
   that the README depends on:

   ```sh
   git log --oneline "$BASELINE"..HEAD -- Makefile package.json .nvmrc \
       src/components docs/ public/CNAME vite.config.ts
   git diff --name-only "$BASELINE"..HEAD
   ```

2. For every change in those paths, decide whether the README claim it
   mirrors is still accurate. Use the mapping table below.

## Mapping table

| Source of truth                        | README section to update                                     |
| -------------------------------------- | ------------------------------------------------------------ |
| `Makefile` targets                     | "Usage" table                                                |
| `package.json` scripts                 | "Usage" table (only the targets `make` exposes)              |
| `.nvmrc`                               | "Prerequisites" — Node version line                          |
| `public/CNAME` / `vite.config.ts` base | "Troubleshooting" — Pages deploy 404 note + live URL         |
| `src/components/SheetView.tsx` + peers | "Examples" — keep the per-row affordances description honest |
| `docs/` filenames                      | "Documentation" link list                                    |
| `.github/workflows/*.yml`              | Badge row (only when a workflow is added or removed)         |
| `LICENSE` SPDX id                      | License badge + "License" section                            |

If a change in any of the source-of-truth files has no corresponding
README claim, leave the README alone — not every source change needs
to surface in the README.

## Update checklist

- Read `BASELINE` and run the discovery commands above.
- Walk the mapping table; for each row where the source moved, edit
  the matching README section to reflect the current state.
- Keep wording terse — `README.md` is not the place for design rationale
  (that belongs in `docs/architecture.md`).
- Run `make fmt` and `make lint` so formatting and link rot don't ride
  along.
- Rewrite the tracking file:

  ```sh
  git rev-parse HEAD > .agent/skills/update-readme/.last-updated
  ```

## Verification

1. Re-read each README section the skill touched against the matching
   source of truth — every concrete value (target name, version,
   filename, URL) appears verbatim in both.
2. `make fmt-check` and `make lint` pass.
3. `.agent/skills/update-readme/.last-updated` contains the current
   `HEAD`.

## Skill self-improvement

After a run:

1. **Grow the mapping table** whenever a new README claim is added
   that mirrors something in source.
2. **Record drift recipes** — if a particular phrasing keeps regressing
   (e.g. the live-site URL flipped between custom domain and Pages
   subpath form), add a one-line note here so the next run catches it
   sooner.
3. **Commit the skill edit** alongside the README edits.
