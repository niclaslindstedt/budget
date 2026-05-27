// Helpers that own the read/write boundary for the device-scoped
// settings split. `resolveEffectiveSettings` produces the flat
// `Settings` consumers expect; `applySettingsDraft` /
// `applyDeviceSettingPatch` route writes back into the correct
// `PersistedSettings` bucket; `isDeviceScoped` is the single source
// of truth for which keys belong on the device side.

import { describe, expect, it } from "vitest";

import { DEFAULT_PERSISTED_SETTINGS } from "../src/data/constants/defaults";
import {
  applyDeviceSettingPatch,
  applySettingsDraft,
  DEVICE_SCOPED_KEYS,
  isDeviceScoped,
  resolveEffectiveSettings,
} from "../src/data/settings";
import type { PersistedSettings, Settings } from "../src/data/types";

function clonePersisted(): PersistedSettings {
  return {
    ...DEFAULT_PERSISTED_SETTINGS,
    device: {
      mobile: { ...DEFAULT_PERSISTED_SETTINGS.device.mobile },
      desktop: { ...DEFAULT_PERSISTED_SETTINGS.device.desktop },
    },
  };
}

describe("isDeviceScoped", () => {
  it("discriminates common vs device keys", () => {
    expect(isDeviceScoped("currency")).toBe(false);
    expect(isDeviceScoped("language")).toBe(false);
    expect(isDeviceScoped("cloudReauthAutoOpen")).toBe(false);
    expect(isDeviceScoped("fontScale")).toBe(true);
    expect(isDeviceScoped("showCurrency")).toBe(true);
    expect(isDeviceScoped("downloadBudget")).toBe(true);
    expect(isDeviceScoped("headerAction")).toBe(true);
  });

  it("DEVICE_SCOPED_KEYS covers every advertised device field", () => {
    // Cross-check: every key in the const is recognised by the
    // discriminator. Catches forgetting to add a new key to the
    // membership set when extending DeviceSettings.
    for (const key of DEVICE_SCOPED_KEYS) {
      expect(isDeviceScoped(key)).toBe(true);
    }
  });
});

describe("resolveEffectiveSettings", () => {
  it("merges common + mobile bucket when isMobile is true", () => {
    const persisted = clonePersisted();
    persisted.device.mobile.fontScale = 1.2;
    persisted.device.desktop.fontScale = 0.9;
    const eff = resolveEffectiveSettings(persisted, true);
    expect(eff.fontScale).toBe(1.2);
    expect(eff.currency).toBe(persisted.currency);
  });

  it("merges common + desktop bucket when isMobile is false", () => {
    const persisted = clonePersisted();
    persisted.device.mobile.fontScale = 1.2;
    persisted.device.desktop.fontScale = 0.9;
    const eff = resolveEffectiveSettings(persisted, false);
    expect(eff.fontScale).toBe(0.9);
    expect(eff.currency).toBe(persisted.currency);
  });

  it("strips the device wrapper from the effective view", () => {
    const eff = resolveEffectiveSettings(clonePersisted(), false);
    expect((eff as unknown as Record<string, unknown>).device).toBeUndefined();
  });
});

describe("applySettingsDraft", () => {
  it("routes a device-scoped field into the named scope only", () => {
    const persisted = clonePersisted();
    const draft: Settings = {
      ...resolveEffectiveSettings(persisted, false),
      fontScale: 1.4,
      abbreviateNumbers: true,
    };
    const next = applySettingsDraft(persisted, "mobile", draft);
    expect(next.device.mobile.fontScale).toBe(1.4);
    expect(next.device.mobile.abbreviateNumbers).toBe(true);
    // Desktop bucket untouched.
    expect(next.device.desktop.fontScale).toBe(
      persisted.device.desktop.fontScale,
    );
    expect(next.device.desktop.abbreviateNumbers).toBe(
      persisted.device.desktop.abbreviateNumbers,
    );
  });

  it("routes a common field into the top level", () => {
    const persisted = clonePersisted();
    const draft: Settings = {
      ...resolveEffectiveSettings(persisted, false),
      currency: "$",
      cloudReauthAutoOpen: false,
    };
    const next = applySettingsDraft(persisted, "desktop", draft);
    expect(next.currency).toBe("$");
    expect(next.cloudReauthAutoOpen).toBe(false);
  });

  it("does not leak device-scoped keys onto the top level", () => {
    const persisted = clonePersisted();
    const draft: Settings = {
      ...resolveEffectiveSettings(persisted, false),
      fontScale: 1.4,
    };
    const next = applySettingsDraft(persisted, "mobile", draft);
    expect(
      (next as unknown as Record<string, unknown>).fontScale,
    ).toBeUndefined();
    expect(
      (next as unknown as Record<string, unknown>).showCurrency,
    ).toBeUndefined();
  });
});

describe("applyDeviceSettingPatch", () => {
  it("merges a partial patch into the named scope", () => {
    const persisted = clonePersisted();
    const next = applyDeviceSettingPatch(persisted, "mobile", {
      downloadBudget: { format: "xlsx", includeHistory: false },
    });
    expect(next.device.mobile.downloadBudget).toEqual({
      format: "xlsx",
      includeHistory: false,
    });
    // Other mobile fields preserved.
    expect(next.device.mobile.fontScale).toBe(
      persisted.device.mobile.fontScale,
    );
    // Desktop untouched.
    expect(next.device.desktop.downloadBudget).toEqual(
      persisted.device.desktop.downloadBudget,
    );
  });
});
