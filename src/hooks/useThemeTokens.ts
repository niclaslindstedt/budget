import { useEffect, useState } from "react";

// Reads a fixed set of CSS custom properties off `<html>` into concrete JS
// strings and keeps them in sync as the theme changes. The rest of the app
// inherits theme colours / fonts / metrics through CSS, but an SVG chart
// (visx) needs them as JS values to hand to `stroke` / `fill` / `fontFamily`.
//
// `useTheme` projects the active appearance onto `document.documentElement`:
// the `data-theme` attribute selects a preset palette (CSS owns those rules),
// while the custom theme writes the colour / radius / density / border vars
// inline on the element's `style` and toggles `data-reduce-motion`. A
// MutationObserver watching exactly those attributes therefore catches every
// theme switch and re-reads the requested tokens.

export type ThemeTokens = Record<string, string>;

function readTokens(names: readonly string[]): ThemeTokens {
  const cs = getComputedStyle(document.documentElement);
  const out: ThemeTokens = {};
  for (const name of names) out[name] = cs.getPropertyValue(name).trim();
  return out;
}

// `names` is expected to be a stable, module-level literal at every call site;
// it's joined into a string key so an inline array can't re-subscribe the
// observer on every render. The effect reconstructs the list from that key so
// its dependency array stays honest.
export function useThemeTokens(names: readonly string[]): ThemeTokens {
  const key = names.join(",");
  const [tokens, setTokens] = useState<ThemeTokens>(() =>
    typeof document === "undefined" ? {} : readTokens(names),
  );

  useEffect(() => {
    const list = key.split(",");
    const reread = () => setTokens(readTokens(list));
    reread();
    const observer = new MutationObserver(reread);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "style", "data-reduce-motion"],
    });
    return () => observer.disconnect();
  }, [key]);

  return tokens;
}
