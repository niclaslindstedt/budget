import AxeBuilder from "@axe-core/playwright";

import { expect, signInAsGuest, test } from "../fixtures";

// Automated a11y smoke. Runs axe-core against the auth screen and a
// few representative post-auth surfaces (budget shell, an open
// modal, an open custom picker). Asserts zero violations at each
// snapshot.
//
// Scope tradeoffs:
//
// * `color-contrast` is disabled because the contrast story is
//   per-theme (Dark, Light, Dracula, GitHub Dark, GitHub Light, the
//   user's Custom palette) and a single browser run can only sample
//   one. A dedicated contrast-audit follow-up will sweep every theme;
//   gating it here would block PRs on a separate, scoped concern.
//
// * `region` (every page region must be inside a landmark) is also
//   off — the floating chrome (toasts, install prompt, update toast)
//   intentionally sits outside the `<main>` landmark so it survives
//   modal-driven `inert` flips. Re-enable once those surfaces grow
//   their own landmarks.
//
// The suite uses `analyze()` not `withTags(...).analyze()` so a fresh
// axe rule landing in a future axe-core upgrade is surfaced as a real
// finding instead of silently included only via a tag we forgot to
// list. CI failure on a new rule is the right default — we'd rather
// know.

const COMMON_DISABLES = ["color-contrast", "region"];

test.describe("Accessibility", () => {
  test("auth screen has no axe violations", async ({ page }) => {
    await page.goto("./");
    await expect(
      page.getByRole("heading", { name: "Welcome — create your account" }),
    ).toBeVisible();
    const results = await new AxeBuilder({ page })
      .disableRules(COMMON_DISABLES)
      .analyze();
    expect(results.violations).toEqual([]);
  });

  test("budget shell has no axe violations", async ({ page }) => {
    await signInAsGuest(page);
    const results = await new AxeBuilder({ page })
      .disableRules(COMMON_DISABLES)
      .analyze();
    expect(results.violations).toEqual([]);
  });

  test("settings modal has no axe violations", async ({ page }) => {
    await signInAsGuest(page);
    await page.getByRole("button", { name: "Open menu" }).click();
    await page.getByRole("menuitem", { name: "Settings" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    const results = await new AxeBuilder({ page })
      .disableRules(COMMON_DISABLES)
      .analyze();
    expect(results.violations).toEqual([]);
  });
});
