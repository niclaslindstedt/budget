// Iterative design screenshot harness. The `recipe` block at the end
// of this file is the only thing an agent edits per iteration — the
// helpers above are stable building blocks for common app flows.
//
// Run:
//
//   make dev &                                 # leave running in the background
//   node .agent/skills/design/screenshot.mjs   # captures the recipe at every viewport
//
// Then `Read` the PNGs written under /tmp/design-*.png, tweak code,
// rerun. Vite HMR picks up edits without a rebuild so each loop is
// ~1-2s once the dev server is warm.
//
// CLI flags (all optional, sensible defaults):
//
//   --base-url <url>       Where the app is served (default
//                          http://localhost:5173/). Auto-falls back to
//                          /preview/ when the dev port is silent.
//   --out <dir>            Output directory (default /tmp).
//   --name <prefix>        Filename prefix (default "design").
//   --viewports <list>     Comma-separated subset of
//                          desktop,mobile,mobile-landscape,tablet
//                          (default desktop,mobile).

import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

// === HELPERS (don't edit — these stay stable across recipes) ===

// Playwright's `newContext` takes `viewport: { width, height }` as a
// nested object — passing `width` / `height` at the top level is a
// silent no-op and lands on the default 1280×720 desktop. Every entry
// here is shaped for direct spread into the context options.
const VIEWPORTS = {
  desktop: { viewport: { width: 1280, height: 800 } },
  // iPhone 12 viewport — same `390 × 844` Playwright's "iPhone 12"
  // device descriptor exposes, with hasTouch / isMobile flipped so
  // touchscreen swipes work and the mobile media queries match.
  mobile: {
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  },
  "mobile-landscape": {
    viewport: { width: 844, height: 390 },
    hasTouch: true,
    isMobile: true,
  },
  // iPad mini portrait — wide enough to render the desktop layout
  // but narrow enough that responsive overrides are visible.
  tablet: {
    viewport: { width: 768, height: 1024 },
    hasTouch: true,
    isMobile: true,
  },
};

// Land on the auth screen and click into guest mode. Returns once
// the header wordmark is visible — the budget reducer is fully
// hydrated by that paint, so callers can chain UI interactions
// immediately.
export async function signInAsGuest(page) {
  await page.goto("./");
  await page
    .getByRole("button", { name: /^Continue (without account|as guest)$/ })
    .click();
  await page.getByText("budget", { exact: true }).waitFor();
}

// Open the New-sheet modal, name the sheet, pick its type, confirm.
// `type` is the visible TypePicker label — "Budget" or "Accounts".
// The Accounts type is a workspace singleton; this is a no-op if one
// already exists (the option greys out and the click is dropped).
export async function addSheet(page, name, type = "Budget") {
  await page.getByRole("button", { name: "New sheet", exact: true }).click();
  const modal = page.getByRole("dialog");
  await modal.getByRole("textbox", { name: "Name" }).fill(name);
  if (type !== "Budget") {
    // Default selection is Budget — only open the picker when we need
    // something else, otherwise the dropdown can race with the focus
    // shift after fill().
    await modal.getByRole("button", { expanded: false }).first().click();
    await page.getByRole("option", { name: type }).click();
  }
  await modal.getByRole("button", { name: /^Create/ }).click();
  await page.getByRole("heading", { name, level: 2 }).waitFor();
}

// Add a financial account from the Accounts sheet. Caller is
// responsible for being on the Accounts sheet first (use
// `addSheet(page, "Accounts", "Accounts")`).
export async function addAccount(page, name) {
  await page.getByRole("button", { name: "Add account" }).click();
  const modal = page.getByRole("dialog");
  await modal.getByRole("textbox", { name: "Name" }).fill(name);
  await modal.getByRole("button", { name: /^Create/ }).click();
  // The "Edit <name>" pen button is the unambiguous "row exists" probe
  // — other per-row buttons share the account name too (view, delete,
  // more) so a bare button match would trip strict mode.
  await page
    .getByRole("button", { name: `Edit ${name}`, exact: true })
    .waitFor();
}

