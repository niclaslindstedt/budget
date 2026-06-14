import { describe, expect, it } from "vitest";

import {
  discoverMortgagePayments,
  monthsWithinBand,
  type MortgageDiscoveryInput,
} from "../src/data/property-mortgage/discovery";
import {
  resolveMonthlyPaymentAt,
  splitPaymentAcrossMortgages,
} from "../src/data/finance/payment";
import { PRESET_TYPE_MORTGAGE_ID } from "../src/data/presets/types";
import type {
  Company,
  HistoryEntry,
  Mortgage,
  Property,
} from "../src/data/types";

// Monthly ISO dates ("YYYY-MM-DD") on a fixed day from a start month.
function monthlyDates(
  startYear: number,
  startMonth: number,
  count: number,
  day = 28,
): string[] {
  const out: string[] = [];
  let y = startYear;
  let m = startMonth;
  for (let i = 0; i < count; i++) {
    out.push(
      `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    );
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

function entry(
  id: string,
  date: string,
  amount: number,
  description: string,
  extra: Partial<HistoryEntry> = {},
): HistoryEntry {
  return { id, date, description, amount, importedAt: 0, ...extra };
}

const COMPANY: Company = { id: "co-sbab", name: "SBAB" };

// A fictional split mortgage: an 8,000 amortisation draw and a 4,000
// interest draw every month for a year, plus an unrelated 149 subscription.
// `amortTags` / `rantaTags` decide which legs the user has tagged.
function splitMortgageHistory(
  opts: {
    amortType?: boolean;
    amortCompany?: boolean;
    rantaType?: boolean;
  } = {},
): HistoryEntry[] {
  const dates = monthlyDates(2023, 1, 12);
  const out: HistoryEntry[] = [];
  dates.forEach((d, i) => {
    out.push(
      entry(`amort-${i}`, d, -8_000, "HEMBANKEN AMORTERING", {
        ...(opts.amortType ? { userTypeId: PRESET_TYPE_MORTGAGE_ID } : {}),
        ...(opts.amortCompany ? { userCompanyId: COMPANY.id } : {}),
      }),
    );
    out.push(
      entry(`ranta-${i}`, d, -4_000, "HEMBANKEN RANTA", {
        ...(opts.rantaType ? { userTypeId: PRESET_TYPE_MORTGAGE_ID } : {}),
      }),
    );
    out.push(entry(`sub-${i}`, d, -149, "STREAMINGTJANST"));
  });
  return out;
}

function baseInput(
  entries: HistoryEntry[],
  over: Partial<MortgageDiscoveryInput> = {},
): MortgageDiscoveryInput {
  return {
    entries,
    merchantHints: {},
    matchRules: [],
    companies: [COMPANY],
    types: [],
    mortgageTypeId: PRESET_TYPE_MORTGAGE_ID,
    ...over,
  };
}

describe("discoverMortgagePayments", () => {
  it("reports seed 'none' and no series when nothing is tagged", () => {
    const { series, seed } = discoverMortgagePayments(
      baseInput(splitMortgageHistory()),
    );
    expect(seed).toBe("none");
    expect(series).toEqual([]);
  });

  it("anchors on the Mortgage type and expands across every month", () => {
    // Only one month of the amortisation leg is tagged; the rest is found
    // by its shared bank description.
    const entries = splitMortgageHistory();
    const tagged = entries.find((e) => e.id === "amort-0")!;
    tagged.userTypeId = PRESET_TYPE_MORTGAGE_ID;
    const { series, seed } = discoverMortgagePayments(baseInput(entries));
    expect(seed).toBe("tags");
    const amort = series.find((s) => s.suggestedAmount === 8_000);
    expect(amort).toBeDefined();
    expect(amort?.months).toHaveLength(12);
    expect(amort?.spanMonths).toBe(12);
    expect(amort?.anchor).toBe("tag");
    // The untagged subscription must NOT surface.
    expect(series.some((s) => s.suggestedAmount === 149)).toBe(false);
  });

  it("anchors on the tied company", () => {
    const { series, seed } = discoverMortgagePayments(
      baseInput(splitMortgageHistory({ amortCompany: true }), {
        companyIds: [COMPANY.id],
      }),
    );
    expect(seed).toBe("tags");
    expect(series.find((s) => s.suggestedAmount === 8_000)).toBeDefined();
    expect(series.find((s) => s.suggestedAmount === 4_000)).toBeUndefined();
  });

  it("surfaces both legs when each is tagged, largest first", () => {
    const { series } = discoverMortgagePayments(
      baseInput(splitMortgageHistory({ amortType: true, rantaType: true })),
    );
    expect(series.map((s) => s.suggestedAmount)).toEqual([8_000, 4_000]);
  });

  it("falls back to existing payments when nothing is tagged", () => {
    const entries = splitMortgageHistory();
    const { series, seed } = discoverMortgagePayments(
      baseInput(entries, { seedEntryIds: ["amort-3"] }),
    );
    expect(seed).toBe("payments");
    const amort = series.find((s) => s.suggestedAmount === 8_000);
    expect(amort?.anchor).toBe("payment");
    expect(amort?.months).toHaveLength(12);
  });

  it("ranks the series closest to an expected figure first", () => {
    // Both legs tagged; the larger amortisation draw would lead by amount,
    // but an expected interest figure of 4,000 promotes the interest draw.
    const { series } = discoverMortgagePayments(
      baseInput(splitMortgageHistory({ amortType: true, rantaType: true }), {
        targetAmounts: [4_000],
      }),
    );
    expect(series[0].suggestedAmount).toBe(4_000);
    expect(series[0].targetDelta).toBe(0);
  });

  it("drops a series whose charge is orders of magnitude off the expected payment", () => {
    // The real ~8,000 mortgage draw plus a tiny 20-kr fee that got tagged as
    // Mortgage by mistake — both anchored, but only the draw is plausible
    // against the loan's expected monthly figure.
    const dates = monthlyDates(2023, 1, 12);
    const entries: HistoryEntry[] = [];
    dates.forEach((d, i) => {
      entries.push(
        entry(`pay-${i}`, d, -8_000, "HEMBANKEN BOLAN", {
          userTypeId: PRESET_TYPE_MORTGAGE_ID,
        }),
      );
      entries.push(
        entry(`fee-${i}`, d, -20, "BANKAVGIFT", {
          userTypeId: PRESET_TYPE_MORTGAGE_ID,
        }),
      );
    });
    const { series } = discoverMortgagePayments(
      baseInput(entries, { targetAmounts: [8_000] }),
    );
    expect(series.map((s) => s.suggestedAmount)).toEqual([8_000]);
  });

  it("keeps every anchored series when the loan has no expected figure", () => {
    // Same mix, but with no loan terms to gate against, the finder offers
    // both groups (largest typical charge first) rather than silently hiding
    // one — the user still decides.
    const dates = monthlyDates(2023, 1, 12);
    const entries: HistoryEntry[] = [];
    dates.forEach((d, i) => {
      entries.push(
        entry(`pay-${i}`, d, -8_000, "HEMBANKEN BOLAN", {
          userTypeId: PRESET_TYPE_MORTGAGE_ID,
        }),
      );
      entries.push(
        entry(`fee-${i}`, d, -20, "BANKAVGIFT", {
          userTypeId: PRESET_TYPE_MORTGAGE_ID,
        }),
      );
    });
    const { series } = discoverMortgagePayments(baseInput(entries));
    expect(series.map((s) => s.suggestedAmount)).toEqual([8_000, 20]);
  });

  it("drops months that predate the purchase date and centres on the rest", () => {
    // Six months of a previous home's 5,000 loan, then six of this home's
    // 8,000 loan — same bank description either side of the move.
    const dates = monthlyDates(2023, 1, 12);
    const entries = dates.map((d, i) =>
      entry(`p-${i}`, d, i < 6 ? -5_000 : -8_000, "HEMBANKEN BOLAN", {
        userTypeId: PRESET_TYPE_MORTGAGE_ID,
      }),
    );
    const { series } = discoverMortgagePayments(
      baseInput(entries, { fromDate: "2023-07-01" }),
    );
    const s = series[0];
    expect(s.suggestedAmount).toBe(8_000);
    // The pre-purchase months are gone from the series entirely, not merely
    // down-weighted — span and month list reflect only the six owned months.
    expect(s.months).toHaveLength(6);
    expect(s.spanMonths).toBe(6);
    expect(s.months.every((m) => m.date >= "2023-07-01")).toBe(true);
    const kept = monthsWithinBand(s, s.suggestedAmount, 0.1);
    expect(kept).toHaveLength(6);
    expect(kept.every((m) => m.amount === 8_000)).toBe(true);
  });

  it("drops pre-purchase months even when the amount is unchanged", () => {
    // A previous home's loan charged at the SAME amount and description as the
    // current one, so the amount band can't tell them apart — only the
    // purchase date keeps the earlier months out.
    const dates = monthlyDates(2023, 1, 12);
    const entries = dates.map((d, i) =>
      entry(`p-${i}`, d, -8_000, "HEMBANKEN BOLAN", {
        userTypeId: PRESET_TYPE_MORTGAGE_ID,
      }),
    );
    const { series } = discoverMortgagePayments(
      baseInput(entries, { fromDate: "2023-07-01" }),
    );
    const s = series[0];
    expect(s.months).toHaveLength(6);
    expect(s.months[0].date).toBe("2023-07-28");
    expect(monthsWithinBand(s, s.suggestedAmount, 0.1)).toHaveLength(6);
  });

  it("drops a series whose charges all predate the purchase date", () => {
    // Every matching charge is from before the move — the previous home's
    // mortgage — so the series is the old home's and must not surface.
    const dates = monthlyDates(2023, 1, 12);
    const entries = dates.map((d, i) =>
      entry(`p-${i}`, d, -8_000, "HEMBANKEN BOLAN", {
        userTypeId: PRESET_TYPE_MORTGAGE_ID,
      }),
    );
    const { series } = discoverMortgagePayments(
      baseInput(entries, { fromDate: "2024-01-01" }),
    );
    expect(series).toEqual([]);
  });
});

// ── Ownership end: the sold-date cut-off ─────────────────────────────────────
//
// A property owned in the past stops being charged at its sale. Months after
// `toDate` are the *next* home's mortgage (often the same bank, sometimes the
// same description), so they are dropped exactly like pre-purchase months —
// and the expected window the promotion judges completeness against ends at
// the sale month, so a past property's clean-but-ended series can still be
// flagged highly probable.
describe("discoverMortgagePayments — sold-date cut-off", () => {
  it("drops months after the sold date and centres on the owned window", () => {
    // Six months of this (since sold) home's 8,000 loan, then six of the
    // next home's 5,000 loan under the same bank description.
    const dates = monthlyDates(2023, 1, 12);
    const entries = dates.map((d, i) =>
      entry(`p-${i}`, d, i < 6 ? -8_000 : -5_000, "HEMBANKEN BOLAN", {
        userTypeId: PRESET_TYPE_MORTGAGE_ID,
      }),
    );
    const { series } = discoverMortgagePayments(
      baseInput(entries, { toDate: "2023-06-30" }),
    );
    const s = series[0];
    expect(s.suggestedAmount).toBe(8_000);
    expect(s.months).toHaveLength(6);
    expect(s.months.every((m) => m.date <= "2023-06-30")).toBe(true);
  });

  it("drops a series whose charges all postdate the sale", () => {
    const dates = monthlyDates(2024, 1, 12);
    const entries = dates.map((d, i) =>
      entry(`p-${i}`, d, -8_000, "HEMBANKEN BOLAN", {
        userTypeId: PRESET_TYPE_MORTGAGE_ID,
      }),
    );
    const { series, diagnostics } = discoverMortgagePayments(
      baseInput(entries, { toDate: "2023-12-31" }),
    );
    expect(series).toEqual([]);
    expect(diagnostics.candidates[0].outcome).toBe("no-eligible-month");
  });

  it("judges completeness against the sale month, not the latest charge", () => {
    // The sold home's loan was charged Jan–Jun 2024 and stopped at the
    // sale; unrelated spending keeps the account current long after. The
    // series covers the loan's whole active window (purchase → sale), so
    // it is still promoted — without the sale-month clamp the expected
    // window would run to December and the promotion could never fire for
    // a past property.
    const entries = [
      ...monthlyDates(2024, 1, 6).map((d, i) =>
        entry(`loan-${i}`, d, -18_756, "HEMBANKEN BOLAN"),
      ),
      ...monthlyDates(2024, 7, 6).map((d, i) =>
        entry(`food-${i}`, d, -950, "MATBUTIKEN"),
      ),
    ];
    const { series } = discoverMortgagePayments(
      baseInput(entries, {
        fromDate: "2024-01-01",
        toDate: "2024-06-30",
        targetAmounts: [18_750],
        targetSchedules: [{ startDate: "2024-01-01", cadenceMonths: 1 }],
      }),
    );
    const loan = series.find((s) => s.suggestedAmount === 18_756);
    expect(loan).toBeDefined();
    expect(loan!.highlyProbable).toBe(true);
  });
});

// ── Amount fallback: clean payments (no company / type / existing payment) ──
//
// The "Find mortgage payments" walk leans on tags first, then on payments
// already recorded; with neither it falls back to the loan terms. When the
// mortgages resolve an expected monthly figure (amortisation + interest, per
// loan and combined), a recurring outflow whose typical amount lands near one
// of those figures is offered as a candidate — so a property whose imported
// payments carry no company or type still surfaces its mortgage charge from
// the maths alone. This battery exercises that path across loan sizes,
// property values, amortisation modes, and one / two / three mortgages paid
// as a single combined charge or as one draw per loan.

// A fixed reference date for resolving the expected figures, mirroring the
// modal's use of "today" — deterministic because no scenario records a rate
// history, so the headline rate applies on every date.
const REF_DATE = "2025-06-04";

function mort(id: string, over: Partial<Mortgage> = {}): Mortgage {
  return { id, name: id, payments: [], ...over };
}

function property(
  mortgages: Mortgage[],
  over: Partial<Property> = {},
): Property {
  return { id: "prop", name: "Home", valueHistory: [], mortgages, ...over };
}

// The bank charge a property is actually drawn for: the combined expected
// monthly payment across its mortgages, rounded to whole kronor the way a
// real statement reads. A per-mortgage variant for properties paid as one
// draw per loan.
function combinedCharge(mortgages: readonly Mortgage[]): number {
  return Math.round(
    mortgages.reduce((s, m) => s + resolveMonthlyPaymentAt(m, REF_DATE), 0),
  );
}
function eachCharge(mortgages: readonly Mortgage[]): number[] {
  return mortgages.map((m) => Math.round(resolveMonthlyPaymentAt(m, REF_DATE)));
}

// Twelve months of one clean recurring outflow — no company, no type, no
// existing payment — exactly the "all clean" history the finder must still
// crack from the loan terms.
function cleanCharges(
  prefix: string,
  description: string,
  amount: number,
  count = 12,
  startYear = 2024,
  startMonth = 1,
): HistoryEntry[] {
  return monthlyDates(startYear, startMonth, count).map((d, i) =>
    entry(`${prefix}-${i}`, d, -amount, description),
  );
}

// Run the finder for a property the way the modal does: expected figures
// (combined + per-loan) from the loan terms, the purchase date as the hard
// cut-off, the lender (if any) as a company anchor. Clean histories carry no
// tags, so the amount fallback is what surfaces the series.
function runFinder(
  prop: Property,
  entries: HistoryEntry[],
  over: Partial<MortgageDiscoveryInput> = {},
) {
  const each = prop.mortgages.map((m) => resolveMonthlyPaymentAt(m, REF_DATE));
  const combined = each.reduce((s, v) => s + v, 0);
  return discoverMortgagePayments(
    baseInput(entries, {
      companyIds: prop.companyId ? [prop.companyId] : [],
      fromDate: prop.purchaseDate,
      targetAmounts: [combined, ...each],
      ...over,
    }),
  );
}

describe("discoverMortgagePayments — amount fallback on clean payments", () => {
  it("finds a small fixed-amortisation loan paid as one combined charge", () => {
    // 200k loan, 1,000/mo amortisation, 3% on the balance ⇒ 500 interest ⇒
    // a 1,500 combined charge.
    const m = mort("m1", {
      loanAmount: 200_000,
      currentBalance: 200_000,
      interestRate: 3,
      amortization: { mode: "fixed", amount: 1_000 },
    });
    const prop = property([m], { purchaseAmount: 350_000 });
    const charge = combinedCharge([m]);
    expect(charge).toBe(1_500);
    const { series, seed } = runFinder(
      prop,
      cleanCharges("loan", "HEMBANKEN BOLAN", charge),
    );
    expect(seed).toBe("amount");
    expect(series).toHaveLength(1);
    expect(series[0].suggestedAmount).toBe(1_500);
    expect(series[0].anchor).toBe("amount");
    expect(series[0].months).toHaveLength(12);
  });

  it("finds a percent-of-initial amortisation loan", () => {
    // 500k loan, 2% annual amortisation of the initial ⇒ 833.33/mo, 2.5% on
    // the balance ⇒ 1,041.67 interest ⇒ 1,875 combined.
    const m = mort("m1", {
      loanAmount: 500_000,
      currentBalance: 500_000,
      interestRate: 2.5,
      amortization: { mode: "percent", percent: 2 },
    });
    const prop = property([m], { purchaseAmount: 900_000 });
    const charge = combinedCharge([m]);
    expect(charge).toBe(1_875);
    const { series, seed } = runFinder(
      prop,
      cleanCharges("loan", "BANK AMORTERING", charge),
    );
    expect(seed).toBe("amount");
    expect(series[0].suggestedAmount).toBe(1_875);
  });

  it("finds a medium fixed loan with a large interest leg", () => {
    // 1.2M loan, 3,000/mo amortisation, 4% ⇒ 4,000 interest ⇒ 7,000.
    const m = mort("m1", {
      loanAmount: 1_200_000,
      currentBalance: 1_200_000,
      interestRate: 4,
      amortization: { mode: "fixed", amount: 3_000 },
    });
    const prop = property([m], { purchaseAmount: 2_400_000 });
    const charge = combinedCharge([m]);
    expect(charge).toBe(7_000);
    const { series } = runFinder(
      prop,
      cleanCharges("loan", "BOLAN DRAG", charge),
    );
    expect(series[0].suggestedAmount).toBe(7_000);
  });

  it("finds an interest-only loan (no amortisation recorded)", () => {
    // 800k loan, no amortisation set, 3.5% ⇒ 2,333.33 ⇒ rounds to 2,333.
    const m = mort("m1", {
      loanAmount: 800_000,
      currentBalance: 800_000,
      interestRate: 3.5,
    });
    const prop = property([m], { purchaseAmount: 1_500_000 });
    const charge = combinedCharge([m]);
    expect(charge).toBe(2_333);
    const { series } = runFinder(
      prop,
      cleanCharges("loan", "RANTA BOLAN", charge),
    );
    expect(series[0].suggestedAmount).toBe(2_333);
    expect(series[0].months).toHaveLength(12);
  });

  it("finds a large loan paid as one combined charge", () => {
    // 4M loan, 8,000/mo amortisation, 2% ⇒ 6,666.67 interest ⇒ 14,667.
    const m = mort("m1", {
      loanAmount: 4_000_000,
      currentBalance: 4_000_000,
      interestRate: 2,
      amortization: { mode: "fixed", amount: 8_000 },
    });
    const prop = property([m], { purchaseAmount: 6_000_000 });
    const charge = combinedCharge([m]);
    expect(charge).toBe(14_667);
    const { series } = runFinder(
      prop,
      cleanCharges("loan", "STORBANKEN BOLAN", charge),
    );
    expect(series[0].suggestedAmount).toBe(14_667);
  });

  it("surfaces only the mortgage charge, not an unrelated subscription", () => {
    const m = mort("m1", {
      loanAmount: 1_200_000,
      currentBalance: 1_200_000,
      interestRate: 4,
      amortization: { mode: "fixed", amount: 3_000 },
    });
    const prop = property([m], { purchaseAmount: 2_400_000 });
    const charge = combinedCharge([m]); // 7,000
    const entries = [
      ...cleanCharges("loan", "BOLAN DRAG", charge),
      ...cleanCharges("sub", "STREAMINGTJANST", 149),
    ];
    const { series } = runFinder(prop, entries);
    expect(series).toHaveLength(1);
    expect(series[0].suggestedAmount).toBe(7_000);
  });

  it("tolerates a charge that drifts within the anchor band", () => {
    // The expected combined is ~7,000 but the historical charge sits at 7,700
    // (10% high, within the ±20% anchor band) — still surfaced.
    const m = mort("m1", {
      loanAmount: 1_200_000,
      currentBalance: 1_200_000,
      interestRate: 4,
      amortization: { mode: "fixed", amount: 3_000 },
    });
    const prop = property([m], { purchaseAmount: 2_400_000 });
    const { series, seed } = runFinder(
      prop,
      cleanCharges("loan", "BOLAN DRAG", 7_700),
    );
    expect(seed).toBe("amount");
    expect(series[0].suggestedAmount).toBe(7_700);
  });

  it("drops a charge that lands outside the anchor band", () => {
    // Expected ~1,500, but the only recurring outflow is 4,000 — 62% off,
    // outside the ±20% anchor band — so the finder offers nothing.
    const m = mort("m1", {
      loanAmount: 200_000,
      currentBalance: 200_000,
      interestRate: 3,
      amortization: { mode: "fixed", amount: 1_000 },
    });
    const prop = property([m], { purchaseAmount: 350_000 });
    const { series, seed } = runFinder(
      prop,
      cleanCharges("rent", "HYRA", 4_000),
    );
    expect(seed).toBe("amount");
    expect(series).toEqual([]);
  });

  it("drops a charge far below the expected figure", () => {
    // Expected ~7,000; a lone 200 fee is nowhere near it.
    const m = mort("m1", {
      loanAmount: 1_200_000,
      currentBalance: 1_200_000,
      interestRate: 4,
      amortization: { mode: "fixed", amount: 3_000 },
    });
    const prop = property([m], { purchaseAmount: 2_400_000 });
    const { series } = runFinder(prop, cleanCharges("fee", "AVGIFT", 200));
    expect(series).toEqual([]);
  });

  it("reports seed 'none' when the loan has no terms to anchor on", () => {
    // A mortgage with no balance and no rate resolves no expected figure, so
    // there is nothing to anchor a clean history against.
    const m = mort("m1");
    const prop = property([m], { purchaseAmount: 2_400_000 });
    const { series, seed } = runFinder(
      prop,
      cleanCharges("loan", "BOLAN DRAG", 7_000),
    );
    expect(seed).toBe("none");
    expect(series).toEqual([]);
  });

  it("finds the combined charge of a two-mortgage property", () => {
    // First loan 2M @2% + 4,000 amort ⇒ 7,333.33; second 500k @3% + 2,000
    // amort ⇒ 3,250; combined ⇒ 10,583, paid as one draw.
    const m1 = mort("m1", {
      loanAmount: 2_000_000,
      currentBalance: 2_000_000,
      interestRate: 2,
      amortization: { mode: "fixed", amount: 4_000 },
    });
    const m2 = mort("m2", {
      loanAmount: 500_000,
      currentBalance: 500_000,
      interestRate: 3,
      amortization: { mode: "fixed", amount: 2_000 },
    });
    const prop = property([m1, m2], { purchaseAmount: 3_500_000 });
    const charge = combinedCharge([m1, m2]);
    expect(charge).toBe(10_583);
    const { series, seed } = runFinder(
      prop,
      cleanCharges("loan", "TVABANKEN BOLAN", charge),
    );
    expect(seed).toBe("amount");
    expect(series[0].suggestedAmount).toBe(10_583);
    // The combined charge splits across the two loans by their expected share.
    const split = splitPaymentAcrossMortgages([m1, m2], charge, "2024-06-28");
    expect([...split.values()].reduce((s, v) => s + v, 0)).toBe(10_583);
    expect(split.size).toBe(2);
  });

  it("finds two separate per-loan draws of a two-mortgage property", () => {
    // The same two loans, but paid as one draw each — both surface, since the
    // per-loan expected figures anchor them.
    const m1 = mort("m1", {
      loanAmount: 2_000_000,
      currentBalance: 2_000_000,
      interestRate: 2,
      amortization: { mode: "fixed", amount: 4_000 },
    });
    const m2 = mort("m2", {
      loanAmount: 500_000,
      currentBalance: 500_000,
      interestRate: 3,
      amortization: { mode: "fixed", amount: 2_000 },
    });
    const prop = property([m1, m2], { purchaseAmount: 3_500_000 });
    const [c1, c2] = eachCharge([m1, m2]); // 7,333 and 3,250
    const entries = [
      ...cleanCharges("a", "BOLAN ETT", c1),
      ...cleanCharges("b", "BOLAN TVA", c2),
    ];
    const { series } = runFinder(prop, entries);
    expect(series.map((s) => s.suggestedAmount).sort((a, b) => a - b)).toEqual([
      3_250, 7_333,
    ]);
  });

  it("finds a two-mortgage property mixing fixed and percent amortisation", () => {
    // Fixed amort on one, percent-of-initial on the other.
    const m1 = mort("m1", {
      loanAmount: 1_500_000,
      currentBalance: 1_500_000,
      interestRate: 2,
      amortization: { mode: "fixed", amount: 5_000 },
    });
    const m2 = mort("m2", {
      loanAmount: 600_000,
      currentBalance: 600_000,
      interestRate: 3,
      amortization: { mode: "percent", percent: 2 },
    });
    const prop = property([m1, m2], { purchaseAmount: 2_800_000 });
    const charge = combinedCharge([m1, m2]);
    const { series, seed } = runFinder(
      prop,
      cleanCharges("loan", "BLANDBANKEN BOLAN", charge),
    );
    expect(seed).toBe("amount");
    expect(series[0].suggestedAmount).toBe(charge);
  });

  it("finds a two-mortgage property with very different rates", () => {
    const m1 = mort("m1", {
      loanAmount: 3_000_000,
      currentBalance: 3_000_000,
      interestRate: 1.5,
      amortization: { mode: "fixed", amount: 6_000 },
    });
    const m2 = mort("m2", {
      loanAmount: 300_000,
      currentBalance: 300_000,
      interestRate: 5.5,
      amortization: { mode: "fixed", amount: 1_500 },
    });
    const prop = property([m1, m2], { purchaseAmount: 4_000_000 });
    const charge = combinedCharge([m1, m2]);
    const { series } = runFinder(
      prop,
      cleanCharges("loan", "RANTEBANKEN BOLAN", charge),
    );
    expect(series[0].suggestedAmount).toBe(charge);
  });

  it("surfaces only the combined draw amid noise for two mortgages", () => {
    const m1 = mort("m1", {
      loanAmount: 2_000_000,
      currentBalance: 2_000_000,
      interestRate: 2,
      amortization: { mode: "fixed", amount: 4_000 },
    });
    const m2 = mort("m2", {
      loanAmount: 500_000,
      currentBalance: 500_000,
      interestRate: 3,
      amortization: { mode: "fixed", amount: 2_000 },
    });
    const prop = property([m1, m2], { purchaseAmount: 3_500_000 });
    const charge = combinedCharge([m1, m2]);
    // Noise kept clear of every expected figure (combined 10,583 and the
    // per-loan 7,333 / 3,250) so only the mortgage draw lands in band.
    const entries = [
      ...cleanCharges("loan", "TVABANKEN BOLAN", charge),
      ...cleanCharges("food", "MATBUTIK", 1_250),
      ...cleanCharges("gym", "TRANINGSKORT", 399),
    ];
    const { series } = runFinder(prop, entries);
    expect(series).toHaveLength(1);
    expect(series[0].suggestedAmount).toBe(charge);
  });

  it("finds the combined charge of a three-mortgage property", () => {
    // 3M @1.8% + 5,000 ⇒ 9,500; 1M @2.2% + 2% percent ⇒ 3,500; 400k @3% +
    // 1,500 ⇒ 2,500; combined ⇒ 15,500.
    const m1 = mort("m1", {
      loanAmount: 3_000_000,
      currentBalance: 3_000_000,
      interestRate: 1.8,
      amortization: { mode: "fixed", amount: 5_000 },
    });
    const m2 = mort("m2", {
      loanAmount: 1_000_000,
      currentBalance: 1_000_000,
      interestRate: 2.2,
      amortization: { mode: "percent", percent: 2 },
    });
    const m3 = mort("m3", {
      loanAmount: 400_000,
      currentBalance: 400_000,
      interestRate: 3,
      amortization: { mode: "fixed", amount: 1_500 },
    });
    const prop = property([m1, m2, m3], { purchaseAmount: 5_200_000 });
    const charge = combinedCharge([m1, m2, m3]);
    expect(charge).toBe(15_500);
    const { series, seed } = runFinder(
      prop,
      cleanCharges("loan", "TREBANKEN BOLAN", charge),
    );
    expect(seed).toBe("amount");
    expect(series[0].suggestedAmount).toBe(15_500);
    const split = splitPaymentAcrossMortgages(
      [m1, m2, m3],
      charge,
      "2024-06-28",
    );
    expect(split.size).toBe(3);
    expect([...split.values()].reduce((s, v) => s + v, 0)).toBe(15_500);
  });

  it("finds three separate per-loan draws of a three-mortgage property", () => {
    const m1 = mort("m1", {
      loanAmount: 3_000_000,
      currentBalance: 3_000_000,
      interestRate: 1.8,
      amortization: { mode: "fixed", amount: 5_000 },
    });
    const m2 = mort("m2", {
      loanAmount: 1_000_000,
      currentBalance: 1_000_000,
      interestRate: 2.2,
      amortization: { mode: "percent", percent: 2 },
    });
    const m3 = mort("m3", {
      loanAmount: 400_000,
      currentBalance: 400_000,
      interestRate: 3,
      amortization: { mode: "fixed", amount: 1_500 },
    });
    const prop = property([m1, m2, m3], { purchaseAmount: 5_200_000 });
    const [c1, c2, c3] = eachCharge([m1, m2, m3]); // 9,500 / 3,500 / 2,500
    const entries = [
      ...cleanCharges("a", "BOLAN A", c1),
      ...cleanCharges("b", "BOLAN B", c2),
      ...cleanCharges("c", "BOLAN C", c3),
    ];
    const { series } = runFinder(prop, entries);
    expect(series.map((s) => s.suggestedAmount).sort((a, b) => a - b)).toEqual([
      2_500, 3_500, 9_500,
    ]);
  });

  it("finds a three-mortgage property with all-percent amortisation", () => {
    const m1 = mort("m1", {
      loanAmount: 2_000_000,
      currentBalance: 2_000_000,
      interestRate: 2,
      amortization: { mode: "percent", percent: 3 },
    });
    const m2 = mort("m2", {
      loanAmount: 1_000_000,
      currentBalance: 1_000_000,
      interestRate: 2.5,
      amortization: { mode: "percent", percent: 2 },
    });
    const m3 = mort("m3", {
      loanAmount: 600_000,
      currentBalance: 600_000,
      interestRate: 3,
      amortization: { mode: "percent", percent: 1 },
    });
    const prop = property([m1, m2, m3], { purchaseAmount: 4_500_000 });
    const charge = combinedCharge([m1, m2, m3]);
    const { series, seed } = runFinder(
      prop,
      cleanCharges("loan", "PROCENTBANKEN BOLAN", charge),
    );
    expect(seed).toBe("amount");
    expect(series[0].suggestedAmount).toBe(charge);
  });

  it("drops pre-purchase months for a three-mortgage combined charge", () => {
    // The same combined charge runs for twelve months, but the home was only
    // bought half-way through — the earlier months (a previous home's loan at
    // the same description and size) are dropped outright.
    const m1 = mort("m1", {
      loanAmount: 3_000_000,
      currentBalance: 3_000_000,
      interestRate: 1.8,
      amortization: { mode: "fixed", amount: 5_000 },
    });
    const m2 = mort("m2", {
      loanAmount: 1_000_000,
      currentBalance: 1_000_000,
      interestRate: 2.2,
      amortization: { mode: "percent", percent: 2 },
    });
    const m3 = mort("m3", {
      loanAmount: 400_000,
      currentBalance: 400_000,
      interestRate: 3,
      amortization: { mode: "fixed", amount: 1_500 },
    });
    const prop = property([m1, m2, m3], {
      purchaseAmount: 5_200_000,
      purchaseDate: "2024-07-01",
    });
    const charge = combinedCharge([m1, m2, m3]);
    const { series } = runFinder(
      prop,
      cleanCharges("loan", "TREBANKEN BOLAN", charge),
    );
    expect(series[0].suggestedAmount).toBe(charge);
    expect(series[0].months).toHaveLength(6);
    expect(series[0].spanMonths).toBe(6);
    expect(series[0].months.every((m) => m.date >= "2024-07-01")).toBe(true);
  });

  it("ranks the charge closest to the expected figure first", () => {
    // Two recurring outflows both inside the ±20% band of a ~7,000 expected
    // combined: the on-the-nose 7,000 draw and a 6,100 one. Both surface, the
    // closer one leads.
    const m = mort("m1", {
      loanAmount: 1_200_000,
      currentBalance: 1_200_000,
      interestRate: 4,
      amortization: { mode: "fixed", amount: 3_000 },
    });
    const prop = property([m], { purchaseAmount: 2_400_000 });
    const charge = combinedCharge([m]); // 7,000
    const entries = [
      ...cleanCharges("loan", "BOLAN DRAG", charge),
      ...cleanCharges("near", "ANNAN DRAG", 6_100),
    ];
    const { series } = runFinder(prop, entries);
    expect(series.map((s) => s.suggestedAmount)).toEqual([7_000, 6_100]);
    expect(series[0].targetDelta).toBeLessThan(series[1].targetDelta!);
  });
});

// ── Reference-number descriptions ──────────────────────────────────────────
//
// A Swedish mortgage auto-giro charge is labelled "Avibetalning <ref>". The
// reference number is STATIC PER PROPERTY — the same on every payment for a
// given property — so the description is byte-identical month to month, and the
// finder groups on it verbatim: all the months coalesce into one series. The
// reference is also what separates properties (see the cross-property battery
// below): a different property's charge carries a different reference and forms
// its own group, so it can't be offered for the wrong property. A charge that
// is nothing but a reference number (no leading word) normalises to empty and
// is salvaged by its amount instead.

// Twelve months of an auto-giro charge with a STATIC reference number (the same
// every month, as a real recurring autogiro is), optionally with a leading word
// and a caller-chosen reference / id prefix. Mirrors the reported "Avibetalning
// 9120-3273663" statement text.
function aviCharges(
  amount: number,
  opts: {
    word?: string;
    ref?: string;
    idPrefix?: string;
    count?: number;
    startYear?: number;
    startMonth?: number;
  } = {},
): HistoryEntry[] {
  const {
    word = "Avibetalning",
    ref = "9120-3273663",
    idPrefix = "avi",
    count = 12,
    startYear = 2025,
    startMonth = 9,
  } = opts;
  const description = word ? `${word} ${ref}` : ref;
  return monthlyDates(startYear, startMonth, count).map((d, i) =>
    entry(`${idPrefix}-${i}`, d, -amount, description),
  );
}

// The property from the screenshot: two Skandiabanken loans (one interest-only
// at 1.63 %, one amortising 10 755/mo at 2.85 %) whose combined monthly
// payment is ~19 600, bought 2025-09-01.
function screenshotProperty(): Property {
  const m1 = mort("m1", {
    loanAmount: 6_144_208,
    currentBalance: 6_144_208,
    interestRate: 1.63,
    amortization: { mode: "fixed", amount: 0 },
  });
  const m2 = mort("m2", {
    loanAmount: 308_792,
    currentBalance: 211_977,
    interestRate: 2.85,
    amortization: { mode: "fixed", amount: 10_755 },
  });
  return property([m1, m2], {
    purchaseAmount: 7_700_000,
    purchaseDate: "2025-09-01",
    valueHistory: [{ id: "v", date: "2026-01-01", value: 8_120_000 }],
  });
}

describe("discoverMortgagePayments — reference-number descriptions", () => {
  it("coalesces a monthly auto-giro charge with a static reference into one series", () => {
    const prop = screenshotProperty();
    const { series, seed } = runFinder(prop, aviCharges(19_636));
    expect(seed).toBe("amount");
    expect(series).toHaveLength(1);
    expect(series[0].suggestedAmount).toBe(19_636);
    // All twelve months in one group — the description is identical every month.
    expect(series[0].months).toHaveLength(12);
    expect(series[0].spanMonths).toBe(12);
    expect(series[0].label).toContain("Avibetalning");
  });

  it("groups a static per-property reference into one series", () => {
    const prop = screenshotProperty();
    const { diagnostics } = runFinder(prop, aviCharges(19_636));
    expect(diagnostics.outflowEntries).toBe(12);
    // The exact description is identical every month, so the twelve months form
    // a SINGLE group, not twelve.
    expect(diagnostics.groupCount).toBe(1);
    expect(diagnostics.candidates).toHaveLength(1);
    expect(diagnostics.candidates[0].monthCount).toBe(12);
    expect(diagnostics.candidates[0].eligibleMonthCount).toBe(12);
    expect(diagnostics.candidates[0].outcome).toBe("kept");
    expect(diagnostics.candidates[0].synthetic).toBe(false);
  });

  it("salvages a charge whose description is nothing but a reference number", () => {
    // No leading word at all — the description normalises to empty, so there
    // is no text to group by; the amount fallback groups it by the expected
    // figure instead.
    const prop = screenshotProperty();
    const { series, diagnostics } = runFinder(
      prop,
      aviCharges(19_636, { word: "" }),
    );
    expect(series).toHaveLength(1);
    expect(series[0].months).toHaveLength(12);
    expect(diagnostics.skippedMeaningless).toBe(12);
    expect(diagnostics.salvagedByAmount).toBe(12);
    expect(diagnostics.candidates[0].synthetic).toBe(true);
    expect(diagnostics.candidates[0].outcome).toBe("kept");
  });

  it("reports a meaningless charge far from the expected figure in the funnel", () => {
    // A bare-reference charge of a wholly unrelated size can't be salvaged —
    // no expected figure is near it — so it's dropped before grouping and the
    // funnel records why.
    const prop = screenshotProperty();
    const { series, diagnostics } = runFinder(
      prop,
      aviCharges(450, { word: "" }),
    );
    expect(series).toEqual([]);
    expect(diagnostics.skippedMeaningless).toBe(12);
    expect(diagnostics.salvagedByAmount).toBe(0);
    expect(diagnostics.groupCount).toBe(0);
  });

  it("still keeps genuinely distinct descriptions in separate groups", () => {
    // Two recurring charges with different stable text near two different
    // expected figures stay in separate groups.
    const m1 = mort("m1", {
      loanAmount: 2_000_000,
      currentBalance: 2_000_000,
      interestRate: 2,
      amortization: { mode: "fixed", amount: 4_000 },
    });
    const m2 = mort("m2", {
      loanAmount: 500_000,
      currentBalance: 500_000,
      interestRate: 3,
      amortization: { mode: "fixed", amount: 2_000 },
    });
    const prop = property([m1, m2], {
      purchaseAmount: 3_500_000,
      purchaseDate: "2025-01-01",
    });
    const [c1, c2] = eachCharge([m1, m2]); // 7,333 and 3,250
    const entries = [
      ...aviCharges(c1, {
        word: "Bolan amortering",
        idPrefix: "a",
        startMonth: 1,
      }),
      ...aviCharges(c2, { word: "Bolan ranta", idPrefix: "b", startMonth: 1 }),
    ];
    const { series } = runFinder(prop, entries);
    expect(series.map((s) => s.suggestedAmount).sort((a, b) => a - b)).toEqual([
      3_250, 7_333,
    ]);
  });
});

// ── Cross-property safety: distinct references stay apart ───────────────────
//
// Several properties' mortgages can be paid from the same account, all labelled
// "Avibetalning <ref>" — same prefix, but each property's reference is static
// and DIFFERENT. Their payments can also be close in size, so the amount band
// alone can't tell them apart. Matching the exact description keeps each
// property's charge in its own group, so running the walk for one property
// never sweeps in (and offers to record) another property's payments.
describe("discoverMortgagePayments — distinct references stay apart", () => {
  it("does not merge two properties' similar avibetalning charges", () => {
    // Property A and B are both charged ~19,600 under "Avibetalning", but each
    // carries its own static reference. They must form TWO groups, not one.
    const prop = screenshotProperty();
    const entries = [
      ...aviCharges(19_636, { ref: "9120-3273663", idPrefix: "a" }),
      ...aviCharges(19_600, { ref: "8473-1192834", idPrefix: "b" }),
    ];
    const { series, diagnostics } = runFinder(prop, entries);
    expect(diagnostics.groupCount).toBe(2);
    expect(series).toHaveLength(2);
    const refs = series.map((s) => s.label).sort();
    expect(refs).toEqual([
      "Avibetalning 8473-1192834",
      "Avibetalning 9120-3273663",
    ]);
    // Each series carries only its own twelve months, not a merged twenty-four.
    expect(series.every((s) => s.months.length === 12)).toBe(true);
  });

  it("anchors only the property whose recorded payment matches the exact description", () => {
    // One recorded payment seeds property A's reference. Only A's series is a
    // payment match; B's identical-prefix charge stays amount-only and is never
    // anchored as a payment on this property.
    const prop = screenshotProperty();
    const aCharges = aviCharges(19_636, { ref: "9120-3273663", idPrefix: "a" });
    const bCharges = aviCharges(19_600, { ref: "8473-1192834", idPrefix: "b" });
    const { series } = runFinder(prop, [...aCharges, ...bCharges], {
      seedEntryIds: ["a-0"],
    });
    const a = series.find((s) => s.label === "Avibetalning 9120-3273663");
    const b = series.find((s) => s.label === "Avibetalning 8473-1192834");
    expect(a?.anchor).toBe("payment");
    expect(b?.anchor).toBe("amount");
  });
});

// ── A stray tag must not shadow the amount search ──────────────────────────
//
// The lender bank also bills unrelated charges (a monthly card fee), and a
// user who tagged one of those with the lender company — or who has the
// company auto-applied by a rule — would otherwise flip the whole walk into
// "tags-only" mode: the only tagged anchor is the 20 kr fee, it's dropped as
// implausible, and the ~monthly mortgage payment sitting in the history is
// never even considered. The amount search must run alongside the tags.
describe("discoverMortgagePayments — a stray tag does not shadow the maths", () => {
  function feeCharges(): HistoryEntry[] {
    // A small monthly bank-card fee, company-tagged to the lender.
    return monthlyDates(2025, 9, 12).map((d, i) =>
      entry(`fee-${i}`, d, -20, "Manadsavgift Bankkort", {
        userCompanyId: COMPANY.id,
      }),
    );
  }

  it("finds the untagged mortgage even when an unrelated lender charge is tagged", () => {
    const base = screenshotProperty();
    const prop = property(base.mortgages, {
      ...base,
      companyId: COMPANY.id, // the property's lender
    });
    const entries = [...aviCharges(19_636), ...feeCharges()];
    const { series, seed, diagnostics } = runFinder(prop, entries);
    // The stray fee IS tagged...
    expect(diagnostics.tagKeyCount).toBeGreaterThanOrEqual(1);
    // ...but the mortgage still surfaces, from the loan maths, and leads.
    expect(series[0].suggestedAmount).toBe(19_636);
    expect(series[0].anchor).toBe("amount");
    expect(seed).toBe("amount");
    // The 20 kr fee is offered to nobody — it's an order of magnitude off the
    // expected payment.
    expect(series.some((s) => s.suggestedAmount === 20)).toBe(false);
    const fee = diagnostics.candidates.find((c) => c.suggestedAmount === 20);
    expect(fee?.outcome).toBe("plausibility");
  });

  it("still surfaces a correctly-tagged mortgage as a tag match", () => {
    // When the tagged charge IS the mortgage, it leads as a tag anchor (the
    // amount search would find it too, deduped by its description key).
    const base = screenshotProperty();
    const prop = property(base.mortgages, { ...base, companyId: COMPANY.id });
    const entries = monthlyDates(2025, 9, 12).map((d, i) =>
      entry(`m-${i}`, d, -19_636, "Avibetalning bolan", {
        userCompanyId: COMPANY.id,
      }),
    );
    const { series, seed } = runFinder(prop, entries);
    expect(series).toHaveLength(1);
    expect(series[0].suggestedAmount).toBe(19_636);
    expect(series[0].anchor).toBe("tag");
    expect(seed).toBe("tags");
  });
});

// ── Ranking: strictness first, then closeness to the expected figure ───────
describe("discoverMortgagePayments — ranking across strictness and closeness", () => {
  // Twelve clean monthly charges of one description at a fixed amount.
  function monthly(
    prefix: string,
    description: string,
    amount: number,
    extra: Partial<HistoryEntry> = {},
  ): HistoryEntry[] {
    return monthlyDates(2024, 1, 12).map((d, i) =>
      entry(`${prefix}-${i}`, d, -amount, description, extra),
    );
  }

  it("ranks the closest amount-only candidate first among near-misses", () => {
    // Expected payment 18 750. Four recurring charges all inside the ±20 %
    // band — 18 756 (spot on), 18 200, 22 000, 15 300 — all surface, and the
    // one closest to the estimate leads.
    const entries = [
      ...monthly("a", "Stora Bolanet", 18_756),
      ...monthly("b", "Andra Lanet", 18_200),
      ...monthly("c", "Tredje Lanet", 15_300),
      ...monthly("d", "Fjarde Lanet", 22_000),
    ];
    const { series, seed } = discoverMortgagePayments(
      baseInput(entries, { targetAmounts: [18_750] }),
    );
    expect(seed).toBe("amount");
    // Closest-to-18 750 first: 18 756, 18 200, 22 000, 15 300.
    expect(series.map((s) => s.suggestedAmount)).toEqual([
      18_756, 18_200, 22_000, 15_300,
    ]);
    expect(series.every((s) => s.anchor === "amount")).toBe(true);
  });

  it("ranks by strictness first, then closeness, across all three scopes", () => {
    // The same near-misses, but now the 18 756 charge is company-tagged and
    // the 18 200 charge already has a recorded payment. Strictness wins:
    // tag, then payment, then the amount-only charges (closest of those
    // first) — even though an amount-only charge sits nearer the estimate
    // than the payment-seeded one.
    const entries = [
      ...monthly("tag", "Stora Bolanet", 18_756, {
        userCompanyId: COMPANY.id,
      }),
      ...monthly("pay", "Andra Lanet", 18_200),
      ...monthly("amtA", "Tredje Lanet", 22_000),
      ...monthly("amtB", "Fjarde Lanet", 15_300),
    ];
    const { series, seed } = discoverMortgagePayments(
      baseInput(entries, {
        companyIds: [COMPANY.id],
        seedEntryIds: ["pay-0"],
        targetAmounts: [18_750],
      }),
    );
    expect(seed).toBe("tags");
    expect(series.map((s) => s.anchor)).toEqual([
      "tag",
      "payment",
      "amount",
      "amount",
    ]);
    expect(series.map((s) => s.suggestedAmount)).toEqual([
      18_756, 18_200, 22_000, 15_300,
    ]);
  });

  it("keeps a tagged charge on top even when an amount-only charge is closer", () => {
    // The tagged charge is a worse amount match (18 000, delta 0.04) than an
    // untagged one (18 756, delta ~0), yet the tag's higher strictness keeps
    // it first — the surer signal leads.
    const entries = [
      ...monthly("tag", "Stora Bolanet", 18_000, {
        userCompanyId: COMPANY.id,
      }),
      ...monthly("amt", "Andra Lanet", 18_756),
    ];
    const { series, seed } = discoverMortgagePayments(
      baseInput(entries, {
        companyIds: [COMPANY.id],
        targetAmounts: [18_750],
      }),
    );
    expect(seed).toBe("tags");
    expect(series.map((s) => s.anchor)).toEqual(["tag", "amount"]);
    expect(series.map((s) => s.suggestedAmount)).toEqual([18_000, 18_756]);
  });
});

// ── Monthly recurrence: the highly-probable promotion ──────────────────────
//
// A mortgage is paid on a fixed cadence, every period, for the same amount. A
// charge that recurs on that clean cadence (no gaps) over a meaningful span,
// under one stable description, whose typical amount lands in the tight band of
// an expected figure is the surest signal a charge IS the mortgage — surer than
// any single tag the user happened to apply. It is flagged `highlyProbable` and
// RANKS above the tag / company anchor. (Completeness over the loan's whole
// active window, the configurable cadence, and the one-winner-per-figure rule
// are exercised in the "cadence and window completeness" battery below.)
describe("discoverMortgagePayments — monthly recurrence promotion", () => {
  function monthly(
    prefix: string,
    description: string,
    amount: number,
    extra: Partial<HistoryEntry> = {},
    count = 12,
  ): HistoryEntry[] {
    return monthlyDates(2024, 1, count).map((d, i) =>
      entry(`${prefix}-${i}`, d, -amount, description, extra),
    );
  }

  it("flags a clean monthly charge in band as highly probable", () => {
    const { series } = discoverMortgagePayments(
      baseInput(monthly("loan", "HEMBANKEN BOLAN", 18_756), {
        targetAmounts: [18_750],
      }),
    );
    expect(series).toHaveLength(1);
    expect(series[0].regularCadence).toBe(true);
    expect(series[0].highlyProbable).toBe(true);
  });

  it("ranks a highly-probable amount charge above a tagged charge", () => {
    // The tagged charge recurs monthly but its amount (14,000) is outside the
    // ±20% band of the 18,750 estimate, so it is NOT highly probable. The
    // untagged 18,756 charge is monthly AND in band — highly probable — so the
    // recurrence + amount match trumps the tag and leads.
    const entries = [
      ...monthly("tag", "Stora Bolanet", 14_000, { userCompanyId: COMPANY.id }),
      ...monthly("amt", "Andra Lanet", 18_756),
    ];
    const { series } = discoverMortgagePayments(
      baseInput(entries, {
        companyIds: [COMPANY.id],
        targetAmounts: [18_750],
      }),
    );
    expect(series.map((s) => s.suggestedAmount)).toEqual([18_756, 14_000]);
    expect(series.map((s) => s.anchor)).toEqual(["amount", "tag"]);
    expect(series[0].highlyProbable).toBe(true);
    expect(series[1].highlyProbable).toBe(false);
  });

  it("does not flag a charge with a gap in its monthly cadence", () => {
    // Eleven months of a charge, but March is missing — the cadence is broken,
    // so even though the amount is on the nose it is not highly probable.
    const dates = monthlyDates(2024, 1, 12).filter(
      (d) => !d.startsWith("2024-03"),
    );
    const entries = dates.map((d, i) =>
      entry(`g-${i}`, d, -18_750, "HEMBANKEN BOLAN"),
    );
    const { series } = discoverMortgagePayments(
      baseInput(entries, { targetAmounts: [18_750] }),
    );
    expect(series).toHaveLength(1);
    expect(series[0].regularCadence).toBe(false);
    expect(series[0].highlyProbable).toBe(false);
  });

  it("does not flag a run too short to be a pattern", () => {
    // Only two months — a coincidence, not a standing payment.
    const { series } = discoverMortgagePayments(
      baseInput(monthly("short", "HEMBANKEN BOLAN", 18_750, {}, 2), {
        targetAmounts: [18_750],
      }),
    );
    expect(series).toHaveLength(1);
    expect(series[0].regularCadence).toBe(false);
    expect(series[0].highlyProbable).toBe(false);
  });

  it("does not flag an amount-salvaged (no stable description) charge", () => {
    // A bare-reference charge recurs monthly in band, but has no stable
    // description to group by — it is salvaged by amount and stays unflagged.
    const prop = screenshotProperty();
    const { series, diagnostics } = runFinder(
      prop,
      aviCharges(19_636, { word: "" }),
    );
    expect(series).toHaveLength(1);
    expect(series[0].regularCadence).toBe(true);
    expect(series[0].highlyProbable).toBe(false);
    expect(diagnostics.candidates[0].synthetic).toBe(true);
    expect(diagnostics.candidates[0].highlyProbable).toBe(false);
  });
});

// ── Cadence and window completeness: don't flag an incomplete run ───────────
//
// A charge that recurs cleanly but covers only part of the window the loan has
// been active — five of the eight months expected since it was taken out —
// must not be flagged highly probable even though its amount matches and it has
// no internal gaps. And only ONE charge per expected figure is flagged: a
// second clean-but-wrong charge near the same amount never also lights up.
describe("discoverMortgagePayments — cadence and window completeness", () => {
  function monthly(
    prefix: string,
    description: string,
    amount: number,
    startYear: number,
    startMonth: number,
    count: number,
  ): HistoryEntry[] {
    return monthlyDates(startYear, startMonth, count).map((d, i) =>
      entry(`${prefix}-${i}`, d, -amount, description),
    );
  }

  it("flags a charge that covers the whole window since the loan started", () => {
    // The mortgage runs every month from the purchase (2025-09) to the latest
    // data the account has (2026-04) — eight of eight expected months.
    const prop = screenshotProperty();
    const { series } = runFinder(
      prop,
      monthly("loan", "Avibetalning bolan", 19_636, 2025, 9, 8),
    );
    expect(series).toHaveLength(1);
    expect(series[0].suggestedAmount).toBe(19_636);
    expect(series[0].regularCadence).toBe(true);
    expect(series[0].highlyProbable).toBe(true);
  });

  it("does NOT flag a clean monthly run that covers only part of the window", () => {
    // Same mortgage amount, but the charge only appears for the last five of the
    // eight months since the purchase (it started late, or stopped). Ordinary
    // spending (groceries) keeps running all eight months, so the data window
    // reaches 2026-04 and the five-month run falls short. It stays a candidate,
    // just not "highly probable".
    const prop = screenshotProperty();
    const entries = [
      ...monthly("loan", "Avibetalning bolan", 19_636, 2025, 12, 5),
      ...monthly("food", "MATBUTIK", 1_250, 2025, 9, 8),
    ];
    const { series } = runFinder(prop, entries);
    const loan = series.find((s) => s.suggestedAmount === 19_636);
    expect(loan).toBeDefined();
    // Clean cadence, no internal gaps...
    expect(loan!.regularCadence).toBe(true);
    // ...but it covers only 5 of the 8 expected months, so it isn't promoted.
    expect(loan!.highlyProbable).toBe(false);
    const cand = series.find((s) => s.suggestedAmount === 19_636);
    expect(cand).toBeDefined();
  });

  it("counts charges on the configured cadence for a quarterly loan", () => {
    // A loan charged every three months: four draws over a year is a complete
    // quarterly cadence, so it IS flagged when the schedule says cadence 3.
    const m = mort("m1", {
      loanAmount: 1_200_000,
      currentBalance: 1_200_000,
      interestRate: 4,
      amortization: { mode: "fixed", amount: 9_000 },
    });
    const each = [resolveMonthlyPaymentAt(m, REF_DATE)];
    const combined = each[0];
    const quarterly = [
      entry("q-0", "2024-01-28", -combined, "Avibetalning bolan"),
      entry("q-1", "2024-04-28", -combined, "Avibetalning bolan"),
      entry("q-2", "2024-07-28", -combined, "Avibetalning bolan"),
      entry("q-3", "2024-10-28", -combined, "Avibetalning bolan"),
    ];
    const schedule = { startDate: "2024-01-01", cadenceMonths: 3 };
    const { series: quarterlySeries } = discoverMortgagePayments(
      baseInput(quarterly, {
        fromDate: "2024-01-01",
        targetAmounts: [combined, ...each],
        targetSchedules: [schedule, schedule],
      }),
    );
    expect(quarterlySeries).toHaveLength(1);
    expect(quarterlySeries[0].regularCadence).toBe(true);
    expect(quarterlySeries[0].highlyProbable).toBe(true);

    // The same draws read as a BROKEN cadence (and so no promotion) when the
    // loan is assumed monthly — three-month gaps aren't a monthly rhythm.
    const monthlySchedule = { startDate: "2024-01-01", cadenceMonths: 1 };
    const { series: monthlySeries } = discoverMortgagePayments(
      baseInput(quarterly, {
        fromDate: "2024-01-01",
        targetAmounts: [combined, ...each],
        targetSchedules: [monthlySchedule, monthlySchedule],
      }),
    );
    expect(monthlySeries[0].regularCadence).toBe(false);
    expect(monthlySeries[0].highlyProbable).toBe(false);
  });

  it("flags only the strongest charge when two match the same figure", () => {
    // Two clean monthly in-band charges sit near the same 18 750 estimate. Both
    // surface, but only the closer one earns "highly probable" — the other is a
    // plain candidate.
    const entries = [
      ...monthly("a", "Stora Bolanet", 18_756, 2024, 1, 12),
      ...monthly("b", "Andra Lanet", 18_200, 2024, 1, 12),
    ];
    const { series } = discoverMortgagePayments(
      baseInput(entries, { targetAmounts: [18_750] }),
    );
    expect(series.map((s) => s.highlyProbable)).toEqual([true, false]);
    expect(series.filter((s) => s.highlyProbable)).toHaveLength(1);
    expect(series[0].suggestedAmount).toBe(18_756);
  });

  it("flags one charge per figure for a property paid as separate per-loan draws", () => {
    // Two loans, each paid as its own monthly draw near its own expected figure.
    // Each draw is the best for its figure, so BOTH are highly probable.
    const m1 = mort("m1", {
      loanAmount: 2_000_000,
      currentBalance: 2_000_000,
      interestRate: 2,
      amortization: { mode: "fixed", amount: 4_000 },
    });
    const m2 = mort("m2", {
      loanAmount: 500_000,
      currentBalance: 500_000,
      interestRate: 3,
      amortization: { mode: "fixed", amount: 2_000 },
    });
    const prop = property([m1, m2], { purchaseAmount: 3_500_000 });
    const [c1, c2] = eachCharge([m1, m2]); // 7,333 and 3,250
    const entries = [
      ...monthly("a", "Bolan Ett", c1, 2024, 1, 12),
      ...monthly("b", "Bolan Tva", c2, 2024, 1, 12),
    ];
    const { series } = runFinder(prop, entries);
    expect(series.filter((s) => s.highlyProbable)).toHaveLength(2);
    expect(series.every((s) => s.highlyProbable)).toBe(true);
  });
});

// ── Metadata anchors skip the cadence requirement ──────────────────────────
//
// A charge the user marked as the mortgage (a company / type tag) or whose
// description matches an already-recorded payment carries enough signal on its
// own that it is promoted to "highly probable" on its amount alone — it does
// NOT also have to recur on a clean, complete cadence. A few weekend-slipped or
// missed months therefore no longer cost it the badge. An amount-only charge,
// with no such metadata, still must recur cleanly across the whole window.
describe("discoverMortgagePayments — metadata anchors skip cadence", () => {
  it("flags a tagged charge with a broken cadence as highly probable", () => {
    // Eleven months of a tagged mortgage draw with March missing — a broken
    // monthly cadence. The tag vouches for it, so it is still highly probable.
    const dates = monthlyDates(2024, 1, 12).filter(
      (d) => !d.startsWith("2024-03"),
    );
    const entries = dates.map((d, i) =>
      entry(`t-${i}`, d, -18_750, "HEMBANKEN BOLAN", {
        userTypeId: PRESET_TYPE_MORTGAGE_ID,
      }),
    );
    const { series } = discoverMortgagePayments(
      baseInput(entries, { targetAmounts: [18_750] }),
    );
    expect(series).toHaveLength(1);
    expect(series[0].anchor).toBe("tag");
    expect(series[0].regularCadence).toBe(false);
    expect(series[0].highlyProbable).toBe(true);
  });

  it("flags a payment-seeded charge with a broken cadence as highly probable", () => {
    // The same gappy run, anchored by an existing recorded payment (a 1-1
    // description match) instead of a tag — promoted all the same.
    const dates = monthlyDates(2024, 1, 12).filter(
      (d) => !d.startsWith("2024-03"),
    );
    const entries = dates.map((d, i) =>
      entry(`s-${i}`, d, -18_750, "HEMBANKEN BOLAN"),
    );
    const { series } = discoverMortgagePayments(
      baseInput(entries, {
        seedEntryIds: ["s-0"],
        targetAmounts: [18_750],
      }),
    );
    expect(series).toHaveLength(1);
    expect(series[0].anchor).toBe("payment");
    expect(series[0].regularCadence).toBe(false);
    expect(series[0].highlyProbable).toBe(true);
  });

  it("still withholds the badge from an amount-only charge with a broken cadence", () => {
    // No tag, no recorded payment — the same gap leaves it an ordinary
    // candidate, since an amount-only match has no metadata to vouch for it.
    const dates = monthlyDates(2024, 1, 12).filter(
      (d) => !d.startsWith("2024-03"),
    );
    const entries = dates.map((d, i) =>
      entry(`a-${i}`, d, -18_750, "HEMBANKEN BOLAN"),
    );
    const { series } = discoverMortgagePayments(
      baseInput(entries, { targetAmounts: [18_750] }),
    );
    expect(series).toHaveLength(1);
    expect(series[0].anchor).toBe("amount");
    expect(series[0].highlyProbable).toBe(false);
  });

  it("does not promote a tagged charge whose amount is outside the band", () => {
    // The cadence requirement is waived, but the amount band still gates: a
    // tagged charge 30% off the expected figure is not highly probable.
    const entries = monthlyDates(2024, 1, 12).map((d, i) =>
      entry(`t-${i}`, d, -13_000, "HEMBANKEN BOLAN", {
        userTypeId: PRESET_TYPE_MORTGAGE_ID,
      }),
    );
    const { series } = discoverMortgagePayments(
      baseInput(entries, { targetAmounts: [18_750] }),
    );
    expect(series).toHaveLength(1);
    expect(series[0].anchor).toBe("tag");
    expect(series[0].highlyProbable).toBe(false);
  });
});

// ── Weekend slips: two payments in one calendar month ──────────────────────
//
// A mortgage falls due on a fixed day, but a weekend or holiday pushes the
// posting a few days on. When a payment due at the end of one month posts in
// the first days of the next, that calendar month holds TWO payments and the
// month between is empty. Grouping strictly by calendar month would collapse
// the two into one (the larger wins) and lose the other; clustering by a
// day-gap keeps both, because they are more than two weeks apart. A genuine
// few-days-apart double-draw still folds into one payment.
describe("discoverMortgagePayments — weekend month-boundary slips", () => {
  it("keeps two same-group payments that share a calendar month", () => {
    // Eleven clean monthly draws, but January's payment slipped to Feb 1 —
    // so February holds both Feb 1 and Feb 27, and January is empty. All
    // twelve payments must survive, not eleven.
    const entries = [
      entry("p-jan", "2024-02-01", -18_750, "HEMBANKEN BOLAN"),
      ...monthlyDates(2024, 2, 11, 27).map((d, i) =>
        entry(`p-${i}`, d, -18_750, "HEMBANKEN BOLAN"),
      ),
    ];
    const { series } = discoverMortgagePayments(
      baseInput(entries, { targetAmounts: [18_750] }),
    );
    const s = series.find((x) => x.suggestedAmount === 18_750)!;
    expect(s).toBeDefined();
    expect(s.months).toHaveLength(12);
    // Both February payments are present.
    const feb = s.months.filter((m) => m.monthKey === "2024-02");
    expect(feb).toHaveLength(2);
    expect(feb.map((m) => m.date).sort()).toEqual(["2024-02-01", "2024-02-27"]);
  });

  it("does not drop the slipped payment when its description is tagged", () => {
    const entries = [
      entry("p-jan", "2024-02-02", -8_000, "HEMBANKEN AMORTERING", {
        userTypeId: PRESET_TYPE_MORTGAGE_ID,
      }),
      ...monthlyDates(2024, 2, 11, 28).map((d, i) =>
        entry(`p-${i}`, d, -8_000, "HEMBANKEN AMORTERING", {
          userTypeId: PRESET_TYPE_MORTGAGE_ID,
        }),
      ),
    ];
    const { series } = discoverMortgagePayments(baseInput(entries));
    const s = series.find((x) => x.suggestedAmount === 8_000)!;
    expect(s.months).toHaveLength(12);
  });

  it("folds a few-days-apart double-draw into a single payment", () => {
    // A reversal + repost three days apart is the SAME payment — the larger
    // (more-negative) draw stands in, the cluster counts once.
    const entries = [
      entry("dup-a", "2024-01-15", -8_000, "HEMBANKEN BOLAN", {
        userTypeId: PRESET_TYPE_MORTGAGE_ID,
      }),
      entry("dup-b", "2024-01-18", -8_050, "HEMBANKEN BOLAN", {
        userTypeId: PRESET_TYPE_MORTGAGE_ID,
      }),
      ...monthlyDates(2024, 2, 11, 15).map((d, i) =>
        entry(`p-${i}`, d, -8_000, "HEMBANKEN BOLAN", {
          userTypeId: PRESET_TYPE_MORTGAGE_ID,
        }),
      ),
    ];
    const { series } = discoverMortgagePayments(baseInput(entries));
    const s = series.find((x) => x.label === "HEMBANKEN BOLAN")!;
    // Twelve payments, not thirteen — the two January draws are one.
    expect(s.months).toHaveLength(12);
    const jan = s.months.filter((m) => m.monthKey === "2024-01");
    expect(jan).toHaveLength(1);
    // The larger of the two January draws stands in for the cluster.
    expect(jan[0].amount).toBe(8_050);
  });
});

describe("monthsWithinBand", () => {
  it("drops a month whose charge strays outside the band", () => {
    // Eleven steady 8,000 draws plus one 16,000 double-draw in an early
    // month — the pattern's amount band should exclude the outlier.
    const dates = monthlyDates(2023, 1, 12);
    const entries = dates.map((d, i) =>
      entry(`pay-${i}`, d, i === 1 ? -16_000 : -8_000, "HEMBANKEN AMORTERING", {
        userTypeId: PRESET_TYPE_MORTGAGE_ID,
      }),
    );
    const { series } = discoverMortgagePayments(baseInput(entries));
    const target = series.find((s) => s.suggestedAmount === 8_000);
    expect(target).toBeDefined();
    const kept = monthsWithinBand(target!, target!.suggestedAmount, 0.1);
    expect(kept).toHaveLength(11);
    expect(kept.every((m) => m.amount === 8_000)).toBe(true);
  });
});
