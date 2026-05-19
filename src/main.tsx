import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App.tsx";
import { ChangelogPage } from "./components/ChangelogPage";
import { PrivacyPage } from "./components/PrivacyPage";
import { SchemaPage } from "./components/SchemaPage";
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

createRoot(rootElement).render(
  <StrictMode>
    {isSchema ? (
      <SchemaPage />
    ) : isPrivacy ? (
      <PrivacyPage />
    ) : isChangelog ? (
      <ChangelogPage />
    ) : (
      <App />
    )}
  </StrictMode>,
);
