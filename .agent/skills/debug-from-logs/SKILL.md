---
name: debug-from-logs
description: "Use whenever the user pastes captured log output in a message — production diagnostics from the in-app Logs tab, a console transcript, a CI snippet, anything resembling timestamped or scoped log lines. Walks the trace from last-known-good to the failure, traces each suspicious line back to its source by greping the logged string, forms and verifies a root-cause hypothesis, and — critically — ends by evaluating whether the logs themselves were sufficient and adds the missing diagnostics in the same change when they were not."
---

# Debugging from pasted logs

Pasted logs are the user's primary debugging surface for this app —
the in-app Logs tab (`src/utils/logger.ts` + the Logs settings tab)
captures every `[scope] LEVEL message` entry into a ring buffer and
persists it across reloads when capture is on. When the user shares
that output, they've usually already reproduced the bug and the
trace is what's actionable. This skill is the playbook for turning
that trace into a fix without losing time guessing.

Three things distinguish this from generic "read the error and fix
it":

1. **Read the trace as a transaction.** Find the last successful
   operation, the first sign of trouble, and the terminal failure.
   The gap between the first two is where the bug usually hides.
2. **Treat log sufficiency as part of the deliverable.** A bug that
   was hard to diagnose from the logs is going to be hard to
   diagnose next time too. The final step of every run is to ask
   whether the trace contained enough to find the bug, and to ship
   the missing diagnostics in the same PR when it did not.
3. **Confirm the bug with a Playwright spec before fixing it.** A
   reproduction in `e2e/regression/` makes "is the bug fixed?" a
   one-command answer (`make e2e`) instead of a manual click-around,
   and the same spec becomes the permanent regression net once the
   fix lands. Specs that run a dev server and screenshot the failing
   surface also surface UI-only bugs the logs alone can't show.

## When to invoke

Invoke this skill the moment the user's message contains pasted log
output — even if they didn't say "debug this" explicitly. Triggers
include but are not limited to:

- A message with multiple lines that look like
  `HH:MM:SS [scope] LEVEL message` (the in-app logger format).
- A pasted browser console / devtools transcript.
- A CI failure block with timestamps, stack traces, or
  `error:` / `fail:` prefixes.
- Output from `make test`, `make build`, or any other command the
  user ran locally.
- Stack traces with file:line:column locations.

If the message has logs **plus** an explicit "fix this", run the
skill — the explicit ask doesn't change the process. If you're
unsure whether something counts as logs (e.g. a short single-line
error string), default to running the skill — the cost of going
through the checklist on a small payload is low.

Do **not** invoke this skill for:

- A request to write new logs / instrument code from scratch
  (without an existing failure to diagnose).
- A code-review pass where logs are pasted as context but the user
  is asking about something other than a bug.

## Process

Walk these steps in order. Don't skip ahead — the early steps
constrain the search space for the later ones.

### 1. Frame what the user observed vs expected

Before reading the logs, restate the symptom in one sentence: what
did the user do, and what was supposed to happen instead? The logs
will tell you which code paths ran; only the symptom tells you
which one was wrong.

If the user didn't say what they expected, ask once (briefly) and
proceed. The symptom anchors every later judgement about
"suspicious vs benign" log lines.

### 2. Read the trace top-to-bottom once

Don't grep yet. Skim the whole paste so you have a mental picture
of the scopes involved, the rough timeline, and where levels jump
from `INFO` to `WARN` / `ERROR`. Note:

- **The last successful operation.** The most recent line that
  matches the symptom's "supposed to happen" path.
- **The first sign of trouble.** The earliest `WARN`, `ERROR`, or
  visibly anomalous `INFO` (unusual duration, missing follow-up,
  unexpected branch).
- **The terminal failure.** The last line before the trace stops or
  starts looping.

The bug lives in the code path executed between the last success
and the first sign of trouble. The terminal failure is usually a
downstream symptom, not the root cause.

### 3. Trace each suspicious entry back to its source

For every interesting line, grep the codebase for the literal
message text — the in-app logger always logs string-interpolated
templates, so the message + surrounding context narrows the call
site immediately.

```sh
# Pin the call site of a known log line.
git grep -n "loadGisScript: network error"

# Or, when the message has interpolated values, search a stable
# prefix or suffix.
git grep -n "popup failed"
```

