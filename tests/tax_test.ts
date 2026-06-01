import { describe, expect, it } from "vitest";

import {
  grossFromNetMonthly,
  netFromGrossMonthly,
} from "../src/data/tax/engine";
import {
  clampTaxYear,
  SUPPORTED_TAX_YEARS,
} from "../src/data/tax/se/constants";
import { rateForMunicipality } from "../src/data/tax/se/municipalities";
import type { SwedishTaxParams } from "../src/data/types";

// Stockholm employment profile, working-age, no church.
const STOCKHOLM: SwedishTaxParams = {
  country: "SE",
  municipalityId: "0180",
  churchMember: false,
  incomeKind: "employment",
};

describe("clampTaxYear", () => {
  it("clamps out-of-range years to the supported span", () => {
    const min = SUPPORTED_TAX_YEARS[0];
    const max = SUPPORTED_TAX_YEARS[SUPPORTED_TAX_YEARS.length - 1];
    expect(clampTaxYear(1990)).toBe(min);
    expect(clampTaxYear(3000)).toBe(max);
    expect(clampTaxYear(2024)).toBe(2024);
  });

  it("falls back to a default for a non-finite year", () => {
    expect(SUPPORTED_TAX_YEARS).toContain(clampTaxYear(Number.NaN));
  });
});

describe("swedish forward calculation", () => {
  it("withholds a plausible amount on an average salary", () => {
    const r = netFromGrossMonthly(40000, STOCKHOLM, 2026);
    // Net is below gross, tax is positive, and the effective rate for a
    // ~40k/mo earner lands in a sane 18–28 % band.
    expect(r.netMonthly).toBeLessThan(40000);
    expect(r.taxMonthly).toBeGreaterThan(0);
    const effective = r.taxMonthly / 40000;
    expect(effective).toBeGreaterThan(0.15);
    expect(effective).toBeLessThan(0.3);
  });

  it("applies state tax above the skiktgräns for a high earner", () => {
    const high = netFromGrossMonthly(80000, STOCKHOLM, 2026);
    // Annual gross ≫ skiktgräns ⇒ a non-zero state-tax component.
    expect(high.components.state).toBeGreaterThan(0);
    // The marginal rate at 80k is higher than at 40k.
    const low = netFromGrossMonthly(40000, STOCKHOLM, 2026);
    expect(high.taxMonthly / 80000).toBeGreaterThan(low.taxMonthly / 40000);
  });

  it("gives a 66+ pensioner more take-home via the higher deduction", () => {
    // The förhöjt grundavdrag lands on pension income (no jobbskatte-
    // avdrag to offset it), so a 66+ pensioner keeps more than a younger
    // one on the same pension.
    const pension: SwedishTaxParams = { ...STOCKHOLM, incomeKind: "pension" };
    const senior: SwedishTaxParams = { ...pension, birthYear: 1950 };
    const young: SwedishTaxParams = { ...pension, birthYear: 1990 };
    const s = netFromGrossMonthly(25000, senior, 2026);
    const y = netFromGrossMonthly(25000, young, 2026);
    expect(s.netMonthly).toBeGreaterThan(y.netMonthly);
  });

  it("adds the church fee for a member", () => {
    const member: SwedishTaxParams = { ...STOCKHOLM, churchMember: true };
    const m = netFromGrossMonthly(40000, member, 2026);
    const non = netFromGrossMonthly(40000, STOCKHOLM, 2026);
    expect(m.components.church).toBeGreaterThan(0);
    expect(m.netMonthly).toBeLessThan(non.netMonthly);
  });

  it("selects the paycheck's tax year", () => {
    // The municipal rate is year-aware via the table; the deduction
    // scales with that year's prisbasbelopp, so two years differ.
    const y2024 = netFromGrossMonthly(45000, STOCKHOLM, 2024);
    const y2026 = netFromGrossMonthly(45000, STOCKHOLM, 2026);
    expect(y2024.netMonthly).not.toBe(y2026.netMonthly);
  });

  it("honours an explicit year override on the params", () => {
    const pinned: SwedishTaxParams = { ...STOCKHOLM, year: 2024 };
    // The caller passes 2026, but the override pins 2024.
    const viaOverride = netFromGrossMonthly(45000, pinned, 2026);
    const direct = netFromGrossMonthly(45000, STOCKHOLM, 2024);
    expect(viaOverride.netMonthly).toBe(direct.netMonthly);
  });
});

describe("net → gross inversion", () => {
  it("round-trips gross → net → gross within a krona", () => {
    for (const gross of [25000, 40000, 62000, 95000]) {
      const { netMonthly } = netFromGrossMonthly(gross, STOCKHOLM, 2026);
      const back = grossFromNetMonthly(netMonthly, STOCKHOLM, 2026);
      expect(Math.abs(back.grossMonthly - gross)).toBeLessThan(1);
    }
  });

  it("is monotonic — more net implies more gross", () => {
    const lo = grossFromNetMonthly(20000, STOCKHOLM, 2026);
    const hi = grossFromNetMonthly(50000, STOCKHOLM, 2026);
    expect(hi.grossMonthly).toBeGreaterThan(lo.grossMonthly);
  });

  it("round-trips across multiple years", () => {
    for (const year of [2022, 2024, 2026]) {
      const { netMonthly } = netFromGrossMonthly(38000, STOCKHOLM, year);
      const back = grossFromNetMonthly(netMonthly, STOCKHOLM, year);
      expect(Math.abs(back.grossMonthly - 38000)).toBeLessThan(1);
    }
  });
});

describe("municipality rates", () => {
  it("resolves a known kommun and falls back to the average otherwise", () => {
    expect(rateForMunicipality("0180", 2026)).toBeGreaterThan(0.2);
    // Unknown id → national-average fallback (a finite, sane rate).
    const fallback = rateForMunicipality("9999", 2026);
    expect(fallback).toBeGreaterThan(0.25);
    expect(fallback).toBeLessThan(0.4);
  });

  it("falls back to the nearest year for an untranscribed year", () => {
    // 2022 has no own record yet; it borrows the latest year's rate.
    expect(rateForMunicipality("0180", 2022)).toBe(
      rateForMunicipality("0180", 2026),
    );
  });
});
