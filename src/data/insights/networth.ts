// Pure net-worth math for the Insights sheet. Aggregates every asset and
// liability the workspace tracks — account balances, savings balances,
// owned items' current values, property values, mortgage balances, and
// standalone loan balances — into one snapshot plus a monthly time
// series. No React, no formatting: the page maps the figures to labels
// and currency strings.
//
// Liabilities are counted from two disjoint sources so a mortgage can
// never be double-counted:
//   1. Every property's mortgages directly (`balanceAt`), scaled by the
//      property's ownership share and skipped when the property is
//      excluded. A property co-owned 50/50 contributes half its value
//      AND half its mortgage debt — the user's share of the equity.
//   2. Only loans that resolve no linked mortgages
//      (`resolveLinkedMortgages(...) === null`). A linked `kind:
//      "mortgage"` loan is a live view of property mortgages already
//      counted by source 1, so it contributes nothing here and gets no
//      settings row — its property governs. An unlinked mortgage-kind
//      loan still counts via `loanRemainingBalance`.

import type {
  InsightsNetWorthSettings,
  InvestmentHolding,
  Loan,
  Property,
  Saving,
  StockPosition,
  UserData,
} from "../types";
import { computeAccountBalances } from "../accounts/balance";
import { computeItemCurrentValue, isItemOwned } from "../items/value";
import { computeCarCurrentValue, isCarOwned } from "../cars/value";
import { loanRemainingBalance, resolveLinkedMortgages } from "../loans/balance";
import { balanceAt } from "../finance/interest";
import { propertyInitialLoanTotal } from "../finance/amortization";
import { isPropertySoldAt, resolveValueHistory } from "../property-value/value";
import { holdingValueAt } from "../investment/holdings";
import { resolveStockPosition } from "../investment/stock";
import { findColumnByType } from "../sheet";
import { isoToMonthNum, monthNumToIsoEnd } from "../../utils/date";

const NET_WORTH_CATEGORIES = [
  "accounts",
  "savings",
  "items",
  "investments",
  "cars",
  "properties",
  "mortgages",
  "loans",
] as const;

export type NetWorthCategory = (typeof NET_WORTH_CATEGORIES)[number];

// The entity categories a user can exclude / share-adjust. Mortgages are
// not entities here — they ride with their property (net-equity share).
export type NetWorthEntityCategory = Exclude<NetWorthCategory, "mortgages">;

// One row of the settings modal / breakdown list.
export type NetWorthEntityFigure = {
  id: string;
  category: NetWorthEntityCategory;
  name: string;
  // Current value / balance before the share is applied; null when the
  // source records no figure (renders "—" and contributes 0).
  gross: number | null;
  // For a property: the unscaled sum of its mortgages' outstanding
  // balances, so the modal can show the equity behind the row. Absent
  // for every other category and for a property whose mortgages resolve
  // no balance.
  liabilityGross?: number;
  // Resolved share — 100 when no override.
  sharePct: number;
  excluded: boolean;
  // Signed contribution to the total: share-adjusted, 0 when excluded
  // or unknown; negative for loans; value minus mortgage debt for a
  // property.
  effective: number;
};

export type NetWorthSnapshot = {
  entities: NetWorthEntityFigure[];
  // Share-and-exclusion-adjusted totals; `mortgages` and `loans` are
  // negative (or 0).
  perCategory: Record<NetWorthCategory, number>;
  total: number;
};

type ResolvedOverride = { excluded: boolean; sharePct: number };

function resolveOverride(
  settings: InsightsNetWorthSettings | undefined,
  id: string,
): ResolvedOverride {
  const override = settings?.overrides?.[id];
  return {
    excluded: override?.excluded === true,
    sharePct: override?.sharePct ?? 100,
  };
}

// The latest dated point on or before `iso`, or undefined when none has
// landed yet. Shared by the savings and property walks.
function latestPointAt(
  points: readonly { date: string; value: number }[],
  iso: string,
): number | undefined {
  let latest: { date: string; value: number } | undefined;
  for (const point of points) {
    if (point.date > iso) continue;
    if (!latest || point.date > latest.date) latest = point;
  }
  return latest?.value;
}

function savingBalanceAt(saving: Saving, iso: string): number | undefined {
  return latestPointAt(saving.balanceHistory, iso);
}

// An investment holding's gross market value at `iso`. Net worth counts
// gross (what it's worth), consistent with properties charting market
// value rather than after-sale-tax.
function holdingNetWorthValue(
  holding: InvestmentHolding,
  iso: string,
): number | undefined {
  return holdingValueAt(holding, iso);
}

