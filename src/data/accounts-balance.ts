import { todayIso } from "../utils/date";
import { findColumnByType } from "./sheet";
import type { UserData } from "./types";

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
export function accountBalance(
  data: UserData,
  accountId: string,
  today: string = todayIso(),
): number {
  // Imported bank-statement entries carry the authoritative
  // post-transaction balance, so anchor on the latest such entry
  // dated on or before `today` and only sum items that happen after
  // it. Falling back to `openingBalance + Σ amounts` for accounts
  // that have never been seeded from history keeps the old
  // zero-anchored behaviour for free.
  const account = data.accounts.find((a) => a.id === accountId);
  const history = data.history[accountId] ?? [];
  let anchorDate = "";
  let total = account?.openingBalance ?? 0;
  let anchored = false;
  for (const entry of history) {
    if (entry.date > today) continue;
    if (entry.balance !== undefined && entry.date >= anchorDate) {
      anchorDate = entry.date;
      total = entry.balance;
      anchored = true;
    }
  }
  for (const entry of history) {
    if (entry.date > today) continue;
    if (anchored && entry.date <= anchorDate) continue;
    total += entry.amount;
  }
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
  for (const tx of data.transfers) {
    if (tx.date > today) continue;
    if (anchored && tx.date <= anchorDate) continue;
    if (tx.fromAccountId === accountId) total -= tx.amount;
    if (tx.toAccountId === accountId) total += tx.amount;
  }
  return total;
}
