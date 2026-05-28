import { todayIso } from "../../utils/date";
import { findColumnByType } from "../sheet";
import type { UserData } from "../types";

// Sum of the account's budget rows' amounts plus signed transfer
// amounts (outgoing subtract, incoming add), counting only entries
// that have actually taken place — i.e. dated on or before `today`.
// Future-dated budget rows and transfers are projections, not yet
// money in or out of the account, so they're excluded from the
// displayed balance. Undated rows are likewise excluded since we
// don't know when (or whether) they happen. Returns 0 when the
// account has neither past budget rows nor past transfers —
// those accounts are still listed on the Accounts sheet at zero so
// the user can add transfers against them later.
//
// Direct single-account computation: only touches the slices that
// matter for `accountId` (its own history, transfers it's a leg of,
// budget sheets pointing at it). Routing through
// `computeAccountBalances` would walk every other account's history,
// every other sheet's budget rows, and every transfer between two
// unrelated accounts — wasted O(workspace) work when the caller only
// needs one number. For workspaces with K accounts the saved factor
// is K. When computing balances for every account at once, prefer
// `computeAccountBalances` — that path amortises the shared sheet /
// transfer walks across all K accounts in one pass.
export function accountBalance(
  data: UserData,
  accountId: string,
  today: string = todayIso(),
): number {
  const account = data.accounts.find((a) => a.id === accountId);
  if (!account) return 0;
  let total = account.openingBalance ?? 0;

  // History anchor: the latest entry on or before `today` with a
  // stored balance wins. Walks this account's entries once to find
  // it, then a second pass sums amounts strictly after the anchor.
  // Two short passes over one account's history beats one big pass
  // over every account's history when the caller only wants one.
  const history = data.history[accountId] ?? [];
  let anchorDate = "";
  let anchorTotal = 0;
  let anchored = false;
  for (const entry of history) {
    if (entry.date > today) continue;
    if (entry.balance !== undefined && entry.date >= anchorDate) {
      anchorDate = entry.date;
      anchorTotal = entry.balance;
      anchored = true;
    }
  }
  if (anchored) total = anchorTotal;

  for (const entry of history) {
    if (entry.date > today) continue;
    if (anchored && entry.date <= anchorDate) continue;
    total += entry.amount;
  }

  // Only the budget items pointing at this account contribute. Other
  // sheets' rows aren't even visited.
  for (const sheet of data.sheets) {
    for (const item of sheet.items) {
      if (item.type !== "accountBudget") continue;
      if (item.accountId !== accountId) continue;
      const amountCol = findColumnByType(item.columns, "amount");
      const dateCol = findColumnByType(item.columns, "date");
      if (!amountCol || !dateCol) continue;
      for (const row of item.rows) {
        const d = row.cells[dateCol.id];
        if (typeof d !== "string" || d === "" || d > today) continue;
        if (anchored && d <= anchorDate) continue;
        const v = row.cells[amountCol.id];
        if (typeof v === "number") total += v;
      }
    }
  }

  // Only transfers touching this account contribute. Cross-account
  // transfers between two other accounts are skipped entirely.
  for (const tx of data.transfers) {
    if (tx.date > today) continue;
    if (anchored && tx.date <= anchorDate) continue;
    if (tx.fromAccountId === accountId) total -= tx.amount;
    else if (tx.toAccountId === accountId) total += tx.amount;
  }

  return total;
}

// Compute every account's balance in a single pass over the workspace.
// `AccountsPage` calls this once per render instead of invoking
// `accountBalance` per account, which would re-walk the sheet tree,
// the transfer log, and each account's history K times for K accounts.
// With ~10 accounts, ~500 rows, and ~200 transfers, that drops a
// per-render budget from O(K × (R + T + H)) to O(R + T + H).
export function computeAccountBalances(
  data: UserData,
  today: string = todayIso(),
): Map<string, number> {
  const balances = new Map<string, number>();
  // Account ids that actually exist on this workspace. Stale ids
  // lingering in `data.history` / `data.transfers` are ignored so we
  // don't materialise phantom rows.
  for (const account of data.accounts) {
    balances.set(account.id, account.openingBalance ?? 0);
  }

  // Imported bank-statement entries carry the authoritative
  // post-transaction balance. For each account, find the latest entry
  // with a stored balance on or before `today`; that becomes the
  // anchor. Everything dated <= the anchor is replaced by the anchor's
  // balance, only later entries / rows / transfers contribute.
  const anchorDateByAccount = new Map<string, string>();
  for (const accountId of Object.keys(data.history)) {
    if (!balances.has(accountId)) continue;
    const history = data.history[accountId];
    let anchorDate = "";
    let anchorTotal = 0;
    let anchored = false;
    for (const entry of history) {
      if (entry.date > today) continue;
      if (entry.balance !== undefined && entry.date >= anchorDate) {
        anchorDate = entry.date;
        anchorTotal = entry.balance;
        anchored = true;
      }
    }
    if (anchored) {
      balances.set(accountId, anchorTotal);
      anchorDateByAccount.set(accountId, anchorDate);
    }
  }

  // Sum history amounts strictly after the anchor (or all of history
  // when the account has no anchor).
  for (const accountId of Object.keys(data.history)) {
    if (!balances.has(accountId)) continue;
    const anchorDate = anchorDateByAccount.get(accountId);
    let total = balances.get(accountId) ?? 0;
    for (const entry of data.history[accountId]) {
      if (entry.date > today) continue;
      if (anchorDate !== undefined && entry.date <= anchorDate) continue;
      total += entry.amount;
    }
    balances.set(accountId, total);
  }

  // Walk every accountBudget once and distribute each row's amount to
  // the owning account's running total. Previously this loop ran K
  // times (one per `accountBalance` call); collapsing it to a single
  // pass is the biggest win for workspaces with several accounts.
  for (const sheet of data.sheets) {
    for (const item of sheet.items) {
      if (item.type !== "accountBudget") continue;
      const accountId = item.accountId;
      if (accountId === null || !balances.has(accountId)) continue;
      const amountCol = findColumnByType(item.columns, "amount");
      const dateCol = findColumnByType(item.columns, "date");
      if (!amountCol || !dateCol) continue;
      const anchorDate = anchorDateByAccount.get(accountId);
      let total = balances.get(accountId) ?? 0;
      for (const row of item.rows) {
        const d = row.cells[dateCol.id];
        if (typeof d !== "string" || d === "" || d > today) continue;
        if (anchorDate !== undefined && d <= anchorDate) continue;
        const v = row.cells[amountCol.id];
        if (typeof v === "number") total += v;
      }
      balances.set(accountId, total);
    }
  }

  // Walk transfers once, applying the signed delta to both ends.
  for (const tx of data.transfers) {
    if (tx.date > today) continue;
    if (balances.has(tx.fromAccountId)) {
      const anchorDate = anchorDateByAccount.get(tx.fromAccountId);
      if (anchorDate === undefined || tx.date > anchorDate) {
        balances.set(
          tx.fromAccountId,
          (balances.get(tx.fromAccountId) ?? 0) - tx.amount,
        );
      }
    }
    if (balances.has(tx.toAccountId)) {
      const anchorDate = anchorDateByAccount.get(tx.toAccountId);
      if (anchorDate === undefined || tx.date > anchorDate) {
        balances.set(
          tx.toAccountId,
          (balances.get(tx.toAccountId) ?? 0) + tx.amount,
        );
      }
    }
  }

  return balances;
}
