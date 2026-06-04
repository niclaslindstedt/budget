import { describe, expect, it } from "vitest";

import {
  discoverMortgagePayments,
  monthsWithinBand,
  type MortgageDiscoveryInput,
} from "../src/data/property-mortgage/discovery";
import {
  resolveMonthlyPaymentAt,
  splitPaymentAcrossMortgages,
} from "../src/data/property-mortgage/payment";
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

// ── Reference-number descriptions (the real reported failure) ──────────────
//
// A Swedish mortgage auto-giro charge is labelled "Avibetalning <ref>" with a
// DIFFERENT reference number every month. The shared normaliser leaves a
// stray two-digit fragment ("avibetalning 91", "avibetalning 84", …), so a
// description-keyed grouping puts every month in its own group and the charge
// never forms a recurring series. The finder's stricter grouping key strips
// the reference so all the months coalesce under "avibetalning"; a charge
// that's nothing but a reference number is salvaged by its amount instead.

// Twelve months of an auto-giro charge whose reference number differs every
// month, optionally with a leading word. Mirrors the reported "Avibetalning
// 9120-3273663" statement text.
function aviCharges(
  amount: number,
  opts: {
    word?: string;
    count?: number;
    startYear?: number;
    startMonth?: number;
  } = {},
): HistoryEntry[] {
  const {
    word = "Avibetalning",
    count = 12,
    startYear = 2025,
    startMonth = 9,
  } = opts;
  return monthlyDates(startYear, startMonth, count).map((d, i) => {
    const ref = `${9120 + i * 137}-${3273663 + i * 911}`;
    const description = word ? `${word} ${ref}` : ref;
    return entry(`avi-${i}`, d, -amount, description);
  });
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
  it("coalesces a monthly auto-giro charge with a varying reference into one series", () => {
    const prop = screenshotProperty();
    const { series, seed } = runFinder(prop, aviCharges(19_636));
    expect(seed).toBe("amount");
    expect(series).toHaveLength(1);
    expect(series[0].suggestedAmount).toBe(19_636);
    // All twelve months in one group — not fragmented one-per-reference.
    expect(series[0].months).toHaveLength(12);
    expect(series[0].spanMonths).toBe(12);
    expect(series[0].label).toContain("Avibetalning");
  });

  it("groups by stable text even though every reference number differs", () => {
    const prop = screenshotProperty();
    const { diagnostics } = runFinder(prop, aviCharges(19_636));
    expect(diagnostics.outflowEntries).toBe(12);
    // The reference is stripped, so the twelve distinct descriptions form a
    // SINGLE group, not twelve.
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
    // expected figures must not be merged by the reference-stripping key.
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
      ...aviCharges(c1, { word: "Bolan amortering", startMonth: 1 }),
      ...aviCharges(c2, { word: "Bolan ranta", startMonth: 1 }),
    ];
    const { series } = runFinder(prop, entries);
    expect(series.map((s) => s.suggestedAmount).sort((a, b) => a - b)).toEqual([
      3_250, 7_333,
    ]);
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
