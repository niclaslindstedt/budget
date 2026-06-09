import type { Account, Saving } from "../types";

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
