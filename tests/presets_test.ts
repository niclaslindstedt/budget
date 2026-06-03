import { describe, expect, it } from "vitest";

import { DEFAULT_PERSISTED_SETTINGS } from "../src/data/constants/defaults";
import {
  isPresetCategoryId,
  PRESET_CATEGORIES,
} from "../src/data/presets/categories";
import { allCategories, allTypes } from "../src/data/presets/merge";
import {
  effectivePresetKind,
  effectiveTypeKind,
  isPresetTypeId,
  PRESET_ENTRY_TYPES,
} from "../src/data/presets/types";
import { createDefaultSheet } from "../src/data/sheet";
import type { UserData } from "../src/data/types";
import { validateUserData } from "../src/data/validate";

function workspace(patch: Partial<UserData> = {}): UserData {
  const sheet = createDefaultSheet("Default");
  return {
    version: 64,
    sheets: [sheet],
    activeSheetId: sheet.id,
    accounts: [],
    categories: [],
    types: [],
    hiddenPresetTypeIds: [],
    presetTypeKindOverrides: {},
    hiddenPresetCategoryIds: [],
    transfers: [],
    history: {},
    historyImports: {},
    merchantHints: {},
    recurringDismissals: [],
    transferCollapseDismissals: [],
    ignoredItemEntryIds: [],
    itemFindExclusionPatterns: [],
    matchRules: [],
    seriesMatchRules: [],
    renamePatterns: {},
    seriesMetadata: {},
    primaryIncomeMerchants: [],
    settings: {
      ...DEFAULT_PERSISTED_SETTINGS,
      device: {
        mobile: { ...DEFAULT_PERSISTED_SETTINGS.device.mobile },
        desktop: { ...DEFAULT_PERSISTED_SETTINGS.device.desktop },
      },
    },
    ...patch,
  };
}

