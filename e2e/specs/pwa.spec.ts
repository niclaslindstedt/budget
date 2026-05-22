import { expect, test } from "../fixtures";

// Service worker + manifest assertions for the `/preview/` slot. The
// suite always runs against the preview build (see
// `playwright.config.ts`), so `id` / `scope` / `start_url` must all
// be `"/preview/"`. Production gets the same assertions via the
// release skill's manual post-flight checklist.

test.describe("PWA", () => {
  test("serves a preview-scoped manifest", async ({ page }) => {
    const resp = await page.request.get("./manifest.webmanifest");
    expect(resp.status()).toBe(200);
    const manifest = (await resp.json()) as Record<string, unknown>;
    expect(manifest.id).toBe("/preview/");
    expect(manifest.scope).toBe("/preview/");
    expect(manifest.start_url).toBe("/preview/");
    expect(manifest.name).toBe("Budget (preview)");
  });

  test("registers a service worker on /preview/", async ({ page }) => {
    await page.goto("./");
    const scope = await page.evaluate(async () => {
      if (!("serviceWorker" in navigator)) return null;
      const reg = await navigator.serviceWorker.ready;
      return reg.scope;
    });
    expect(scope).not.toBeNull();
    expect(scope!.endsWith("/preview/")).toBe(true);
  });
});
