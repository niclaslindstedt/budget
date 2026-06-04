// Developer-only fake-data generator. Produces a complete, valid
// `UserData` populated with ~6 months of believable accounts, bank
// history, transfers, budget rows, and a sprinkle of custom taxonomy —
// so an agent (or the maintainer) debugging the app can land in a
// realistic state instead of an empty budget.
//
// This is wired to the ephemeral in-memory developer storage backend
// (`src/storage/dev-seed-adapter.ts`), never to a real persistence
// surface: the bytes live in memory for the duration of the dev
// session and are discarded when the toggle is turned off or the page
// is reloaded. See the "Developer fake-data backend" section in
// AGENTS.md.
//
// Output is DETERMINISTIC: ids come from a per-call counter and every
// amount / day jitter comes from a seeded PRNG, so two calls in the
// same environment serialize byte-for-byte identically. That keeps a
// bug reproduced against the seed reproducible across runs.

import { DEFAULT_PERSISTED_SETTINGS } from "../constants/defaults";
import { CATEGORY_COLORS } from "../constants/taxonomy";
import { LATEST_VERSION } from "../migrations";
import { mintBudgetRow } from "../budget/rows";
import type {
  Account,
  Category,
  Column,
  Company,
  EntryType,
  HistoryEntry,
  Item,
  Sheet,
  Tag,
  Transfer,
  UserData,
  UserRow,
} from "../types";

// Tiny deterministic PRNG (mulberry32). Seeded from a fixed constant so
// the generated dataset is identical on every call.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The six fiscal months the seed covers, anchored so the dataset reads
// as "the last half-year" relative to the app's notion of today
// (2026-06-04). Kept as explicit literals rather than computed from
// `Date.now()` so the output stays deterministic regardless of when
// the generator runs.
const MONTHS: ReadonlyArray<{ year: number; month: number }> = [
  { year: 2025, month: 12 },
  { year: 2026, month: 1 },
  { year: 2026, month: 2 },
  { year: 2026, month: 3 },
  { year: 2026, month: 4 },
  { year: 2026, month: 5 },
];

