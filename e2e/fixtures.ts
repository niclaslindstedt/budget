import { expect, test as base, type Page } from "@playwright/test";

// Shared Playwright fixtures and helpers for the e2e suite.
//
// Tests run against the built `/preview/` slot (`playwright.config.ts`).
// Two state-isolation rules keep them deterministic:
//
//   1. Each test gets a fresh browser context (Playwright's default).
//   2. We clear the app's persisted state (localStorage + IndexedDB
//      + sessionStorage) before every test via the `clean` fixture,
//      so a previous test signing in as guest can't leak data into
//      the next one's auth-screen render.
//
// The `signInAsGuest` helper drives the most common entry path: the
// app's auth screen with no real accounts. Most specs that exercise
// post-auth flows lean on it instead of re-clicking the same button.

export const test = base.extend<{ clean: void }>({
  // Auto-running fixture that wipes per-origin storage before the test
  // body. The `auto` flag makes it run for every test without each spec
  // having to opt in.
  clean: [
    async ({ page }, use) => {
      // Land on the preview slot before clearing storage. We use a
      // relative URL ("./") so it appends to Playwright's `baseURL`
      // path (`/preview/`) — an absolute "/" would skip the preview
      // prefix and hit Vite's "the server is configured with a public
      // base URL of /preview/" notice page instead.
      await page.goto("./");
      await page.evaluate(async () => {
        try {
          window.localStorage.clear();
          window.sessionStorage.clear();
        } catch {
          // Some browsers throw on storage access when third-party
          // cookies are blocked — for our same-origin preview that
          // never fires, but we'd rather not crash the test setup.
        }
        if (
          "indexedDB" in window &&
          typeof indexedDB.databases === "function"
        ) {
          try {
            const dbs = await indexedDB.databases();
            await Promise.all(
              dbs
                .filter((d) => typeof d.name === "string")
                .map(
                  (d) =>
                    new Promise<void>((resolve) => {
                      const req = indexedDB.deleteDatabase(d.name as string);
                      req.onsuccess = () => resolve();
                      req.onerror = () => resolve();
                      req.onblocked = () => resolve();
                    }),
                ),
            );
          } catch {
            // Best-effort: a blocked / unsupported delete won't break
            // the test because the rest of state lives in localStorage.
          }
        }
        // PWA hygiene: drop any service worker registration and wipe
        // every Cache Storage namespace before the test body runs.
        // Without this, a preview SW (registered the first time a
        // test loaded `/preview/`) would serve precached entries to
        // every subsequent test in the same context.
        try {
          if ("serviceWorker" in navigator) {
            const regs = await navigator.serviceWorker.getRegistrations();
            await Promise.all(regs.map((r) => r.unregister()));
          }
          if ("caches" in self) {
            const keys = await caches.keys();
            await Promise.all(keys.map((k) => caches.delete(k)));
          }
        } catch {
          // Best-effort: privacy modes / locked-down contexts may
          // refuse SW or Cache Storage access. Ignore — the suite
          // doesn't depend on offline behaviour today.
        }
      });
      await use();
    },
    { auto: true },
  ],
});

export { expect };

// Click the "Continue without account" link on the auth screen and
// wait for the budget shell to take over. Returns once the header's
// "budget" wordmark is visible — the budget reducer hydrates fully
// before that paint, so subsequent actions can rely on the shell.
export async function signInAsGuest(page: Page): Promise<void> {
  await page.goto("./");
  await page
    .getByRole("button", { name: /^Continue (without account|as guest)$/ })
    .click();
  await expect(page.getByText("budget", { exact: true })).toBeVisible();
}
