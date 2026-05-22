// Top-level <LanguageProvider> wrapper mounted from main.tsx. Lives
// in its own file (rather than inline next to the component switch in
// main.tsx) so React Fast Refresh has a stable boundary — main.tsx
// only exports module-level side effects and the routed page render,
// neither of which Fast Refresh can reload, so co-locating a
// component there warns.

import { useEffect, useState, type ReactNode } from "react";

import { UpdateToast } from "../components/UpdateToast";

import { LanguageProvider, type Lang } from "./index";
import { readLanguagePreference } from "./language-preference";

export function LanguageRoot({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(() => readLanguagePreference());
  useEffect(() => {
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<Lang>).detail;
      if (detail === "en" || detail === "sv") setLang(detail);
    };
    window.addEventListener("budget:language", onChange);
    return () => window.removeEventListener("budget:language", onChange);
  }, []);
  return (
    <LanguageProvider value={lang}>
      {children}
      <UpdateToast />
    </LanguageProvider>
  );
}
