/// <reference types="vite/client" />

// OAuth public client identifiers injected at build time. Both are
// readable in the deployed JS bundle either way (PKCE makes them safe
// to ship), so the only reason they live outside the source is so a
// fork can register its own apps without touching the original
// developer's identifiers.
//
// Set them in a local `.env.local` for dev and as GitHub Actions
// secrets (`VITE_DROPBOX_APP_KEY`, `VITE_GOOGLE_CLIENT_ID`) for the
// production build — see `.env.example` and `.github/workflows/pages.yml`.
interface ImportMetaEnv {
  readonly VITE_DROPBOX_APP_KEY?: string;
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  // Optional donate-button target URL (PayPal, Stripe link, Ko-fi,
  // GitHub Sponsors, anything). Empty / undefined hides the button
  // in Settings entirely. Not a secret (ships in the bundle); routed
  // through a GitHub Actions secret so forks don't inherit the
  // upstream maintainer's personal donate URL.
  readonly VITE_DONATE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Build-time constants injected via `vite.config.ts`'s `define` block.
// `__APP_VERSION__` is the version string from `package.json`.
// `__IS_PREVIEW__` is true when the bundle is built with a non-root
// `VITE_BASE_PATH` (i.e. the `/preview/` build); used at runtime to
// namespace storage keys so production data is never touched by
// preview migrations.
// `__BUILD_LABEL__` is a short identifier appended to the browser-tab
// title — `vX.Y.Z` for production, `preview` (optionally with a CI
// run number + short sha) for the `/preview/` slot.
declare const __APP_VERSION__: string;
declare const __IS_PREVIEW__: boolean;
declare const __BUILD_LABEL__: string;
