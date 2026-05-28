import { describe, expect, it } from "vitest";

import {
  amountsWithinTolerance,
  daysBetween,
  expandToSeries,
  findCandidates,
  findOrphans,
  findRuleDrivenCandidates,
  inferSeriesRule,
  nextFiscalMonthStartDate,
  nextMonthSameDate,
  RECONCILIATION_AMOUNT_FLOOR_CENTS,
  RECONCILIATION_AMOUNT_PCT,
  RECONCILIATION_DATE_LAG_DAYS,
  seriesHasOccurrenceInNextMonth,
} from "../src/data/reconciliation";
import type {
  Column,
  HistoryEntry,
  Row,
  SeriesMatchRule,
} from "../src/data/types";

const dateCol: Column = { id: "d", type: "date", label: "Date" };
const descCol: Column = { id: "x", type: "description", label: "Desc" };
const amtCol: Column = { id: "a", type: "amount", label: "Amount" };
const columns: Column[] = [dateCol, descCol, amtCol];

function row(over: Partial<Row> & { date?: string; amount?: number }): Row {
  return {
    kind: "user",
    id: over.id ?? "r1",
    cells: {
      [dateCol.id]: over.date ?? "2026-03-27",
      [descCol.id]: "",
      [amtCol.id]: over.amount ?? -5252,
    },
    ...(over.seriesId ? { seriesId: over.seriesId } : {}),
    ...(over.typeId ? { typeId: over.typeId } : {}),
  };
}

function entry(over: Partial<HistoryEntry>): HistoryEntry {
  return {
    id: over.id ?? "e1",
    date: over.date ?? "2026-03-30",
    description: over.description ?? "SIMPLEKO",
    amount: over.amount ?? -5252,
    balance: over.balance,
    importedAt: over.importedAt ?? 1,
    ...over,
  };
}

describe("amountsWithinTolerance", () => {
  it("flat floor (2 SEK) covers small rounding", () => {
    expect(amountsWithinTolerance(45, 47)).toBe(true);
    expect(amountsWithinTolerance(45, 48)).toBe(false);
  });

  it("1% covers large transactions", () => {
    expect(amountsWithinTolerance(10_000, 10_050)).toBe(true);
    expect(amountsWithinTolerance(10_000, 10_150)).toBe(false);
  });

  it("handles negative amounts symmetrically", () => {
    expect(amountsWithinTolerance(-5252, -5253)).toBe(true);
    expect(amountsWithinTolerance(-5252, -5254)).toBe(true);
    // 1% of 5500 is 55, so a 248-kr delta is out of band.
    expect(amountsWithinTolerance(-5252, -5500)).toBe(false);
  });

  it("guards floating-point noise", () => {
    expect(amountsWithinTolerance(0.1 + 0.2, 0.3)).toBe(true);
  });
});

describe("daysBetween", () => {
  it("counts inclusive days, positive when a is later", () => {
    expect(daysBetween("2026-03-30", "2026-03-27")).toBe(3);
    expect(daysBetween("2026-03-27", "2026-03-30")).toBe(-3);
  });

  it("crosses month boundaries", () => {
    expect(daysBetween("2026-04-02", "2026-03-30")).toBe(3);
  });

  it("returns NaN for bad input", () => {
    expect(Number.isNaN(daysBetween("bad", "2026-01-01"))).toBe(true);
  });
});