// A stock position's gross market value at `iso` — share count × the last
// recorded price on or before the date. Undefined when no price is known.
function stockNetWorthValue(
  position: StockPosition,
  iso: string,
): number | undefined {
  return resolveStockPosition(position, iso).value;
}

// A sold property's value resolves to nothing from its sale date — the
// asset became cash (which the account balances already count), so keeping
// it would double-count the proceeds. Before the sale it contributes its
// recorded history, so the series still shows the years it was owned.
function propertyValueAt(property: Property, iso: string): number | undefined {
  if (isPropertySoldAt(property, iso)) return undefined;
  return latestPointAt(resolveValueHistory(property), iso);
}

// Sum of a property's mortgages' outstanding balances at `iso` —
// undefined when no mortgage resolves a balance (no balance and no loan
// amount recorded anywhere). `balanceAt` extrapolates backward without
// bound (it has no notion of when the loan started), so before the
// property's first dated value the debt would show without the asset
// and drag the series deeply negative — clamp the mortgages to enter
// the timeline with the property. A property with no dated value at
// all keeps counting its mortgages (the snapshot must reflect the debt
// even when the user never recorded a value).
// A sold property's mortgages were settled at the sale, so the debt is gone
// from the sale date too — `balanceAt` would otherwise keep extrapolating a
// loan the user no longer carries.
function propertyMortgageBalanceAt(
  property: Property,
  iso: string,
): number | undefined {
  if (isPropertySoldAt(property, iso)) return undefined;
  const valueDates = resolveValueHistory(property);
  if (valueDates.length > 0 && valueDates.every((p) => p.date > iso))
    return undefined;
  let sum: number | undefined;
  const percentBasis = propertyInitialLoanTotal(property.mortgages);
  for (const mortgage of property.mortgages) {
    const balance = balanceAt(mortgage, iso, undefined, percentBasis);
    if (balance !== undefined) sum = (sum ?? 0) + balance;
  }
  return sum;
}

// A standalone loan's balance at `iso`, clamped to its start date —
// `loanRemainingBalance` backdates to the start sum even before the
// loan existed, which would weigh on series samples from before the
// debt was taken.
function loanBalanceAt(loan: Loan, iso: string): number | null {
  if (loan.startDate !== undefined && iso < loan.startDate) return null;
  return loanRemainingBalance(loan, iso);
}

// The loans that contribute their own balance — see the dedupe note at
// the top of the file.
function standaloneLoans(data: UserData): Loan[] {
  return data.loans.filter(
    (loan) => resolveLinkedMortgages(loan, data.properties) === null,
  );
}

function zeroPerCategory(): Record<NetWorthCategory, number> {
  return {
    accounts: 0,
    savings: 0,
    items: 0,
    investments: 0,
    cars: 0,
    properties: 0,
    mortgages: 0,
    loans: 0,
  };
}

function sumPerCategory(per: Record<NetWorthCategory, number>): number {
  let total = 0;
  for (const category of NET_WORTH_CATEGORIES) total += per[category];
  return total;
}

// --- Simple-asset contributors ---------------------------------------
//
// The simple asset kinds share one shape: a collection of named entities,
// each resolving one gross (positive) figure at a date. The registry lets
// the snapshot breakdown, the per-sample series math, and the
// series-window scan iterate one list, so adding an asset kind is one
// entry here instead of three parallel edits. Properties and standalone
// loans stay explicit in the functions below — a property is two-sided
// (value minus its mortgages' debt behind one override) and loans
// contribute negatively after the linked-mortgage dedup; forcing them
// through this shape would hide that math.

type AssetRow = { id: string; name: string; gross: number | undefined };

type AssetContributor = {
  category: NetWorthEntityCategory;
  // One row per countable entity at `iso`, gross before share/exclusion
  // (undefined when the source records no figure — the breakdown renders
  // "—" and the series counts 0).
  rowsAt(data: UserData, iso: string): AssetRow[];
  // Series-sample rows; the series walk falls back to `rowsAt` when
  // absent. Items override this to apply the `acquiredAt` gate the
  // snapshot deliberately skips: the breakdown still lists a
  // future-dated item, the series lets it enter the timeline at its
  // acquisition.
  seriesRowsAt?(data: UserData, iso: string): AssetRow[];
  // Feed every date this kind knows about (on included entities only)
  // into `consider`. Drives the series window.
  collectDates(
    data: UserData,
    isIncluded: (id: string) => boolean,
    consider: (date: string | undefined) => void,
  ): void;
};

