import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App.tsx";
import { AchievementsPage } from "./components/AchievementsPage";
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
import { BUILD_LABEL } from "./utils/build-env";
import { installFocusDiagnostic } from "./utils/focus-diagnostic";
import { installSelectOnFocus } from "./utils/select-on-focus";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element #root not found in index.html");
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
const isAchievements =
  path.endsWith("/achievements") || path === "/achievements";

createRoot(rootElement).render(
  <StrictMode>
    <LanguageRoot>
      {isPrivacy ? (
        <PrivacyPage />
      ) : isChangelog ? (
        <ChangelogPage />
      ) : isAchievements ? (
        <AchievementsPage />
      ) : (
        <App />
      )}
    </LanguageRoot>
  </StrictMode>,
);
