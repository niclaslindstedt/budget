// Developer-only fake-data generator. Produces a complete, valid
// `UserData` populated with ~6 months of believable accounts, bank
// history, transfers, budget rows, and a sprinkle of custom taxonomy —
// so an agent (or the maintainer) debugging the app can land in a
// realistic state instead of an empty budget.
//
// Every name here is INVENTED — fictional banks, lenders, merchants,
// employers, and products. Nothing in this file references a real
// company, product, or person; it ships in an open-source repository,
// so the seed reads like a plausible household without naming anyone.
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
  FileCategory,
  HistoryEntry,
  Item,
  Loan,
  LoanPayment,
  MatchRule,
  MerchantHint,
  MortgagePayment,
  PrimaryIncomeMerchant,
  Property,
  PropertyFile,
  PropertyRepair,
  RenamePattern,
  Salary,
  Saving,
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
  // Two banks back the household's accounts: the everyday accounts sit
  // at one bank, the property accounts at another, so the seed exercises
  // multiple institutions and the mortgage charges below land across two
  // banks. Both bank names are invented.
  const checking: Account = {
    id: mkId("acc"),
    name: "Checking",
    bank: "Fjällbanken",
    clearing: "8327",
    accountNumber: "923 456 789-0",
    glyph: "wallet",
    color: CATEGORY_COLORS[5],
  };
  const savings: Account = {
    id: mkId("acc"),
    name: "Savings",
    bank: "Fjällbanken",
    clearing: "8327",
    accountNumber: "923 456 111-2",
    glyph: "piggy-bank",
    color: CATEGORY_COLORS[12],
  };
  const credit: Account = {
    id: mkId("acc"),
    name: "Credit card",
    bank: "Kortia Bank",
    glyph: "credit-card",
    color: CATEGORY_COLORS[0],
  };
  // Two more accounts at a second (invented) bank, dedicated to the two
  // owned city properties below. The city flat's mortgage is drawn from
  // the first, the villa's from the second, so the three property
  // mortgage charges spread across two banks (cabin → Fjällbanken;
  // flat + villa → Brogata Sparbank). The villa account carries a large
  // buffer because the villa's combined mortgage charge is sizeable.
  const cityAccount: Account = {
    id: mkId("acc"),
    name: "City account",
    bank: "Brogata Sparbank",
    clearing: "9042",
    accountNumber: "551 200 884-1",
    glyph: "building-2",
    color: CATEGORY_COLORS[8],
  };
  const villaAccount: Account = {
    id: mkId("acc"),
    name: "Villa account",
    bank: "Brogata Sparbank",
    clearing: "9042",
    accountNumber: "551 200 991-7",
    glyph: "vault",
    color: CATEGORY_COLORS[3],
  };
  const accounts: Account[] = [
    checking,
    savings,
    credit,
    cityAccount,
    villaAccount,
  ];

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
  const companyGrocery: Company = {
    id: mkId("co"),
    name: "Matboden",
    companyCategoryId: "preset-company-cat-grocery",
  };
  const companyStreaming: Company = {
    id: mkId("co"),
    name: "Ljudström",
    companyCategoryId: "preset-company-cat-entertainment",
  };
  // The three mortgage lenders, one per owned property below. Tagged as
  // banks so the Properties page's lender pill resolves a category, and
  // kept distinct so the lender pill and per-property mortgage list show
  // more than one value. All three names are invented.
  const companyHypotek: Company = {
    id: mkId("co"),
    name: "Hypoteksbolaget",
    companyCategoryId: "preset-company-cat-bank",
  };
  const companyCityLender: Company = {
    id: mkId("co"),
    name: "Bolånekompaniet",
    companyCategoryId: "preset-company-cat-bank",
  };
  const companyVillaLender: Company = {
    id: mkId("co"),
    name: "Fastighetslån AB",
    companyCategoryId: "preset-company-cat-bank",
  };
  // The car-loan lender for the Loans sheet below — distinct from the
  // mortgage lenders so the loan row's company sub-line shows its own name.
  const companyCarLender: Company = {
    id: mkId("co"),
    name: "Fordonskredit AB",
    companyCategoryId: "preset-company-cat-bank",
  };

  // A third-tier subtype (category → type → subtype) so the seeded
  // laptop below has a taxonomy anchor and the item editor's subtype
  // picker shows a populated option. Hangs off the Electronics preset
  // type, matching how the credit-card "Elektronikhuset" rows are
  // classified.
  const laptopSubtype: Subtype = {
    id: mkId("sub"),
    name: "Laptop",
    typeId: "preset-type-electronics",
  };

  const tags: Tag[] = [tagReimbursable, tagVacation];
  const companies: Company[] = [
    companyGrocery,
    companyStreaming,
    companyHypotek,
    companyCityLender,
    companyVillaLender,
    companyCarLender,
  ];
  const categories: Category[] = [vacationCategory];
  const types: EntryType[] = [boatFuelType];
  const subtypes: Subtype[] = [laptopSubtype];

  // ---- Property file categories ------------------------------------
  // Two categories so the Properties settings tab and the file-upload
  // picker both show populated options, and the cabin's sample files
  // (below) land in a subfolder and in the `files/` root respectively.
  const insuranceFileCategory: FileCategory = {
    id: mkId("fcat"),
    name: "Försäkring",
  };
  const manualsFileCategory: FileCategory = {
    id: mkId("fcat"),
    name: "Manualer",
  };
  const fileCategories: FileCategory[] = [
    insuranceFileCategory,
    manualsFileCategory,
  ];

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
  const cityRaw: RawEntry[] = [];
  const villaRaw: RawEntry[] = [];
  // Transactions for the Savings-SHEET buffer account (a `Saving`, distinct
  // from the regular `savings` Account above). Stored but never surfaced on
  // the Savings page — they exist so the buffer participates in cross-account
  // transfer detection.
  const bufferRaw: RawEntry[] = [];

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
  // The two new properties' mortgage charges per fiscal month, tracked so
  // their recorded payments below can link back to the originating bank
  // rows (mirroring how the cabin's anchor payments are linked).
  const cityMortgageByMonth = new Map<
    string,
    { date: string; amount: number }
  >();
  const villaMortgageByMonth = new Map<
    string,
    { date: string; amount: number }
  >();
  // The cabin's mortgage charge recurs every month, but the household has
  // classified the months to differing degrees — so "Find mortgage
  // payments" has a charge in every state to surface: fully tagged
  // (Mortgage type + lender company), company-only (no type), and raw
  // (neither). Because the finder keys on the shared description, one
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
  // The CSN and car-loan charges feeding the Loans sheet below. The CSN
  // loan records the two earliest months as payments (linked to the bank
  // rows) and carries the learned description pattern; the car-loan
  // months are merely typed. Both therefore leave unconsumed candidates
  // for the loan rows' "Import payments" walk.
  const csnChargeByMonth = new Map<string, { date: string; amount: number }>();
  const carChargeByMonth = new Map<string, { date: string; amount: number }>();
  const csnRecordedMonths = MONTHS.slice(0, 2); // Dec 2025, Jan 2026
  const carTypedKeys = monthKeySet(MONTHS.slice(0, 4)); // Dec – Mar

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
      description: "Lön Nordlund Konsult AB",
      amount: salaryNet,
      typeId: "preset-type-salary",
    });
    checkingRaw.push({
      date: iso(year, month, 28),
      description: "Hyra Stadsbostäder",
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
      description: "Bolån Hypoteksbolaget",
      amount: mortgageAmount,
    };
    if (mortgageTypedKeys.has(mortgageKey))
      mortgageCharge.typeId = "preset-type-mortgage";
    if (mortgageCompanyKeys.has(mortgageKey))
      mortgageCharge.companyId = companyHypotek.id;
    checkingRaw.push(mortgageCharge);
    // CSN repayment and car-loan draw on Checking — the loan records on
    // the Loans sheet below reconcile against these rows (see the key
    // sets above for which months are typed / recorded).
    const csnDate = iso(year, month, 26);
    const csnAmount = -1180;
    const csnKey = `${year}-${month}`;
    csnChargeByMonth.set(csnKey, { date: csnDate, amount: csnAmount });
    checkingRaw.push({
      date: csnDate,
      description: "CSN återbetalning",
      amount: csnAmount,
      typeId: "preset-type-csn",
    });
    const carDate = iso(year, month, 12);
    const carAmount = -2450;
    carChargeByMonth.set(csnKey, { date: carDate, amount: carAmount });
    const carCharge: RawEntry = {
      date: carDate,
      description: "Fordonskredit AB autogiro 88231",
      amount: carAmount,
    };
    if (carTypedKeys.has(csnKey)) {
      carCharge.typeId = "preset-type-car-loan";
      carCharge.companyId = companyCarLender.id;
    }
    checkingRaw.push(carCharge);
    checkingRaw.push({
      date: iso(year, month, 4),
      description: "Elnät Kraftbolaget",
      amount: -money(between(700, 1600)),
      typeId: "preset-type-electricity",
    });
    checkingRaw.push({
      date: iso(year, month, 18),
      description: "Ljudström Premium",
      amount: -119,
      typeId: "preset-type-music-streaming",
      companyId: companyStreaming.id,
    });
    // A handful of grocery runs.
    for (let g = 0; g < between(3, 5); g++) {
      checkingRaw.push({
        date: iso(year, month, between(2, 27)),
        description: "Matboden",
        amount: -money(between(180, 1300) + rng()),
        typeId: "preset-type-groceries",
        companyId: companyGrocery.id,
      });
    }
    // A restaurant outing, occasionally reimbursable.
    checkingRaw.push({
      date: iso(year, month, between(5, 26)),
      description: "Restaurang Eken",
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
    // exports (Kortia Bank) carry no per-row balance, so this account
    // exercises the no-balance code path.
    creditRaw.push({
      date: iso(year, month, between(3, 12)),
      description: "Bensin Tanka",
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
        description: "Elektronikhuset",
        amount: -money(between(300, 4000)),
        typeId: "preset-type-electronics",
      });
    }
    creditRaw.push({
      date: iso(year, month, 27),
      description: "Inbetalning kortkonto",
      amount: money(between(900, 5200)),
    });

    // City account (Brogata Sparbank): a second household income, the
    // overnight flat's mortgage charge, and a grocery run. The mortgage
    // charge is fully tagged (lender company + Mortgage type) and linked
    // into the flat's recorded payments below.
    cityRaw.push({
      date: iso(year, month, 25),
      description: "Lön Almvik Design AB",
      amount: money(27000 + between(-300, 500)),
      typeId: "preset-type-salary",
    });
    const cityMortgageDate = iso(year, month, 28);
    const cityMortgageAmount = -money(5400 + between(-120, 180));
    cityMortgageByMonth.set(`${year}-${month}`, {
      date: cityMortgageDate,
      amount: cityMortgageAmount,
    });
    cityRaw.push({
      date: cityMortgageDate,
      description: "Bolån Bolånekompaniet",
      amount: cityMortgageAmount,
      typeId: "preset-type-mortgage",
      companyId: companyCityLender.id,
    });
    cityRaw.push({
      date: iso(year, month, between(6, 22)),
      description: "Närlivs",
      amount: -money(between(150, 900) + rng()),
      typeId: "preset-type-groceries",
    });

    // Villa account (Brogata Sparbank): a monthly funding deposit, the
    // villa's combined mortgage charge (one draw covering all three loans
    // against it), and a running-cost line. The mortgage charge is fully
    // tagged and linked into the villa's recorded payments below.
    villaRaw.push({
      date: iso(year, month, 24),
      description: "Insättning villakonto",
      amount: 60000,
    });
    const villaMortgageDate = iso(year, month, 28);
    const villaMortgageAmount = -money(61500 + between(-600, 600));
    villaMortgageByMonth.set(`${year}-${month}`, {
      date: villaMortgageDate,
      amount: villaMortgageAmount,
    });
    villaRaw.push({
      date: villaMortgageDate,
      description: "Bolån Fastighetslån",
      amount: villaMortgageAmount,
      typeId: "preset-type-mortgage",
      companyId: companyVillaLender.id,
    });
    villaRaw.push({
      date: iso(year, month, between(8, 20)),
      description: "Driftkostnad villa",
      amount: -money(between(2200, 3600)),
      typeId: "preset-type-electricity",
    });
  }

  // A one-off furniture purchase over the item-find threshold (2000) that
  // is never catalogued or linked, so the Items page's "Find items" scan
  // always surfaces at least one candidate.
  checkingRaw.push({
    date: "2026-02-14",
    description: "Möbelhuset soffa",
    amount: -8900,
    typeId: "preset-type-furniture",
  });

  // Three charges tagged Repairs / Renovations on the cabin's account. One
  // (the plumber) is bound to the cabin below as a recorded repair so the
  // wrench view shows a row with a "missing receipt" flag from first paint;
  // the other two stay unconsumed so the "Add repairs / renovations" picker
  // always surfaces candidates without any setup.
  checkingRaw.push({
    date: "2026-01-20",
    description: "Rörmokare Andersson",
    amount: -6800,
    typeId: "preset-type-repairs",
  });
  checkingRaw.push({
    date: "2026-03-10",
    description: "Bauhaus byggvaror",
    amount: -4500,
    typeId: "preset-type-repairs",
  });
  checkingRaw.push({
    date: "2026-04-05",
    description: "Hornbach färg & tapet",
    amount: -3200,
    typeId: "preset-type-renovations",
  });

  // ---- Savings accounts (Savings sheet) ----------------------------
  // Distinct `Saving` entities — money set aside, with a manually-recorded
  // balance history (the current balance is the latest point by date). The
  // buffer also carries imported transactions (`bufferRaw`) so it exercises
  // the fully-wired account↔savings transfer detection: a one-off "Överföring
  // buffert" pair below (a unique 4 250 magnitude so it forms its own
  // candidate) leaves an unconsumed account↔saving transfer to discover.
  const buffer: Saving = {
    id: mkId("sav"),
    kind: "savings",
    name: "Buffertkonto",
    bank: "Fjällbanken",
    clearing: "8327",
    accountNumber: "923 456 222-3",
    description: "Tre månadslöner för oförutsedda utgifter",
    glyph: "umbrella",
    color: CATEGORY_COLORS[9],
    balanceHistory: [
      { id: mkId("svpt"), date: "2026-01-01", value: 90000 },
      { id: mkId("svpt"), date: "2026-05-26", value: 98500 },
    ],
  };
  const vacation: Saving = {
    id: mkId("sav"),
    kind: "savings",
    name: "Resekassa",
    bank: "Fjällbanken",
    clearing: "8327",
    accountNumber: "923 456 333-4",
    description: "Sommarresan",
    glyph: "plane",
    color: CATEGORY_COLORS[6],
    balanceHistory: [
      { id: mkId("svpt"), date: "2026-03-01", value: 12000 },
      { id: mkId("svpt"), date: "2026-05-01", value: 18000 },
    ],
  };
  const savingsAccounts: Saving[] = [buffer, vacation];

  // The mirror pair: money leaves Checking and lands in the buffer on the
  // same day, a unique magnitude so the detector pairs exactly these two.
  checkingRaw.push({
    date: "2026-05-26",
    description: "Överföring buffertkonto",
    amount: -4250,
  });
  bufferRaw.push({
    date: "2026-05-26",
    description: "Insättning buffert från lönekonto",
    amount: 4250,
  });

  const history: Record<string, HistoryEntry[]> = {
    [checking.id]: finalizeHistory(checkingRaw, 18500, true),
    [savings.id]: finalizeHistory(savingsRaw, 64000, true),
    [credit.id]: finalizeHistory(creditRaw, 0, false),
    [cityAccount.id]: finalizeHistory(cityRaw, 85000, true),
    [villaAccount.id]: finalizeHistory(villaRaw, 920000, true),
    [buffer.id]: finalizeHistory(bufferRaw, 94250, true),
  };

  // Anchor opening balances so the running totals reconcile (mirrors
  // what the import flow stamps from the earliest statement row).
  checking.openingBalance = 18500;
  savings.openingBalance = 64000;
  cityAccount.openingBalance = 85000;
  villaAccount.openingBalance = 920000;

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
  const employerPrimary: Employer = {
    id: mkId("emp"),
    name: "Nordlund Konsult AB",
    color: CATEGORY_COLORS[5],
    glyph: "briefcase",
    roles: [developerRole],
  };
  const employers: Employer[] = [employerPrimary];

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
      employerId: employerPrimary.id,
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
    [normaliseDescription("Matboden")]: {
      typeId: "preset-type-groceries",
      hitCount: 12,
      lastUsedAt: importedAt,
      companyId: companyGrocery.id,
    },
    [normaliseDescription("Bensin Tanka")]: {
      typeId: "preset-type-fuel",
      hitCount: 4,
      lastUsedAt: importedAt,
    },
  };

  const matchRules: MatchRule[] = [
    {
      id: mkId("rule"),
      pattern: "*Tanka*",
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
    {
      key: normaliseDescription("Lön Nordlund Konsult AB"),
      anchorDayOfMonth: 25,
    },
  ];

  // ---- Properties (homes + mortgages) ------------------------------
  // Three owned homes so the Properties page shows a spread of
  // loan-to-value ratios and a multi-mortgage card:
  //
  // - a holiday cabin with one mortgage at ~60% of its value, whose
  //   payments are sourced from the "Bolån Hypoteksbolaget" Checking
  //   rows. Only the two earliest months are recorded here (linked via
  //   `sourceHistoryId`) — the fully-tagged anchor. Every later charge is
  //   left unrecorded and variously classified (fully tagged,
  //   company-only, or raw), so the Properties page's "Find mortgage
  //   payments" walk surfaces them all as candidates.
  // - a small overnight city flat with one mortgage at ~35% of its
  //   value, paid from the City account.
  // - a large villa carrying three mortgages, paid from the Villa account
  //   as one combined monthly charge (recorded against the first loan,
  //   the way a single autogiro draw covering every loan would read).
  //
  // The cabin's charges live on Checking and the other two on the Brogata
  // accounts, so the three properties' mortgage charges land across two
  // banks.
  const cabinHistory = history[checking.id];
  const recordedMortgageMonths = mortgageRecordedMonths;
  // The plumber charge tagged Repairs (above), bound to the cabin so the
  // wrench view opens onto a real repair — its source entry carries no
  // receipt, so it surfaces the "missing receipt" flag from first paint.
  const cabinRepairSource = cabinHistory.find(
    (e) => e.description === "Rörmokare Andersson",
  );
  const cabinRepairs: PropertyRepair[] = cabinRepairSource
    ? [
        {
          id: mkId("repair"),
          date: cabinRepairSource.date,
          amount: Math.abs(cabinRepairSource.amount),
          description: cabinRepairSource.description,
          typeId: "preset-type-repairs",
          accountId: checking.id,
          sourceHistoryId: cabinRepairSource.id,
        },
      ]
    : [];
  // Two uploaded files on the cabin so the Files manager opens onto real
  // rows — one filed under the "Försäkring" category (a subfolder) carrying
  // a tag, one in the `files/` root with no category. The bytes don't exist
  // in the in-memory dev backend, so opening one shows a load error; the rows,
  // metadata, and the category subfolder layout are what the seed surfaces.
  const cabinFiles: PropertyFile[] = [
    {
      id: mkId("pfile"),
      path: "Fritidshuset/files/Försäkring/hemförsäkring-2026.pdf",
      description: "Hemförsäkring 2026",
      categoryId: insuranceFileCategory.id,
      tagIds: [tagReimbursable.id],
    },
    {
      id: mkId("pfile"),
      path: "Fritidshuset/files/altan-före.jpg",
      description: "Altanen före renovering",
    },
  ];
  const cabin: Property = {
    id: mkId("prop"),
    name: "Fritidshuset",
    companyId: companyHypotek.id,
    accountId: checking.id,
    purchaseAmount: 2950000,
    purchaseDate: "2021-09-01",
    size: 65,
    rooms: 2,
    // The purchase (2,950,000 on 2021-09-01) is the property's first value —
    // synthesised from purchaseAmount/purchaseDate, so it isn't stored here.
    valueHistory: [
      { id: mkId("pval"), date: "2024-01-01", value: 3300000 },
      { id: mkId("pval"), date: "2026-05-01", value: 3180000 },
    ],
    mortgages: [
      {
        id: mkId("mort"),
        name: "Hypoteksbolaget bolån",
        loanAmount: 2100000,
        // ~60% of the cabin's current value (3,180,000) — see the two
        // sibling properties below, which sit at 35% and (across three
        // loans) ~60% so the page shows a spread of loan-to-value ratios.
        currentBalance: 1908000,
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
            ? cabinHistory.find(
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
    repairs: cabinRepairs,
    files: cabinFiles,
  };

  // A small overnight flat in the city, kept for weeknights close to
  // work. A single mortgage sized to ~35% of its current value
  // (3,650,000 × 0.35 ≈ 1,277,500) so the page carries a low-leverage
  // property next to the cabin. Every month's charge on the City account
  // is recorded as a payment, linked to the originating bank row.
  const cityHistory = history[cityAccount.id];
  const apartment: Property = {
    id: mkId("prop"),
    name: "Övernattningslägenheten",
    companyId: companyCityLender.id,
    accountId: cityAccount.id,
    purchaseAmount: 3200000,
    purchaseDate: "2022-05-15",
    size: 42,
    rooms: 1.5,
    // A bostadsrätt, so it carries a monthly fee to the housing
    // association on top of the mortgage.
    fee: 2850,
    // Purchase (3,200,000 on 2022-05-15) is synthesised as the first value.
    valueHistory: [{ id: mkId("pval"), date: "2026-05-01", value: 3650000 }],
    mortgages: [
      {
        id: mkId("mort"),
        name: "Bolånekompaniet bolån",
        loanAmount: 1400000,
        currentBalance: 1277500,
        interestRate: 4.05,
        rateHistory: [
          { id: mkId("rate"), date: "", rate: 1.79 },
          { id: mkId("rate"), date: "2023-05-01", rate: 4.05 },
        ],
        rateChangeMonths: 24,
        nextRateChangeDate: "2027-05-01",
        amortization: { mode: "percent", percent: 1 },
        payments: MONTHS.map(({ year, month }) => {
          const charge = cityMortgageByMonth.get(`${year}-${month}`);
          const sourceHist = charge
            ? cityHistory.find(
                (e) => e.date === charge.date && e.amount === charge.amount,
              )
            : undefined;
          const payment: MortgagePayment = {
            id: mkId("mpay"),
            date: charge ? charge.date : iso(year, month, 28),
            amount: charge ? Math.abs(charge.amount) : 5400,
          };
          if (sourceHist) payment.sourceHistoryId = sourceHist.id;
          return payment;
        }),
      },
    ],
    repairs: [],
    files: [],
  };

  // A big house carrying three loans — a first mortgage, a second
  // mortgage, and a top-up — so the Properties page renders a
  // multi-mortgage card. The terms deliberately vary across the three
  // (percent vs fixed amortisation, a long vs short vs empty rate
  // history, with and without a next-reset date) to exercise every
  // branch of the mortgage row. Outstanding balances sum to ~60% of the
  // current value (19,200,000): 6,400,000 + 3,250,000 + 1,870,000 =
  // 11,520,000. The property is paid as one combined charge from the
  // Villa account; that single draw is recorded against the first loan.
  const villaHistory = history[villaAccount.id];
  const villa: Property = {
    id: mkId("prop"),
    name: "Villa Ekbacken",
    companyId: companyVillaLender.id,
    accountId: villaAccount.id,
    purchaseAmount: 14500000,
    purchaseDate: "2019-06-01",
    size: 285,
    rooms: 8,
    // Purchase (14,500,000 on 2019-06-01) is synthesised as the first value.
    valueHistory: [
      { id: mkId("pval"), date: "2023-01-01", value: 17800000 },
      { id: mkId("pval"), date: "2026-05-01", value: 19200000 },
    ],
    mortgages: [
      {
        id: mkId("mort"),
        name: "Fastighetslån bolån 1",
        loanAmount: 7000000,
        currentBalance: 6400000,
        interestRate: 3.79,
        rateHistory: [
          { id: mkId("rate"), date: "", rate: 1.95 },
          { id: mkId("rate"), date: "2022-09-01", rate: 3.12 },
          { id: mkId("rate"), date: "2024-03-01", rate: 3.79 },
        ],
        rateChangeMonths: 12,
        nextRateChangeDate: "2026-09-01",
        amortization: { mode: "percent", percent: 2 },
        payments: MONTHS.map(({ year, month }) => {
          const charge = villaMortgageByMonth.get(`${year}-${month}`);
          const sourceHist = charge
            ? villaHistory.find(
                (e) => e.date === charge.date && e.amount === charge.amount,
              )
            : undefined;
          const payment: MortgagePayment = {
            id: mkId("mpay"),
            date: charge ? charge.date : iso(year, month, 28),
            amount: charge ? Math.abs(charge.amount) : 61500,
          };
          if (sourceHist) payment.sourceHistoryId = sourceHist.id;
          return payment;
        }),
      },
      {
        id: mkId("mort"),
        name: "Fastighetslån bolån 2",
        loanAmount: 3500000,
        currentBalance: 3250000,
        interestRate: 4.2,
        rateChangeMonths: 3,
        nextRateChangeDate: "2026-08-01",
        amortization: { mode: "fixed", amount: 5000 },
        payments: [],
      },
      {
        id: mkId("mort"),
        name: "Fastighetslån topplån",
        loanAmount: 2000000,
        currentBalance: 1870000,
        interestRate: 5.45,
        amortization: { mode: "percent", percent: 3 },
        payments: [],
      },
    ],
    repairs: [],
    files: [],
  };
  const properties: Property[] = [cabin, apartment, villa];

  // ---- Loans (rendered by the Loans sheet) --------------------------
  // One loan per flavour worth exercising: a CSN student loan with
  // recorded payments and a learned payment pattern (so the auto-attach
  // path and the Import payments dedupe both have data), a car loan whose
  // typed bank charges are all still unconsumed candidates, and a
  // mortgage loan LINKED to the city flat's mortgage (terms and payments
  // resolve live from the property — nothing is copied here).
  const csnLoan: Loan = {
    id: mkId("loan"),
    name: "CSN",
    kind: "student",
    startDate: "2019-01-25",
    // Student loans have no start sum — the recorded snapshot anchors
    // the derived balance, dated so every payment amortises from it.
    balanceHistory: [{ id: mkId("lbal"), date: "2019-01-25", value: 188000 }],
    payments: csnRecordedMonths.map(({ year, month }) => {
      const charge = csnChargeByMonth.get(`${year}-${month}`);
      const sourceHist = charge
        ? cabinHistory.find(
            (e) => e.date === charge.date && e.amount === charge.amount,
          )
        : undefined;
      const payment: LoanPayment = {
        id: mkId("lpay"),
        date: charge ? charge.date : iso(year, month, 26),
        amount: charge ? Math.abs(charge.amount) : 1180,
      };
      if (sourceHist) payment.sourceHistoryId = sourceHist.id;
      return payment;
    }),
    paymentPatterns: [normaliseDescription("CSN återbetalning")],
  };
  const carLoan: Loan = {
    id: mkId("loan"),
    name: "Billån Kombin",
    kind: "car",
    companyId: companyCarLender.id,
    startDate: "2024-08-12",
    startSum: 145000,
    rate: 5.95,
    startFee: 595,
    // The start sum (plus financed fee) is the implicit opening anchor;
    // the recent snapshot re-syncs the derived balance so the loan's
    // unconsumed payment candidates amortise from there once imported.
    balanceHistory: [{ id: mkId("lbal"), date: "2025-11-30", value: 122400 }],
    payments: [],
  };
  const linkedMortgageLoan: Loan = {
    id: mkId("loan"),
    name: "Bolån lägenheten",
    kind: "mortgage",
    propertyId: apartment.id,
    mortgageIds: [apartment.mortgages[0].id],
    payments: [],
    balanceHistory: [],
  };
  // The villa carries three mortgages drawn as ONE combined charge, so
  // this loan links all three and the Loans sheet lists them as a single
  // row with aggregated figures — the multi-link case.
  const villaMortgageLoan: Loan = {
    id: mkId("loan"),
    name: "Bolån villan",
    kind: "mortgage",
    propertyId: villa.id,
    mortgageIds: villa.mortgages.map((m) => m.id),
    payments: [],
    balanceHistory: [],
  };
  const loans: Loan[] = [
    csnLoan,
    carLoan,
    linkedMortgageLoan,
    villaMortgageLoan,
  ];

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
  // The laptop is anchored to the Laptop subtype (so it inherits the
  // Electronics type → category) and linked to the budget purchase row
  // below; the bike is left unclassified to exercise both paths. The
  // laptop's lifetime makes the spending dashboard's "spread item
  // costs" cogwheel option reachable from the seed.
  const laptopItem: Item = {
    id: mkId("item"),
    name: 'Bärbar dator 14"',
    subtypeId: laptopSubtype.id,
    acquiredAt: "2026-02-10",
    purchasePrice: 24990,
    depreciation: { method: "percentPerYear", ratePerYear: 25 },
    lifetimeYears: 4,
  };
  const bikeItem: Item = {
    id: mkId("item"),
    name: "Cykel Norrsken",
    acquiredAt: "2025-12-20",
    purchasePrice: 6500,
  };
  const items: Item[] = [laptopItem, bikeItem];

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
        description: "Ljudström",
        amount: -119,
        typeId: "preset-type-music-streaming",
        companyId: companyStreaming.id,
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

  // A one-off purchase linked to the laptop item, so the line-item pill
  // and the item ↔ transaction connection render in the seeded data.
  pushRow(
    {
      date: "2026-02-10",
      description: "Elektronikhuset",
      amount: -24990,
      typeId: "preset-type-electronics",
    },
    { lineItems: [{ id: mkId("link"), itemId: laptopItem.id }] },
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

  const savingsSheet: Sheet = {
    id: mkId("sheet"),
    name: "Savings",
    type: "savings",
    glyph: "coins",
    color: CATEGORY_COLORS[9],
    description: "",
    items: [{ id: mkId("item"), type: "savingsView" }],
  };

  const loansSheet: Sheet = {
    id: mkId("sheet"),
    name: "Loans",
    type: "loans",
    glyph: "hand-coins",
    color: CATEGORY_COLORS[0],
    description: "",
    items: [{ id: mkId("item"), type: "loansView" }],
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
      savingsSheet,
      loansSheet,
    ],
    activeSheetId: budgetSheet.id,
    accounts,
    taxProfiles,
    salaries,
    employers,
    properties,
    savings: savingsAccounts,
    loans,
    fileCategories,
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
