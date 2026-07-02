// The developer fake-data generator (`buildSeedUserData`) feeds the
// ephemeral in-memory dev backend. These tests pin the two properties
// that matter: the output is a VALID `UserData` (so the real load /
// validate pipeline accepts it without dropping anything), and it is
// DETERMINISTIC (so a bug reproduced against the seed reproduces
// across runs). The validator is the same one every load runs through,
// so passing it is the strongest guarantee the fabricated shape stays
// in step with the persisted contract as the latter grows.

import { describe, expect, it } from "vitest";

import { buildSeedUserData } from "../src/data/dev/seed";
import { detectTransferCandidates } from "../src/data/accounts/transfer-collapse";
import { detectRecurringCandidates } from "../src/data/budget/recurring-detection";
import { findCarExpenseCandidates } from "../src/data/cars/find";
import { findItemPurchaseCandidates } from "../src/data/items/find";
import { findLoanPaymentCandidates } from "../src/data/loans/candidates";
import { LATEST_VERSION } from "../src/data/migrations";
import { PRESET_TYPE_MORTGAGE_ID } from "../src/data/presets/types";
import { discoverMortgagePayments } from "../src/data/property-mortgage/discovery";
import { discoverSalaries } from "../src/data/salary/discovery";
import type { SalaryView } from "../src/data/types";
import { validateUserData } from "../src/data/validate";
import { serializeUserData } from "../src/storage/file";

// Reference date mirroring the app's notion of "today" in this fixture —
// the six fiscal months the seed covers end in May 2026.
const REFERENCE_DATE = "2026-06-04";

