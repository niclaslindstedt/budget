import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App.tsx";
import { ChangelogPage } from "./components/ChangelogPage";
import { PrivacyPage } from "./components/PrivacyPage";
import { LanguageRoot } from "./i18n/LanguageRoot";
import "./styles.css";
// Bundled webfonts powering the Appearance → Font picker. Each
// `@fontsource/*` side-effect import injects a `@font-face` rule and
// (via the bundler) references the WOFF2 file so it ends up in the
// build output. Three families × regular + bold weights — see
// `FONT_FAMILIES` in `src/data/constants.ts` for the user-facing
// surface. Local-first: no CDN at runtime.
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/700.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/700.css";
import "@fontsource/source-serif-4/400.css";
import "@fontsource/source-serif-4/700.css";
import {
  bootViewportWorkaround,
  syncViewportVars,
} from "./hooks/useVisualViewportOffset";
import { BUILD_LABEL } from "./utils/build-env";
import { installFocusDiagnostic } from "./utils/focus-diagnostic";
import { installSelectOnFocus } from "./utils/select-on-focus";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element #root not found in index.html");
}

// iOS 26 standalone-PWA viewport workaround. Two halves, both
// scoped to standalone mode so a regular browser tab doesn't pay
// either cost.
//
// 1. `syncViewportVars()` writes `--vv-height` / `--vv-top` /
//    `--vv-bottom` from `window.visualViewport` BEFORE React
//    mounts, so the standalone-mode CSS in `styles.css` (which
//    drives the BottomBar's `top` off `--vv-bottom`) reads real
//    numbers on the very first paint instead of the `100vh`
//    fallback.
//
// 2. `bootViewportWorkaround()` (standalone only) toggles the
//    viewport meta's `viewport-fit` token cover→auto→cover across
//    two animation frames, does a `scrollBy(0, 1)`/`(0, -1)`
//    round-trip, and re-measures on a few timeouts. The toggle is
//    the documented trick (fozzedout iPhone PWA gist, siyuan-note
//    #13743) to force iOS 26's compositor to reconcile the
//    layout-vs-visual viewport split without a user-driven scroll
//    — the same "snap to place" the user otherwise has to trigger
//    by dragging the page. Without this wake, fixed elements
//    render against the stale pre-Liquid-Glass rectangle on the
//    first frame even though the JS-set CSS variables hold the
//    correct values.
//
// In Safari / Chrome tabs, `(display-mode: standalone)` doesn't
// match, the CSS overrides are inert, and the workaround is a
// few cheap DOM writes that resolve to no visible change. Cost
// to non-PWA users is effectively zero.
syncViewportVars();
const isStandalone =
  typeof window !== "undefined" &&
  ((window.navigator as Navigator & { standalone?: boolean }).standalone ===
    true ||
    window.matchMedia("(display-mode: standalone)").matches);
if (isStandalone) {
  bootViewportWorkaround();
}

// Suffix the static page title baked into the HTML with the build
// label so the browser tab shows which version is running. The static
// title (set per-route by the build-time SEO splicer) stays intact for
// search-engine crawlers and link unfurlers; only the live tab title
// gains the suffix.
document.title = `${document.title} (${BUILD_LABEL})`;

installFocusDiagnostic();
installSelectOnFocus();

// Trivial path-based switch. The build emits `dist/<alias>/index.html`
// aliases (see `vite.config.ts`) so GitHub Pages serves the same SPA
// at `/privacy/` and `/changelog/`, and this check decides which view
// to mount. The preview build's pages live one segment deeper (e.g.
// `/preview/privacy/`); the suffix check below matches both.
const path = window.location.pathname.replace(/\/$/, "");
const isPrivacy = path.endsWith("/privacy") || path === "/privacy";
const isChangelog = path.endsWith("/changelog") || path === "/changelog";

createRoot(rootElement).render(
  <StrictMode>
    <LanguageRoot>
      {isPrivacy ? <PrivacyPage /> : isChangelog ? <ChangelogPage /> : <App />}
    </LanguageRoot>
  </StrictMode>,
);
