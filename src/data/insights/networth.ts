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
import { loanRemainingBalance, resolveLinkedMortgages } from "../loans/balance";
import { balanceAt } from "../finance/interest";
import { propertyInitialLoanTotal } from "../finance/amortization";
import { isPropertySoldAt, resolveValueHistory } from "../property-value/value";
import { holdingValueAt } from "../investment/holdings";
import { resolveStockPosition } from "../investment/stock";
import { findColumnByType } from "../sheet";
import { isoToMonthNum, monthNumToIsoEnd } from "../../utils/date";

export type NetWorthCategory =
  | "accounts"
  | "savings"
  | "items"
  | "investments"
  | "properties"
  | "mortgages"
  | "loans";

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

export function computeNetWorthSnapshot(
  data: UserData,
  settings: InsightsNetWorthSettings | undefined,
  todayIso: string,
): NetWorthSnapshot {
  const entities: NetWorthEntityFigure[] = [];
  const perCategory: Record<NetWorthCategory, number> = {
    accounts: 0,
    savings: 0,
    items: 0,
    investments: 0,
    properties: 0,
    mortgages: 0,
    loans: 0,
  };

  const pushAsset = (
    category: NetWorthEntityCategory,
    id: string,
    name: string,
    gross: number | undefined,
  ) => {
    const { excluded, sharePct } = resolveOverride(settings, id);
    const effective =
      excluded || gross === undefined ? 0 : gross * (sharePct / 100);
    perCategory[category] += effective;
    entities.push({
      id,
      category,
      name,
      gross: gross ?? null,
      sharePct,
      excluded,
      effective,
    });
  };

  const balances = computeAccountBalances(data, todayIso);
  for (const account of data.accounts) {
    pushAsset("accounts", account.id, account.name, balances.get(account.id));
  }
  for (const saving of data.savings) {
    pushAsset(
      "savings",
      saving.id,
      saving.name,
      savingBalanceAt(saving, todayIso),
    );
  }
  for (const item of data.items) {
    if (!isItemOwned(item)) continue;
    pushAsset(
      "items",
      item.id,
      item.name,
      computeItemCurrentValue(item, todayIso),
    );
  }
  for (const holding of data.investmentHoldings) {
    pushAsset(
      "investments",
      holding.id,
      holding.name,
      holdingNetWorthValue(holding, todayIso),
    );
  }
  for (const position of data.investmentStocks) {
    pushAsset(
      "investments",
      position.id,
      position.name,
      stockNetWorthValue(position, todayIso),
    );
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

  const total =
    perCategory.accounts +
    perCategory.savings +
    perCategory.items +
    perCategory.investments +
    perCategory.properties +
    perCategory.mortgages +
    perCategory.loans;
  return { entities, perCategory, total };
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

  const includedAccountIds = new Set(
    data.accounts.filter((a) => included(a.id)).map((a) => a.id),
  );
  for (const accountId of includedAccountIds) {
    for (const entry of data.history[accountId] ?? []) consider(entry.date);
  }
  for (const tx of data.transfers) {
    if (
      includedAccountIds.has(tx.fromAccountId) ||
      includedAccountIds.has(tx.toAccountId)
    )
      consider(tx.date);
  }
  // Budget rows count toward an account's balance, so a workspace that
  // only plans forward (no imported history) still anchors the window.
  for (const sheet of data.sheets) {
    for (const item of sheet.items) {
      if (item.type !== "accountBudget") continue;
      if (item.accountId === null || !includedAccountIds.has(item.accountId))
        continue;
      const dateCol = findColumnByType(item.columns, "date");
      if (!dateCol) continue;
      for (const row of item.rows) {
        const d = row.cells[dateCol.id];
        if (typeof d === "string") consider(d);
      }
    }
  }
  for (const saving of data.savings) {
    if (!included(saving.id)) continue;
    for (const point of saving.balanceHistory) consider(point.date);
  }
  for (const item of data.items) {
    if (!isItemOwned(item) || !included(item.id)) continue;
    consider(item.acquiredAt);
    // A recorded value snapshot can predate (or stand in for a missing)
    // acquisition date, so the series window starts where the value data
    // does — otherwise an appreciating item's history would be clipped.
    for (const point of item.valueHistory ?? []) consider(point.date);
  }
  for (const holding of data.investmentHoldings) {
    if (!included(holding.id)) continue;
    consider(holding.purchaseDate);
    for (const point of holding.valueHistory) consider(point.date);
  }
  for (const position of data.investmentStocks) {
    if (!included(position.id)) continue;
    for (const tx of position.transactions) consider(tx.date);
    for (const point of position.priceHistory) consider(point.date);
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
  const per: Record<NetWorthCategory, number> = {
    accounts: 0,
    savings: 0,
    items: 0,
    investments: 0,
    properties: 0,
    mortgages: 0,
    loans: 0,
  };
  const balances = computeAccountBalances(data, iso);
  for (const account of data.accounts) {
    const { excluded, sharePct } = resolveOverride(settings, account.id);
    if (excluded) continue;
    per.accounts += (balances.get(account.id) ?? 0) * (sharePct / 100);
  }
  for (const saving of data.savings) {
    const { excluded, sharePct } = resolveOverride(settings, saving.id);
    if (excluded) continue;
    per.savings += (savingBalanceAt(saving, iso) ?? 0) * (sharePct / 100);
  }
  for (const item of data.items) {
    if (!isItemOwned(item)) continue;
    const { excluded, sharePct } = resolveOverride(settings, item.id);
    if (excluded) continue;
    if (item.acquiredAt !== undefined && item.acquiredAt > iso) continue;
    per.items += computeItemCurrentValue(item, iso) * (sharePct / 100);
  }
  for (const holding of data.investmentHoldings) {
    const { excluded, sharePct } = resolveOverride(settings, holding.id);
    if (excluded) continue;
    per.investments +=
      (holdingNetWorthValue(holding, iso) ?? 0) * (sharePct / 100);
  }
  for (const position of data.investmentStocks) {
    const { excluded, sharePct } = resolveOverride(settings, position.id);
    if (excluded) continue;
    per.investments +=
      (stockNetWorthValue(position, iso) ?? 0) * (sharePct / 100);
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
    const total =
      per.accounts +
      per.savings +
      per.items +
      per.investments +
      per.properties +
      per.mortgages +
      per.loans;
    return { x: ms, y: total };
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
