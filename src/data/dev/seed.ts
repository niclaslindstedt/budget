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
import { normaliseDescription } from "../description-normaliser";
import { LATEST_VERSION } from "../migrations";
import { mintBudgetRow } from "../budget/rows";
import type {
  Account,
  Category,
  Column,
  Company,
  Employer,
  EntryType,
  HistoryEntry,
  Item,
  MatchRule,
  MerchantHint,
  MortgagePayment,
  PrimaryIncomeMerchant,
  Property,
  RenamePattern,
  Salary,
  SeriesMetadata,
  Sheet,
  Subtype,
  Tag,
  TaxProfile,
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
  // Companies carry preset company-category associations so the
  // Companies settings tab and the company-category analysis surface
  // render a populated link rather than "unclassified" across the board.
  const companyIca: Company = {
    id: mkId("co"),
    name: "ICA Maxi",
    companyCategoryId: "preset-company-cat-grocery",
  };
  const companySpotify: Company = {
    id: mkId("co"),
    name: "Spotify",
    companyCategoryId: "preset-company-cat-entertainment",
  };
  // The mortgage lender, referenced by the seeded property below. Tagged
  // as a bank so the Properties page's lender pill resolves a category.
  const companySbab: Company = {
    id: mkId("co"),
    name: "SBAB",
    companyCategoryId: "preset-company-cat-bank",
  };

  // A third-tier subtype (category → type → subtype) so the seeded
  // MacBook below has a taxonomy anchor and the item editor's subtype
  // picker shows a populated option. Hangs off the Electronics preset
  // type, matching how the credit-card "Elgiganten" rows are classified.
  const laptopSubtype: Subtype = {
    id: mkId("sub"),
    name: "Laptop",
    typeId: "preset-type-electronics",
  };

  const tags: Tag[] = [tagReimbursable, tagVacation];
  const companies: Company[] = [companyIca, companySpotify, companySbab];
  const categories: Category[] = [vacationCategory];
  const types: EntryType[] = [boatFuelType];
  const subtypes: Subtype[] = [laptopSubtype];

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

  // The net salary deposit per fiscal month, captured here so the Salary
  // sheet's records (below) reconcile exactly with the bank rows the
  // "Find salaries" walk would discover.
  const salaryNetByMonth = new Map<string, { date: string; net: number }>();
  // The cabin's mortgage charge per fiscal month, same idea so the
  // Properties page's "Find mortgage payments" walk reconciles against
  // the seeded bank rows.
  const mortgageChargeByMonth = new Map<
    string,
    { date: string; amount: number }
  >();
  // The mortgage charge "Bolån SBAB Värmdö" recurs every month, but the
  // household has classified the months to differing degrees — so "Find
  // mortgage payments" has a charge in every state to surface: fully
  // tagged (Mortgage type + lender company), company-only (no type), and
  // raw (neither). Because the finder keys on the shared description, one
  // tagged month pulls in the untyped / un-companied ones too, so all are
  // found regardless of their own tags. The two earliest months are also
  // reconciled into recorded payments below (the anchor); every later
  // charge is left unrecorded so the walk surfaces it as a candidate.
  const monthKeySet = (
    list: ReadonlyArray<{ year: number; month: number }>,
  ): Set<string> => new Set(list.map(({ year, month }) => `${year}-${month}`));
  const mortgageRecordedMonths = MONTHS.slice(0, 2); // Dec 2025, Jan 2026
  const mortgageTypedKeys = monthKeySet(MONTHS.slice(0, 3)); // + Feb 2026
  const mortgageCompanyKeys = monthKeySet(MONTHS.slice(0, 4)); // + Mar 2026

  for (const { year, month } of MONTHS) {
    // Salary in, rent + utilities out on Checking.
    const salaryDate = iso(year, month, 25);
    const salaryNet = money(32000 + between(-200, 600));
    salaryNetByMonth.set(`${year}-${month}`, {
      date: salaryDate,
      net: salaryNet,
    });
    checkingRaw.push({
      date: salaryDate,
      description: "Lön Agilator AB",
      amount: salaryNet,
      typeId: "preset-type-salary",
    });
    checkingRaw.push({
      date: iso(year, month, 28),
      description: "Hyra Stockholmshem",
      amount: -12400,
      typeId: "preset-type-rent",
    });
    // Mortgage charge for the owned holiday cabin (the household rents
    // its city flat above and owns the cabin below). The type and lender
    // are applied independently per month (see the key sets above) so the
    // seed carries fully tagged, company-only, and raw charges side by
    // side — the finder surfaces all of them via the shared description.
    const mortgageDate = iso(year, month, 27);
    const mortgageAmount = -money(5200 + between(-80, 80));
    const mortgageKey = `${year}-${month}`;
    mortgageChargeByMonth.set(mortgageKey, {
      date: mortgageDate,
      amount: mortgageAmount,
    });
    const mortgageCharge: RawEntry = {
      date: mortgageDate,
      description: "Bolån SBAB Värmdö",
      amount: mortgageAmount,
    };
    if (mortgageTypedKeys.has(mortgageKey))
      mortgageCharge.typeId = "preset-type-mortgage";
    if (mortgageCompanyKeys.has(mortgageKey))
      mortgageCharge.companyId = companySbab.id;
    checkingRaw.push(mortgageCharge);
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

  // A one-off furniture purchase over the item-find threshold (2000) that
  // is never catalogued or linked, so the Items page's "Find items" scan
  // always surfaces at least one candidate.
  checkingRaw.push({
    date: "2026-02-14",
    description: "Mio Möbler soffa",
    amount: -8900,
    typeId: "preset-type-furniture",
  });

  const history: Record<string, HistoryEntry[]> = {
    [checking.id]: finalizeHistory(checkingRaw, 18500, true),
    [savings.id]: finalizeHistory(savingsRaw, 64000, true),
    [credit.id]: finalizeHistory(creditRaw, 0, false),
  };

  // Anchor opening balances so the running totals reconcile (mirrors
  // what the import flow stamps from the earliest statement row).
  checking.openingBalance = 18500;
  savings.openingBalance = 64000;

  // ---- Salary (employers, tax profile, paychecks) -----------------
  // Populates the Salary sheet: one employer with a role, a reusable
  // Swedish tax profile, and one paycheck per month whose `net` matches
  // the Checking salary deposit exactly (and whose `sourceHistoryId`
  // points back at that bank row, so "Find salaries" treats them as
  // already added). `gross` is the brutto the user would have entered —
  // roughly net ÷ 0.76 for a typical Stockholm marginal rate.
  //
  // Two deliberate gaps make the discovery / estimation flows trivially
  // reachable: the earliest month (Dec 2025) is left out entirely so
  // "Find salaries" surfaces it as a candidate, and the two most recent
  // paychecks carry no entered `gross` so the tax-profile net→gross
  // estimation renders next to the explicit-gross rows.
  const developerRole = { id: mkId("role"), title: "Systemutvecklare" };
  const employerAgilator: Employer = {
    id: mkId("emp"),
    name: "Agilator AB",
    color: CATEGORY_COLORS[5],
    glyph: "briefcase",
    roles: [developerRole],
  };
  const employers: Employer[] = [employerAgilator];

  const taxProfile: TaxProfile = {
    id: mkId("tax"),
    name: "Stockholm",
    params: {
      country: "SE",
      municipalityId: "0180",
      churchMember: false,
      birthYear: 1988,
      incomeKind: "employment",
    },
  };
  const taxProfiles: TaxProfile[] = [taxProfile];

  const salaryHistory = history[checking.id];
  const salaryMonths = MONTHS.slice(1); // leave Dec 2025 for "Find salaries"
  const salaries: Salary[] = salaryMonths.map(({ year, month }, i) => {
    const deposit = salaryNetByMonth.get(`${year}-${month}`);
    const net = deposit ? deposit.net : 32000;
    const sourceHist = deposit
      ? salaryHistory.find(
          (e) => e.date === deposit.date && e.amount === deposit.net,
        )
      : undefined;
    const salary: Salary = {
      id: mkId("sal"),
      date: iso(year, month, 25),
      net,
      employerId: employerAgilator.id,
      roleId: developerRole.id,
    };
    // Omit gross on the two most recent paychecks (see note above).
    if (i < salaryMonths.length - 2) salary.gross = money(net / 0.76);
    if (sourceHist) salary.sourceHistoryId = sourceHist.id;
    return salary;
  });

  // ---- Import-learning memory --------------------------------------
  // A few records so the "Merchant memory" settings section, the
  // history match-rule list, and the rename predictor render populated
  // state instead of empty lists.
  const merchantHints: Record<string, MerchantHint> = {
    [normaliseDescription("ICA Maxi")]: {
      typeId: "preset-type-groceries",
      hitCount: 12,
      lastUsedAt: importedAt,
      companyId: companyIca.id,
    },
    [normaliseDescription("Circle K drivmedel")]: {
      typeId: "preset-type-fuel",
      hitCount: 4,
      lastUsedAt: importedAt,
    },
  };

  const matchRules: MatchRule[] = [
    {
      id: mkId("rule"),
      pattern: "*Circle K*",
      description: "Drivmedel",
      typeId: "preset-type-fuel",
      amountSign: "negative",
    },
  ];

  // Per-account rename memory: the bank writes "Restaurang Lunch", the
  // user calls it "Lunch ute". Keyed by normalised description under the
  // credit account (where those rows live).
  const renamePatterns: Record<string, Record<string, RenamePattern>> = {
    [credit.id]: {
      [normaliseDescription("Restaurang Lunch")]: {
        suggestedDescription: "Lunch ute",
        hitCount: 3,
        lastUsedAt: importedAt,
      },
    },
  };

  // The salary bank pattern, so early-arriving paychecks (a payday that
  // lands before the weekend) are shifted into the next fiscal month.
  const primaryIncomeMerchants: PrimaryIncomeMerchant[] = [
    { key: normaliseDescription("Lön Agilator AB"), anchorDayOfMonth: 25 },
  ];

  // ---- Properties (homes + mortgages) ------------------------------
  // One owned holiday cabin (the household rents its city flat — see the
  // "Hyra Stockholmshem" history rows — and owns the cabin here) with a
  // purchase price, a manually-recorded value history, and a single
  // mortgage carrying a rate history, an annual amortisation requirement,
  // and recorded payments. The payments are sourced from the "Bolån SBAB
  // Värmdö" checking history rows: only the two earliest months are
  // recorded here (linked via `sourceHistoryId`) — the fully-tagged anchor.
  // Every later charge is left unrecorded and variously classified
  // (fully tagged, company-only, or raw), so the Properties page's "Find
  // mortgage payments" walk surfaces them all as candidates.
  const mortgageHistory = history[checking.id];
  const recordedMortgageMonths = mortgageRecordedMonths;
  const cabin: Property = {
    id: mkId("prop"),
    name: "Fritidshus Värmdö",
    companyId: companySbab.id,
    accountId: checking.id,
    purchaseAmount: 2950000,
    purchaseDate: "2021-09-01",
    size: 65,
    valueHistory: [
      { id: mkId("pval"), date: "2021-09-01", value: 2950000 },
      { id: mkId("pval"), date: "2024-01-01", value: 3300000 },
      { id: mkId("pval"), date: "2026-05-01", value: 3180000 },
    ],
    mortgages: [
      {
        id: mkId("mort"),
        name: "SBAB bolån",
        loanAmount: 2100000,
        currentBalance: 1840000,
        interestRate: 3.45,
        rateHistory: [
          { id: mkId("rate"), date: "", rate: 1.59 },
          { id: mkId("rate"), date: "2023-03-01", rate: 3.45 },
        ],
        rateChangeMonths: 3,
        nextRateChangeDate: "2026-09-01",
        amortization: { mode: "percent", percent: 2 },
        payments: recordedMortgageMonths.map(({ year, month }) => {
          const charge = mortgageChargeByMonth.get(`${year}-${month}`);
          const sourceHist = charge
            ? mortgageHistory.find(
                (e) => e.date === charge.date && e.amount === charge.amount,
              )
            : undefined;
          const payment: MortgagePayment = {
            id: mkId("mpay"),
            date: charge ? charge.date : iso(year, month, 27),
            amount: charge ? Math.abs(charge.amount) : 5200,
          };
          if (sourceHist) payment.sourceHistoryId = sourceHist.id;
          return payment;
        }),
      },
    ],
  };
  const properties: Property[] = [cabin];

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

  // ---- Items (owned-things catalog) --------------------------------
  // The MacBook is anchored to the Laptop subtype (so it inherits the
  // Electronics type → category) and linked to the budget purchase row
  // below; the bike is left unclassified to exercise both paths.
  const macbookItem: Item = {
    id: mkId("item"),
    name: 'MacBook Pro 14"',
    subtypeId: laptopSubtype.id,
    acquiredAt: "2026-02-10",
    purchasePrice: 24990,
    depreciation: { method: "percentPerYear", ratePerYear: 25 },
  };
  const bikeItem: Item = {
    id: mkId("item"),
    name: "Cykel Crescent",
    acquiredAt: "2025-12-20",
    purchasePrice: 6500,
  };
  const items: Item[] = [macbookItem, bikeItem];

  // ---- Budget sheet bound to Checking ------------------------------
  // Forward-looking recurring rows (salary, rent, subscription, gym)
  // across the six months, each sharing a seriesId so the "edit series"
  // flows have something to chew on.
  const columns = seedColumns(mkId);
  const salarySeries = mkId("series");
  const rentSeries = mkId("series");
  const subSeries = mkId("series");
  const gymSeries = mkId("series");

  // The salary series is the household's primary income; flagging it
  // (with the real payday as the anchor) exercises the fiscal-month-shift
  // pipeline and the per-series toggle in the recurring panel.
  const seriesMetadata: Record<string, SeriesMetadata> = {
    [salarySeries]: { isPrimaryIncome: true, anchorDayOfMonth: 25 },
  };

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

  // A one-off purchase linked to the MacBook item, so the line-item pill
  // and the item ↔ transaction connection render in the seeded data.
  pushRow(
    {
      date: "2026-02-10",
      description: "Elgiganten",
      amount: -24990,
      typeId: "preset-type-electronics",
    },
    { lineItems: [{ id: mkId("link"), itemId: macbookItem.id }] },
  );

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

  const itemsSheet: Sheet = {
    id: mkId("sheet"),
    name: "Items",
    type: "items",
    glyph: "package",
    color: CATEGORY_COLORS[7],
    description: "",
    items: [{ id: mkId("item"), type: "itemsView" }],
  };

  const salarySheet: Sheet = {
    id: mkId("sheet"),
    name: "Salary",
    type: "salary",
    glyph: "banknote",
    color: CATEGORY_COLORS[2],
    description: "Seeded salary history",
    items: [
      {
        id: mkId("item"),
        type: "salaryView",
        accountId: checking.id,
        taxProfileId: taxProfile.id,
      },
    ],
  };

  const propertiesSheet: Sheet = {
    id: mkId("sheet"),
    name: "Properties",
    type: "properties",
    glyph: "home",
    color: CATEGORY_COLORS[10],
    description: "",
    items: [{ id: mkId("item"), type: "propertiesView" }],
  };

  // ---- Assemble the full UserData ----------------------------------
  // Every collection is listed explicitly; the closed `UserData` type
  // makes omitting a required field a compile error, so this stays in
  // step with the persisted shape as it grows.
  return {
    version: LATEST_VERSION,
    sheets: [
      accountsSheet,
      budgetSheet,
      salarySheet,
      itemsSheet,
      propertiesSheet,
    ],
    activeSheetId: budgetSheet.id,
    accounts,
    taxProfiles,
    salaries,
    employers,
    properties,
    companies,
    tags,
    categories,
    types,
    subtypes,
    items,
    hiddenPresetTypeIds: [],
    presetTypeKindOverrides: {},
    hiddenPresetCategoryIds: [],
    companyCategories: [],
    hiddenPresetCompanyCategoryIds: [],
    transfers,
    history,
    historyImports: {},
    merchantHints,
    recurringDismissals: [],
    transferCollapseDismissals: [],
    ignoredItemEntryIds: [],
    itemFindExclusionPatterns: [],
    matchRules,
    seriesMatchRules: [],
    renamePatterns,
    seriesMetadata,
    primaryIncomeMerchants,
    settings: { ...DEFAULT_PERSISTED_SETTINGS },
  };
}
