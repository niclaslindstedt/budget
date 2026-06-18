import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App.tsx";
import { HomePage } from "./components/HomePage";
import { PrivacyPage } from "./components/PrivacyPage";
import { LanguageRoot } from "./i18n/LanguageRoot";
import "./styles.css";
// Default webfont (JetBrains Mono — the `mono` family and the base of
// every fallback stack). Imported statically so it lands in the main
// bundle and is precached for offline first paint. The three
// non-default families (Inter, Source Serif 4, OpenDyslexic) are NOT
// imported here — they load on demand from `src/utils/fonts.ts` when
// the user selects or previews one, and are kept out of the
// service-worker precache (see `vite.config.ts`), so a session that
// never leaves the default face never pays for them. Only the latin +
// latin-ext subsets ship: the app's two languages (English, Swedish)
// live entirely within them, so fontsource's bare entrypoints — which
// also pull cyrillic / greek / vietnamese — would be pure waste.
// Local-first: no CDN at runtime.
import "@fontsource/jetbrains-mono/latin-400.css";
import "@fontsource/jetbrains-mono/latin-ext-400.css";
import "@fontsource/jetbrains-mono/latin-700.css";
import "@fontsource/jetbrains-mono/latin-ext-700.css";
const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element #root not found in index.html");
}

// Trivial path-based switch. The build emits `dist/privacy/index.html`
// and `dist/home/index.html` (see `vite.config.ts`) so GitHub Pages
// serves the same SPA at those clean URLs, and these checks decide
// which view to mount. The preview build's pages live one segment
// deeper (`/preview/privacy/`, `/preview/home/`); the suffix checks
// below match both.
const path = window.location.pathname.replace(/\/$/, "");
const isPrivacy = path.endsWith("/privacy") || path === "/privacy";
const isHome = path.endsWith("/home") || path === "/home";

createRoot(rootElement).render(
  <StrictMode>
    <LanguageRoot>
      {isPrivacy ? <PrivacyPage /> : isHome ? <HomePage /> : <App />}
    </LanguageRoot>
  </StrictMode>,
);
