import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App.tsx";
import { ChangelogPage } from "./components/ChangelogPage";
import { PrivacyPage } from "./components/PrivacyPage";
import { SchemaPage } from "./components/SchemaPage";
import { LanguageProvider, type Lang } from "./i18n";
import { readLanguagePreference } from "./i18n/language-preference";
import "./styles.css";
import { BUILD_LABEL } from "./utils/build-env";
import { announceDebugHint } from "./utils/debug";
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

installSelectOnFocus();
announceDebugHint();

// Trivial path-based switch. The build emits `dist/<alias>/index.html`
// aliases (see `vite.config.ts`) so GitHub Pages serves the same SPA
// at `/privacy/`, `/schema/`, and `/changelog/`, and this check
// decides which view to mount. The preview build's pages live one
// segment deeper (e.g. `/preview/privacy/`); the suffix check below
// matches both. `/schema` is the JSON-Schema reference an agent can
// fetch when handed an exported `budget-*.json` file.
const path = window.location.pathname.replace(/\/$/, "");
const isPrivacy = path.endsWith("/privacy") || path === "/privacy";
const isSchema = path.endsWith("/schema") || path === "/schema";
const isChangelog = path.endsWith("/changelog") || path === "/changelog";

// Read-only language root. Listens for the custom `budget:language`
// event so the SettingsModal can push live-preview updates without
// rebuilding the App tree from above. The plaintext language-
// preference store backs this so the auth screen and standalone
// pages render in the right language without first decrypting the
// budget bucket.
function LanguageRoot({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState<Lang>(() => readLanguagePreference());
  useEffect(() => {
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<Lang>).detail;
      if (detail === "en" || detail === "sv") setLang(detail);
    };
    window.addEventListener("budget:language", onChange);
    return () => window.removeEventListener("budget:language", onChange);
  }, []);
  return <LanguageProvider value={lang}>{children}</LanguageProvider>;
}

createRoot(rootElement).render(
  <StrictMode>
    <LanguageRoot>
      {isSchema ? (
        <SchemaPage />
      ) : isPrivacy ? (
        <PrivacyPage />
      ) : isChangelog ? (
        <ChangelogPage />
      ) : (
        <App />
      )}
    </LanguageRoot>
  </StrictMode>,
);