describe("findCandidates — boundaries", () => {
  it("matches at the +7 day boundary", () => {
    const r = row({ date: "2026-03-20" });
    const e = entry({ date: "2026-03-27", amount: -5252 });
    const matches = findCandidates([e], [r], columns);
    expect(matches).toHaveLength(1);
    expect(matches[0].dateLagDays).toBe(7);
  });

  it("rejects at +8 days", () => {
    const r = row({ date: "2026-03-20" });
    const e = entry({ date: "2026-03-28", amount: -5252 });
    expect(findCandidates([e], [r], columns)).toHaveLength(0);
  });

  it("rejects negative lag (history before prediction)", () => {
    const r = row({ date: "2026-03-30" });
    const e = entry({ date: "2026-03-27", amount: -5252 });
    expect(findCandidates([e], [r], columns)).toHaveLength(0);
  });

  it("rejects opposite signs", () => {
    const r = row({ date: "2026-03-27", amount: 5252 });
    const e = entry({ date: "2026-03-30", amount: -5252 });
    expect(findCandidates([e], [r], columns)).toHaveLength(0);
  });

  it("rejects amount outside tolerance", () => {
    const r = row({ date: "2026-03-27", amount: -5252 });
    const e = entry({ date: "2026-03-30", amount: -6000 });
    expect(findCandidates([e], [r], columns)).toHaveLength(0);
  });

  it("at +2 days with exact amount it's high confidence", () => {
    const r = row({ date: "2026-03-28", amount: -5252 });
    const e = entry({ date: "2026-03-30", amount: -5252 });
    const m = findCandidates([e], [r], columns);
    expect(m[0].confidence).toBe("high");
  });

  it("at +5 days or wider delta it's low confidence", () => {
    const r = row({ date: "2026-03-25", amount: -5252 });
    const e = entry({ date: "2026-03-30", amount: -5252 });
    const m = findCandidates([e], [r], columns);
    expect(m[0].confidence).toBe("low");
  });

  it("skips correction rows", () => {
    const r: Row = {
      ...row({ date: "2026-03-27" }),
      kind: "correction",
      isCorrection: true,
    };
    const e = entry({ date: "2026-03-30" });
    expect(findCandidates([e], [r], columns)).toHaveLength(0);
  });

  it("skips synthesized history rows", () => {
    const r: Row = {
      ...row({ date: "2026-03-27" }),
      kind: "historic",
      historyEntryId: "ext",
    };
    const e = entry({ date: "2026-03-30" });
    expect(findCandidates([e], [r], columns)).toHaveLength(0);
  });

  it("greedy assignment: a row never claims two entries", () => {
    const r = row({ id: "r1", date: "2026-03-27", amount: -5252 });
    const e1 = entry({ id: "e1", date: "2026-03-28", amount: -5252 });
    const e2 = entry({ id: "e2", date: "2026-03-30", amount: -5252 });
    const m = findCandidates([e1, e2], [r], columns);
    expect(m).toHaveLength(1);
    expect(m[0].historyEntryId).toBe("e1"); // closer date
  });

  it("series rows win ties over loose rows", () => {
    const seriesRow = row({
      id: "rs",
      date: "2026-03-27",
      seriesId: "rent",
    });
    const oneOff = row({ id: "ro", date: "2026-03-27" });
    const e = entry({ date: "2026-03-30" });
    const m = findCandidates([e], [oneOff, seriesRow], columns);
    expect(m).toHaveLength(1);
    expect(m[0].rowId).toBe("rs");
  });

  it("skips hidden + transfer-collapsed entries", () => {
    const r = row({ date: "2026-03-27" });
    const hidden = entry({ id: "h", hidden: true });
    const collapsed = entry({ id: "c", collapsedIntoTransferId: "t1" });
    expect(findCandidates([hidden, collapsed], [r], columns)).toHaveLength(0);
  });
});

describe("findOrphans", () => {
  it("flags rows in newly-covered months that didn't reconcile", () => {
    const r = row({ id: "r1", date: "2026-03-20" });
    const orphans = findOrphans([r], columns, new Set(["2026-03"]), new Set());
    expect(orphans).toEqual([{ rowId: "r1", monthKey: "2026-03" }]);
  });

  it("does not flag reconciled rows", () => {
    const r = row({ id: "r1", date: "2026-03-20" });
    const orphans = findOrphans(
      [r],
      columns,
      new Set(["2026-03"]),
      new Set(["r1"]),
    );
    expect(orphans).toHaveLength(0);
  });

  it("does not flag rows in months that were already covered", () => {
    const r = row({ id: "r1", date: "2026-02-20" });
    expect(
      findOrphans([r], columns, new Set(["2026-03"]), new Set()),
    ).toHaveLength(0);
  });

  it("skips correction / synthesized rows", () => {
    const corr: Row = {
      ...row({ id: "r1" }),
      kind: "correction",
      isCorrection: true,
    };
    const synth: Row = {
      ...row({ id: "r2" }),
      kind: "historic",
      historyEntryId: "x",
    };
    expect(
      findOrphans([corr, synth], columns, new Set(["2026-03"]), new Set()),
    ).toHaveLength(0);
  });

  it("works retrospectively against the full coverage set (budget CTA)", () => {
    // The budget-page footer CTA passes `coveredSet` directly as the
    // newlyCovered argument with an empty reconciledRowIds — the
    // helper should still flag any manual row inside a covered month.
    const manual = row({ id: "m1", date: "2026-04-10" });
    const reconciled: Row = {
      ...row({ id: "h1", date: "2026-04-12" }),
      kind: "historic",
      historyEntryId: "abc",
    };
    expect(
      findOrphans(
        [manual, reconciled],
        columns,
        new Set(["2026-04"]),
        new Set(),
      ),
    ).toEqual([{ rowId: "m1", monthKey: "2026-04" }]);
  });
});