describe("preset helpers", () => {
  it("ships at least one rent and one mortgage preset", () => {
    // Smoke test that the seed list is wired up — protects against an
    // accidental tree-shake of the const arrays.
    expect(PRESET_ENTRY_TYPES.some((t) => t.id === "preset-type-rent")).toBe(
      true,
    );
    expect(
      PRESET_ENTRY_TYPES.some((t) => t.id === "preset-type-mortgage"),
    ).toBe(true);
    expect(PRESET_CATEGORIES.some((c) => c.id === "preset-cat-housing")).toBe(
      true,
    );
  });

  it("isPresetTypeId / isPresetCategoryId recognises preset prefixes", () => {
    expect(isPresetTypeId("preset-type-rent")).toBe(true);
    expect(isPresetTypeId("not-a-preset")).toBe(false);
    expect(isPresetCategoryId("preset-cat-housing")).toBe(true);
    expect(isPresetCategoryId("user-1234")).toBe(false);
  });

  it("allTypes returns visible presets followed by user-added types", () => {
    const state = workspace({
      types: [
        {
          id: "u1",
          name: "Padel",
          color: "#61afef",
          glyph: "ticket",
          categoryId: "preset-cat-other",
        },
      ],
    });
    const merged = allTypes(state);
    expect(merged[0].id.startsWith("preset-type-")).toBe(true);
    expect(merged.at(-1)).toEqual({
      id: "u1",
      name: "Padel",
      color: "#61afef",
      glyph: "ticket",
      categoryId: "preset-cat-other",
    });
    expect(merged).toHaveLength(PRESET_ENTRY_TYPES.length + 1);
  });

  it("allCategories drops hidden presets from the merged list", () => {
    const state = workspace({
      hiddenPresetCategoryIds: ["preset-cat-housing"],
    });
    const merged = allCategories(state);
    expect(merged.some((c) => c.id === "preset-cat-housing")).toBe(false);
    expect(merged).toHaveLength(PRESET_CATEGORIES.length - 1);
  });

  it("validateUserData accepts a Row.typeId pointing at a preset id", () => {
    const sheet = createDefaultSheet("Default", "a1");
    const item = sheet.items[0] as {
      columns: { id: string; type: string; label: string }[];
      rows: { id: string; cells: Record<string, unknown>; typeId?: string }[];
    };
    const descCol = item.columns.find((c) => c.type === "description")!;
    item.rows.push({
      id: "row-with-preset-type",
      cells: { [descCol.id]: "rent for May" },
      typeId: "preset-type-rent",
    });
    const state = workspace({
      sheets: [sheet],
      activeSheetId: sheet.id,
      accounts: [{ id: "a1", name: "Default" }],
    });
    const r = validateUserData(state);
    expect(r.ok).toBe(true);
    if (r.ok) {
      const firstItem = r.value.sheets[0].items[0] as {
        rows: typeof item.rows;
      };
      expect(firstItem.rows[0].typeId).toBe("preset-type-rent");
    }
  });

  it("validateUserData rejects a user-added type that collides with a preset id", () => {
    const state = {
      ...workspace(),
      types: [
        {
          id: "preset-type-rent",
          name: "Hijack",
          color: "#e06c75",
          glyph: "home" as const,
          categoryId: "preset-cat-other",
        },
      ],
    };
    const r = validateUserData(state);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatch(/preset/);
    }
  });

  it("preset income types ship with kind = 'income'", () => {
    const salary = PRESET_ENTRY_TYPES.find(
      (t) => t.id === "preset-type-salary",
    );
    const childAllowance = PRESET_ENTRY_TYPES.find(
      (t) => t.id === "preset-type-child-allowance",
    );
    expect(salary?.kind).toBe("income");
    expect(childAllowance?.kind).toBe("income");
  });

  it("preset expense types ship with kind = 'expense'", () => {
    const rent = PRESET_ENTRY_TYPES.find((t) => t.id === "preset-type-rent");
    const groceries = PRESET_ENTRY_TYPES.find(
      (t) => t.id === "preset-type-groceries",
    );
    expect(rent?.kind).toBe("expense");
    expect(groceries?.kind).toBe("expense");
  });

  it("effectiveTypeKind reads through the override map for presets", () => {
    const child = PRESET_ENTRY_TYPES.find(
      (t) => t.id === "preset-type-child-allowance",
    )!;
    expect(effectivePresetKind(child, {})).toBe("income");
    expect(
      effectivePresetKind(child, { "preset-type-child-allowance": "any" }),
    ).toBe("any");
    expect(
      effectiveTypeKind(child, { "preset-type-child-allowance": "expense" }),
    ).toBe("expense");
  });

  it("effectiveTypeKind returns the user type's own kind", () => {
    const userType = {
      id: "u1",
      name: "Padel",
      color: "#61afef",
      glyph: "ticket" as const,
      categoryId: "preset-cat-other",
      kind: "expense" as const,
    };
    expect(effectiveTypeKind(userType, {})).toBe("expense");
  });

  it("allTypes projects preset kind through the override map", () => {
    const state = workspace({
      presetTypeKindOverrides: { "preset-type-child-allowance": "any" },
    });
    const merged = allTypes(state);
    const child = merged.find((t) => t.id === "preset-type-child-allowance");
    expect(child?.kind).toBeUndefined();
  });

  it("validateUserData drops unknown ids and bad values from kind overrides", () => {
    const r = validateUserData(
      workspace({
        presetTypeKindOverrides: {
          "preset-type-rent": "income",
          "not-a-preset": "income",
          // @ts-expect-error testing runtime sanitisation of bad value
          "preset-type-salary": "garbage",
        },
      }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.presetTypeKindOverrides).toEqual({
        "preset-type-rent": "income",
      });
    }
  });

  it("validateUserData drops unknown ids from the hide-lists", () => {
    const r = validateUserData(
      workspace({
        hiddenPresetTypeIds: ["preset-type-rent", "not-a-preset"],
        hiddenPresetCategoryIds: ["preset-cat-housing", "stale-id"],
      }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.hiddenPresetTypeIds).toEqual(["preset-type-rent"]);
      expect(r.value.hiddenPresetCategoryIds).toEqual(["preset-cat-housing"]);
    }
  });
});
