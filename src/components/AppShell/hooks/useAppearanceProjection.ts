import { useEffect } from "react";

import type { Settings } from "../../../data/types";
import { bcp47, type Lang } from "../../../i18n";
import { useTheme } from "../../../hooks";
import { writeLanguagePreference } from "../../../i18n/language-preference";

type Params = {
  // Resolved settings to project — caller picks between the persisted
  // bucket and the SettingsModal's draft so the user can see their
  // theme / font / shape choice applied before committing.
  appearanceSettings: Settings;
  // Bucket-canonical language preference (read from
  // `data.settings.language`).
  language: Lang;
};

// Projects the user's Appearance settings onto the document root:
//
//   - `--app-font-scale` so the body's `font-size: calc(... *
//     var(--app-font-scale))` rule (and every rem/em dimension
//     downstream) picks up the multiplier.
//   - `useTheme` writes `data-theme`, `--app-font-family`, and the
//     inline colour / shape / motion vars.
//   - Language broadcast — mirrored into the plaintext localStorage
//     store and announced as a `budget:language` event so the top-
//     level <LanguageProvider> re-renders the tree.
export function useAppearanceProjection({
  appearanceSettings,
  language,
}: Params): void {
  const fontScale = appearanceSettings.fontScale;
  useEffect(() => {
    document.documentElement.style.setProperty(
      "--app-font-scale",
      String(fontScale),
    );
    return () => {
      document.documentElement.style.removeProperty("--app-font-scale");
    };
  }, [fontScale]);

  useTheme(appearanceSettings);

  useEffect(() => {
    writeLanguagePreference(language);
    document.documentElement.lang = bcp47(language);
    window.dispatchEvent(
      new CustomEvent<Lang>("budget:language", { detail: language }),
    );
  }, [language]);
}
