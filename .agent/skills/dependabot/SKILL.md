---
name: dependabot
description: 'Use when the user wants to clear out the open Dependabot PRs — "do the dependabot PRs", "update the deps", "merge dependabot". Consolidates every open Dependabot bump into ONE branch + PR, resolves the peer-dependency fallout the bumps trigger (Vite / ESLint / TypeScript / React majors drag transitive tooling with them), gets the full CI chain green, then closes the superseded Dependabot PRs. Manual playbook — not part of the `maintenance` umbrella.'
---

# Clearing the Dependabot queue

Dependabot opens one PR per bump. Merging them one at a time means N−1
rebases as each merge invalidates the next PR's `package-lock.json`, and
the major bumps (Vite, ESLint, TypeScript, React) fail in isolation
anyway because they need transitive tooling bumps Dependabot never
grouped in. **So don't merge them individually — consolidate.** Pull
every target version onto one branch, fix the fallout once, ship one PR,
then close the originals.

This is a dependency bump, not a feature. Resist the urge to refactor
working code to satisfy new lint opinions the majors pull in — keep the
diff to versions + the minimum to make CI green.

## 1. Enumerate the PRs

`mcp__github__list_pull_requests` (state `open`) — the full list can blow
the token budget, so if it overflows, parse the saved file with python
and filter `user.login == "dependabot[bot]"`. Record number + title; the
title carries the target version for single-package bumps.

