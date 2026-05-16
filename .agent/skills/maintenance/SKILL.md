---
name: maintenance
description: "Use to bring the whole repository back into sync without first diagnosing which artifact is stale. Dispatches every update-* skill in the registry below, in order, and re-runs sync-oss-spec at the end to catch residual conformance violations."
---

# Maintenance umbrella

The per-artifact `update-*` skills each fix one drift-prone surface
(README, docs, …). The `maintenance` skill is the entry point that
schedules them in the correct order, aggregates the resulting diff,
and finishes with `sync-oss-spec` so anything the per-artifact skills
left behind is still caught.

This skill performs no rewriting of its own. Adding a new `update-*`
skill without adding its row to the **Registry** below is a drift bug
in its own right.

## Tracking mechanism

`.agent/skills/maintenance/.last-updated` holds the git commit hash
of the last successful **whole-sweep** run. Empty means "never run" —
fall back to the repository's initial commit:

```sh
BASELINE=$(cat .agent/skills/maintenance/.last-updated)
[ -z "$BASELINE" ] && BASELINE=$(git rev-list --max-parents=0 HEAD)
```

Individual `update-*` skills track their own baselines independently;
this file only moves when the whole sweep completes cleanly.

## Discovery process

1. Read `BASELINE` as above.
2. List every skill in the registry. For each one, check whether its
   own `.last-updated` is older than `HEAD` — if so, that skill is
   the next candidate to run.

   ```sh
   for s in $(awk -F'|' '/^\| `update-/ { gsub(/`/, "", $2); print $2 }' \
                  .agent/skills/maintenance/SKILL.md); do
       printf '%-20s %s\n' "$s" "$(cat .agent/skills/$s/.last-updated)"
   done
   ```

3. Dispatch each candidate in registry order. The dispatch mechanism
   depends on the agent driving this skill — typically loading the
   target `SKILL.md` and following it end-to-end before moving on.

## Registry

The single source of truth for which sync skills exist in this repo.
Run order is the order rows appear in this table — upstream fixes
land before downstream skills read them.

| Skill           | Run when                                                             | Run order |
| --------------- | -------------------------------------------------------------------- | --------- |
| `update-docs`   | Source layout or persisted-data shape moved; `docs/` mirrors it.     | 1         |
| `update-readme` | `Makefile`, `package.json`, `.nvmrc`, or UI behaviour moved.         | 2         |
| `sync-oss-spec` | Always last — catches residual `OSS_SPEC.md` conformance violations. | 3         |

Add a row when a new `update-*` skill lands. Remove a row when its
skill is deleted. Rows are intentionally re-orderable: the run order
column is the contract.

### Skills the spec lists but this project does not ship

`OSS_SPEC.md` §21.5 also names `update-manpages` (CLI projects) and
`update-website` (separate showcase site). This project ships neither
a CLI nor a separate showcase — the deployed Pages site **is** the
app — so neither skill is required here. See the "OSS_SPEC.md
exceptions" section of `AGENTS.md` for the full list of spec rules
that do not apply.

## Update checklist

- Read `BASELINE` and enumerate the registry above.
- For each row in registry order, load that skill's `SKILL.md` and run
  its own "Update checklist" end-to-end. Skip a skill only if its
  `.last-updated` already equals `HEAD` (nothing changed since the
  last sweep).
- After every per-artifact skill finishes, run `sync-oss-spec` as the
  final row — its job is to detect residual structural drift the
  per-artifact passes left behind.
- Run `make fmt`, `make lint`, `make test` once at the end so the
  combined diff is healthy.
- Rewrite the umbrella tracking file:

  ```sh
  git rev-parse HEAD > .agent/skills/maintenance/.last-updated
  ```

## Verification

1. Every skill in the registry was either run this sweep, or its
   `.last-updated` already matched `HEAD` at the start.
2. `make fmt-check`, `make lint`, and `make test` pass against the
   aggregated diff.
3. `sync-oss-spec` reports zero structural violations on the final
   pass (ignoring the documented OSS_SPEC.md exceptions in `AGENTS.md`).
4. `.agent/skills/maintenance/.last-updated` contains the current
   `HEAD`.

## Skill self-improvement

After a run:

1. **Add a row** to the registry whenever a new `update-*` skill is
   created in this repo.
2. **Remove a row** whenever a skill is deleted.
3. **Reorder rows** when a real dependency emerges — e.g. a new skill
   that produces output another skill reads must come first.
4. **Commit the registry edit** alongside the per-artifact skill
   edits.
