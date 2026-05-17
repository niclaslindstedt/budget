---
name: update-docs
description: "Use when docs/ may be stale relative to src/ layout, the persisted-data shape, or the Makefile target table — or when the in-app privacy policy at src/components/PrivacyPage.tsx may be stale relative to the storage/encryption/Dropbox claims it restates. Discovers commits that touched those sources of truth since the skill last ran and merges the current shape back into docs/architecture.md, docs/getting-started.md, and the privacy page."
---

# Updating docs/

`docs/` is the reference manual. Today it ships two topic files:

- `docs/getting-started.md` — local setup walk-through.
- `docs/architecture.md` — module layout and the planned data model.

A third doc-like artifact lives in `src/` because it ships as a page
of the deployed SPA rather than as standalone markdown:

- `src/components/PrivacyPage.tsx` — the privacy policy rendered at
  `budget.niclaslindstedt.se/privacy`. The page restates concrete
  storage/encryption/Dropbox claims that are themselves enforced in
  `src/storage/`, so it drifts the same way `docs/` does.

All three restate things that already live in the source tree (file
names, exported types, `make` targets, the `localStorage` key, the
Dropbox app-folder name, the at-rest encryption algorithm). When
those move and the docs don't, the docs start lying — and any
follow-on doc generator (a future hosted-docs view inside the app, for
example) lies along with them.

This skill brings `docs/` and the privacy page back into sync with
their sources of truth.

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
   the docs and the privacy page mirror:

   ```sh
   git log --oneline "$BASELINE"..HEAD -- src/ Makefile package.json \
       .nvmrc README.md index.html vite.config.ts
   git diff --name-only "$BASELINE"..HEAD -- src/ Makefile package.json \
       .nvmrc README.md index.html vite.config.ts
   ```

2. For every change in those paths, decide whether a doc claim
   referencing it is still accurate. Use the mapping table below.

## Mapping table

| Source of truth                                                              | Doc target → section                                                                                                                             |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/` top-level layout (file tree)                                          | `docs/architecture.md` → "Today" / "Planned shape"                                                                                               |
| `src/data/types.ts`                                                          | `docs/architecture.md` → persisted-data shape                                                                                                    |
| `src/data/constants.ts` (`STORAGE_KEY`)                                      | `docs/architecture.md` → localStorage key callouts                                                                                               |
| `src/storage/local.ts`, `src/storage/file.ts`                                | `docs/architecture.md` → storage + import/export notes                                                                                           |
| `src/data/migrations.ts`                                                     | `docs/architecture.md` → migration runner / version field                                                                                        |
| `Makefile` targets used in setup                                             | `docs/getting-started.md` → command walk-through                                                                                                 |
| `.nvmrc`                                                                     | `docs/getting-started.md` → Node version line                                                                                                    |
| `package.json` scripts surfaced via `make`                                   | `docs/getting-started.md` → command walk-through                                                                                                 |
| `src/storage/dropbox-adapter.ts` (app-folder name, `DROPBOX_FILE_PATH`)      | `src/components/PrivacyPage.tsx` → "Dropbox integration"                                                                                         |
| `src/storage/crypto.ts` (KDF + cipher choice)                                | `src/components/PrivacyPage.tsx` → encryption claims in "What the app stores" and "Dropbox integration"                                          |
| `src/storage/encrypting-adapter.ts`, `src/storage/backend-preference.ts`     | `src/components/PrivacyPage.tsx` → per-device encryption opt-out wording                                                                         |
| `src/storage/users.ts` (account / password hashing)                          | `src/components/PrivacyPage.tsx` → "What the app stores" (account row)                                                                           |
| `src/storage/backend-preference.ts` (`BackendId` list)                       | `src/components/PrivacyPage.tsx` — when a new storage backend lands, add a section describing its scope                                          |
| `package.json` deps + `index.html` (new analytics / third-party network use) | `src/components/PrivacyPage.tsx` → "Web analytics" / "Cookies" / "Server logs" must reflect any new vendor                                       |
| `src/main.tsx` pathname switch + `vite.config.ts` `emit-path-alias`          | `src/components/PrivacyPage.tsx` is reachable at `/privacy`; if the route is removed, the link in `src/components/SettingsModal.tsx` must go too |

If a change in source has no matching claim in `docs/` or the privacy
page, leave them alone — adding new doc content is a feature task,
not drift cleanup.

## Update checklist

- Read `BASELINE` and run the discovery commands above.
- Walk the mapping table; for each row where the source moved, edit
  the matching docs section to reflect the current state. Mirror exact
  filenames and identifiers (`STORAGE_KEY`, `MAX_COLUMN_CHARS`, the
  exported type names) verbatim so future text search keeps working.
- If `src/components/PrivacyPage.tsx` had any material wording change
  (anything beyond pure prose polish), bump its `LAST_UPDATED`
  constant to today's ISO date — the value is rendered verbatim at
  the top of the page and is how readers tell the policy is fresh.
- Cross-check the `README.md` "Documentation" link list — every file
  the README links to must still exist and still be linked. The README
  also carries a "Privacy" pointer to `budget.niclaslindstedt.se/privacy`;
  if the route or the page moves, update that link too.
- Run `make fmt` and `make lint`.
- Rewrite the tracking file:

  ```sh
  git rev-parse HEAD > .agent/skills/update-docs/.last-updated
  ```

## Verification

1. Re-read each docs section the skill touched against the matching
   source of truth — every concrete value (file name, type name,
   constant, target, KDF / cipher name, Dropbox folder name) appears
   verbatim in both.
2. `make fmt-check` and `make lint` pass.
3. Every link inside `docs/` and from `README.md` into `docs/`
   resolves to a file that still exists; the README's "Privacy"
   pointer at `budget.niclaslindstedt.se/privacy` still resolves to
   the privacy page after `make build` (look for
   `dist/privacy/index.html`).
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