const ASSET_CONTRIBUTORS: readonly AssetContributor[] = [
  {
    category: "accounts",
    rowsAt(data, iso) {
      const balances = computeAccountBalances(data, iso);
      return data.accounts.map((account) => ({
        id: account.id,
        name: account.name,
        gross: balances.get(account.id),
      }));
    },
    collectDates(data, isIncluded, consider) {
      const includedAccountIds = new Set(
        data.accounts.filter((a) => isIncluded(a.id)).map((a) => a.id),
      );
      for (const accountId of includedAccountIds) {
        for (const entry of data.history[accountId] ?? []) {
          consider(entry.date);
        }
      }
      for (const tx of data.transfers) {
        if (
          includedAccountIds.has(tx.fromAccountId) ||
          includedAccountIds.has(tx.toAccountId)
        )
          consider(tx.date);
      }
      // Budget rows count toward an account's balance, so a workspace
      // that only plans forward (no imported history) still anchors the
      // window.
      for (const sheet of data.sheets) {
        for (const item of sheet.items) {
          if (item.type !== "accountBudget") continue;
          if (
            item.accountId === null ||
            !includedAccountIds.has(item.accountId)
          )
            continue;
          const dateCol = findColumnByType(item.columns, "date");
          if (!dateCol) continue;
          for (const row of item.rows) {
            const d = row.cells[dateCol.id];
            if (typeof d === "string") consider(d);
          }
        }
      }
    },
  },
  {
    category: "savings",
    rowsAt: (data, iso) =>
      data.savings.map((saving) => ({
        id: saving.id,
        name: saving.name,
        gross: savingBalanceAt(saving, iso),
      })),
    collectDates(data, isIncluded, consider) {
      for (const saving of data.savings) {
        if (!isIncluded(saving.id)) continue;
        for (const point of saving.balanceHistory) consider(point.date);
      }
    },
  },
  {
    category: "items",
    rowsAt: (data, iso) =>
      data.items.filter(isItemOwned).map((item) => ({
        id: item.id,
        name: item.name,
        gross: computeItemCurrentValue(item, iso),
      })),
    seriesRowsAt: (data, iso) =>
      data.items
        .filter(
          (item) =>
            isItemOwned(item) &&
            !(item.acquiredAt !== undefined && item.acquiredAt > iso),
        )
        .map((item) => ({
          id: item.id,
          name: item.name,
          gross: computeItemCurrentValue(item, iso),
        })),
    collectDates(data, isIncluded, consider) {
      for (const item of data.items) {
        if (!isItemOwned(item) || !isIncluded(item.id)) continue;
        consider(item.acquiredAt);
        // A recorded value snapshot can predate (or stand in for a
        // missing) acquisition date, so the series window starts where
        // the value data does — otherwise an appreciating item's history
        // would be clipped.
        for (const point of item.valueHistory ?? []) consider(point.date);
      }
    },
  },
  {
    category: "investments",
    rowsAt: (data, iso) =>
      data.investmentHoldings.map((holding) => ({
        id: holding.id,
        name: holding.name,
        gross: holdingNetWorthValue(holding, iso),
      })),
    collectDates(data, isIncluded, consider) {
      for (const holding of data.investmentHoldings) {
        if (!isIncluded(holding.id)) continue;
        consider(holding.purchaseDate);
        for (const point of holding.valueHistory) consider(point.date);
      }
    },
  },
  {
    category: "investments",
    rowsAt: (data, iso) =>
      data.investmentStocks.map((position) => ({
        id: position.id,
        name: position.name,
        gross: stockNetWorthValue(position, iso),
      })),
    collectDates(data, isIncluded, consider) {
      for (const position of data.investmentStocks) {
        if (!isIncluded(position.id)) continue;
        for (const tx of position.transactions) consider(tx.date);
        for (const point of position.priceHistory) consider(point.date);
      }
    },
  },
  {
    // Cars are single-sided like items: a sold / leased / pool car
    // contributes nothing (`isCarOwned`), and the loan financing a car
    // already counts negatively through the standalone-loans leg, so the
    // equity falls out without two-sided handling here. The car's own
    // `sharePct` (a co-owner outside the budget) scales the GROSS — the
    // user's stake is the figure the breakdown shows — and the insights
    // per-entity override still applies on top like any other row.
    category: "cars",
    rowsAt: (data, iso) =>
      data.cars.filter(isCarOwned).map((car) => {
        const value = computeCarCurrentValue(car, iso);
        return {
          id: car.id,
          name: car.name,
          gross:
            value === undefined
              ? undefined
              : value * ((car.sharePct ?? 100) / 100),
        };
      }),
    seriesRowsAt: (data, iso) =>
      data.cars
        .filter(
          (car) =>
            isCarOwned(car) &&
            !(car.purchaseDate !== undefined && car.purchaseDate > iso),
        )
        .map((car) => {
          const value = computeCarCurrentValue(car, iso);
          return {
            id: car.id,
            name: car.name,
            gross:
              value === undefined
                ? undefined
                : value * ((car.sharePct ?? 100) / 100),
          };
        }),
    collectDates(data, isIncluded, consider) {
      for (const car of data.cars) {
        if (!isCarOwned(car) || !isIncluded(car.id)) continue;
        consider(car.purchaseDate);
        // A recorded snapshot can predate (or stand in for a missing)
        // purchase date, so the series window starts where the value
        // data does — mirrors the items contributor.
        for (const snapshot of car.snapshots) consider(snapshot.date);
      }
    },
  },
];

