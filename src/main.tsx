import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App.tsx";
import "./styles.css";
import { installSelectOnFocus } from "./utils/select-on-focus";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element #root not found in index.html");
}

installSelectOnFocus();

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
