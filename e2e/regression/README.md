# Regression tests

Specs in this folder lock in fixes for **bugs that shipped at least
once**. The flow is:

1. Reproduce the bug in a Playwright spec under
   `e2e/regression/<short-slug>.spec.ts`. The spec should **fail**
   against the current `main`.
2. Fix the bug in `src/`.
3. The same spec now passes — commit the test and the fix in the same
   PR so the test is the regression net for the fix.

Specs here run alongside `e2e/specs/` on every push to `main` and as
part of the `Release` workflow. A spec that starts failing here means
the same bug came back — read the failing spec's docstring for the
original symptom and the GitHub issue / PR that introduced the fix.

## Naming

Use a short kebab-case slug that describes the symptom, not the cause.
A future reader scanning `ls e2e/regression/` should be able to guess
which user-visible bug each spec guards against:

- `e2e/regression/sheet-add-row-no-flicker.spec.ts`
- `e2e/regression/auth-guest-mode-survives-reload.spec.ts`
- `e2e/regression/settings-language-persists.spec.ts`

When a regression spec is more naturally grouped with another (e.g. a
follow-up tightening on the same bug), append a `-N` suffix —
`foo.spec.ts`, `foo-2.spec.ts` — rather than nesting subfolders.

## Header comment

Every regression spec opens with a one-paragraph block summarising:

- **What the user saw** (the surface symptom).
- **What was broken** (the proximate cause).
- **Link** to the issue / PR that introduced the fix.

Example:

```ts
// Regression: clicking "Add row" twice in a row sometimes appended
// only one row because the reducer's optimistic state lost the
// second dispatch when the click landed during a paint frame. Fixed
// in #123 by debouncing the reducer's batch flush.
```

## Linking from `debug-from-logs`

When the `debug-from-logs` skill walks a bug report from pasted logs,
it writes the failing-then-fixed spec into this folder before
proposing the fix. The folder grows over time — that's expected.