export function computeNetWorthSnapshot(
  data: UserData,
  settings: InsightsNetWorthSettings | undefined,
  todayIso: string,
): NetWorthSnapshot {
  const entities: NetWorthEntityFigure[] = [];
  const perCategory = zeroPerCategory();

  for (const contributor of ASSET_CONTRIBUTORS) {
    for (const { id, name, gross } of contributor.rowsAt(data, todayIso)) {
      const { excluded, sharePct } = resolveOverride(settings, id);
      const effective =
        excluded || gross === undefined ? 0 : gross * (sharePct / 100);
      perCategory[contributor.category] += effective;
      entities.push({
        id,
        category: contributor.category,
        name,
        gross: gross ?? null,
        sharePct,
        excluded,
        effective,
      });
    }
  }

  for (const property of data.properties) {
    // A property sold by today gets no breakdown row at all — like a
    // disposed item, it is no longer owned capital (the per-date helpers
    // above keep its history alive in the series).
    if (isPropertySoldAt(property, todayIso)) continue;
    const { excluded, sharePct } = resolveOverride(settings, property.id);
    const value = propertyValueAt(property, todayIso);
    const mortgages = propertyMortgageBalanceAt(property, todayIso);
    const share = sharePct / 100;
    const valueEffective = excluded || value === undefined ? 0 : value * share;
    const mortgageEffective =
      excluded || mortgages === undefined ? 0 : mortgages * share;
    perCategory.properties += valueEffective;
    perCategory.mortgages -= mortgageEffective;
    entities.push({
      id: property.id,
      category: "properties",
      name: property.name,
      gross: value ?? null,
      ...(mortgages !== undefined ? { liabilityGross: mortgages } : {}),
      sharePct,
      excluded,
      effective: valueEffective - mortgageEffective,
    });
  }

  for (const loan of standaloneLoans(data)) {
    const { excluded, sharePct } = resolveOverride(settings, loan.id);
    const balance = loanBalanceAt(loan, todayIso);
    const effective =
      excluded || balance === null ? 0 : -balance * (sharePct / 100);
    perCategory.loans += effective;
    entities.push({
      id: loan.id,
      category: "loans",
      name: loan.name,
      gross: balance,
      sharePct,
      excluded,
      effective,
    });
  }

  return { entities, perCategory, total: sumPerCategory(perCategory) };
}

export type NetWorthSeriesPoint = { x: number; y: number };

// One category's contribution sampled over the same monthly window as
// `buildNetWorthSeries`. Liability categories (`mortgages`, `loans`)
// carry negative values, so a stacked chart can diverge them below zero.
export type NetWorthCategorySeries = {
  category: NetWorthCategory;
  points: NetWorthSeriesPoint[];
};

// The earliest date any included entity knows about, considering only
// dates on or before `today`. Drives the series window so the chart
// starts where the data does instead of prepending years of zero.
function earliestRelevantDate(
  data: UserData,
  settings: InsightsNetWorthSettings | undefined,
  today: string,
): string | undefined {
  let earliest: string | undefined;
  const consider = (date: string | undefined) => {
    if (date === undefined || date === "" || date > today) return;
    if (earliest === undefined || date < earliest) earliest = date;
  };
  const included = (id: string) => !resolveOverride(settings, id).excluded;

  for (const contributor of ASSET_CONTRIBUTORS) {
    contributor.collectDates(data, included, consider);
  }
  for (const property of data.properties) {
    if (!included(property.id)) continue;
    for (const point of resolveValueHistory(property)) consider(point.date);
    for (const mortgage of property.mortgages) {
      consider(mortgage.loanStartDate);
      for (const payment of mortgage.payments) consider(payment.date);
    }
  }
  for (const loan of standaloneLoans(data)) {
    if (!included(loan.id)) continue;
    consider(loan.startDate);
    for (const point of loan.balanceHistory) consider(point.date);
    for (const payment of loan.payments) consider(payment.date);
  }
  return earliest;
}

