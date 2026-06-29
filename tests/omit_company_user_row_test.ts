import { describe, expect, it } from "vitest";

import type { ComplexEntryDraft } from "../src/data/action-payloads";
import { applyPatternsAfterCellEdit } from "../src/data/reducers/item";
import { DEFAULT_PERSISTED_SETTINGS } from "../src/data/constants/defaults";
import { reducer } from "../src/data/reducer";
import { createDefaultSheet, findColumnByType } from "../src/data/sheet";
import { validateRow } from "../src/data/validate/sheet-items";
import type {
  AccountBudget,
  MatchRule,
  Row,
  UserData,
  UserRow,
} from "../src/data/types";

// User-authored budget rows can carry the explicit "Omit company"
// decision (`Row.noCompany`), the same flag history entries use. This
// covers the persistence + reducer paths that land it and keep it
// mutually exclusive with a real `companyId`.

const ACCOUNT_ID = "acct-1";
const COMPANY_ID = "co1";
const TYPE_ID = "t1";

function makeState(): UserData {
  const sheet = createDefaultSheet("Budget", ACCOUNT_ID);
  return {
    version: 50,
    sheets: [sheet],
    activeSheetId: sheet.id,
    accounts: [{ id: ACCOUNT_ID, name: "Checking" }],
    companies: [{ id: COMPANY_ID, name: "Ellevio" }],
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

function addComplex(
  state: UserData,
  draft: Partial<ComplexEntryDraft> = {},
): UserData {
  const fullDraft: ComplexEntryDraft = {
    description: "Recurring",
    amount: -250,
    typeId: TYPE_ID,
    dates: ["2026-07-01"],
    ...draft,
  };
  return reducer(state, {
    type: "addRowsFromComplex",
    sheetId: state.sheets[0].id,
    itemId: budget(state).id,
    draft: fullDraft,
  });
}

describe("addRowsFromComplex with the omit flag", () => {
  it("flags minted rows `noCompany` and leaves the company blank", () => {
    const rows = budget(addComplex(makeState(), { noCompany: true })).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0].noCompany).toBe(true);
    expect(rows[0].companyId).toBeUndefined();
  });

  it("lets a chosen company win over the omit flag", () => {
    // The modal never sends both, but the minting must stay consistent
    // if it ever did: the company is the stronger signal.
    const rows = budget(
      addComplex(makeState(), { companyId: COMPANY_ID, noCompany: true }),
    ).rows;
    expect(rows[0].companyId).toBe(COMPANY_ID);
    expect(rows[0].noCompany).toBeUndefined();
  });

  it("sets neither field when the entry has no company decision", () => {
    const rows = budget(addComplex(makeState())).rows;
    expect(rows[0].companyId).toBeUndefined();
    expect(rows[0].noCompany).toBeUndefined();
  });
});

describe("bulkUpdate with the omit flag", () => {
  function omitRow(state: UserData, rowId: string, next: boolean): UserData {
    return reducer(state, {
      type: "bulkUpdate",
      sheetId: state.sheets[0].id,
      itemId: budget(state).id,
      rowIds: [rowId],
      patch: next ? { noCompany: true, companyId: null } : { noCompany: false },
    });
  }

  it("sets and clears the flag, and a company assignment clears it", () => {
    let state = addComplex(makeState(), { companyId: COMPANY_ID });
    const rowId = budget(state).rows[0].id;
    expect(budget(state).rows[0].companyId).toBe(COMPANY_ID);

    // Omitting clears the existing company.
    state = omitRow(state, rowId, true);
    expect(budget(state).rows[0].noCompany).toBe(true);
    expect(budget(state).rows[0].companyId).toBeUndefined();

    // Assigning a company drops the omit flag again.
    state = reducer(state, {
      type: "bulkUpdate",
      sheetId: state.sheets[0].id,
      itemId: budget(state).id,
      rowIds: [rowId],
      patch: { companyId: COMPANY_ID },
    });
    expect(budget(state).rows[0].companyId).toBe(COMPANY_ID);
    expect(budget(state).rows[0].noCompany).toBeUndefined();

    // Clearing omit on a flagged row drops the flag.
    state = omitRow(state, rowId, true);
    state = omitRow(state, rowId, false);
    expect(budget(state).rows[0].noCompany).toBeUndefined();
  });
});

describe("editSeries with the omit flag", () => {
  it("applies the omit flag and clears any prior company", () => {
    let state = addComplex(makeState(), { companyId: COMPANY_ID });
    const rowId = budget(state).rows[0].id;
    state = reducer(state, {
      type: "editSeries",
      sheetId: state.sheets[0].id,
      itemId: budget(state).id,
      rowId,
      patch: {
        description: "Recurring",
        amount: -250,
        noCompany: true,
        companyId: null,
      },
      scope: { kind: "just-this" },
    });
    expect(budget(state).rows[0].noCompany).toBe(true);
    expect(budget(state).rows[0].companyId).toBeUndefined();
  });
});

describe("applyPatternsAfterCellEdit", () => {
  it("does not re-tag a row flagged `noCompany`", () => {
    const sheet = createDefaultSheet("Budget", ACCOUNT_ID);
    const item = sheet.items[0] as AccountBudget;
    const descCol = findColumnByType(item.columns, "description");
    if (!descCol) throw new Error("expected a description column");

    const baseRow: UserRow = {
      kind: "user",
      id: "r1",
      cells: { [descCol.id]: "old" },
      noCompany: true,
    };
    const prev: AccountBudget = { ...item, rows: [baseRow] };
    const editedRow: Row = {
      ...baseRow,
      cells: { [descCol.id]: "ICA Supermarket" },
    };
    const next: AccountBudget = { ...item, rows: [editedRow] };

    const rule: MatchRule = {
      id: "rule1",
      pattern: "ICA*",
      companyId: COMPANY_ID,
    };
    const out = applyPatternsAfterCellEdit(prev, next, [rule]);
    // The rule wants to stamp a company, but the omit decision holds.
    expect(out.rows[0].companyId).toBeUndefined();
    expect(out.rows[0].noCompany).toBe(true);
  });
});

describe("validateRow persists the omit flag", () => {
  const empty = new Set<string>();

  it("keeps `noCompany: true` on a company-less row", () => {
    const result = validateRow(
      { id: "r1", cells: {}, noCompany: true },
      "row",
      empty,
      empty,
      empty,
      empty,
      empty,
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.noCompany).toBe(true);
  });

  it("drops the flag when the row also carries a company", () => {
    const known = new Set([COMPANY_ID]);
    const result = validateRow(
      { id: "r1", cells: {}, companyId: COMPANY_ID, noCompany: true },
      "row",
      empty,
      empty,
      known,
      empty,
      empty,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.companyId).toBe(COMPANY_ID);
      expect(result.value.noCompany).toBeUndefined();
    }
  });

  it("rejects a non-boolean flag", () => {
    const result = validateRow(
      { id: "r1", cells: {}, noCompany: "yes" },
      "row",
      empty,
      empty,
      empty,
      empty,
      empty,
    );
    expect(result.ok).toBe(false);
  });
});
