import { describe, expect, it } from "vitest";

import {
  itemSubtypes,
  PROPERTY_REPAIR_TYPE_IDS,
} from "../src/data/items/subtypes";
import {
  PRESET_TYPE_RENOVATIONS_ID,
  PRESET_TYPE_REPAIRS_ID,
} from "../src/data/presets/types";
import type { Subtype } from "../src/data/types";

const SUBTYPES: Subtype[] = [
  { id: "s1", name: "Laptop", typeId: "ty-electronics" },
  { id: "s2", name: "Phone", typeId: "ty-electronics" },
  { id: "s3", name: "Plumbing", typeId: PRESET_TYPE_REPAIRS_ID },
  { id: "s4", name: "Paint", typeId: PRESET_TYPE_RENOVATIONS_ID },
];

describe("itemSubtypes", () => {
  it("drops subtypes parented to the repairs / renovations types", () => {
    expect(itemSubtypes(SUBTYPES).map((s) => s.id)).toEqual(["s1", "s2"]);
  });

  it("keeps every subtype when none are repairs / renovations", () => {
    const items = SUBTYPES.slice(0, 2);
    expect(itemSubtypes(items)).toEqual(items);
  });

  it("returns an empty list when every subtype is a property repair", () => {
    expect(itemSubtypes(SUBTYPES.slice(2))).toEqual([]);
  });

  it("treats both preset repair types as property-repair parents", () => {
    expect(PROPERTY_REPAIR_TYPE_IDS.has(PRESET_TYPE_REPAIRS_ID)).toBe(true);
    expect(PROPERTY_REPAIR_TYPE_IDS.has(PRESET_TYPE_RENOVATIONS_ID)).toBe(true);
  });
});