describe("inferSeriesRule + expandToSeries", () => {
  it("returns null when the matched row has no seriesId", () => {
    const r = row({ id: "r" });
    const e = entry({});
    const match = findCandidates([e], [r], columns)[0];
    expect(inferSeriesRule(match, e, r, () => "rule")).toBeNull();
  });

  it("infers a wildcard-token pattern from the bank description", () => {
    const r = row({ id: "r", seriesId: "rent" });
    const e = entry({ description: "SIMPLEKO 0123456" });
    const match = findCandidates([e], [r], columns)[0];
    const rule = inferSeriesRule(match, e, r, () => "rule")!;
    expect(rule.seriesId).toBe("rent");
    expect(rule.pattern.toLowerCase()).toContain("simpleko");
    expect(rule.amountTolerancePct).toBeGreaterThanOrEqual(
      RECONCILIATION_AMOUNT_PCT,
    );
    expect(rule.dateLagDays).toBeLessThanOrEqual(RECONCILIATION_DATE_LAG_DAYS);
  });

  it("expandToSeries collects sibling occurrences", () => {
    const r1 = row({ id: "r1", date: "2026-02-27", seriesId: "rent" });
    const r2 = row({ id: "r2", date: "2026-03-27", seriesId: "rent" });
    const r3 = row({ id: "r3", date: "2026-04-27", seriesId: "rent" });
    const e1 = entry({
      id: "e1",
      date: "2026-02-28",
      description: "SIMPLEKO 1",
    });
    const e2 = entry({
      id: "e2",
      date: "2026-03-30",
      description: "SIMPLEKO 2",
    });
    const e3 = entry({
      id: "e3",
      date: "2026-04-28",
      description: "SIMPLEKO 3",
    });

    const rule: SeriesMatchRule = {
      id: "rule",
      seriesId: "rent",
      pattern: "*simpleko*",
      amountTolerancePct: RECONCILIATION_AMOUNT_PCT,
      dateLagDays: RECONCILIATION_DATE_LAG_DAYS,
    };
    const expansions = expandToSeries(
      rule,
      [e1, e2, e3],
      [r1, r2, r3],
      columns,
      // r2/e2 already matched
      new Set(["r2", "hist:e2"]),
    );
    expect(expansions.map((m) => m.rowId).sort()).toEqual(["r1", "r3"]);
  });
});

describe("findRuleDrivenCandidates", () => {
  it("matches when a stored series rule fires", () => {
    const r = row({ id: "r", date: "2026-04-27", seriesId: "rent" });
    const e = entry({ date: "2026-04-28", description: "SIMPLEKO 9" });
    const rule: SeriesMatchRule = {
      id: "rule",
      seriesId: "rent",
      pattern: "*simpleko*",
      amountTolerancePct: RECONCILIATION_AMOUNT_PCT,
      dateLagDays: RECONCILIATION_DATE_LAG_DAYS,
    };
    const m = findRuleDrivenCandidates([rule], [e], [r], columns);
    expect(m).toHaveLength(1);
    expect(m[0].rowId).toBe("r");
  });

  it("does not match a different series", () => {
    const r = row({ id: "r", date: "2026-04-27", seriesId: "other" });
    const e = entry({ date: "2026-04-28", description: "SIMPLEKO" });
    const rule: SeriesMatchRule = {
      id: "rule",
      seriesId: "rent",
      pattern: "*simpleko*",
      amountTolerancePct: RECONCILIATION_AMOUNT_PCT,
      dateLagDays: RECONCILIATION_DATE_LAG_DAYS,
    };
    expect(findRuleDrivenCandidates([rule], [e], [r], columns)).toHaveLength(0);
  });
});

