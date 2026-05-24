---
name: design
description: "Use whenever you are iterating on the look or layout of a screen — tuning a CSS rule, building a new modal, redesigning a table, hunting a mobile-only regression. Walks an edit / reload / screenshot / inspect loop that uses the Read tool to view PNGs inline at every viewport (desktop, mobile, mobile-landscape, tablet). The harness drives the app through reusable flows (sign in, add sheet, add account, swipe a row) so each iteration only changes the bit that's being designed. Manual playbook — not part of the `maintenance` umbrella."
---

# Iterating on visual design

The app is a single-page React SPA. Most layout bugs only surface at
specific viewports (the desktop table vs the mobile card grid, swipe
state vs at-rest, soft-keyboard pushing the modal footer up). Looking
at the rendered pixels at every iteration is what makes "tuning the
spacing" fast — without it, the loop is "edit, reload, switch to
phone, scroll, sigh, swap back" and an hour disappears.

This skill ships a small harness at
`.agent/skills/design/screenshot.mjs` that:

- Connects to whatever app server is already running (`make dev` on
  port 5173 preferred; falls back to `make preview-serve` on 4173).
- Spins up Chromium contexts for desktop / mobile / mobile-landscape
  / tablet viewports as needed.
- Drives the UI through a per-iteration **recipe** the agent edits.
- Writes one PNG per viewport to `/tmp/design-<viewport>.png` so the
  next step is just `Read /tmp/design-mobile.png`.

The Read tool renders PNGs inline. That's the whole reason this skill
is fast — you can see every iteration without leaving the session.

## When to invoke

Invoke whenever you are about to change something visible and you'd
benefit from comparing renders across iterations:

- Tuning padding, gap, radius, colour on a component you can already
  navigate to.
- Building a new modal / page / table and want to confirm it looks
  right at every breakpoint before declaring it done.
- Debugging a mobile-only layout bug a desktop-only test missed
  (swipe-revealed action cells, soft-keyboard pushing modal footers,
  iOS rounded corners on icons, `dvh` vs `svh` flicker).
- Verifying a CSS rule actually wins the cascade — colored
  backgrounds on action buttons, `border-width` token reach, the
  Custom-theme radius preset.

Do **not** invoke when:

- The change has no visible surface (pure refactor, internal hook
  rename, build config). Type-check and tests are the right loop.
- The bug is a behavioural regression with no visual component.
  Reach for the `debug-from-logs` or e2e suite instead.
- The visual concern is the home-screen / launcher icon (different
  pipeline — `tune-pwa-icons` covers that).

## Pipeline

```
your code edit
   │
   ▼  vite HMR (already running via `make dev`)
   │
   ▼  node .agent/skills/design/screenshot.mjs
   │       ├─ resolves base URL (dev → preview fallback)
   │       ├─ for each --viewports entry:
   │       │     ├─ open Chromium context with that viewport
   │       │     ├─ run `recipe(page, viewport)` (the editable block)
   │       │     └─ page.screenshot() → /tmp/design-<viewport>.png
   │       └─ prints the written paths to stdout
   │
   ▼  Read /tmp/design-desktop.png  /tmp/design-mobile.png
   │
   └── inspect, decide, loop
```

`recipe(page, viewport)` is the only block you edit between
iterations. It's a `function(page, viewport)` near the bottom of the
script with a clear `// === RECIPE ===` banner around it. Everything
above is reusable plumbing.

## The iteration loop

1. **Boot the dev server once.** Vite HMR makes reloads ~100ms after
   the first warm-up.

   ```sh
   make dev &
   ```

   If `make dev` is already running, skip this step.

2. **Edit the recipe** at the bottom of
   `.agent/skills/design/screenshot.mjs`. The default recipe is a
   placeholder — replace it with the flow that lands on the state
   you want to see. Use the exported helpers (`signInAsGuest`,
   `addSheet`, `addAccount`, `swipeLeft`, …) instead of re-clicking
   through the chrome.

3. **Edit the code you're designing** under `src/`. Single targeted
   change per iteration — a diff that touches three CSS rules at
   once makes it hard to tell which one moved the screenshot.

4. **Run the harness.**

   ```sh
   node .agent/skills/design/screenshot.mjs --viewports desktop,mobile
   ```

   Vite HMR has already shipped the edit to the running tab; the
   fresh Chromium context just opens to the current state. No
   rebuild step.

5. **Read the PNGs.**

   ```
   Read /tmp/design-desktop.png
   Read /tmp/design-mobile.png
   ```

6. **Adjust and repeat.** Two to four iterations from a clean
   starting point is usually enough. If you're past six iterations on
   the same component, the source design probably wants restructuring
   (split into two components, change the layout primitive, swap the
   responsive strategy) instead of another nudge to the same rule.

## CLI flags

All flags are optional.

| Flag                 | Default          | What it does                                                                                                                                                                                                                                                  |
| -------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--base-url <url>`   | auto-detect      | Where the app is served. Defaults to `http://localhost:5173/` (vite dev) and falls back to `http://localhost:4173/preview/` (vite preview) when 5173 is silent. Pass an explicit URL to target a deployed slot.                                               |
| `--out <dir>`        | `/tmp`           | Output directory for the PNGs.                                                                                                                                                                                                                                |
| `--name <prefix>`    | `design`         | Filename prefix. Useful when iterating on two screens in parallel (`--name modal-foo` vs `--name table-bar`).                                                                                                                                                 |
| `--viewports <list>` | `desktop,mobile` | Comma-separated subset of `desktop`, `mobile`, `mobile-landscape`, `tablet`. Skip the ones you don't need so the loop stays under a couple of seconds. Mobile viewports always write `fullPage: false` (one-screen capture); desktop writes the full content. |

