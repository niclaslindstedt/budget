// Top-level <LanguageProvider> wrapper mounted from main.tsx. Lives
// in its own file (rather than inline next to the component switch in
// main.tsx) so React Fast Refresh has a stable boundary — main.tsx
// only exports module-level side effects and the routed page render,
// neither of which Fast Refresh can reload, so co-locating a
// component there warns.

import { useEffect, useState, type ReactNode } from "react";

import { InstallPrompt } from "../components/InstallPrompt";
import { ToastProvider } from "../components/Toast";
import { UpdateToast } from "../components/UpdateToast";

import {
  LanguageProvider,
  ensureCatalog,
  isCatalogLoaded,
  type Lang,
} from "./index";
import { readLanguagePreference } from "./language-preference";

export function LanguageRoot({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(() => readLanguagePreference());
  // Gate the very first paint until the initial language's catalog is
  // resident, so a returning non-English user never sees a flash of
  // English before their code-split catalog arrives. English is resident
  // synchronously, so English users never gate.
  const [booted, setBooted] = useState<boolean>(() => isCatalogLoaded(lang));

  useEffect(() => {
    // Apply a language switch only once its catalog is resident. Flipping
    // the context to a language whose code-split catalog hasn't loaded
    // would render the app in the English fallback and — because the
    // context value wouldn't change again when the catalog later arrives
    // (same `lang`, referentially-stable `children`) — leave it stuck on
    // English. Loading first means the single context change already has
    // the real strings. The brief wait shows the previous language; the
    // chunk is small and service-worker-cached after first use.
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<Lang>).detail;
      if (detail !== "en" && detail !== "sv") return;
      void ensureCatalog(detail).then(() => setLang(detail));
    };
    window.addEventListener("budget:language", onChange);
    return () => window.removeEventListener("budget:language", onChange);
  }, []);

  useEffect(() => {
    if (isCatalogLoaded(lang)) {
      setBooted(true);
      return;
    }
    // Only reached for a returning non-English user on first paint —
    // load the persisted language's catalog, then unblock the render.
    let cancelled = false;
    void ensureCatalog(lang).then(() => {
      if (!cancelled) setBooted(true);
    });
    return () => {
      cancelled = true;
    };
  }, [lang]);

  return (
    <LanguageProvider value={lang}>
      <ToastProvider>
        {booted ? children : null}
        <UpdateToast />
        <InstallPrompt />
      </ToastProvider>
    </LanguageProvider>
  );
}