describe("constants", () => {
  it("are sane", () => {
    expect(RECONCILIATION_DATE_LAG_DAYS).toBe(7);
    expect(RECONCILIATION_AMOUNT_PCT).toBe(0.01);
    expect(RECONCILIATION_AMOUNT_FLOOR_CENTS).toBe(200);
  });
});

describe("nextFiscalMonthStartDate", () => {
  it("returns the first day of the next fiscal month (startOfMonth=25)", () => {
    expect(nextFiscalMonthStartDate("2026-04", 25)).toBe("2026-05-25");
  });

  it("collapses to calendar months when startOfMonth=1", () => {
    expect(nextFiscalMonthStartDate("2026-04", 1)).toBe("2026-05-01");
  });

  it("rolls December → January of the next year", () => {
    expect(nextFiscalMonthStartDate("2026-12", 25)).toBe("2027-01-25");
  });

  it("zero-pads single-digit start days", () => {
    expect(nextFiscalMonthStartDate("2026-04", 5)).toBe("2026-05-05");
  });

  it("returns the input unchanged for malformed keys", () => {
    expect(nextFiscalMonthStartDate("bad", 25)).toBe("bad");
  });
});

describe("nextMonthSameDate", () => {
  it("shifts one calendar month forward, preserving the day", () => {
    expect(nextMonthSameDate("2026-04-10")).toBe("2026-05-10");
  });

  it("clamps Jan 31 → Feb 28 in a non-leap year", () => {
    expect(nextMonthSameDate("2026-01-31")).toBe("2026-02-28");
  });

  it("clamps Jan 31 → Feb 29 in a leap year", () => {
    expect(nextMonthSameDate("2028-01-31")).toBe("2028-02-29");
  });

  it("rolls December → January of the next year", () => {
    expect(nextMonthSameDate("2026-12-15")).toBe("2027-01-15");
  });

  it("returns the input unchanged for malformed dates", () => {
    expect(nextMonthSameDate("bad")).toBe("bad");
  });
});

describe("seriesHasOccurrenceInNextMonth", () => {
  it("returns true when a sibling row lands in the next fiscal month (startOfMonth=25)", () => {
    // monthKey 2026-04 with startOfMonth=25 spans Apr 25 → May 24.
    // r1 sits in fiscal April; r2's May 26 lands in fiscal May.
    const r1 = row({ id: "r1", date: "2026-05-10", seriesId: "rent" });
    const r2 = row({ id: "r2", date: "2026-05-26", seriesId: "rent" });
    expect(
      seriesHasOccurrenceInNextMonth([r1, r2], columns, "rent", "2026-04", 25),
    ).toBe(true);
  });

  it("returns false when no sibling lands in the next fiscal month", () => {
    // Both rows sit inside fiscal April (Apr 25 → May 24 under
    // startOfMonth=25), so the next-month check should be false.
    const r1 = row({ id: "r1", date: "2026-04-30", seriesId: "rent" });
    const r2 = row({ id: "r2", date: "2026-05-10", seriesId: "rent" });
    expect(
      seriesHasOccurrenceInNextMonth([r1, r2], columns, "rent", "2026-04", 25),
    ).toBe(false);
  });

  it("respects fiscal month boundaries — May 24 (startOfMonth=25) is still fiscal April", () => {
    const r1 = row({ id: "r1", date: "2026-05-01", seriesId: "rent" });
    const r2 = row({ id: "r2", date: "2026-05-24", seriesId: "rent" });
    expect(
      seriesHasOccurrenceInNextMonth([r1, r2], columns, "rent", "2026-04", 25),
    ).toBe(false);
  });

  it("ignores rows in other series", () => {
    const r1 = row({ id: "r1", date: "2026-05-01", seriesId: "rent" });
    const other = row({ id: "r2", date: "2026-05-26", seriesId: "utilities" });
    expect(
      seriesHasOccurrenceInNextMonth(
        [r1, other],
        columns,
        "rent",
        "2026-04",
        25,
      ),
    ).toBe(false);
  });

  it("rolls December → next-year January under calendar months", () => {
    const r1 = row({ id: "r1", date: "2026-12-15", seriesId: "rent" });
    const r2 = row({ id: "r2", date: "2027-01-15", seriesId: "rent" });
    expect(
      seriesHasOccurrenceInNextMonth([r1, r2], columns, "rent", "2026-12", 1),
    ).toBe(true);
  });
});
