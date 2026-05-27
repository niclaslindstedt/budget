import { describe, expect, it } from "vitest";

import { PRESET_CATEGORIES, PRESET_ENTRY_TYPES } from "../src/data/presets";
import { tFor, type TFunction } from "../src/i18n";
import { displayCategoryName, displayTypeName } from "../src/i18n/preset-names";

function tEn(): TFunction {
  return (k, p) => tFor("en", k, p);
}
function tSv(): TFunction {
  return (k, p) => tFor("sv", k, p);
}

describe("preset-names", () => {
  it("translates every preset category id in both languages", () => {
    const en = tEn();
    const sv = tSv();
    for (const cat of PRESET_CATEGORIES) {
      const enName = displayCategoryName(cat, en);
      const svName = displayCategoryName(cat, sv);
      // The fallback path returns the dotted key when the slug is
      // missing — assert we never see one.
      expect(enName.startsWith("presetCategories.")).toBe(false);
      expect(svName.startsWith("presetCategories.")).toBe(false);
      expect(enName.length).toBeGreaterThan(0);
      expect(svName.length).toBeGreaterThan(0);
    }
  });

  it("translates every preset entry type id in both languages", () => {
    const en = tEn();
    const sv = tSv();
    for (const ty of PRESET_ENTRY_TYPES) {
      const enName = displayTypeName(ty, en);
      const svName = displayTypeName(ty, sv);
      expect(enName.startsWith("presetTypes.")).toBe(false);
      expect(svName.startsWith("presetTypes.")).toBe(false);
      expect(enName.length).toBeGreaterThan(0);
      expect(svName.length).toBeGreaterThan(0);
    }
  });

  it("returns the stored name verbatim for user-added entries", () => {
    const en = tEn();
    const sv = tSv();
    const userCategory = {
      id: "cat-userpadel",
      name: "Padel",
      color: "#61afef",
      icon: "ticket" as const,
    };
    const userType = {
      id: "t-userpadel",
      name: "Padel court",
      color: "#61afef",
      glyph: "ticket" as const,
      categoryId: "preset-cat-other",
    };
    expect(displayCategoryName(userCategory, en)).toBe("Padel");
    expect(displayCategoryName(userCategory, sv)).toBe("Padel");
    expect(displayTypeName(userType, en)).toBe("Padel court");
    expect(displayTypeName(userType, sv)).toBe("Padel court");
  });

  it("renders the Swedish translation for a known preset", () => {
    const sv = tSv();
    const mortgage = PRESET_ENTRY_TYPES.find(
      (t) => t.id === "preset-type-mortgage",
    )!;
    const housing = PRESET_CATEGORIES.find(
      (c) => c.id === "preset-cat-housing",
    )!;
    expect(displayTypeName(mortgage, sv)).toBe("Amortering");
    expect(displayCategoryName(housing, sv)).toBe("Boende");
  });
});
