// Projects the user's appearance preferences onto the document root so
// the CSS variables in `src/styles.css` (and every utility that resolves
// through them via `@theme inline`) follow what the picker writes into
// `Settings.theme` / `Settings.fontFamily` / `Settings.customTheme`.
//
// Three effects, each independently subscribed so a font change doesn't
// rewrite the colour overrides (and vice versa):
//
// 1. `data-theme` attribute on `<html>` from `settings.theme`. CSS owns
//    the dark / light / system palette rules; `custom` is a no-op at
//    the CSS layer — effect (3) writes inline overrides instead.
// 2. `--app-font-family` from the selected webfont stack. The font is
//    preloaded as a side-effect `@fontsource/*` import in main.tsx so
//    there's no FOUT swap once it lands.
// 3. Custom-theme overrides: 18 colour vars + radius / density /
//    border-width / reduce-motion. Only written when `theme === "custom"`
//    so flipping back to a preset cleans every inline value out of the
//    style attribute.

import { useEffect } from "react";

import {
  COLOR_KEYS,
  COLOR_KEY_TO_CSS_VAR,
  FONT_FAMILIES,
} from "../data/themes";
import type {
  BorderWidthPreset,
  DensityPreset,
  RadiusPreset,
  Settings,
} from "../data/types";

// `radius-sm/md/lg` triples per preset. Numbers chosen so that "md" sits
// at the historical defaults (`.field-input` rounded to 6px, the
// formula-pill at 4px) and the other presets fan out symmetrically.
const RADIUS_PX: Record<RadiusPreset, { sm: string; md: string; lg: string }> =
  {
    none: { sm: "0px", md: "0px", lg: "0px" },
    sm: { sm: "2px", md: "4px", lg: "6px" },
    md: { sm: "4px", md: "6px", lg: "12px" },
    lg: { sm: "6px", md: "10px", lg: "20px" },
  };

// Vertical / horizontal row padding consumed by the `--density-row-*`
// vars. Today only `.field-input` reads `--density-row-py` (vertical
// only) — horizontal stays at the Tailwind utility's value. The
// horizontal value is kept here for future surfaces that want to read
// it (`--density-row-px`).
const DENSITY: Record<DensityPreset, { py: string; px: string }> = {
  compact: { py: "0.25rem", px: "0.375rem" },
  comfortable: { py: "0.375rem", px: "0.5rem" },
  spacious: { py: "0.5rem", px: "0.75rem" },
};

const BORDER_WIDTH_PX: Record<BorderWidthPreset, string> = {
  thin: "0.5px",
  normal: "1px",
  bold: "2px",
};

export function useTheme(settings: Settings): void {
  const { theme, fontFamily, customTheme } = settings;

  // (1) Theme preset attribute. Cleared on unmount so the auth screen
  // (which mounts a different React tree) doesn't inherit a lingering
  // value from the previous signed-in session.
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    return () => {
      document.documentElement.removeAttribute("data-theme");
    };
  }, [theme]);

  // (2) Font family stack.
  useEffect(() => {
    const family = FONT_FAMILIES.find((f) => f.id === fontFamily);
    if (!family) return;
    document.documentElement.style.setProperty(
      "--app-font-family",
      family.stack,
    );
    return () => {
      document.documentElement.style.removeProperty("--app-font-family");
    };
  }, [fontFamily]);

  // (3) Custom theme overrides. Only writes inline vars when the active
  // theme is `"custom"`; otherwise clears any prior overrides so
  // flipping back to a preset leaves a clean style attribute on
  // `<html>`.
  useEffect(() => {
    const html = document.documentElement;
    if (theme !== "custom") {
      for (const k of COLOR_KEYS) {
        html.style.removeProperty(`--${COLOR_KEY_TO_CSS_VAR[k]}`);
      }
      html.style.removeProperty("--radius-sm");
      html.style.removeProperty("--radius-md");
      html.style.removeProperty("--radius-lg");
      html.style.removeProperty("--density-row-py");
      html.style.removeProperty("--density-row-px");
      html.style.removeProperty("--border-width");
      html.removeAttribute("data-reduce-motion");
      return;
    }
    for (const k of COLOR_KEYS) {
      html.style.setProperty(
        `--${COLOR_KEY_TO_CSS_VAR[k]}`,
        customTheme.colors[k],
      );
    }
    const r = RADIUS_PX[customTheme.radius];
    html.style.setProperty("--radius-sm", r.sm);
    html.style.setProperty("--radius-md", r.md);
    html.style.setProperty("--radius-lg", r.lg);
    const d = DENSITY[customTheme.density];
    html.style.setProperty("--density-row-py", d.py);
    html.style.setProperty("--density-row-px", d.px);
    html.style.setProperty(
      "--border-width",
      BORDER_WIDTH_PX[customTheme.borderWidth],
    );
    html.setAttribute(
      "data-reduce-motion",
      customTheme.reduceMotion ? "true" : "false",
    );
  }, [theme, customTheme]);
}
