import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App.tsx";
import { PrivacyPage } from "./components/PrivacyPage";
import { SchemaPage } from "./components/SchemaPage";
import "./styles.css";
import { announceDebugHint } from "./utils/debug";
import { installSelectOnFocus } from "./utils/select-on-focus";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element #root not found in index.html");
}

installSelectOnFocus();
announceDebugHint();

// Trivial path-based switch. The build emits `dist/<alias>/index.html`
// aliases (see `vite.config.ts`) so GitHub Pages serves the same SPA
// at `/privacy/` and `/schema/`, and this check decides which view to
// mount. `/schema` is the JSON-Schema reference an agent can fetch
// when handed an exported `budget-*.json` file.
const path = window.location.pathname;
const isPrivacy = path === "/privacy" || path === "/privacy/";
const isSchema = path === "/schema" || path === "/schema/";

createRoot(rootElement).render(
  <StrictMode>
    {isSchema ? <SchemaPage /> : isPrivacy ? <PrivacyPage /> : <App />}
  </StrictMode>,
);
