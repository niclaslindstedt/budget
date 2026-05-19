// Build-time constants exposed as plain TypeScript values. Vite
// substitutes the underlying `__APP_VERSION__` / `__IS_PREVIEW__`
// globals via the `define` block in `vite.config.ts` — the source-of-
// truth for both lives in `package.json` and the `VITE_BASE_PATH` env
// var the CI workflow sets.

export const APP_VERSION: string = __APP_VERSION__;

// True when the bundle is being built for the `/preview/` slot
// (current `main`) rather than the root `/` slot (latest released
// tag). Used to namespace every persistence surface (localStorage,
// sessionStorage, IndexedDB, cloud paths) so opening the preview
// build can never read, migrate, or overwrite production data on
// the same machine or cloud account.
export const IS_PREVIEW: boolean = __IS_PREVIEW__;
