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
import { LATEST_VERSION } from "../src/data/migrations";
import { validateUserData } from "../src/data/validate";
import { serializeUserData } from "../src/storage/file";

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

  it("seeds three accounts with six months of bank history each", () => {
    const seed = buildSeedUserData();
    expect(seed.accounts).toHaveLength(3);
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
});