function iso(year: number, month: number, day: number): string {
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

// Round to two decimals so serialized amounts stay clean (no float
// fuzz from the PRNG jitter).
function money(n: number): number {
  return Math.round(n * 100) / 100;
}

// Standard six-column ledger layout, mirroring
// `createDefaultAccountBudget` but with deterministic column ids so the
// budget rows below can reference them and the output stays stable.
function seedColumns(mkId: (p: string) => string): Column[] {
  return [
    { id: mkId("col"), type: "date", label: "Date" },
    { id: mkId("col"), type: "description", label: "Description" },
    { id: mkId("col"), type: "type", label: "Type" },
    { id: mkId("col"), type: "amount", label: "Amount" },
    { id: mkId("col"), type: "balance", label: "Balance" },
    { id: mkId("col"), type: "completed", label: "Done" },
  ];
}

export function buildSeedUserData(): UserData {
  let counter = 0;
  const mkId = (prefix: string): string => `seed-${prefix}-${++counter}`;
  const rng = mulberry32(0x42_75_64_67); // "Budg"

  // Pick a jittered integer in [min, max].
  const between = (min: number, max: number): number =>
    min + Math.floor(rng() * (max - min + 1));

  // ---- Accounts ----------------------------------------------------
  const checking: Account = {
    id: mkId("acc"),
    name: "Checking",
    bank: "Swedbank",
    clearing: "8327",
    accountNumber: "923 456 789-0",
    glyph: "wallet",
    color: CATEGORY_COLORS[5],
  };
  const savings: Account = {
    id: mkId("acc"),
    name: "Savings",
    bank: "Swedbank",
    clearing: "8327",
    accountNumber: "923 456 111-2",
    glyph: "piggy-bank",
    color: CATEGORY_COLORS[12],
  };
  const credit: Account = {
    id: mkId("acc"),
    name: "Credit card",
    bank: "Bank Norwegian",
    glyph: "credit-card",
    color: CATEGORY_COLORS[0],
  };
  const accounts: Account[] = [checking, savings, credit];

  // ---- Custom taxonomy (exercise the non-preset path) --------------
  const vacationCategory: Category = {
    id: mkId("cat"),
    name: "Vacation",
    color: CATEGORY_COLORS[4],
    icon: "plane",
  };
  const boatFuelType: EntryType = {
    id: mkId("type"),
    name: "Boat fuel",
    color: CATEGORY_COLORS[9],
    glyph: "ship",
    categoryId: vacationCategory.id,
    kind: "expense",
  };
  const tagReimbursable: Tag = {
    id: mkId("tag"),
    name: "Reimbursable",
    color: CATEGORY_COLORS[3],
  };
  const tagVacation: Tag = {
    id: mkId("tag"),
    name: "Vacation 2026",
    color: CATEGORY_COLORS[6],
  };
  const companyIca: Company = { id: mkId("co"), name: "ICA Maxi" };
  const companySpotify: Company = { id: mkId("co"), name: "Spotify" };

  const tags: Tag[] = [tagReimbursable, tagVacation];
  const companies: Company[] = [companyIca, companySpotify];
  const categories: Category[] = [vacationCategory];
  const types: EntryType[] = [boatFuelType];

  // ---- Bank history (per account) ----------------------------------
  // Each builder pushes unsorted entries; `finalizeHistory` sorts by
  // date and recomputes the running balance from `opening` so the
  // numbers reconcile the way an imported statement would.
  const importedAt = Date.UTC(2026, 5, 1); // fixed timestamp, deterministic

  type RawEntry = Omit<HistoryEntry, "id" | "importedAt" | "balance"> & {
    typeId?: string;
    tagIds?: string[];
    companyId?: string;
  };

  function finalizeHistory(
    raw: RawEntry[],
    opening: number,
    withBalance: boolean,
  ): HistoryEntry[] {
    const sorted = [...raw].sort((a, b) => a.date.localeCompare(b.date));
    let running = opening;
    return sorted.map((e) => {
      running = money(running + e.amount);
      const entry: HistoryEntry = {
        id: mkId("hist"),
        date: e.date,
        description: e.description,
        amount: e.amount,
        importedAt,
      };
      if (withBalance) entry.balance = running;
      if (e.typeId) entry.userTypeId = e.typeId;
      if (e.companyId) entry.userCompanyId = e.companyId;
      if (e.tagIds && e.tagIds.length > 0) entry.userTagIds = e.tagIds;
      return entry;
    });
  }

  const checkingRaw: RawEntry[] = [];
  const savingsRaw: RawEntry[] = [];
  const creditRaw: RawEntry[] = [];

  for (const { year, month } of MONTHS) {
    // Salary in, rent + utilities out on Checking.
    checkingRaw.push({
      date: iso(year, month, 25),
      description: "Lön Agilator AB",
      amount: money(32000 + between(-200, 600)),
      typeId: "preset-type-salary",
    });
    checkingRaw.push({
      date: iso(year, month, 28),
      description: "Hyra Stockholmshem",
      amount: -12400,
      typeId: "preset-type-rent",
    });
    checkingRaw.push({
      date: iso(year, month, 4),
      description: "Ellevio elnät",
      amount: -money(between(700, 1600)),
      typeId: "preset-type-electricity",
    });
    checkingRaw.push({
      date: iso(year, month, 18),
      description: "Spotify Premium",
      amount: -119,
      typeId: "preset-type-music-streaming",
      companyId: companySpotify.id,
    });
    // A handful of grocery runs.
    for (let g = 0; g < between(3, 5); g++) {
      checkingRaw.push({
        date: iso(year, month, between(2, 27)),
        description: "ICA Maxi",
        amount: -money(between(180, 1300) + rng()),
        typeId: "preset-type-groceries",
        companyId: companyIca.id,
      });
    }
    // A restaurant outing, occasionally reimbursable.
    checkingRaw.push({
      date: iso(year, month, between(5, 26)),
      description: "Restaurang Pelikan",
      amount: -money(between(320, 900)),
      typeId: "preset-type-restaurant",
      tagIds: rng() > 0.6 ? [tagReimbursable.id] : undefined,
    });
    // Monthly standing transfer out to Savings (mirrors the explicit
    // Transfer record below; on a real statement both sides show up as
    // bank rows, so the seed keeps them as history too).
    checkingRaw.push({
      date: iso(year, month, 26),
      description: "Överföring sparkonto",
      amount: -3000,
    });

    // Savings: the matching deposit, plus a small interest line.
    savingsRaw.push({
      date: iso(year, month, 26),
      description: "Insättning från lönekonto",
      amount: 3000,
      typeId: "preset-type-savings",
    });
    savingsRaw.push({
      date: iso(year, month, 1),
      description: "Sparränta",
      amount: money(between(8, 40) + rng()),
    });

    // Credit card: a few purchases and a monthly payment. Credit
    // exports (Bank Norwegian) carry no per-row balance, so this
    // account exercises the no-balance code path.
    creditRaw.push({
      date: iso(year, month, between(3, 12)),
      description: "Circle K drivmedel",
      amount: -money(between(450, 950)),
      typeId: "preset-type-fuel",
    });
    creditRaw.push({
      date: iso(year, month, between(8, 20)),
      description: "Restaurang Lunch",
      amount: -money(between(95, 260)),
      typeId: "preset-type-lunch",
    });
    if (rng() > 0.5) {
      creditRaw.push({
        date: iso(year, month, between(10, 24)),
        description: "Elgiganten",
        amount: -money(between(300, 4000)),
        typeId: "preset-type-electronics",
      });
    }
    creditRaw.push({
      date: iso(year, month, 27),
      description: "Inbetalning kortkonto",
      amount: money(between(900, 5200)),
    });
  }

  const history: Record<string, HistoryEntry[]> = {
    [checking.id]: finalizeHistory(checkingRaw, 18500, true),
    [savings.id]: finalizeHistory(savingsRaw, 64000, true),
    [credit.id]: finalizeHistory(creditRaw, 0, false),
  };

  // Anchor opening balances so the running totals reconcile (mirrors
  // what the import flow stamps from the earliest statement row).
  checking.openingBalance = 18500;
  savings.openingBalance = 64000;

  // ---- Transfers (cross-account log) -------------------------------
  const transfers: Transfer[] = MONTHS.map(({ year, month }) => ({
    id: mkId("xfer"),
    date: iso(year, month, 26),
    description: "Månadssparande",
    amount: 3000,
    fromAccountId: checking.id,
    toAccountId: savings.id,
    typeId: "preset-type-savings",
    completed: true,
  }));

  // ---- Budget sheet bound to Checking ------------------------------
  // Forward-looking recurring rows (salary, rent, subscription, gym)
  // across the six months, each sharing a seriesId so the "edit series"
  // flows have something to chew on.
  const columns = seedColumns(mkId);
  const salarySeries = mkId("series");
  const rentSeries = mkId("series");
  const subSeries = mkId("series");
  const gymSeries = mkId("series");

  const rows: UserRow[] = [];
  const pushRow = (
    values: Parameters<typeof mintBudgetRow>[1],
    extra: Partial<UserRow> = {},
  ): void => {
    const row = mintBudgetRow(columns, values);
    if (row) rows.push({ ...row, id: mkId("row"), ...extra });
  };

  for (const { year, month } of MONTHS) {
    pushRow({
      date: iso(year, month, 25),
      description: "Lön",
      amount: 32000,
      typeId: "preset-type-salary",
      seriesId: salarySeries,
    });
    pushRow({
      date: iso(year, month, 28),
      description: "Hyra",
      amount: -12400,
      typeId: "preset-type-rent",
      seriesId: rentSeries,
    });
    pushRow(
      {
        date: iso(year, month, 18),
        description: "Spotify",
        amount: -119,
        typeId: "preset-type-music-streaming",
        companyId: companySpotify.id,
        seriesId: subSeries,
      },
      { tagIds: [tagVacation.id] },
    );
    pushRow({
      date: iso(year, month, 2),
      description: "Gym",
      amount: -399,
      typeId: "preset-type-gym",
      seriesId: gymSeries,
    });
  }

  const budgetSheet: Sheet = {
    id: mkId("sheet"),
    name: "Checking budget",
    type: "budget",
    glyph: "wallet",
    color: CATEGORY_COLORS[5],
    description: "Seeded developer budget",
    items: [
      {
        id: mkId("item"),
        type: "accountBudget",
        accountId: checking.id,
        columns,
        rows,
      },
    ],
  };

  const accountsSheet: Sheet = {
    id: mkId("sheet"),
    name: "Accounts",
    type: "accounts",
    glyph: "landmark",
    color: CATEGORY_COLORS[13],
    description: "",
    items: [{ id: mkId("item"), type: "accountsView" }],
  };

  // ---- Items (owned-things catalog) --------------------------------
  const items: Item[] = [
    {
      id: mkId("item"),
      name: 'MacBook Pro 14"',
      acquiredAt: "2026-02-10",
      purchasePrice: 24990,
      depreciation: { method: "percentPerYear", ratePerYear: 25 },
    },
    {
      id: mkId("item"),
      name: "Cykel Crescent",
      acquiredAt: "2025-12-20",
      purchasePrice: 6500,
    },
  ];

  // ---- Assemble the full UserData ----------------------------------
  // Every collection is listed explicitly; the closed `UserData` type
  // makes omitting a required field a compile error, so this stays in
  // step with the persisted shape as it grows.
  return {
    version: LATEST_VERSION,
    sheets: [accountsSheet, budgetSheet],
    activeSheetId: budgetSheet.id,
    accounts,
    taxProfiles: [],
    salaries: [],
    employers: [],
    properties: [],
    companies,
    tags,
    categories,
    types,
    subtypes: [],
    items,
    hiddenPresetTypeIds: [],
    presetTypeKindOverrides: {},
    hiddenPresetCategoryIds: [],
    companyCategories: [],
    hiddenPresetCompanyCategoryIds: [],
    transfers,
    history,
    historyImports: {},
    merchantHints: {},
    recurringDismissals: [],
    transferCollapseDismissals: [],
    ignoredItemEntryIds: [],
    itemFindExclusionPatterns: [],
    matchRules: [],
    seriesMatchRules: [],
    renamePatterns: {},
    seriesMetadata: {},
    primaryIncomeMerchants: [],
    settings: { ...DEFAULT_PERSISTED_SETTINGS },
  };
}
