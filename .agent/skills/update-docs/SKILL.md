---
name: update-docs
description: "Use when docs/ may be stale relative to src/ layout, the persisted-data shape, or the Makefile target table. Discovers commits that touched those sources of truth since the skill last ran and merges the current shape back into docs/architecture.md and docs/getting-started.md."
---

# Updating docs/

`docs/` is the reference manual. Today it ships two topic files:

- `docs/getting-started.md` — local setup walk-through.
- `docs/architecture.md` — module layout and the planned data model.

Both restate things that already live in the source tree (file
names, exported types, `make` targets, the `localStorage` key). When
those move and the docs don't, the docs start lying — and any
follow-on doc generator (a future hosted-docs view inside the app, for
example) lies along with them.

This skill brings `docs/` back into sync with its sources of truth.

## Tracking mechanism

`.agent/skills/update-docs/.last-updated` holds the git commit hash
of the last successful run. Empty means "never run" — fall back to the
repository's initial commit:

```sh
BASELINE=$(cat .agent/skills/update-docs/.last-updated)
[ -z "$BASELINE" ] && BASELINE=$(git rev-list --max-parents=0 HEAD)
```

## Discovery process

1. Compute the diff range since the baseline and inspect the files
   `docs/` mirrors:

   ```sh
   git log --oneline "$BASELINE"..HEAD -- src/ Makefile package.json \
       .nvmrc README.md
   git diff --name-only "$BASELINE"..HEAD -- src/ Makefile package.json \
       .nvmrc README.md
   ```

2. For every change in those paths, decide whether a doc claim
   referencing it is still accurate. Use the mapping table below.

## Mapping table

| Source of truth                               | Doc file → section                                        |
| --------------------------------------------- | --------------------------------------------------------- |
| `src/` top-level layout (file tree)           | `docs/architecture.md` → "Today" / "Planned shape"        |
| `src/data/types.ts`                           | `docs/architecture.md` → persisted-data shape             |
| `src/data/constants.ts` (`STORAGE_KEY`)       | `docs/architecture.md` → localStorage key callouts        |
| `src/storage/local.ts`, `src/storage/file.ts` | `docs/architecture.md` → storage + import/export notes    |
| `src/data/migrations.ts`                      | `docs/architecture.md` → migration runner / version field |
| `Makefile` targets used in setup              | `docs/getting-started.md` → command walk-through          |
| `.nvmrc`                                      | `docs/getting-started.md` → Node version line             |
| `package.json` scripts surfaced via `make`    | `docs/getting-started.md` → command walk-through          |

If a change in source has no matching claim in `docs/`, leave the docs
alone — adding new doc content is a feature task, not drift cleanup.

## Update checklist

- Read `BASELINE` and run the discovery commands above.
- Walk the mapping table; for each row where the source moved, edit
  the matching docs section to reflect the current state. Mirror exact
  filenames and identifiers (`STORAGE_KEY`, `MAX_COLUMN_CHARS`, the
  exported type names) verbatim so future text search keeps working.
- Cross-check the `README.md` "Documentation" link list — every file
  the README links to must still exist and still be linked.
- Run `make fmt` and `make lint`.
- Rewrite the tracking file:

  ```sh
  git rev-parse HEAD > .agent/skills/update-docs/.last-updated
  ```

## Verification

1. Re-read each docs section the skill touched against the matching
   source of truth — every concrete value (file name, type name,
   constant, target) appears verbatim in both.
2. `make fmt-check` and `make lint` pass.
3. Every link inside `docs/` and from `README.md` into `docs/`
   resolves to a file that still exists.
4. `.agent/skills/update-docs/.last-updated` contains the current
   `HEAD`.

## Skill self-improvement

After a run:

1. **Grow the mapping table** whenever a new doc claim is added that
   mirrors something in source (e.g. a new topic file under `docs/`,
   or a new exported type the architecture doc references).
2. **Record drift recipes** — if a particular shape keeps regressing
   (file tree drifts, exported type names rename), add a one-line note
   so the next run catches it sooner.
3. **Commit the skill edit** alongside the docs edits.