describe("buildSeedUserData", () => {
  it("produces a UserData that passes validation unchanged", () => {
    const seed = buildSeedUserData();
    const result = validateUserData(seed);
    expect(result.ok).toBe(true);
  });

  it("stamps the latest persisted version", () => {
    expect(buildSeedUserData().version).toBe(LATEST_VERSION);
  });

  it("is deterministic — two calls serialize identically", () => {
    expect(serializeUserData(buildSeedUserData())).toBe(
      serializeUserData(buildSeedUserData()),
    );
  });

  it("seeds five accounts with six months of bank history each", () => {
    const seed = buildSeedUserData();
    expect(seed.accounts).toHaveLength(5);
    for (const account of seed.accounts) {
      const entries = seed.history[account.id] ?? [];
      // Each account gets several rows per month across six months.
      expect(entries.length).toBeGreaterThanOrEqual(6);
      const months = new Set(entries.map((e) => e.date.slice(0, 7)));
      expect(months.size).toBe(6);
    }
  });

  it("seeds transfers, budget rows, and custom taxonomy", () => {
    const seed = buildSeedUserData();
    expect(seed.transfers.length).toBeGreaterThanOrEqual(6);
    // The custom (non-preset) taxonomy exercises the user-curated path.
    expect(seed.tags.length).toBeGreaterThan(0);
    expect(seed.companies.length).toBeGreaterThan(0);
    expect(seed.categories.length).toBeGreaterThan(0);
    expect(seed.types.length).toBeGreaterThan(0);
    // The active sheet is a budget bound to an account, with rows.
    const active = seed.sheets.find((s) => s.id === seed.activeSheetId);
    expect(active?.type).toBe("budget");
    const budgetItem = active?.items.find((i) => i.type === "accountBudget");
    const rows =
      budgetItem && budgetItem.type === "accountBudget" ? budgetItem.rows : [];
    expect(rows.length).toBeGreaterThan(0);
  });

  it("keeps running balances reconciled on balance-bearing accounts", () => {
    const seed = buildSeedUserData();
    const checking = seed.accounts.find((a) => a.name === "Checking");
    expect(checking?.openingBalance).toBeDefined();
    const entries = seed.history[checking!.id] ?? [];
    let running = checking!.openingBalance!;
    for (const entry of entries) {
      running = Math.round((running + entry.amount) * 100) / 100;
      expect(entry.balance).toBeCloseTo(running, 2);
    }
  });

  // The seed exists so an agent (or the maintainer) can try every feature
  // with as few clicks as possible. That means every page must be one
  // tab-click away (a sheet of each type), and every "discovery" walk must
  // have at least one unconsumed candidate so the find-flows are reachable
  // without setting up data by hand first.

  it("covers every sheet type so each page is one tab-click away", () => {
    const types = new Set(buildSeedUserData().sheets.map((s) => s.type));
    expect([...types].sort()).toEqual([
      "accounts",
      "budget",
      "cars",
      "insights",
      "investment",
      "items",
      "loans",
      "properties",
      "salary",
      "savings",
      "scenarios",
    ]);
  });

  it("seeds a scenarios sheet bound to the budget with worked what-ifs", () => {
    const seed = buildSeedUserData();
    const sheet = seed.sheets.find((s) => s.type === "scenarios");
    expect(sheet).toBeDefined();
    const view = sheet!.items[0];
    if (view.type !== "scenariosView")
      throw new Error("expected scenariosView");
    // Bound to the seeded budget sheet, with monitors and two scenarios
    // carrying overrides / exclusions / added rows so every affordance
    // on the page has something to show.
    const budgetSheet = seed.sheets.find((s) => s.id === view.baseSheetId);
    expect(budgetSheet?.type).toBe("budget");
    expect(view.monitors.length).toBeGreaterThanOrEqual(2);
    expect(view.scenarios.length).toBeGreaterThanOrEqual(2);
    const loseJob = view.scenarios[0];
    expect(loseJob.overrides.some((o) => o.amount === 0)).toBe(true);
    expect(loseJob.overrides.some((o) => o.excluded === true)).toBe(true);
    expect(loseJob.addedRows.length).toBeGreaterThan(0);
    // Every override references a real row in the base budget.
    const budgetRows = new Set(
      budgetSheet!.items.flatMap((i) =>
        i.type === "accountBudget" ? i.rows.map((r) => r.id) : [],
      ),
    );
    for (const scenario of view.scenarios)
      for (const override of scenario.overrides)
        expect(budgetRows.has(override.rowId)).toBe(true);
  });

  it("leaves loan-payment candidates for the Import payments walk", () => {
    const seed = buildSeedUserData();
    // Every seeded loan flavour: the CSN loan (patterns + recorded
    // payments) and the car loan (typed charges, nothing recorded) must
    // both surface unconsumed candidates; the linked mortgage loan reads
    // the property's mortgage so it isn't asserted here.
    for (const kind of ["student", "car"] as const) {
      const loan = seed.loans.find((l) => l.kind === kind);
      expect(loan).toBeDefined();
      const candidates = findLoanPaymentCandidates(loan!, seed);
      expect(candidates.length).toBeGreaterThan(0);
    }
  });

  it("leaves a salary candidate for the Find salaries walk", () => {
    const seed = buildSeedUserData();
    const salarySheet = seed.sheets.find((s) => s.type === "salary");
    const accountId = (salarySheet?.items[0] as SalaryView).accountId!;
    const excludeHistoryIds = new Set(
      seed.salaries
        .map((s) => s.sourceHistoryId)
        .filter((id): id is string => Boolean(id)),
    );
    const result = discoverSalaries({
      entries: seed.history[accountId],
      excludeHistoryIds,
      referenceDate: REFERENCE_DATE,
    });
    expect(result.candidates.length).toBeGreaterThan(0);
  });

  it("seeds a car with every cost leg and leaves finder candidates", () => {
    const seed = buildSeedUserData();
    const car = seed.cars[0];
    expect(car).toBeDefined();
    // The car is financed by the seeded car loan and carries linked
    // expenses plus a value + mileage snapshot, so depreciation,
    // expense, interest, and cost-per-km surfaces all render.
    expect(seed.loans.some((l) => l.id === car.loanId)).toBe(true);
    expect(car.expenses.length).toBeGreaterThan(0);
    expect(car.snapshots.some((s) => s.value !== undefined)).toBe(true);
    expect(car.snapshots.some((s) => s.mileage !== undefined)).toBe(true);
    // Every linked expense resolves to a real bank entry.
    for (const expense of car.expenses) {
      const entries = seed.history[expense.accountId!] ?? [];
      expect(entries.some((e) => e.id === expense.sourceHistoryId)).toBe(true);
    }
    // The walk still has unconsumed transport charges to offer.
    expect(findCarExpenseCandidates(seed).length).toBeGreaterThan(0);
  });

  it("leaves an item-purchase candidate for the Find items scan", () => {
    const seed = buildSeedUserData();
    expect(
      findItemPurchaseCandidates(seed, seed.settings).length,
    ).toBeGreaterThan(0);
  });

  it("leaves a mortgage-payment candidate for the Find mortgage payments walk", () => {
    const seed = buildSeedUserData();
    const property = seed.properties[0];
    const seedEntryIds = property.mortgages
      .flatMap((m) => m.payments)
      .map((p) => p.sourceHistoryId)
      .filter((id): id is string => Boolean(id));
    const result = discoverMortgagePayments({
      entries: seed.history[property.accountId!],
      merchantHints: seed.merchantHints,
      matchRules: seed.matchRules,
      companies: seed.companies,
      types: seed.types,
      companyIds: property.companyId ? [property.companyId] : [],
      mortgageTypeId: PRESET_TYPE_MORTGAGE_ID,
      seedEntryIds,
      fromDate: property.purchaseDate,
    });
    expect(result.series.length).toBeGreaterThan(0);

    // The walk should surface the charges the user hasn't tagged: the seed
    // carries the recurring mortgage charge in every classification state
    // (fully tagged, company-only, and raw — see `buildSeedUserData`), and
    // the finder must expand from the tagged anchor to all of them. Confirm
    // the discovered, not-yet-recorded months include at least one charge
    // with no type AND no company set.
    const entriesById = new Map(
      seed.history[property.accountId!].map((e) => [e.id, e]),
    );
    const recorded = new Set(seedEntryIds);
    const discoveredEntries = result.series
      .flatMap((s) => s.months)
      .filter((m) => !recorded.has(m.entryId))
      .map((m) => entriesById.get(m.entryId)!);
    expect(discoveredEntries.length).toBeGreaterThan(0);
    expect(
      discoveredEntries.some(
        (e) => e.userTypeId === undefined && e.userCompanyId === undefined,
      ),
    ).toBe(true);
  });

  it("surfaces recurring-history candidates for promotion", () => {
    const seed = buildSeedUserData();
    const checking = seed.accounts[0];
    const candidates = detectRecurringCandidates({
      entries: seed.history[checking.id],
      dismissedKeys: new Set(seed.recurringDismissals),
      referenceDate: REFERENCE_DATE,
    });
    expect(candidates.length).toBeGreaterThan(0);
  });

  it("surfaces collapsible cross-account transfer pairs", () => {
    const seed = buildSeedUserData();
    const candidates = detectTransferCandidates({
      history: seed.history,
      dismissedPairKeys: new Set(seed.transferCollapseDismissals),
    });
    expect(candidates.length).toBeGreaterThan(0);
  });
});
