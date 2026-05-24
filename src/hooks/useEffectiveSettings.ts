// Read-side facade for the device-scoped settings split. Resolves the
// stored `PersistedSettings` (common fields flat at the top level,
// device-scoped fields under `device.{mobile,desktop}`) into the flat
// `Settings` shape every component already consumes.
//
// Reactivity: viewport-driven. The hook subscribes to the same
// `(max-width: 639.98px)` media query `useIsMobile()` uses, so
// resizing a desktop browser narrow flips the active scope on the
// fly. `fontScale`, `showCurrency`, etc. switch immediately to the
// other bucket's value — intended per the v35 design.

import { useMemo } from "react";

import { resolveEffectiveSettings } from "../data/settings";
import type { PersistedSettings, Settings } from "../data/types";
import { useIsMobile } from "./useIsMobile";

export { resolveEffectiveSettings } from "../data/settings";

export function useEffectiveSettings(persisted: PersistedSettings): Settings {
  const isMobile = useIsMobile();
  return useMemo(
    () => resolveEffectiveSettings(persisted, isMobile),
    [persisted, isMobile],
  );
}