For each match, **read the surrounding 20–40 lines** — the
diagnostic value is in the control flow around the log call (which
branch logged it, which branch silently didn't, what happens next).

### 4. Identify silent gaps

A common shape in this codebase: a `try { … } catch (err) { log.error(…); return; }`
that swallows the failure without re-throwing or surfacing it
upstream. The log message you see is real, but the trace ends there
because the rest of the system never finds out the operation
failed.

When the log line that should follow the error is missing, that
catch is the gap. Note it — both as a candidate root cause and as a
candidate site for "step 7: insufficient logging".

Other silent gaps to look for:

- An `await` missing on a Promise-returning call, so a rejection
  becomes an unhandled rejection that never reaches the logger.
- An error logged with `log.error("op failed", err)` where the
  logger's `Error.stack` rendering swallows `.message` (notably on
  Safari / iOS Safari, whose `err.stack` doesn't include
  `name: message` on the first line). The user sees only a file
  location and no description.
- A scope that fires `INFO start` but no matching `INFO ok` or
  `ERROR failed` — the operation went into the call and never came
  out.

### 5. Form a single hypothesis

State the root cause in one sentence, naming a file and a line
range. Examples:

- "`src/storage/gdrive-adapter.ts:692` rejects with a "couldn't
  reach Google" Error when the GIS script can't load, but
  `src/App.tsx:2717` catches and returns silently, so the picker
  selection has no visible effect."
- "`src/data/recurring.ts:142` reads `entry.amount` as a number,
  but the JSON migration at `src/data/migrations.ts:88` left
  pre-v3 entries with `amount: "1234.56"` strings, so the sum
  short-circuits to `NaN` on the first row."

If you can't pin it to a file and line range yet, you're not done
with step 3 — keep grepping until you can.

### 6. Verify by reading code, not by running

The user already ran it. Open the candidate file at the line range
in the hypothesis, read the control flow, and confirm the
hypothesis explains every suspicious log line in step 2. If a log
line doesn't fit the story, either the hypothesis is wrong or
there's a second bug.

When you're confident the hypothesis holds, propose or apply the
fix per the user's instructions and the standard `executing-actions-with-care`
rules in `AGENTS.md`.

### 6a. Confirm the bug with a Playwright regression spec

Before writing the fix, write the regression test that proves the
bug exists. Drop it under `e2e/regression/<slug>.spec.ts` with a
short header comment describing the symptom (see
`e2e/regression/README.md` for the conventions). The spec should:

1. Drive the same user journey the trace describes — usually via
   `signInAsGuest(page)` plus the buttons / inputs the reported
   reproduction touches.
2. Assert the broken surface as a `expect(...)`. The spec must
   **fail** against current `main` before you touch the fix —
   otherwise you don't have a real regression net, you have a
   tautology. Run `make e2e -- e2e/regression/<slug>.spec.ts` to
   prove the red state, then commit the spec alongside the fix so
   the same spec lights green after.
3. For UI-only bugs (rendering glitches, focus traps, missing
   elements at a viewport size), screenshot the failing surface
   inside the spec so the report carries a picture:

   ```ts
   await page.screenshot({
     path: "test-results/<slug>-symptom.png",
     fullPage: true,
   });
   ```

   Playwright also writes a `test-failed-1.png` automatically when
   the assertion fails — point the user at it in the report instead
   of describing the misrender in prose.

### 6b. Iterate against a running dev server when the bug is visual

A spec is the right answer when the bug is reproducible from a
clean state. When the bug needs a half-finished gesture (a hover,
a focus, a half-swiped row) or shows up only against the dev
server's HMR-fed bundle, run a dev server in the background and
drive Chromium through Playwright's REPL / a throwaway spec
instead:

