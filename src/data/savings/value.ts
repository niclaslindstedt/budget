import type {
  Account,
  HistoryEntry,
  Saving,
  SavingBalancePoint,
} from "../types";

// A savings account's current balance — the latest balance point by date.
// Undefined only when no balance has ever been recorded (`balanceHistory`
// empty). Unlike a property there is no synthesised "purchase point": the
// create-account modal records the opening balance as a real first
// `balanceHistory` point, so the history is the single source of truth.
// Mirrors `currentPropertyValue`.
export function currentSavingBalance(saving: Saving): number | undefined {
  let latest: { date: string; value: number } | undefined;
  for (const point of saving.balanceHistory) {
    if (!latest || point.date > latest.date) latest = point;
  }
  return latest?.value;
}

// Fold a savings account's imported bank history into its `balanceHistory`
// so importing a statement seeds the balance-over-time series automatically,
// rather than the user having to re-type each snapshot through "Update
// balance". One point per date — the day's *closing* balance, i.e. the
// running balance carried by the last transaction of that day (same-day
// transactions collapse to that single point). Entries arrive date-sorted
// from `mergeHistory`, so the last entry seen per date is the closing one;
// we sort a shallow copy defensively in case the caller passes an unsorted
// set. Only entries that carry a running `balance` contribute — a
// credit-card-style import with amounts but no balance column leaves the
// history untouched (returns the existing points unchanged).
//
// Manual points on dates the import doesn't cover survive untouched; a date
// the import *does* cover becomes authoritative, so any prior point(s) on
// that date are replaced by the derived one. The id of an existing point on
// a covered date is reused (rather than minted fresh) so re-importing the
// same statement is idempotent and doesn't churn ids the edit / delete modal
// references. `mintId` is injected so the helper stays pure and deterministic
// for tests.
export function applyImportedSavingBalances(
  existing: readonly SavingBalancePoint[],
  entries: readonly HistoryEntry[],
  mintId: () => string,
): SavingBalancePoint[] {
  const byDate = (a: { date: string }, b: { date: string }) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
  const closingByDate = new Map<string, number>();
  for (const e of [...entries].sort(byDate)) {
    if (e.balance === undefined) continue;
    closingByDate.set(e.date, e.balance);
  }
  if (closingByDate.size === 0) return [...existing];

  const existingIdByDate = new Map<string, string>();
  for (const pt of existing) {
    if (!existingIdByDate.has(pt.date)) existingIdByDate.set(pt.date, pt.id);
  }
  const kept = existing.filter((pt) => !closingByDate.has(pt.date));
  const derived: SavingBalancePoint[] = [];
  for (const [date, value] of closingByDate) {
    derived.push({ id: existingIdByDate.get(date) ?? mintId(), date, value });
  }
  return [...kept, ...derived].sort(byDate);
}

// A savings account presented as an `Account` so the cross-account transfer
// surfaces (the transfer log, the collapse modal, the transfer create / edit
// picker) can resolve a saving-id endpoint to a name / glyph / colour and let
// the user transfer to or from it — savings are first-class transfer
// endpoints, sharing the `history` / `transfers` id-space with accounts. Drops
// the savings-only fields (`kind`, `balanceHistory`); every other field is an
// optional `Account` field with the same meaning. Do NOT feed the result into
// the Accounts table or `computeAccountBalances` — savings render on the
// Savings sheet with their own dated balance.
export function savingAsTransferEndpoint(saving: Saving): Account {
  const account: Account = { id: saving.id, name: saving.name };
  if (saving.description !== undefined)
    account.description = saving.description;
  if (saving.glyph !== undefined) account.glyph = saving.glyph;
  if (saving.color !== undefined) account.color = saving.color;
  if (saving.bank !== undefined) account.bank = saving.bank;
  if (saving.clearing !== undefined) account.clearing = saving.clearing;
  if (saving.accountNumber !== undefined)
    account.accountNumber = saving.accountNumber;
  if (saving.currency !== undefined) account.currency = saving.currency;
  return account;
}
