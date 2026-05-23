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
import { syncViewportVars } from "./hooks/useVisualViewportOffset";
import { BUILD_LABEL } from "./utils/build-env";
import { installFocusDiagnostic } from "./utils/focus-diagnostic";
import { installSelectOnFocus } from "./utils/select-on-focus";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element #root not found in index.html");
}

// Seed `--screen-h-px` (and `--viewport-bottom-offset`) BEFORE
// React mounts so the standalone-mode CSS in `styles.css` reads a
// real `window.innerHeight` on the very first paint, not the `100vh`
// fallback. Without this, an installed iOS 26 PWA renders the
// BottomBar against the clipped `visualViewport.bottom` for a frame
// — long enough for the user to see (and report) a gap that "snaps
// to place" the moment they drag and the hook in `LanguageRoot`
// re-runs. `LanguageRoot` still keeps the variable up to date as
// the viewport changes; this just covers the cold-launch frame.
syncViewportVars();

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
