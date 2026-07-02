import { describe, expect, it } from "vitest";

import {
  computeDescriptionCompanyHints,
  descriptionCompanyHintsFor,
  mergeCompanyHintIds,
} from "../src/data/company-type-hints";
import { findColumnByType } from "../src/data/sheet";
import { freshUserData } from "../src/storage/local";
import type {
  AccountBudget,
  HistoryEntry,
  Row,
  UserData,
} from "../src/data/types";

type RowSpec = { id?: string; description?: string; companyId?: string };

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
      }) as Row,
  );
  const patchedItem: AccountBudget = { ...item, rows };
  return {
    ...base,
    sheets: [{ ...sheet, items: [patchedItem] }],
    history: { acct: [...(opts.history ?? [])] },
  };
}

describe("computeDescriptionCompanyHints", () => {
  it("returns nothing when no description is paired with a company", () => {
    expect(computeDescriptionCompanyHints(makeData({})).size).toBe(0);
    expect(
      computeDescriptionCompanyHints(
        makeData({ rows: [{ description: "SPOTIFY" }] }),
      ).size,
    ).toBe(0);
  });

  it("collapses cosmetic statement noise to one normalised key", () => {
    const hints = computeDescriptionCompanyHints(
      makeData({
        rows: [
          { id: "a", description: "SPOTIFY", companyId: "co_spotify" },
          {
            id: "b",
            description: "KORTKÖP SPOTIFY 2026-05-01",
            companyId: "co_spotify",
          },
        ],
      }),
    );
    // Both rows map to the same key, so there is exactly one entry.
    expect(hints.size).toBe(1);
    expect([...hints.values()][0]).toEqual(["co_spotify"]);
  });

  it("ranks multiple companies for one merchant by descending usage", () => {
    const rows: RowSpec[] = [
      ...Array.from({ length: 2 }, (_, i) => ({
        id: `a${i}`,
        description: "ICA",
        companyId: "co_a",
      })),
      ...Array.from({ length: 5 }, (_, i) => ({
        id: `b${i}`,
        description: "ICA",
        companyId: "co_b",
      })),
    ];
    expect(
      descriptionCompanyHintsFor(
        computeDescriptionCompanyHints(makeData({ rows })),
        "ICA",
      ),
    ).toEqual(["co_b", "co_a"]);
  });

  it("counts history-entry overrides and splits", () => {
    const history = [
      entry({ description: "NETFLIX", userCompanyId: "co_netflix" }),
      entry({
        description: "AMZN MKTP",
        userCompanyId: "co_outer",
        splits: [{ description: "", amount: -10, companyId: "co_split" }],
      }),
    ];
    const hints = computeDescriptionCompanyHints(makeData({ history }));
    expect(descriptionCompanyHintsFor(hints, "NETFLIX")).toEqual([
      "co_netflix",
    ]);
    // Splits drive presentation, so the parent's override is skipped.
    expect(descriptionCompanyHintsFor(hints, "AMZN MKTP")).toEqual([
      "co_split",
    ]);
  });

  it("skips keys too short to identify a merchant", () => {
    expect(
      computeDescriptionCompanyHints(
        makeData({ rows: [{ description: "AT", companyId: "co_a" }] }),
      ).size,
    ).toBe(0);
  });

  it("caps the ranked list at the maximum", () => {
    const rows: RowSpec[] = [
      "co_a",
      "co_b",
      "co_c",
      "co_d",
      "co_e",
      "co_f",
      "co_g",
    ].map((companyId, i) => ({
      id: `r${i}`,
      description: "MERCHANT",
      companyId,
    }));
    expect(
      descriptionCompanyHintsFor(
        computeDescriptionCompanyHints(makeData({ rows }), 5),
        "MERCHANT",
      ),
    ).toHaveLength(5);
  });
});

describe("descriptionCompanyHintsFor", () => {
  const hints = new Map<string, readonly string[]>([["spotify", ["co_s"]]]);

  it("resolves a raw description via its normalised key", () => {
    expect(descriptionCompanyHintsFor(hints, "SPOTIFY 2026-05-01")).toEqual([
      "co_s",
    ]);
  });

  it("returns empty for a blank, missing, or too-short description", () => {
    expect(descriptionCompanyHintsFor(hints, "")).toEqual([]);
    expect(descriptionCompanyHintsFor(hints, null)).toEqual([]);
    expect(descriptionCompanyHintsFor(hints, undefined)).toEqual([]);
    expect(descriptionCompanyHintsFor(hints, "ab")).toEqual([]);
  });

  it("returns empty when the merchant has no learned company", () => {
    expect(descriptionCompanyHintsFor(hints, "ICA")).toEqual([]);
  });
});

describe("mergeCompanyHintIds", () => {
  it("leads with description hits, then fills with type hits, de-duped", () => {
    expect(
      mergeCompanyHintIds(["co_desc", "co_shared"], ["co_shared", "co_type"]),
    ).toEqual(["co_desc", "co_shared", "co_type"]);
  });

  it("falls back to a single source when the other is empty", () => {
    expect(mergeCompanyHintIds([], ["co_type"])).toEqual(["co_type"]);
    expect(mergeCompanyHintIds(["co_desc"], [])).toEqual(["co_desc"]);
  });

  it("caps the merged band at the maximum", () => {
    const desc = ["a", "b", "c"];
    const type = ["d", "e", "f"];
    expect(mergeCompanyHintIds(desc, type, 4)).toEqual(["a", "b", "c", "d"]);
  });
});
