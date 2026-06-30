import { describe, expect, it } from "vitest";

import {
  computeDescriptionMetadataInductions,
  descriptionMetadataInductionFor,
} from "../src/data/budget/company-type-hints";
import { findColumnByType } from "../src/data/sheet";
import { freshUserData } from "../src/storage/local";
import type {
  AccountBudget,
  HistoryEntry,
  Row,
  UserData,
} from "../src/data/types";

type RowSpec = {
  id?: string;
  description?: string;
  companyId?: string;
  typeId?: string;
};

function entry(overrides: Partial<HistoryEntry>): HistoryEntry {
  return {
    id: overrides.id ?? Math.random().toString(36).slice(2),
    date: overrides.date ?? "2026-05-01",
    description: overrides.description ?? "",
    amount: overrides.amount ?? -100,
    importedAt: overrides.importedAt ?? 1,
    ...overrides,
  };
}

function makeData(opts: {
  rows?: readonly RowSpec[];
  history?: readonly HistoryEntry[];
}): UserData {
  const base = freshUserData();
  const sheet = base.sheets[0]!;
  const item = sheet.items[0] as AccountBudget;
  const descId = findColumnByType(item.columns, "description")!.id;
  const rows: Row[] = (opts.rows ?? []).map(
    (r, i) =>
      ({
        kind: "user",
        id: r.id ?? `r${i}`,
        cells: r.description !== undefined ? { [descId]: r.description } : {},
        ...(r.companyId !== undefined ? { companyId: r.companyId } : {}),
        ...(r.typeId !== undefined ? { typeId: r.typeId } : {}),
      }) as Row,
  );
  const patchedItem: AccountBudget = { ...item, rows };
  return {
    ...base,
    sheets: [{ ...sheet, items: [patchedItem] }],
    history: { acct: [...(opts.history ?? [])] },
  };
}

describe("computeDescriptionMetadataInductions", () => {
  it("returns nothing when no description is paired with metadata", () => {
    expect(computeDescriptionMetadataInductions(makeData({})).size).toBe(0);
    expect(
      computeDescriptionMetadataInductions(
        makeData({ rows: [{ description: "SPOTIFY" }] }),
      ).size,
    ).toBe(0);
  });

  it("induces both company and type when every connection agrees", () => {
    const inductions = computeDescriptionMetadataInductions(
      makeData({
        rows: [
          {
            id: "a",
            description: "SPOTIFY",
            companyId: "co_spotify",
            typeId: "ty_sub",
          },
          {
            id: "b",
            description: "KORTKÖP SPOTIFY 2026-05-01",
            companyId: "co_spotify",
            typeId: "ty_sub",
          },
        ],
      }),
    );
    // Cosmetic noise collapses to one key.
    expect(inductions.size).toBe(1);
    expect(descriptionMetadataInductionFor(inductions, "SPOTIFY")).toEqual({
      companyId: "co_spotify",
      typeId: "ty_sub",
    });
  });

  it("drops a field when its connections disagree, keeps the unanimous one", () => {
    const inductions = computeDescriptionMetadataInductions(
      makeData({
        rows: [
          {
            id: "a",
            description: "ICA",
            companyId: "co_ica",
            typeId: "ty_food",
          },
          {
            id: "b",
            description: "ICA",
            companyId: "co_ica",
            typeId: "ty_household",
          },
        ],
      }),
    );
    // Company agrees (co_ica twice) → induced; type splits → dropped.
    expect(descriptionMetadataInductionFor(inductions, "ICA")).toEqual({
      companyId: "co_ica",
    });
  });

  it("induces a single field even when the other was never set", () => {
    const inductions = computeDescriptionMetadataInductions(
      makeData({
        rows: [
          { id: "a", description: "RENT", typeId: "ty_housing" },
          { id: "b", description: "RENT", typeId: "ty_housing" },
        ],
      }),
    );
    expect(descriptionMetadataInductionFor(inductions, "RENT")).toEqual({
      typeId: "ty_housing",
    });
  });

  it("counts history-entry overrides and splits", () => {
    const history = [
      entry({
        description: "NETFLIX",
        userCompanyId: "co_netflix",
        userTypeId: "ty_sub",
      }),
      entry({
        description: "AMZN MKTP",
        userCompanyId: "co_outer",
        userTypeId: "ty_outer",
        splits: [
          {
            description: "",
            amount: -10,
            companyId: "co_split",
            typeId: "ty_split",
          },
        ],
      }),
    ];
    const inductions = computeDescriptionMetadataInductions(
      makeData({ history }),
    );
    expect(descriptionMetadataInductionFor(inductions, "NETFLIX")).toEqual({
      companyId: "co_netflix",
      typeId: "ty_sub",
    });
    // Splits drive the connection, so the parent's override is skipped.
    expect(descriptionMetadataInductionFor(inductions, "AMZN MKTP")).toEqual({
      companyId: "co_split",
      typeId: "ty_split",
    });
  });

  it("skips keys too short to identify a merchant", () => {
    expect(
      computeDescriptionMetadataInductions(
        makeData({ rows: [{ description: "AT", companyId: "co_a" }] }),
      ).size,
    ).toBe(0);
  });
});

describe("descriptionMetadataInductionFor", () => {
  const inductions = new Map([["spotify", { companyId: "co_s" }]]);

  it("resolves a raw description via its normalised key", () => {
    expect(
      descriptionMetadataInductionFor(inductions, "SPOTIFY 2026-05-01"),
    ).toEqual({ companyId: "co_s" });
  });

  it("returns undefined for a blank, missing, or too-short description", () => {
    expect(descriptionMetadataInductionFor(inductions, "")).toBeUndefined();
    expect(descriptionMetadataInductionFor(inductions, null)).toBeUndefined();
    expect(
      descriptionMetadataInductionFor(inductions, undefined),
    ).toBeUndefined();
    expect(descriptionMetadataInductionFor(inductions, "ab")).toBeUndefined();
  });

  it("returns undefined when the merchant has no induction", () => {
    expect(descriptionMetadataInductionFor(inductions, "ICA")).toBeUndefined();
  });
});
