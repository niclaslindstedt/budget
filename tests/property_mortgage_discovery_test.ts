import { describe, expect, it } from "vitest";

import {
  discoverMortgagePayments,
  monthsWithinBand,
} from "../src/data/property-mortgage/discovery";
import type { HistoryEntry } from "../src/data/types";

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
): HistoryEntry {
  return { id, date, description, amount, importedAt: 0 };
}

// A fictional split mortgage: an 8,000 amortisation draw and a 4,000
// interest draw every month for a year, plus an unrelated 149 subscription.
function splitMortgageHistory(): HistoryEntry[] {
  const dates = monthlyDates(2023, 1, 12);
  const out: HistoryEntry[] = [];
  dates.forEach((d, i) => {
    out.push(entry(`amort-${i}`, d, -8_000, "HEMBANKEN AMORTERING"));
    out.push(entry(`ranta-${i}`, d, -4_000, "HEMBANKEN RANTA"));
    out.push(entry(`sub-${i}`, d, -149, "STREAMINGTJANST"));
  });
  return out;
}

describe("discoverMortgagePayments", () => {
  it("surfaces recurring monthly outflows as series with a calendar span", () => {
    const { series } = discoverMortgagePayments({
      entries: splitMortgageHistory(),
    });
    const amort = series.find((s) => s.suggestedAmount === 8_000);
    expect(amort).toBeDefined();
    expect(amort?.months).toHaveLength(12);
    expect(amort?.spanMonths).toBe(12);
  });

  it("tags series matching the loan's interest, amortisation, and combined targets", () => {
    const { series } = discoverMortgagePayments({
      entries: splitMortgageHistory(),
      targets: { interest: 4_000, principal: 8_000 },
    });
    const amort = series.find((s) => s.suggestedAmount === 8_000);
    const ranta = series.find((s) => s.suggestedAmount === 4_000);
    expect(amort?.matchedTarget).toBe("principal");
    expect(ranta?.matchedTarget).toBe("interest");
  });

  it("matches a single combined charge against interest + amortisation", () => {
    const dates = monthlyDates(2023, 1, 6);
    const entries = dates.map((d, i) =>
      entry(`pay-${i}`, d, -12_000, "HEMBANKEN BOLAN"),
    );
    const { series } = discoverMortgagePayments({
      entries,
      targets: { interest: 4_000, principal: 8_000 },
    });
    expect(series[0]?.matchedTarget).toBe("combined");
  });

  it("ranks amount matches ahead of recurrence-only candidates", () => {
    const { series } = discoverMortgagePayments({
      entries: splitMortgageHistory(),
      targets: { interest: 4_000, principal: 8_000 },
    });
    const matchedIdx = series.findIndex((s) => s.matchedTarget !== undefined);
    const unmatchedIdx = series.findIndex((s) => s.matchedTarget === undefined);
    expect(matchedIdx).toBeGreaterThanOrEqual(0);
    // The 149 subscription has no target match and must sort last.
    expect(unmatchedIdx).toBeGreaterThan(matchedIdx);
    expect(series[series.length - 1]?.suggestedAmount).toBe(149);
  });

  it("widening the tolerance pulls in a charge a tight band excluded", () => {
    // 9,000 vs an 8,000 amortisation target ⇒ ~11.1% off: outside ±10%,
    // inside ±15%.
    const dates = monthlyDates(2023, 1, 6);
    const entries = dates.map((d, i) =>
      entry(`pay-${i}`, d, -9_000, "HEMBANKEN AMORTERING"),
    );
    const tight = discoverMortgagePayments({
      entries,
      targets: { interest: null, principal: 8_000 },
      tolerance: 0.1,
    });
    expect(tight.series[0]?.matchedTarget).toBeUndefined();

    const wide = discoverMortgagePayments({
      entries,
      targets: { interest: null, principal: 8_000 },
      tolerance: 0.15,
    });
    expect(wide.series[0]?.matchedTarget).toBe("principal");
  });
});

describe("monthsWithinBand", () => {
  it("drops a month whose charge strays outside the band", () => {
    // Eleven steady 8,000 draws plus one 16,000 double-draw in an early
    // month — the pattern's amount band should exclude the outlier.
    const dates = monthlyDates(2023, 1, 12);
    const entries = dates.map((d, i) =>
      entry(`pay-${i}`, d, i === 1 ? -16_000 : -8_000, "HEMBANKEN AMORTERING"),
    );
    const { series } = discoverMortgagePayments({ entries });
    const target = series.find((s) => s.suggestedAmount === 8_000);
    expect(target).toBeDefined();
    const kept = monthsWithinBand(target!, target!.suggestedAmount, 0.1);
    expect(kept).toHaveLength(11);
    expect(kept.every((m) => m.amount === 8_000)).toBe(true);
  });
});
