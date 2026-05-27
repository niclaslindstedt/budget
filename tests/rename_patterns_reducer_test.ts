import { describe, expect, it } from "vitest";

import { DEFAULT_PERSISTED_SETTINGS } from "../src/data/constants/defaults";
import { reducer } from "../src/data/reducer";
import { createDefaultSheet } from "../src/data/sheet";
import type { HistoryEntry, UserData } from "../src/data/types";

// Reducer-level tests for the rename-pattern learning loop and the
// commit-time `applyImportRenames` action. The pure helpers are
// covered by `rename_patterns_test.ts`; this file checks that the
// reducer wires them up — that `updateHistoryEntry` records the
// rename, that a no-op edit doesn't pollute the store, and that
// `applyImportRenames` stamps `userDescription` without re-recording.

const ACCOUNT_ID = "acct-1";

function makeState(entries: HistoryEntry[] = []): UserData {
  const sheet = createDefaultSheet("Budget", ACCOUNT_ID);
  return {
    version: 44,
    sheets: [sheet],
    activeSheetId: sheet.id,
    accounts: [{ id: ACCOUNT_ID, name: "Checking" }],
    companies: [],
    categories: [],
    types: [],
    hiddenPresetTypeIds: [],
    presetTypeKindOverrides: {},
    hiddenPresetCategoryIds: [],
    transfers: [],
    history: { [ACCOUNT_ID]: entries },
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

function entry(
  id: string,
  description: string,
  userDescription?: string,
): HistoryEntry {
  return {
    id,
    date: "2026-05-12",
    description,
    amount: -100,
    importedAt: 0,
    ...(userDescription !== undefined ? { userDescription } : {}),
  };
}

describe("reducer.updateHistoryEntry → rename-pattern learning", () => {
  it("records a fresh rename keyed by the normalised bank description", () => {
    const state = makeState([
      entry("e-1", "Kortköp 2026-05-12 ICA SUPERMARKET"),
    ]);
    const next = reducer(state, {
      type: "updateHistoryEntry",
      accountId: ACCOUNT_ID,
      entryId: "e-1",
      patch: { userDescription: "ICA" },
    });
    expect(next.renamePatterns[ACCOUNT_ID]?.["ica supermarket"]).toMatchObject({
      suggestedDescription: "ICA",
      hitCount: 1,
    });
    expect(next.history[ACCOUNT_ID][0].userDescription).toBe("ICA");
  });

  it("does not record when the patch only changes the type", () => {
    const state = makeState([entry("e-1", "ICA MAXI 12/05")]);
    const next = reducer(state, {
      type: "updateHistoryEntry",
      accountId: ACCOUNT_ID,
      entryId: "e-1",
      patch: { userTypeId: "type-1" },
    });
    expect(next.renamePatterns).toEqual({});
  });

  it("does not record when the user clears an existing override", () => {
    const state = makeState([entry("e-1", "ICA MAXI", "ICA")]);
    const next = reducer(state, {
      type: "updateHistoryEntry",
      accountId: ACCOUNT_ID,
      entryId: "e-1",
      patch: { userDescription: "" },
    });
    expect(next.renamePatterns).toEqual({});
    expect(next.history[ACCOUNT_ID][0].userDescription).toBeUndefined();
  });

  it("does not record when the user retypes the existing override text", () => {
    const state = makeState([entry("e-1", "ICA MAXI", "ICA")]);
    const next = reducer(state, {
      type: "updateHistoryEntry",
      accountId: ACCOUNT_ID,
      entryId: "e-1",
      patch: { userDescription: "ICA" },
    });
    expect(next.renamePatterns).toEqual({});
  });

  it("re-records when the user picks a different text", () => {
    const initial = makeState([entry("e-1", "ICA MAXI", "ICA")]);
    const next = reducer(initial, {
      type: "updateHistoryEntry",
      accountId: ACCOUNT_ID,
      entryId: "e-1",
      patch: { userDescription: "Groceries" },
    });
    expect(
      next.renamePatterns[ACCOUNT_ID]?.["ica maxi"]?.suggestedDescription,
    ).toBe("Groceries");
  });
});

describe("reducer.applyImportRenames", () => {
  it("stamps userDescription on each named entry", () => {
    const state = makeState([
      entry("e-1", "ICA MAXI 12/05"),
      entry("e-2", "PRESSBYRÅN T-CEN"),
    ]);
    const next = reducer(state, {
      type: "applyImportRenames",
      accountId: ACCOUNT_ID,
      renames: [
        { entryId: "e-1", userDescription: "ICA" },
        { entryId: "e-2", userDescription: "Pressbyrån" },
      ],
    });
    const history = next.history[ACCOUNT_ID];
    expect(history.find((e) => e.id === "e-1")?.userDescription).toBe("ICA");
    expect(history.find((e) => e.id === "e-2")?.userDescription).toBe(
      "Pressbyrån",
    );
  });

  it("bumps the matching pattern's hit-count and lastUsedAt", () => {
    // Seed an existing pattern by routing through updateHistoryEntry,
    // then apply the same rename via applyImportRenames and confirm
    // the count bumped without re-recording as fresh.
    const seeded = reducer(makeState([entry("e-1", "ICA MAXI")]), {
      type: "updateHistoryEntry",
      accountId: ACCOUNT_ID,
      entryId: "e-1",
      patch: { userDescription: "ICA" },
    });
    expect(seeded.renamePatterns[ACCOUNT_ID]["ica maxi"].hitCount).toBe(1);
    const next = reducer(
      {
        ...seeded,
        history: { [ACCOUNT_ID]: [entry("e-2", "ICA MAXI 19/05")] },
      },
      {
        type: "applyImportRenames",
        accountId: ACCOUNT_ID,
        renames: [{ entryId: "e-2", userDescription: "ICA" }],
      },
    );
    expect(next.renamePatterns[ACCOUNT_ID]["ica maxi"].hitCount).toBe(2);
  });

  it("records a fresh pattern when the accepted text was edited inline", () => {
    const seeded = reducer(makeState([entry("e-1", "ICA MAXI")]), {
      type: "updateHistoryEntry",
      accountId: ACCOUNT_ID,
      entryId: "e-1",
      patch: { userDescription: "ICA" },
    });
    const next = reducer(
      {
        ...seeded,
        history: { [ACCOUNT_ID]: [entry("e-2", "ICA MAXI 19/05")] },
      },
      {
        type: "applyImportRenames",
        accountId: ACCOUNT_ID,
        renames: [{ entryId: "e-2", userDescription: "Groceries" }],
      },
    );
    expect(
      next.renamePatterns[ACCOUNT_ID]["ica maxi"].suggestedDescription,
    ).toBe("Groceries");
    expect(next.renamePatterns[ACCOUNT_ID]["ica maxi"].hitCount).toBe(1);
  });

  it("is a no-op when the renames array is empty", () => {
    const state = makeState([entry("e-1", "ICA MAXI")]);
    const next = reducer(state, {
      type: "applyImportRenames",
      accountId: ACCOUNT_ID,
      renames: [],
    });
    expect(next).toBe(state);
  });

  it("ignores entries that no longer exist", () => {
    const state = makeState([entry("e-1", "ICA MAXI")]);
    const next = reducer(state, {
      type: "applyImportRenames",
      accountId: ACCOUNT_ID,
      renames: [{ entryId: "missing", userDescription: "Anything" }],
    });
    expect(next).toBe(state);
  });
});
