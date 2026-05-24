// Single source of truth for the device-scoped settings split.
// Referenced by the migration splitter, the validator, the
// SettingsModal save-routing logic, and the SettingsModal scope-hint
// banner. The shape of `Settings` (the effective view consumers see)
// stays flat — this module owns the rules for translating between
// flat reads and the bucketed `PersistedSettings` write surface.

import type { DeviceSettings, PersistedSettings, Settings } from "./types";

// Authoritative list of keys that hold independent values per mobile /
// desktop. Adding a new device-scoped field means landing it here in
// the same change that adds it to the `DeviceSettings` type.
export const DEVICE_SCOPED_KEYS = [
  "formatNumbers",
  "showCurrency",
  "showDecimals",
  "abbreviateNumbers",
  "alwaysAbbreviateBalance",
  "fontScale",
  "headerAction",
  "downloadBudget",
  "downloadAccounts",
] as const satisfies readonly (keyof DeviceSettings)[];

export type DeviceScopedKey = (typeof DEVICE_SCOPED_KEYS)[number];

const DEVICE_KEY_SET: ReadonlySet<string> = new Set(DEVICE_SCOPED_KEYS);

export type DeviceScope = "mobile" | "desktop";

export function isDeviceScoped(key: keyof Settings): key is DeviceScopedKey {
  return DEVICE_KEY_SET.has(key as string);
}

// Resolve the flat `Settings` shape every read site already consumes
// against the active viewport. Common fields come from the top level
// of `PersistedSettings`; device-scoped fields come from whichever
// bucket the active viewport selects.
export function resolveEffectiveSettings(
  persisted: PersistedSettings,
  isMobile: boolean,
): Settings {
  const { device, ...common } = persisted;
  const scope = isMobile ? device.mobile : device.desktop;
  return { ...common, ...scope };
}

// Split a flat `Settings` draft (e.g. from the SettingsModal save
// handler) back into the bucketed `PersistedSettings` shape. Common
// fields overwrite the top level; device-scoped fields land in the
// named scope. The other scope is preserved untouched — editing on
// mobile doesn't clobber the desktop bucket, and vice versa.
export function applySettingsDraft(
  persisted: PersistedSettings,
  scope: DeviceScope,
  draft: Settings,
): PersistedSettings {
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(draft)) {
    if (isDeviceScoped(key as keyof Settings)) continue;
    next[key] = value;
  }
  const deviceBucket: DeviceSettings = {
    formatNumbers: draft.formatNumbers,
    showCurrency: draft.showCurrency,
    showDecimals: draft.showDecimals,
    abbreviateNumbers: draft.abbreviateNumbers,
    alwaysAbbreviateBalance: draft.alwaysAbbreviateBalance,
    fontScale: draft.fontScale,
    headerAction: draft.headerAction,
    downloadBudget: draft.downloadBudget,
    downloadAccounts: draft.downloadAccounts,
  };
  return {
    ...(next as Omit<PersistedSettings, "device">),
    device: {
      ...persisted.device,
      [scope]: deviceBucket,
    },
  };
}

// Targeted update for a single device-scoped field. Used by the
// download-modal confirm flow which only knows about one field at a
// time and wants to avoid round-tripping a whole `Settings` draft.
export function applyDeviceSettingPatch(
  persisted: PersistedSettings,
  scope: DeviceScope,
  patch: Partial<DeviceSettings>,
): PersistedSettings {
  return {
    ...persisted,
    device: {
      ...persisted.device,
      [scope]: { ...persisted.device[scope], ...patch },
    },
  };
}
