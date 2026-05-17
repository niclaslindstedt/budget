import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App.tsx";
import { PrivacyPage } from "./components/PrivacyPage";
import "./styles.css";
import { installSelectOnFocus } from "./utils/select-on-focus";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element #root not found in index.html");
}

installSelectOnFocus();

// Trivial path-based switch. The build emits a `dist/privacy/index.html`
// alias (see `vite.config.ts`) so GitHub Pages serves the same SPA at
// `/privacy/`, and this check decides which view to mount.
const path = window.location.pathname;
const isPrivacy = path === "/privacy" || path === "/privacy/";

createRoot(rootElement).render(
  <StrictMode>{isPrivacy ? <PrivacyPage /> : <App />}</StrictMode>,
);
