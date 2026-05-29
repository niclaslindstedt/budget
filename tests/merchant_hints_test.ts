import { describe, expect, it } from "vitest";

import { DEFAULT_PERSISTED_SETTINGS } from "../src/data/constants/defaults";
import {
  recordMerchantHints,
  suggestTypeForDescription,
} from "../src/data/merchant-hints";
import { createDefaultSheet } from "../src/data/sheet";
import type { Category, EntryType, UserData } from "../src/data/types";

function makeState(categories: Category[], types: EntryType[] = []): UserData {
  const sheet = createDefaultSheet("Default");
  return {
    version: 45,
    sheets: [sheet],
    activeSheetId: sheet.id,
    accounts: [],
    companies: [],
    tags: [],
    categories,
    types,
    hiddenPresetTypeIds: [],
    presetTypeKindOverrides: {},
    hiddenPresetCategoryIds: [],
    transfers: [],
    history: {},
    historyImports: {},
    merchantHints: {},
    recurringDismissals: [],
    transferCollapseDismissals: [],
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
  };
}

const food: Category = {
  id: "food",
  name: "Food",
  color: "#e06c75",
  icon: "utensils",
};
const ent: Category = {
  id: "ent",
  name: "Entertainment",
  color: "#61afef",
  icon: "music",
};

const groceriesType: EntryType = {
  id: "type-groceries",
  name: "Groceries",
  color: "#e06c75",
  glyph: "utensils",
  categoryId: food.id,
};
const subType: EntryType = {
  id: "type-sub",
  name: "Subscription",
  color: "#56b6c2",
  glyph: "music",
  categoryId: ent.id,
};

describe("recordMerchantHints", () => {
  it("creates a hint for a new merchant", () => {
    const state = makeState([food], [groceriesType]);
    const next = recordMerchantHints(
      state,
      [
        {
          description: "Kortköp 2026-05-01 ICA Maxi",
          typeId: groceriesType.id,
        },
      ],
      1000,
    );
    expect(next.merchantHints["ica maxi"]).toEqual({
      typeId: groceriesType.id,
      hitCount: 1,
      lastUsedAt: 1000,
    });
  });

  it("increments hitCount when the same type is reinforced", () => {
    let state = makeState([food], [groceriesType]);
    state = recordMerchantHints(
      state,
      [{ description: "ICA Maxi", typeId: groceriesType.id }],
      1000,
    );
    state = recordMerchantHints(
      state,
      [{ description: "ICA Maxi", typeId: groceriesType.id }],
      2000,
    );
    expect(state.merchantHints["ica maxi"]).toEqual({
      typeId: groceriesType.id,
      hitCount: 2,
      lastUsedAt: 2000,
    });
  });

  it("resets hitCount when the type changes", () => {
    let state = makeState([food, ent], [groceriesType, subType]);
    state = recordMerchantHints(
      state,
      [{ description: "Mystery", typeId: groceriesType.id }],
      1000,
    );
    state = recordMerchantHints(
      state,
      [{ description: "Mystery", typeId: subType.id }],
      2000,
    );
    expect(state.merchantHints["mystery"]).toEqual({
      typeId: subType.id,
      hitCount: 1,
      lastUsedAt: 2000,
    });
  });

  it("ignores recordings whose typeId no longer exists", () => {
    const state = makeState([food], [groceriesType]);
    const next = recordMerchantHints(
      state,
      [{ description: "ICA Maxi", typeId: "ghost" }],
      1000,
    );
    expect(next).toBe(state);
  });

  it("drops the hint when typeId is null", () => {
    let state = makeState([food], [groceriesType]);
    state = recordMerchantHints(
      state,
      [{ description: "ICA Maxi", typeId: groceriesType.id }],
      1000,
    );
    state = recordMerchantHints(
      state,
      [{ description: "ICA Maxi", typeId: null }],
      2000,
    );
    expect(state.merchantHints["ica maxi"]).toBeUndefined();
  });

  it("skips descriptions that don't normalise to a meaningful key", () => {
    const state = makeState([food], [groceriesType]);
    const next = recordMerchantHints(
      state,
      [{ description: "   ---  ", typeId: groceriesType.id }],
      1000,
    );
    expect(next.merchantHints).toEqual({});
  });

  it("returns the same reference when nothing changes", () => {
    const state = makeState([food], [groceriesType]);
    expect(recordMerchantHints(state, [], 1000)).toBe(state);
  });

  it("stamps typeId and description overrides from the history-promote flow", () => {
    const state = makeState([ent], [subType]);
    const next = recordMerchantHints(
      state,
      [
        {
          description: "SPOTIFY AB",
          typeId: subType.id,
          description_override: "Spotify",
        },
      ],
      1000,
    );
    expect(next.merchantHints["spotify ab"]).toEqual({
      typeId: subType.id,
      hitCount: 1,
      lastUsedAt: 1000,
      description: "Spotify",
    });
  });

  it("drops a recording with an unknown typeId entirely", () => {
    const state = makeState([ent]);
    const next = recordMerchantHints(
      state,
      [
        {
          description: "Spotify",
          typeId: "ghost-type",
        },
      ],
      1000,
    );
    // No known type → no hint is written.
    expect(next.merchantHints["spotify"]).toBeUndefined();
  });

  it("preserves a prior description override when a later recording leaves it undefined", () => {
    let state = makeState([ent], [subType]);
    state = recordMerchantHints(
      state,
      [
        {
          description: "Spotify",
          typeId: subType.id,
          description_override: "Spotify",
        },
      ],
      1000,
    );
    state = recordMerchantHints(
      state,
      [{ description: "Spotify", typeId: subType.id }],
      2000,
    );
    expect(state.merchantHints["spotify"]?.description).toBe("Spotify");
  });
});

describe("suggestTypeForDescription", () => {
  it("returns the stored type for a matching description", () => {
    const state = makeState([food], [groceriesType]);
    const next = recordMerchantHints(
      state,
      [{ description: "ICA Maxi", typeId: groceriesType.id }],
      1000,
    );
    expect(
      suggestTypeForDescription(
        next.merchantHints,
        "Kortköp 2026-05-01 ICA Maxi",
      ),
    ).toBe(groceriesType.id);
  });

  it("returns null when the description doesn't have a hint", () => {
    expect(suggestTypeForDescription({}, "Spotify")).toBeNull();
  });
});