For **grouped / multi bumps** the title omits versions ("bump react and
@types/react"). Pull the target out of the diff:
`mcp__github__pull_request_read` method `get_diff` — read the
`package.json` hunk, not the lock.

## 2. Apply the npm bumps

Edit `package.json` to the target caret ranges for every npm PR at once.
Then **the part Dependabot doesn't tell you**: a major bump's peers need
their own bumps, and those aren't separate Dependabot PRs. Before
installing, check the peers of anything a major touches:

```
npm view <pkg> peerDependencies          # what range does it demand?
npm view <pkg> version                    # latest available
npm view <pkg>@<ver> peerDependencies     # peers of a specific version
```

Known coupling in this repo (re-verify versions, the shape holds):

- **Vite major** → `@vitejs/plugin-react` caps at the previous Vite (v4
  of the plugin peers Vite ≤7; you need the next major, e.g. v6, for
  Vite 8). `vite-plugin-pwa` and `@vite-pwa/assets-generator` must jump
  to their v1 line for Vite 8. `@tailwindcss/vite`'s peer is wide —
  check but it usually already allows the new Vite.
- **ESLint major (9→10)** → bump `typescript-eslint`,
  `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh` to versions
  whose `eslint` peer lists `^10`. **`eslint-plugin-jsx-a11y` lags** —
  its latest still peers `eslint` at `^9` only. Don't downgrade ESLint
  for it; add an `overrides` block so the install resolves:
  ```json
  "overrides": { "eslint-plugin-jsx-a11y": { "eslint": "$eslint" } }
  ```
  The plugin works fine under ESLint 10 flat config; only its declared
  peer is stale.
- **TypeScript major (5→6)** → confirm `typescript-eslint`'s `typescript`
  peer still spans it (`>=4.8.4 <6.1.0` allows 6.0.x). Bump
  typescript-eslint to its latest 8.x if the installed one predates the
  TS-6 allowance.

Then resolve cleanly. A stale lock produces misleading ERESOLVE traces,
so wipe both:

```
rm -rf node_modules package-lock.json && npm install
```

Read the first ERESOLVE block top-to-bottom — it names the exact package
and the peer range that conflicts. Bump that package, re-install. Two or
three rounds clears it.

## 3. Make the code compile against the new majors

Generated files first. `src/generated/changelog.ts` is gitignored and
`tsc -b` imports it, so run codegen before any typecheck or you'll chase
a phantom "Cannot find module '../generated/changelog'":

```
make codegen          # or: node scripts/codegen/changelog.mjs
npx tsc -b --noEmit
```

**React 18→19 types**: `useRef<T>(null)` now returns
`RefObject<T | null>` (was `RefObject<T>`). Every hand-written
`RefObject<T>` annotation that receives such a ref errors. Widen them to
`RefObject<T | null>` — chase the error through both the hook's return
type and every consumer's prop type (tsc points at each in turn).

## 4. Lint — preserve the surface, don't adopt new rules

The ESLint 10 + react-hooks 7 majors grow their `recommended` presets
with a wave of new rules. In this repo they fired ~120 times on
deliberate, commented patterns (`ref.current = x` during render to keep
a closure fresh, defensive `let x = init` before a conditional reassign,
controlled `setState` in an effect). **Adopting them is a standalone
refactor, not part of a version bump.** Turn the newly-added rules off in
`eslint.config.js` (after the `...recommended.rules` spread) with a
comment explaining they arrived via the bump, so the prior lint surface
is preserved and the diff stays about versions:

```js
"react-hooks/set-state-in-effect": "off",
"react-hooks/refs": "off",
"react-hooks/purity": "off",
"react-hooks/immutability": "off",
"react-hooks/preserve-manual-memoization": "off",
"no-useless-assignment": "off",   // new in @eslint/js v10 recommended
```

Discover _which_ rules are new by counting failures by ruleId rather
than scrolling 120 messages:

```
npx eslint . -f json | python3 -c "import json,sys,collections; c=collections.Counter(m.get('ruleId') for f in json.load(sys.stdin) for m in f['messages']); print(*[f'{n} {r}' for r,n in c.most_common()],sep=chr(10))"
```

Mention the disabled rules in the PR body so the maintainer can adopt
them deliberately later.

## 5. Icons drift from the assets-generator bump

`@vite-pwa/assets-generator` going major regenerates `favicon.ico` with
slightly different bytes, so `make icons-check` fails. Regenerate and
commit — the committed icons are _supposed_ to track the generator:

```
make icons && make icons-check
```

Only `favicon.ico` should change; if PNGs move too, eyeball them.

## 6. GitHub Actions bumps

These live in `.github/workflows/*.yml` as `uses: actions/x@vN`. One sed
across the directory:

```
sed -i 's#actions/checkout@v4#actions/checkout@v6#g; \
        s#actions/setup-node@v4#actions/setup-node@v6#g; \
        ...' .github/workflows/*.yml
```

Map each `@vN → @vM` from the corresponding PR title. No install needed.

## 7. Verify, ship, close

Run the exact PR-gating chain (e2e is _not_ in it — it runs on push to
`main`, so skip the slow Playwright install for the PR):

```
make fmt-check && make lint && make build && make icons-check && make test
```

Commit (one `chore(deps):` commit is fine), push `-u origin <branch>`,
open the PR ready-for-review listing every bump it subsumes and the
disabled-rule note from step 4.

**Changeset**: pure dependency bumps with no intended behaviour change
are `no-changelog`. Apply the label via `mcp__github__issue_write`
immediately after opening (the `changeset` check fires on `opened` and
re-runs on `labeled`).

**Close the superseded PRs**: for each original Dependabot PR, post one
short comment pointing at the consolidated PR, then close it
(`mcp__github__pull_request_read`/`update_pull_request` with `state:
closed`). Closing the branch Dependabot owns is enough — it won't
reopen for the same version.

## Bumps-in-the-road checklist

- Stale `package-lock.json` → misleading ERESOLVE. `rm -rf node_modules
package-lock.json` before trusting the trace.
- Missing `src/generated/*` → "Cannot find module". Run `make codegen`
  before `tsc`.
- `@vitejs/plugin-react` / `vite-plugin-pwa` / `@vite-pwa/assets-generator`
  must move with a Vite major — they're not in the Dependabot batch.
- `eslint-plugin-jsx-a11y` peer lags ESLint majors → `overrides`, not a
  downgrade.
- New `recommended` lint rules from a major → disable, don't refactor.
- `favicon.ico` drift from the assets-generator → `make icons`.
- Don't merge the PRs individually — consolidate into one.
- Prettier formats this `SKILL.md` too — run `make fmt-check` (or
  `prettier --write` the file) after editing the skill, or CI's
  `fmt-check` job fails on it.

## Improve this skill every run

This playbook is only as good as the last bump taught it. **Every time
you run it, leave it sharper than you found it** — in the same PR, before
you call the task done:

1. **Capture what surprised you.** Anything that cost you a round trip
   the skill didn't warn about — a new peer-coupling (package X had to
   move with major Y), a fresh API break in the new versions, a new wave
   of lint rules, a generated artifact that drifted, a CI job that fired
   on an event you didn't expect — is a missing line here. Add it to the
   matching numbered step **and** a one-liner in the "Bumps-in-the-road
   checklist" so it's catchable at a glance.
2. **Correct what was wrong or stale.** If a version pin, peer range, or
   instruction in here didn't match reality this time (e.g. a plugin
   caught up to a peer and the `overrides` entry is no longer needed),
   edit it in place rather than appending a contradiction. The skill
   describes the _current_ shape, not its history — don't narrate "used
   to be X"; just make it say Y.
3. **Keep it lean.** Fold new findings into existing bullets where they
   belong instead of growing a parallel list. A 200-line skill nobody
   reads helps no one; the value is in the few non-obvious traps, kept
   current. Prune advice that the tooling has since made automatic.
4. **Generalize before you write.** A trap from one package
   (`jsx-a11y` lagging ESLint) is worth more stated as the pattern
   ("lint/format plugins lag their host's major; prefer an `overrides`
   shim over downgrading the host"). Capture the shape, cite the
   instance as the example.

The frontmatter `description` is load-bearing too: if you find this skill
fired for a request it shouldn't have, or _didn't_ fire when it should,
adjust the trigger phrasing there in the same pass.