## Available helpers

All exported from `screenshot.mjs`. Import them at the top of a
custom recipe (or just reference them — the recipe runs in the same
file so they're in scope).

| Helper                                   | What it does                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `signInAsGuest(page)`                    | Click "Continue without account" and wait until the budget shell is hydrated.                                                                                                                                                                                                                                                                                                       |
| `addSheet(page, name, type)`             | Drive the New-sheet modal. `type` is the visible TypePicker label — `"Budget"` (default) or `"Accounts"`. The Accounts type is a workspace singleton, so calling this twice with `"Accounts"` is a no-op on the second call.                                                                                                                                                        |
| `addAccount(page, name)`                 | Drive the Add-account modal. Caller must already be on the Accounts sheet.                                                                                                                                                                                                                                                                                                          |
| `swipeLeft(page, locator, distance=200)` | Dispatch the raw `TouchEvent` triple (`touchstart` → `touchmove` → `touchend`) that the `SheetRow` / `AccountRow` handlers listen for. Needed to capture `.is-swiped` state because Playwright's `touchscreen` API lacks a swipe primitive. Targets the locator's row id when present so the event lands on the row, not whatever element happens to be under the start coordinate. |

When the helper set is missing something your recipe needs, add it
to the HELPERS block of `screenshot.mjs` so the next agent gets it
for free (and update the table above + the **Skill self-improvement**
section).

## Recipe patterns

### "I just want to see the budget shell on a fresh guest"

```js
async function recipe(page) {
  await signInAsGuest(page);
}
```

### "I'm tuning the Accounts table swipe state on mobile"

```js
async function recipe(page, viewport) {
  await signInAsGuest(page);
  await addSheet(page, "Accounts", "Accounts");
  for (const name of ["Lönekonto", "Extrakonto", "Utgiftskonto"]) {
    await addAccount(page, name);
  }
  if (viewport.startsWith("mobile")) {
    const row = page.getByRole("row").filter({ hasText: "Lönekonto" });
    await swipeLeft(page, row);
  }
}
```

### "I'm tuning a modal's chrome"

```js
async function recipe(page) {
  await signInAsGuest(page);
  await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("menuitem", { name: "Settings" }).click();
}
```

### "I want both light and dark mode side-by-side"

Run the harness twice with `--name design-light` / `--name design-dark`
and toggle the theme inside the recipe via the Settings modal (or by
setting `localStorage` before the first navigation). Keeping the two
runs separate makes the diff between them obvious in the Read output.

## Common pitfalls

The trip-ups we've actually hit, in roughly descending order of
recurrence:

1. **Forgot to start the dev server.** The harness errors out with a
   pointer to `make dev` / `make preview-serve`. Boot it once at the
   start of the session and leave it running.
2. **Mobile screenshot is missing the swipe state.** The transition
   takes 200ms; the harness already waits 260ms inside `swipeLeft`.
   If you've written a custom swipe path, add a matching wait or the
   PNG captures a mid-animation frame.
3. **Recipe forgets to `await` an interaction.** A bare promise
   means the next step races; the PNG sometimes captures the right
   state and sometimes doesn't. Always `await` every helper call.
4. **CSS rule "looks fine" but isn't winning the cascade.** Tailwind
   utilities live in the `utilities` layer and beat anything in
   `components`. Spec the rule out of an unlayered block, or raise
   the specificity past the conflicting utility. Reading the
   computed style in the Chromium devtools the recipe leaves the
   context open in is the fastest way to confirm.
5. **Viewport mismatch with media queries.** The mobile breakpoint
   is `max-width: 720px` (or `max-height: 500px`). The harness's
   `mobile` is `390 × 844`, which matches; if you add a custom
   viewport between 721 and the desktop minimum, the rules you're
   tuning won't apply.
6. **Strict-mode locator violations in a recipe.** Every accessible-
   name match must be unique. When two buttons share an aria-label
   (the Accounts table's name + view-history cells both expose
   "View history for X"), filter further with `.filter({ hasText:
... })` or pick a different aria-distinguishable button.

## Verification

A loop is "done" when:

- The PNG at every required viewport matches the intended design.
- The same code path looks right at the _next_ breakpoint up (the
  desktop edit didn't accidentally regress mobile, or vice versa).
- The change passes `make typecheck` and `make lint`; the visual
  signal in the screenshots is not a substitute for the
  type/lint/test gates.
- If the change includes a behavioural surface (new buttons,
  reordered controls), an e2e spec under `e2e/specs/` covers it.

## Skill self-improvement

After a run:

1. If the recipe needed a helper that wasn't in the script, add it
   to the HELPERS block and document it in the table above so the
   next agent doesn't reinvent it. Common candidates: opening
   specific modals, seeding categories / types, picking a category
   from a chip picker.
2. If a new viewport mattered for the bug (foldable phone, ultrawide
   desktop, a specific narrow band where a media query flips), add it
   to `VIEWPORTS` and mention the breakpoint context in this skill.
3. If `--base-url` had to point at a deployed slot (preview, prod)
   and the script's fallback chain didn't anticipate that, extend
   `resolveBaseUrl` and update the CLI flags table.
4. Commit the skill edit alongside the design edit so the next loop
   starts from current truth.
