/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

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
  // Optional GoatCounter `/count` endpoint URL (e.g.
  // `https://<slug>.goatcounter.com/count`). When set, a
  // privacy-friendly page-view tracker is injected into the
  // production build's HTML; the `/preview/` slot never includes it.
  // See `injectGoatcounter()` in `vite.config.ts` and `.env.example`.
  readonly VITE_GOATCOUNTER_ENDPOINT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Build-time constants injected via `vite.config.ts`'s `define` block.
// `__APP_VERSION__` is the version string from `package.json`.
// `__IS_PREVIEW__` is true when the bundle is built for any non-root
// slot (`/preview/`, `/branches/<slug>/`); gates the dev surfaces and
// noindex / no-tracker behaviour.
// `__BUILD_LABEL__` is a short identifier appended to the browser-tab
// title — `vX.Y.Z` for production, `vX.Y.Z-pre` (+ optional CI run
// number) for the `/preview/` slot, `vX.Y.Z-<slug>` for a branch slot.
// `__STORAGE_NS__` is the namespace segment that threads through every
// persistence helper in `src/data/constants/storage.ts`. Empty for
// production, "preview" for the preview slot, `branch-<slug>` for a
// branch slot — keeps each deploy slot's localStorage / cloud paths /
// IndexedDB databases distinct so visiting one slot can never migrate
// or overwrite another's data.
declare const __APP_VERSION__: string;
declare const __IS_PREVIEW__: boolean;
declare const __BUILD_LABEL__: string;
declare const __STORAGE_NS__: string;
