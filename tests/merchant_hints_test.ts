import { describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS } from "../src/data/constants";
import {
  recordMerchantHints,
  suggestCategoryForDescription,
} from "../src/data/merchant-hints";
import { createDefaultSheet } from "../src/data/sheet";
import type { Category, EntryType, UserData } from "../src/data/types";

function makeState(categories: Category[], types: EntryType[] = []): UserData {
  const sheet = createDefaultSheet("Default");
  return {
    version: 20,
    sheets: [sheet],
    activeSheetId: sheet.id,
    accounts: [],
    categories,
    types,
    hiddenPresetTypeIds: [],
    hiddenPresetCategoryIds: [],
    transactions: [],
    history: {},
    historyImports: {},
    merchantHints: {},
    recurringDismissals: [],
    transferCollapseDismissals: [],
    matchRules: [],
    settings: { ...DEFAULT_SETTINGS },
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

describe("recordMerchantHints", () => {
  it("creates a hint for a new merchant", () => {
    const state = makeState([food]);
    const next = recordMerchantHints(
      state,
      [{ description: "Kortköp 2026-05-01 ICA Maxi", categoryId: food.id }],
      1000,
    );
    expect(next.merchantHints["ica maxi"]).toEqual({
      categoryId: food.id,
      hitCount: 1,
      lastUsedAt: 1000,
    });
  });

  it("increments hitCount when the same category is reinforced", () => {
    let state = makeState([food]);
    state = recordMerchantHints(
      state,
      [{ description: "ICA Maxi", categoryId: food.id }],
      1000,
    );
    state = recordMerchantHints(
      state,
      [{ description: "ICA Maxi", categoryId: food.id }],
      2000,
    );
    expect(state.merchantHints["ica maxi"]).toEqual({
      categoryId: food.id,
      hitCount: 2,
      lastUsedAt: 2000,
    });
  });

  it("resets hitCount when the category changes", () => {
    let state = makeState([food, ent]);
    state = recordMerchantHints(
      state,
      [{ description: "Mystery", categoryId: food.id }],
      1000,
    );
    state = recordMerchantHints(
      state,
      [{ description: "Mystery", categoryId: ent.id }],
      2000,
    );
    expect(state.merchantHints["mystery"]).toEqual({
      categoryId: ent.id,
      hitCount: 1,
      lastUsedAt: 2000,
    });
  });

  it("ignores recordings whose categoryId no longer exists", () => {
    const state = makeState([food]);
    const next = recordMerchantHints(
      state,
      [{ description: "ICA Maxi", categoryId: "ghost" }],
      1000,
    );
    expect(next).toBe(state);
  });

  it("drops the hint when categoryId is null", () => {
    let state = makeState([food]);
    state = recordMerchantHints(
      state,
      [{ description: "ICA Maxi", categoryId: food.id }],
      1000,
    );
    state = recordMerchantHints(
      state,
      [{ description: "ICA Maxi", categoryId: null }],
      2000,
    );
    expect(state.merchantHints["ica maxi"]).toBeUndefined();
  });

  it("skips descriptions that don't normalise to a meaningful key", () => {
    const state = makeState([food]);
    const next = recordMerchantHints(
      state,
      [{ description: "   ---  ", categoryId: food.id }],
      1000,
    );
    expect(next.merchantHints).toEqual({});
  });

  it("returns the same reference when nothing changes", () => {
    const state = makeState([food]);
    expect(recordMerchantHints(state, [], 1000)).toBe(state);
  });

  it("stamps typeId and description overrides from the history-promote flow", () => {
    const sub: EntryType = {
      id: "type-sub",
      name: "Subscription",
      color: "#56b6c2",
      glyph: "music",
    };
    const state = makeState([ent], [sub]);
    const next = recordMerchantHints(
      state,
      [
        {
          description: "SPOTIFY AB",
          categoryId: ent.id,
          typeId: sub.id,
          description_override: "Spotify",
        },
      ],
      1000,
    );
    expect(next.merchantHints["spotify ab"]).toEqual({
      categoryId: ent.id,
      hitCount: 1,
      lastUsedAt: 1000,
      typeId: sub.id,
      description: "Spotify",
    });
  });

  it("drops an unknown typeId but keeps the rest of the hint", () => {
    const state = makeState([ent]);
    const next = recordMerchantHints(
      state,
      [
        {
          description: "Spotify",
          categoryId: ent.id,
          typeId: "ghost-type",
        },
      ],
      1000,
    );
    expect(next.merchantHints["spotify"]).toEqual({
      categoryId: ent.id,
      hitCount: 1,
      lastUsedAt: 1000,
    });
  });

  it("preserves a prior typeId when a later recording leaves it undefined", () => {
    const sub: EntryType = {
      id: "type-sub",
      name: "Subscription",
      color: "#56b6c2",
      glyph: "music",
    };
    let state = makeState([ent], [sub]);
    state = recordMerchantHints(
      state,
      [{ description: "Spotify", categoryId: ent.id, typeId: sub.id }],
      1000,
    );
    state = recordMerchantHints(
      state,
      [{ description: "Spotify", categoryId: ent.id }],
      2000,
    );
    expect(state.merchantHints["spotify"]?.typeId).toBe(sub.id);
  });
});

describe("suggestCategoryForDescription", () => {
  it("returns the stored category for a matching description", () => {
    const state = makeState([food]);
    const next = recordMerchantHints(
      state,
      [{ description: "ICA Maxi", categoryId: food.id }],
      1000,
    );
    expect(
      suggestCategoryForDescription(
        next.merchantHints,
        "Kortköp 2026-05-01 ICA Maxi",
      ),
    ).toBe(food.id);
  });

  it("returns null when the description doesn't have a hint", () => {
    expect(suggestCategoryForDescription({}, "Spotify")).toBeNull();
  });
});
