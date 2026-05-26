// Coverage for the v30 → v31 migration and the soft-fallback contract
// around the new `theme` / `fontFamily` / `customTheme` settings.
//
// The migration is a bare version bump that relies on `validateSettings`
// filling defaults for missing fields, so the tests focus on the
// validator's behaviour when those fields are present but malformed.

import { describe, expect, it } from "vitest";

import {
  DEFAULT_CUSTOM_THEME,
  DEFAULT_CUSTOM_THEME_COLORS_DARK,
  DEFAULT_SETTINGS,
} from "../src/data/constants";
import {
  LATEST_VERSION,
  migrate,
  type Versioned,
} from "../src/data/migrations";
import { createDefaultSheet } from "../src/data/sheet";
import { validateUserData } from "../src/data/validate";

function v30Bucket(extraSettings: Record<string, unknown> = {}): Versioned {
  const sheet = createDefaultSheet("Default");
  return {
    version: 30,
    sheets: [sheet],
    activeSheetId: sheet.id,
    accounts: [],
    categories: [],
    types: [],
    hiddenPresetTypeIds: [],
    hiddenPresetCategoryIds: [],
    transactions: [],
    history: {},
    historyImports: {},
    merchantHints: {},
    recurringDismissals: [],
    transferCollapseDismissals: [],
    matchRules: [],
    seriesMatchRules: [],
    renamePatterns: {},
    // The v30 shape has no theme/font fields; the validator fills them
    // in. Tests that need to exercise a specific value pass it here.
    settings: { ...DEFAULT_SETTINGS, ...extraSettings },
  };
}

describe("v30 → v31 migration", () => {
  it("fills theme/fontFamily/customTheme with canonical defaults", () => {
    const v30 = v30Bucket();
    // Strip the new fields so the migration is exercising the validator's
    // default-fill path, not just round-tripping the values we set above.
    const settings = v30.settings as Record<string, unknown>;
    delete settings.theme;
    delete settings.fontFamily;
    delete settings.customTheme;

    const { data, migrated } = migrate(v30);
    expect(migrated).toBe(true);
    expect(data.version).toBe(LATEST_VERSION);

    const result = validateUserData(data);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.settings.theme).toBe(DEFAULT_SETTINGS.theme);
    expect(result.value.settings.fontFamily).toBe(DEFAULT_SETTINGS.fontFamily);
    expect(result.value.settings.customTheme).toEqual(DEFAULT_CUSTOM_THEME);
  });

  it("preserves valid theme/font choices through migration", () => {
    const v30 = v30Bucket({
      theme: "light",
      fontFamily: "serif",
    });
    const { data } = migrate(v30);
    const result = validateUserData(data);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.settings.theme).toBe("light");
    expect(result.value.settings.fontFamily).toBe("serif");
  });
});

describe("validateSettings — theme / fontFamily", () => {
  it("falls back to system theme when the value is not in the enum", () => {
    const v30 = v30Bucket({ theme: "neon" });
    const { data } = migrate(v30);
    const result = validateUserData(data);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.settings.theme).toBe(DEFAULT_SETTINGS.theme);
  });

  it("falls back to mono font when the value is not in the enum", () => {
    const v30 = v30Bucket({ fontFamily: "comic" });
    const { data } = migrate(v30);
    const result = validateUserData(data);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.settings.fontFamily).toBe(DEFAULT_SETTINGS.fontFamily);
  });
});

describe("validateSettings — customTheme soft fallbacks", () => {
  it("snaps malformed colour hexes back to the Dark default", () => {
    const v30 = v30Bucket({
      customTheme: {
        ...DEFAULT_CUSTOM_THEME,
        colors: {
          ...DEFAULT_CUSTOM_THEME.colors,
          accent: "not-a-color",
          pageBg: "#abc", // 3-digit hex is allowed — should round-trip
        },
      },
    });
    const { data } = migrate(v30);
    const result = validateUserData(data);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const colors = result.value.settings.customTheme.colors;
    // Malformed value snaps back to the Dark palette default.
    expect(colors.accent).toBe(DEFAULT_CUSTOM_THEME_COLORS_DARK.accent);
    // Valid 3-digit hex round-trips unchanged.
    expect(colors.pageBg).toBe("#abc");
  });

  it("falls back to defaults for bad radius / density / borderWidth values", () => {
    const v30 = v30Bucket({
      customTheme: {
        ...DEFAULT_CUSTOM_THEME,
        radius: "huge",
        density: "extra-spacious",
        borderWidth: "thick",
        reduceMotion: "yes" as unknown as boolean,
      },
    });
    const { data } = migrate(v30);
    const result = validateUserData(data);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const ct = result.value.settings.customTheme;
    expect(ct.radius).toBe(DEFAULT_CUSTOM_THEME.radius);
    expect(ct.density).toBe(DEFAULT_CUSTOM_THEME.density);
    expect(ct.borderWidth).toBe(DEFAULT_CUSTOM_THEME.borderWidth);
    expect(ct.reduceMotion).toBe(DEFAULT_CUSTOM_THEME.reduceMotion);
  });

  it("keeps a valid hex-color override intact", () => {
    const v30 = v30Bucket({
      customTheme: {
        ...DEFAULT_CUSTOM_THEME,
        colors: {
          ...DEFAULT_CUSTOM_THEME.colors,
          accent: "#ff0099",
        },
        radius: "lg",
        reduceMotion: true,
      },
    });
    const { data } = migrate(v30);
    const result = validateUserData(data);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.settings.customTheme.colors.accent).toBe("#ff0099");
    expect(result.value.settings.customTheme.radius).toBe("lg");
    expect(result.value.settings.customTheme.reduceMotion).toBe(true);
  });
});
