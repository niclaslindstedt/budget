import { defineConfig, devices } from "@playwright/test";

// Playwright drives a built preview slot of the app — the same artifact
// `pages.yml` ships to `/preview/` — through Chromium. The tests are
// the regression net for the deployed `/preview/` slot, so we test the
// preview build (not the dev server) end-to-end:
//
//   1. `make preview-build` builds `dist/` with `VITE_BASE_PATH=/preview/`,
//      which mirrors how the Pages workflow assembles the preview tree.
//   2. `make preview-serve` runs `vite preview` against that `dist/` on
//      port 4173. Because the bundle was built for `/preview/`, the app
//      lives at `http://localhost:4173/preview/`.
//   3. Playwright's `baseURL` points at the same URL, so `page.goto("/")`
//      from a spec actually lands on the preview slot.
//
// `BASE_URL` overrides the default so the same suite can be pointed at
// the live `/preview/` URL (`https://budget.niclaslindstedt.se/preview/`)
// or any other preview host without rebuilding the suite.
const baseURL = process.env.BASE_URL ?? "http://localhost:4173/preview/";

// `EXTERNAL_BASE_URL=1` tells Playwright the URL above is already
// reachable (e.g. tests running against the live preview deploy from
// the release workflow). Otherwise we boot a local preview server via
// `make preview-serve`.
const useExternalServer = process.env.EXTERNAL_BASE_URL === "1";

export default defineConfig({
  testDir: "./e2e",
  testMatch: /.*\.spec\.ts$/,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: useExternalServer
    ? undefined
    : {
        command: "make preview-serve",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        stdout: "pipe",
        stderr: "pipe",
      },
});