// Synthesize a horizontal swipe on a sheet row. Playwright's
// `touchscreen` lacks a built-in swipe primitive, so we dispatch the
// raw `TouchEvent` triple the SheetRow / AccountRow handlers listen
// for. Use this whenever you need to capture a `.is-swiped` state.
export async function swipeLeft(page, locator, distance = 200) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("swipeLeft: target locator not in viewport");
  const y = box.y + box.height / 2;
  const startX = box.x + box.width - 20;
  const endX = startX - distance;
  await page.evaluate(
    ({ startX, endX, y, rowId }) => {
      const target = rowId
        ? document.querySelector(`[data-row-id="${CSS.escape(rowId)}"]`)
        : document.elementFromPoint(startX, y);
      if (!target) return;
      const t = (x) =>
        new Touch({
          identifier: 1,
          target,
          clientX: x,
          clientY: y,
          pageX: x,
          pageY: y,
        });
      target.dispatchEvent(
        new TouchEvent("touchstart", {
          bubbles: true,
          touches: [t(startX)],
          changedTouches: [t(startX)],
        }),
      );
      target.dispatchEvent(
        new TouchEvent("touchmove", {
          bubbles: true,
          touches: [t(endX)],
          changedTouches: [t(endX)],
        }),
      );
      target.dispatchEvent(
        new TouchEvent("touchend", {
          bubbles: true,
          touches: [],
          changedTouches: [t(endX)],
        }),
      );
    },
    { startX, endX, y, rowId: await locator.getAttribute("data-row-id") },
  );
  // The swipe-in transition is 200ms (see `transition: transform
  // 200ms ease` in styles.css); wait one frame past that so the
  // screenshot captures the rest state, not a mid-animation frame.
  await page.waitForTimeout(260);
}

// Pop the local "make dev" Vite server, or fall back to a built
// preview server if dev is silent. The skill prefers dev for HMR
// speed; preview is the deterministic backup.
async function resolveBaseUrl(explicit) {
  if (explicit) return explicit;
  const candidates = [
    "http://localhost:5173/",
    "http://localhost:4173/preview/",
  ];
  for (const url of candidates) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(750) });
      if (res.ok || res.status === 304) return url;
    } catch {
      // try next candidate
    }
  }
  throw new Error(
    "No app server reachable. Start `make dev` (or `make preview-build && make preview-serve`) before running this script.",
  );
}

function parseArgs(argv) {
  const args = { out: "/tmp", name: "design", viewports: "desktop,mobile" };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const eq = a.indexOf("=");
    const [flag, inline] =
      eq === -1 ? [a, undefined] : [a.slice(0, eq), a.slice(eq + 1)];
    const value = inline ?? argv[++i];
    if (flag === "--base-url") args.baseUrl = value;
    else if (flag === "--out") args.out = value;
    else if (flag === "--name") args.name = value;
    else if (flag === "--viewports") args.viewports = value;
    else throw new Error(`Unknown flag: ${flag}`);
  }
  return args;
}

// === RECIPE (edit this per iteration) ===
//
// `recipe` runs once per viewport. It receives the page already
// pointed at the right base URL but otherwise empty — drive the UI
// however you need, ending in the visual state you want to inspect.
// The harness takes the screenshot for you after this returns.
//
// `viewport` is the key from VIEWPORTS so the recipe can branch on
// breakpoint when needed (e.g. only swipe on mobile).

async function recipe(page, _viewport) {
  // Replace this block with the flow you're iterating on. The
  // "Recipe patterns" section of SKILL.md has copy-pasteable
  // starting points; the helpers above (signInAsGuest, addSheet,
  // addAccount, swipeLeft) cover the most common chrome.
  await signInAsGuest(page);
}

// === RUN (don't edit) ===

async function main() {
  const args = parseArgs(process.argv);
  const baseURL = await resolveBaseUrl(args.baseUrl);
  if (!existsSync(args.out)) await mkdir(args.out, { recursive: true });
  const viewports = args.viewports.split(",").map((s) => s.trim());
  const browser = await chromium.launch();
  try {
    for (const viewport of viewports) {
      const spec = VIEWPORTS[viewport];
      if (!spec) {
        console.error(
          `Unknown viewport "${viewport}". Known: ${Object.keys(VIEWPORTS).join(", ")}`,
        );
        process.exitCode = 1;
        continue;
      }
      const ctx = await browser.newContext({
        baseURL,
        // Default to dark mode — matches the One Dark palette the app
        // is themed against, and most contributors run in dark too.
        // Override per-recipe by calling `page.emulateMedia` after
        // signing in if you need to inspect light mode.
        colorScheme: "dark",
        ...spec,
      });
      const page = await ctx.newPage();
      try {
        await recipe(page, viewport);
        const path = join(args.out, `${args.name}-${viewport}.png`);
        await page.screenshot({
          path,
          fullPage: viewport.startsWith("mobile") ? false : true,
        });
        console.log(path);
      } finally {
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