// The monthly sample dates the net-worth series walk over: from the
// earliest relevant date through today, each month at its last day,
// except the current month which samples at `todayIso` — so the last
// point equals `computeNetWorthSnapshot(...).total`. A workspace with no
// dated data collapses to a single point at today.
function seriesSampleDates(
  data: UserData,
  settings: InsightsNetWorthSettings | undefined,
  todayIso: string,
): { iso: string; ms: number }[] {
  const earliest = earliestRelevantDate(data, settings, todayIso);
  const startMonth = isoToMonthNum(earliest ?? todayIso);
  const endMonth = isoToMonthNum(todayIso);
  const dates: { iso: string; ms: number }[] = [];
  for (let month = startMonth; month <= endMonth; month++) {
    const monthEnd = monthNumToIsoEnd(month);
    const iso = monthEnd < todayIso ? monthEnd : todayIso;
    const ms = Date.parse(iso);
    if (Number.isFinite(ms)) dates.push({ iso, ms });
  }
  return dates;
}

// Each category's share-adjusted contribution at one sample date. Mirrors
// `computeNetWorthSnapshot`'s per-category math: properties contribute
// their value only (mortgages are their own category), and the two
// liability categories come back negative. Currently-owned items enter at
// `acquiredAt` (undated items count from the window start); a disposed
// item's historical value isn't reconstructible, so it never appears — a
// documented approximation.
function perCategoryAt(
  data: UserData,
  settings: InsightsNetWorthSettings | undefined,
  loans: Loan[],
  iso: string,
): Record<NetWorthCategory, number> {
  const per = zeroPerCategory();
  for (const contributor of ASSET_CONTRIBUTORS) {
    const rows = (contributor.seriesRowsAt ?? contributor.rowsAt)(data, iso);
    for (const row of rows) {
      const { excluded, sharePct } = resolveOverride(settings, row.id);
      if (excluded) continue;
      per[contributor.category] += (row.gross ?? 0) * (sharePct / 100);
    }
  }
  for (const property of data.properties) {
    const { excluded, sharePct } = resolveOverride(settings, property.id);
    if (excluded) continue;
    const share = sharePct / 100;
    per.properties += (propertyValueAt(property, iso) ?? 0) * share;
    per.mortgages -= (propertyMortgageBalanceAt(property, iso) ?? 0) * share;
  }
  for (const loan of loans) {
    const { excluded, sharePct } = resolveOverride(settings, loan.id);
    if (excluded) continue;
    per.loans -= (loanBalanceAt(loan, iso) ?? 0) * (sharePct / 100);
  }
  return per;
}

// Net worth sampled monthly (see `seriesSampleDates`). Each point is the
// algebraic sum of every category's contribution, so the line's last
// point equals `computeNetWorthSnapshot(...).total`.
export function buildNetWorthSeries(
  data: UserData,
  settings: InsightsNetWorthSettings | undefined,
  todayIso: string,
): NetWorthSeriesPoint[] {
  const loans = standaloneLoans(data);
  return seriesSampleDates(data, settings, todayIso).map(({ iso, ms }) => {
    const per = perCategoryAt(data, settings, loans, iso);
    return { x: ms, y: sumPerCategory(per) };
  });
}

// One series per net-worth category, sampled over the same monthly window
// as `buildNetWorthSeries` and sharing one ascending x array (every
// category has a point at every sample, 0 where it contributes nothing) so
// a stacked chart can tile the bands. Liability categories come back
// negative; the caller stacks them below zero. Returned in `categories`
// order — the page passes assets first, liabilities last.
export function buildNetWorthCategorySeries(
  data: UserData,
  settings: InsightsNetWorthSettings | undefined,
  todayIso: string,
  categories: readonly NetWorthCategory[],
): NetWorthCategorySeries[] {
  const loans = standaloneLoans(data);
  const dates = seriesSampleDates(data, settings, todayIso);
  const samples = dates.map(({ iso, ms }) => ({
    ms,
    per: perCategoryAt(data, settings, loans, iso),
  }));
  return categories.map((category) => ({
    category,
    points: samples.map(({ ms, per }) => ({ x: ms, y: per[category] })),
  }));
}
