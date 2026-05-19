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
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
