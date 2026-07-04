import { describe, expect, it } from "vitest";

import { entryNeedsMetadata } from "../src/components/budget/budget-metadata-needs";
import type {
  Company,
  EntryType,
  HistoryEntry,
  MatchRule,
  MerchantHint,
} from "../src/data/types";

const SALARY: EntryType = {
  id: "t-salary",
  name: "Salary",
  color: "#8fbcbb",
  glyph: "wallet",
  categoryId: "cat-income",
};

const MERCHANT: Company = { id: "c-merchant", name: "Merchant A" };

const companies = new Map<string, Company>([[MERCHANT.id, MERCHANT]]);
const types = new Map<string, EntryType>([[SALARY.id, SALARY]]);
const noHints: Readonly<Record<string, MerchantHint>> = {};
const noRules: readonly MatchRule[] = [];

function entry(over: Partial<HistoryEntry> & { id: string }): HistoryEntry {
  return {
    date: "2026-06-25",
    description: "Lön",
    amount: 611,
    importedAt: 0,
    ...over,
  };
}

function needs(e: HistoryEntry): boolean {
  return entryNeedsMetadata(e, noHints, noRules, companies, types);
}

describe("entryNeedsMetadata", () => {
  it("flags an entry with no type", () => {
    expect(needs(entry({ id: "a" }))).toBe(true);
  });

  it("flags an entry that has a type but no company", () => {
    expect(needs(entry({ id: "b", userTypeId: SALARY.id }))).toBe(true);
  });

  it("clears an entry once a type and company are both set", () => {
    expect(
      needs(
        entry({ id: "c", userTypeId: SALARY.id, userCompanyId: MERCHANT.id }),
      ),
    ).toBe(false);
  });

  it("clears an entry with a type and an omitted company", () => {
    expect(
      needs(entry({ id: "d", userTypeId: SALARY.id, noCompany: true })),
    ).toBe(false);
  });

  // Regression: a match rule / merchant hint / override that sets a
  // description equal to the raw bank text is still "something said", so
  // an otherwise-complete entry must not be dragged back for a
  // description it doesn't owe. Before the fix such an entry stayed in
  // the walk yet reported no missing field, leaving Save silently gated.
  it("clears a fully-annotated entry whose description equals the bank text", () => {
    expect(
      needs(
        entry({
          id: "e",
          userTypeId: SALARY.id,
          userCompanyId: MERCHANT.id,
          userDescription: "Lön",
        }),
      ),
    ).toBe(false);
  });

  it("still flags an untouched entry whose display is the raw bank text", () => {
    // No type, no company, no user description: nothing has been said.
    expect(needs(entry({ id: "f" }))).toBe(true);
  });
});
