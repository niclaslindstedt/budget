// Build-time constants exposed as plain TypeScript values. Vite
// substitutes the underlying `__APP_VERSION__` / `__IS_PREVIEW__` /
// `__BUILD_LABEL__` / `__STORAGE_NS__` globals via the `define` block
// in `vite.config.ts` — the source-of-truth lives in `package.json`,
// the `VITE_BASE_PATH` env var the CI workflow sets, and (for the
// build-number suffix) the `GITHUB_RUN_NUMBER` env var GitHub
// Actions populates automatically.

export const APP_VERSION: string = __APP_VERSION__;

// True when the bundle is being built for any non-production slot —
// the `/preview/` build of `main` or the stable `/branch/` slot.
// Gates the developer-only surfaces (dev mode, log capture) and the
// noindex / no-tracker behaviour. Per-slot data isolation goes
// through `STORAGE_NS` below.
export const IS_PREVIEW: boolean = __IS_PREVIEW__;

// Short identifier rendered next to the "budget" header on the page
// and suffixed onto the browser-tab title so you can tell at a
// glance which build is running. Shape: `<pkg.version>[.<run>][-<sfx>]`
// where `<sfx>` is `pre` for `/preview/`, `br[-<source>]` for
// `/branch/` (with the source branch name when CI provides it), and
// absent for the production `/` slot. e.g. `0.1.0` for a local
// release build, `0.1.0.89` for a CI release build, `0.1.0.89-pre`
// for the preview slot, and `0.1.0.89-br-feat-foo` for the branch
// slot.
export const BUILD_LABEL: string = __BUILD_LABEL__;

// Namespace segment threaded through every persistence helper in
// `src/data/constants/storage.ts`. Empty for production; "preview"
// for the `/preview/` slot; "branch" for the `/branch/` slot. Keeps
// localStorage keys, cloud paths, and IndexedDB DB names disjoint
// between deploy slots so visiting one slot can never read, migrate,
// or overwrite another's data on the same machine or cloud account.
// The branch namespace is stable across feature-branch swaps — a
// fresh dispatch parking a new ref keeps reading the same stored
// data, accepting that a branch shipping a breaking schema change
// will be read by whatever lands next.
export const STORAGE_NS: string = __STORAGE_NS__;
