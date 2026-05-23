import { expect, test } from "../fixtures";

// Static SPA route — `/privacy/` — emits a per-route `<title>` and
// body at build time (see `emit-path-alias-with-seo` in
// `vite.config.ts`). The spec asserts the surface renders so a broken
// alias or a JS-only crash in the page is caught by CI.

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
});
