import { describe, expect, it } from "vitest";

import {
  discoverMortgagePayments,
  monthsWithinBand,
  type MortgageDiscoveryInput,
} from "../src/data/property-mortgage/discovery";
import { PRESET_TYPE_MORTGAGE_ID } from "../src/data/presets/types";
import type { Company, HistoryEntry } from "../src/data/types";

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

  it("centres the amount band on charges from the purchase date onward", () => {
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
    const kept = monthsWithinBand(s, s.suggestedAmount, 0.1);
    expect(kept).toHaveLength(6);
    expect(kept.every((m) => m.amount === 8_000)).toBe(true);
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
