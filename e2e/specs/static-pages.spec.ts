import { expect, test } from "../fixtures";

// Static SPA routes — `/privacy/` and `/changelog/` — emit a per-route
// `<title>` and body at build time (see `emit-path-alias-with-seo` in
// `vite.config.ts`). The specs assert both surfaces render so a broken
// alias or a JS-only crash in either page is caught by CI.

test.describe("Static routes", () => {
  test("/privacy/ renders the privacy policy", async ({ page }) => {
    await page.goto("privacy/");
    await expect(
      page.getByRole("heading", { name: /privacy/i }).first(),
    ).toBeVisible();
    // The page links back to the home preview slot — proves the SPA
    // shell mounted and i18n hydrated.
    await expect(
      page.getByRole("link", { name: /back to budget/i }).first(),
    ).toBeVisible();
  });

  test("/changelog/ renders the release notes page", async ({ page }) => {
    await page.goto("changelog/");
    await expect(
      page.getByRole("heading", { name: /change.?log/i }).first(),
    ).toBeVisible();
  });
});
