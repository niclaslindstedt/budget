import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App.tsx";
import { PrivacyPage } from "./components/PrivacyPage";
import { LanguageRoot } from "./i18n/LanguageRoot";
import "./styles.css";
// Bundled webfonts powering the Appearance → Font picker. Each
// `@fontsource/*` side-effect import injects a `@font-face` rule and
// (via the bundler) references the WOFF2 file so it ends up in the
// build output. Three families × regular + bold weights — see
// `FONT_FAMILIES` in `src/data/themes.ts` for the user-facing
// surface. Local-first: no CDN at runtime.
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/700.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/700.css";
import "@fontsource/source-serif-4/400.css";
import "@fontsource/source-serif-4/700.css";
import "@fontsource/opendyslexic/400.css";
import "@fontsource/opendyslexic/700.css";
const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element #root not found in index.html");
}

// Trivial path-based switch. The build emits `dist/privacy/index.html`
// (see `vite.config.ts`) so GitHub Pages serves the same SPA at
// `/privacy/`, and this check decides which view to mount. The preview
// build's page lives one segment deeper (`/preview/privacy/`); the
// suffix check below matches both.
const path = window.location.pathname.replace(/\/$/, "");
const isPrivacy = path.endsWith("/privacy") || path === "/privacy";

createRoot(rootElement).render(
  <StrictMode>
    <LanguageRoot>{isPrivacy ? <PrivacyPage /> : <App />}</LanguageRoot>
  </StrictMode>,
);
