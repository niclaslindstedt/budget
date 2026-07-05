import { describe, expect, it } from "vitest";

import { DEFAULT_PERSISTED_SETTINGS } from "../src/data/constants/defaults";
import { reducer } from "../src/data/reducer";
import { createDefaultSheet } from "../src/data/sheet";
import type { AccountBudget, UserData } from "../src/data/types";

// Cover for the "Omit company" option on the promote-history-to-recurring
// form: every minted future row carries the `noCompany` flag (never a
// company alongside it), and the recorded merchant hint clears any stale
// company suggestion for the merchant key.

const ACCOUNT_ID = "acct-1";
const TYPE_ID = "t1";
const COMPANY_ID = "c1";

function makeState(): UserData {
  const sheet = createDefaultSheet("Budget", ACCOUNT_ID);
  return {
    version: 50,
    sheets: [sheet],
    activeSheetId: sheet.id,
    accounts: [{ id: ACCOUNT_ID, name: "Checking" }],
    companies: [{ id: COMPANY_ID, name: "Merchant A" }],
    tags: [],
    categories: [{ id: "cat1", name: "Bills", color: "#fff", glyph: "tag" }],
    types: [{ id: TYPE_ID, name: "Electricity", categoryId: "cat1" }],
    hiddenPresetTypeIds: [],
    presetTypeKindOverrides: {},
    hiddenPresetCategoryIds: [],
    transfers: [],
    history: { [ACCOUNT_ID]: [] },
    historyImports: {},
    // Pre-existing hint carrying a company — the omit decision must
    // clear it so future imports stop suggesting a company.
    merchantHints: {
      "vattenfall ab": {
        typeId: TYPE_ID,
        companyId: COMPANY_ID,
        hitCount: 3,
        lastUsedAt: 0,
      },
    },
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

function promoteOmitting(state: UserData): UserData {
  return reducer(state, {
    type: "promoteHistoryToRecurring",
    sheetId: state.sheets[0].id,
    itemId: budget(state).id,
    sourceDescription: "VATTENFALL AB",
    description: "Vattenfall",
    amount: -312,
    typeId: TYPE_ID,
    companyId: null,
    noCompany: true,
    dates: ["2026-07-28", "2026-08-28", "2026-09-28"],
    applyToHistoric: true,
    accountId: ACCOUNT_ID,
    excludedHistoryEntryIds: [],
    now: 1,
  });
}

describe("promoteHistoryToRecurring with omit company", () => {
  it("flags every minted future row noCompany and never carries a company", () => {
    const rows = budget(promoteOmitting(makeState())).rows;
    expect(rows).toHaveLength(3);
    expect(
      rows.every((r) => r.noCompany === true && r.companyId === undefined),
    ).toBe(true);
  });

  it("clears the company on the recorded merchant hint", () => {
    const next = promoteOmitting(makeState());
    const hint = next.merchantHints["vattenfall ab"];
    expect(hint.typeId).toBe(TYPE_ID);
    expect(hint.companyId).toBeUndefined();
  });
});
