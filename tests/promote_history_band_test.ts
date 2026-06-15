import { describe, expect, it } from "vitest";

import { DEFAULT_PERSISTED_SETTINGS } from "../src/data/constants/defaults";
import { reducer } from "../src/data/reducer";
import { createDefaultSheet } from "../src/data/sheet";
import type { AccountBudget, UserData } from "../src/data/types";

// Cover for promoting a history entry to a recurring series carrying an
// estimate (min/max) amount band. The promote-history form gained the
// same "range" amount input the recurring-candidate promote modal has,
// so the band must survive onto every minted future row.

const ACCOUNT_ID = "acct-1";
const TYPE_ID = "t1";

function makeState(): UserData {
  const sheet = createDefaultSheet("Budget", ACCOUNT_ID);
  return {
    version: 50,
    sheets: [sheet],
    activeSheetId: sheet.id,
    accounts: [{ id: ACCOUNT_ID, name: "Checking" }],
    companies: [],
    tags: [],
    categories: [{ id: "cat1", name: "Bills", color: "#fff", glyph: "tag" }],
    types: [{ id: TYPE_ID, name: "Electricity", categoryId: "cat1" }],
    hiddenPresetTypeIds: [],
    presetTypeKindOverrides: {},
    hiddenPresetCategoryIds: [],
    transfers: [],
    history: { [ACCOUNT_ID]: [] },
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
  } as unknown as UserData;
}

function budget(state: UserData): AccountBudget {
  return state.sheets[0].items[0] as AccountBudget;
}

function promote(
  state: UserData,
  band?: { amountMin: number; amountMax: number },
): UserData {
  return reducer(state, {
    type: "promoteHistoryToRecurring",
    sheetId: state.sheets[0].id,
    itemId: budget(state).id,
    sourceDescription: "VATTENFALL AB",
    description: "Vattenfall",
    amount: -312,
    typeId: TYPE_ID,
    companyId: null,
    ...(band ?? {}),
    dates: ["2026-07-28", "2026-08-28", "2026-09-28"],
    applyToHistoric: true,
    accountId: ACCOUNT_ID,
    excludedHistoryEntryIds: [],
    now: 0,
  });
}

describe("promoteHistoryToRecurring carries the estimate band", () => {
  it("stamps min/max onto every minted future row", () => {
    const rows = budget(
      promote(makeState(), { amountMin: -250, amountMax: -400 }),
    ).rows;
    expect(rows).toHaveLength(3);
    expect(
      rows.every((r) => r.amountMin === -250 && r.amountMax === -400),
    ).toBe(true);
  });

  it("leaves rows exact when no band is supplied", () => {
    const rows = budget(promote(makeState())).rows;
    expect(rows).toHaveLength(3);
    expect(
      rows.every((r) => r.amountMin === undefined && r.amountMax === undefined),
    ).toBe(true);
  });
});
