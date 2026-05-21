// Build-time constants exposed as plain TypeScript values. Vite
// substitutes the underlying `__APP_VERSION__` / `__IS_PREVIEW__` /
// `__BUILD_LABEL__` globals via the `define` block in
// `vite.config.ts` — the source-of-truth lives in `package.json`,
// the `VITE_BASE_PATH` env var the CI workflow sets, and (for the
// build-number suffix) the `GITHUB_RUN_NUMBER` env var GitHub
// Actions populates automatically.

export const APP_VERSION: string = __APP_VERSION__;

// True when the bundle is being built for the `/preview/` slot
// (current `main`) rather than the root `/` slot (latest released
// tag). Used to namespace every persistence surface (localStorage,
// sessionStorage, IndexedDB, cloud paths) so opening the preview
// build can never read, migrate, or overwrite production data on
// the same machine or cloud account.
export const IS_PREVIEW: boolean = __IS_PREVIEW__;

// Short identifier rendered next to the "budget" header on the page
// and suffixed onto the browser-tab title so you can tell at a
// glance which build is running. Shape: `<pkg.version>[.<run>][-pre]`
// — e.g. `0.1.0` for a local release build, `0.1.0.89` for a CI
// release build, and `0.1.0.89-pre` for the deployed preview slot.
export const BUILD_LABEL: string = __BUILD_LABEL__;