```sh
# In one shell — leave it running for the duration of the debug.
make dev   # http://localhost:5173

# In another, use `npx playwright codegen http://localhost:5173`
# to record selectors, or write a one-off spec with
# `await page.pause()` so the inspector pops open mid-flow.
```

When the visual hypothesis is clear, port the throwaway spec into
`e2e/regression/<slug>.spec.ts` and switch its base URL back to
the preview build (Playwright's default `baseURL` in
`playwright.config.ts`). The regression spec lives forever; the
dev-server scratch pad does not.

### 7. Evaluate log sufficiency — and ship the missing logs

This is the step the skill exists for. After the bug is identified,
ask three questions:

1. **Did the logs contain the root cause?** Could a future reader
   have found it by reading only the pasted trace, without your
   greps?
2. **Were the silent gaps from step 4 the proximate diagnostic
   blocker?** A swallowed catch that left the trace truncated, an
   error rendered without its `.message`, a missing scope on the
   component that started the flow — all of these turned a five-
   minute fix into a fifteen-minute one.
3. **Will the next instance of this class of bug look the same in
   the logs?** If the same diagnostic gap exists across many
   sibling sites, the fix is to teach the logger / the catch
   pattern, not just to patch the one site.

If the answers point at any of these, **add the missing logging in
the same PR as the bug fix**. Concretely:

- Add a `log.warn(...)` or `log.error(...)` at every silently-
  caught error in the path you investigated.
- Add an `INFO` log at the user gesture that started the flow
  (button click, picker selection, drag-drop, etc.) so the next
  trace shows where the transaction began.
- If `err.stack` swallowed the message, fix the logger's error
  rendering instead of every call site.
- If a scope is missing from a module that participates in the
  flow, add `const log = createLogger("<scope>")` and a small
  number of `log.info` calls for the public entry points.

Don't go on a logging spree — the goal is the minimum set that
makes the next reproduction's trace self-explanatory. If you wrote
more than ~5 new log calls, you're probably over-instrumenting;
prune.

### 8. Report

Reply to the user with:

1. The one-sentence root cause (from step 5).
2. The proposed or applied fix.
3. The path to the new `e2e/regression/<slug>.spec.ts` spec, with
   a one-line note that it was red before the fix and green after.
   Drop the screenshot path here too if the bug was visual.
4. A short note about which logs you added and why, or "logs were
   sufficient — no diagnostics added" if step 7 came up clean.

Keep the report tight. The diff and the commit message hold the
detail.

## Working with this codebase's Playwright suite

The end-to-end suite lives under `e2e/` and runs against the built
`/preview/` slot (`playwright.config.ts`). Key facts for debug
sessions:

- `make e2e` builds + serves the preview, then runs every spec under
  `e2e/specs/` and `e2e/regression/`. Add `-- e2e/regression/<slug>.spec.ts`
  to scope to one spec, or `--headed` to see the browser.
- `make e2e-ui` opens Playwright's interactive runner — best when
  iterating on a flaky spec; you can see each step's snapshot and
  re-run frames inline.
- `signInAsGuest(page)` (`e2e/fixtures.ts`) drives the standard
  no-password entry path. Use it rather than re-clicking the auth
  screen in every spec.
- The `clean` fixture in `e2e/fixtures.ts` wipes `localStorage`,
  `sessionStorage`, and IndexedDB before every test. If a regression
  reproduction depends on stale state, set it up explicitly inside
  the test instead of leaking across files.
- Playwright writes traces, screenshots, and videos to
  `test-results/<spec>/` on failure. The HTML reporter dumps to
  `playwright-report/index.html` — open it after a red run with
  `npx playwright show-report`.
- For "show me what the failure looks like" requests, run the
  failing spec with `--retries=0 --reporter=null` so the
  `test-failed-1.png` lands in `test-results/...` quickly, then
  point the user at the path.

## Working with this codebase's logger

`src/utils/logger.ts` is the canonical logger. Key facts:

- `createLogger(scope)` returns `{ info, warn, error, time }`. Use
  `scope` names matching existing modules (e.g. `"dropbox"`,
  `"gdrive"`, `"app"`, `"storage-hook"`) so traces correlate
  across modules. Scope names are visible to the user in the Logs
  tab.
- The logger writes only to the in-app ring buffer, never to
  `console.*`. So pasted logs always come from the in-app capture
  surface — don't trust devtools-pasted output unless the user
  explicitly says they're sharing the browser console.
- `log.time(label, fn)` emits a start + `ok (XXms)` pair on
  success, or `failed (XXms)` + error on rejection. Useful when
  diagnosing latency or hung operations — turn a suspect `await`
  into a `log.time` to make the gap visible.
- Errors are rendered by `describeError()` (`src/utils/logger.ts`)
  which always leads with `name: message` before the stack. If a
  pasted log shows only a file location and no message, the call
  site is likely passing a non-Error value (a string, an object, a
  rejected promise's reason that isn't an Error) — fix the call
  site to throw an `Error` so the logger can render it.

## Skill self-improvement

After a run:

1. If a recurring diagnostic gap keeps showing up (the same shape
   of silent catch across many adapters, the same missing scope,
   etc.), add a row to step 4's "Other silent gaps to look for"
   list.
2. If the trigger heuristic in "When to invoke" misfired (you
   skipped the skill on a paste that needed it, or ran it on a
   paste that didn't), tighten the bullet list accordingly.
3. If you found yourself reaching for a grep pattern repeatedly
   (e.g. `git grep -n "failed (\d+ms)"` for hung ops), promote it
   into step 3's examples.
4. If you couldn't write the regression spec because the surface
   was hard to reach from `signInAsGuest(page)` (the fixture's
   default entry path), add a helper to `e2e/fixtures.ts` so the
   next regression on the same surface starts from a known state.
5. Commit the skill edit alongside the bug fix, the regression
   spec, and any missing diagnostics — the skill is documentation
   of what worked, and drift on the skill itself is the same kind
   of error the skill prevents.
