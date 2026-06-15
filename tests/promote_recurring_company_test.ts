import { describe, expect, it } from "vitest";

import type { ComplexEntryDraft } from "../src/data/action-payloads";
import { DEFAULT_PERSISTED_SETTINGS } from "../src/data/constants/defaults";
import { reducer } from "../src/data/reducer";
import { createDefaultSheet } from "../src/data/sheet";
import type { AccountBudget, UserData } from "../src/data/types";

// Regression cover for promoting a detected recurring candidate
// minting rows that carry every confirm-modal field. Reported
// symptoms: the company picked in the confirm modal was dropped, and
// so was an estimate (min/max) amount band — the candidate promote
// minted through a stripped-down path instead of the same
// `addRowsFromComplex` minting the hand-typed complex entry uses.

const ACCOUNT_ID = "acct-1";
const COMPANY_ID = "co1";
const TYPE_ID = "t1";
const TAG_ID = "g1";

function makeState(): UserData {
  const sheet = createDefaultSheet("Budget", ACCOUNT_ID);
  return {
    version: 50,
    sheets: [sheet],
    activeSheetId: sheet.id,
    accounts: [{ id: ACCOUNT_ID, name: "Checking" }],
    companies: [{ id: COMPANY_ID, name: "Ellevio" }],
    tags: [{ id: TAG_ID, name: "Utilities", color: "#fff" }],
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
  draft: Partial<ComplexEntryDraft> = {},
): UserData {
  const fullDraft: ComplexEntryDraft = {
    description: "Ellevio (publ) AB",
    amount: -250,
    typeId: TYPE_ID,
    companyId: COMPANY_ID,
    dates: ["2026-07-28", "2026-08-28", "2026-09-28"],
    ...draft,
  };
  return reducer(state, {
    type: "promoteRecurringCandidate",
    sheetId: state.sheets[0].id,
    itemId: budget(state).id,
    key: "ELLEVIO",
    sourceDescription: "ELLEVIO (PUBL) AB",
    draft: fullDraft,
    now: 0,
  });
}

describe("promoteRecurringCandidate carries the full draft", () => {
  it("stamps the chosen company on every minted row", () => {
    const rows = budget(promote(makeState())).rows;
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.companyId === COMPANY_ID)).toBe(true);
  });

  it("folds the company into the merchant hint", () => {
    const next = promote(makeState());
    const hint = Object.values(next.merchantHints)[0];
    expect(hint?.companyId).toBe(COMPANY_ID);
  });

  it("carries the estimate min/max band onto every minted row", () => {
    const rows = budget(
      promote(makeState(), { amountMin: -150, amountMax: -350 }),
    ).rows;
    expect(
      rows.every((r) => r.amountMin === -150 && r.amountMax === -350),
    ).toBe(true);
  });

  it("carries tags and the transfer flag onto every minted row", () => {
    const rows = budget(
      promote(makeState(), { tagIds: [TAG_ID], isTransfer: true }),
    ).rows;
    expect(rows.every((r) => r.isTransfer === true)).toBe(true);
    expect(rows.every((r) => r.tagIds?.[0] === TAG_ID)).toBe(true);
  });

  it("leaves rows untagged when no company is chosen", () => {
    const rows = budget(promote(makeState(), { companyId: null })).rows;
    expect(rows.every((r) => r.companyId === undefined)).toBe(true);
  });
});
