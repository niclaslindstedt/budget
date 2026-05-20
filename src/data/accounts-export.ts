// Build the JSON payload for the Accounts sheet download. Picks
// out the selected accounts (full record) and, when the user opted
// in, the transactions involving any of them. The shape is a
// purpose-built export — not a UserData snapshot — so other tools
// can consume the list without dealing with the budget app's wider
// schema.

import type { Account, Transaction } from "./types";

export type AccountsExportPayload = {
  exportedAt: string;
  accounts: AccountExportEntry[];
  transactions?: TransactionExportEntry[];
};

export type AccountExportEntry = {
  id: string;
  name: string;
  description?: string;
  bank?: string;
  clearing?: string;
  accountNumber?: string;
  iban?: string;
  bic?: string;
  currency?: string;
  openingBalance?: number;
  color?: string;
  glyph?: string;
};

export type TransactionExportEntry = {
  id: string;
  date: string;
  description: string;
  amount: number;
  fromAccountId: string;
  toAccountId: string;
  typeId?: string;
  completed?: boolean;
};

export type BuildAccountsExportArgs = {
  accounts: readonly Account[];
  transactions: readonly Transaction[];
  selectedAccountIds: ReadonlyArray<string>;
  // Per-account toggles. When `accountInfo[id]` is false, the
  // exported account entry trims out everything but id, name, color,
  // glyph, and opening balance so the downstream consumer just sees
  // the bare account skeleton.
  accountInfo: Readonly<Record<string, boolean>>;
  // When true, the payload also carries the transactions touching
  // any of the selected accounts. `accountInfo` doesn't gate this —
  // a user can include a transaction list even when they don't want
  // the per-account bank details to leak.
  includeTransactions: boolean;
};

function pickAccount(
  account: Account,
  withDetails: boolean,
): AccountExportEntry {
  const base: AccountExportEntry = { id: account.id, name: account.name };
  if (account.color) base.color = account.color;
  if (account.glyph) base.glyph = account.glyph;
  if (account.openingBalance !== undefined)
    base.openingBalance = account.openingBalance;
  if (!withDetails) return base;
  if (account.description) base.description = account.description;
  if (account.bank) base.bank = account.bank;
  if (account.clearing) base.clearing = account.clearing;
  if (account.accountNumber) base.accountNumber = account.accountNumber;
  if (account.iban) base.iban = account.iban;
  if (account.bic) base.bic = account.bic;
  if (account.currency) base.currency = account.currency;
  return base;
}

export function buildAccountsExport(
  args: BuildAccountsExportArgs,
): AccountsExportPayload {
  const selected = new Set(args.selectedAccountIds);
  const accounts: AccountExportEntry[] = [];
  for (const a of args.accounts) {
    if (!selected.has(a.id)) continue;
    accounts.push(pickAccount(a, args.accountInfo[a.id] ?? false));
  }

  const payload: AccountsExportPayload = {
    exportedAt: new Date().toISOString(),
    accounts,
  };

  if (args.includeTransactions) {
    const txs: TransactionExportEntry[] = [];
    for (const tx of args.transactions) {
      if (!selected.has(tx.fromAccountId) && !selected.has(tx.toAccountId)) {
        continue;
      }
      const entry: TransactionExportEntry = {
        id: tx.id,
        date: tx.date,
        description: tx.description,
        amount: tx.amount,
        fromAccountId: tx.fromAccountId,
        toAccountId: tx.toAccountId,
      };
      if (tx.typeId) entry.typeId = tx.typeId;
      if (tx.completed !== undefined) entry.completed = tx.completed;
      txs.push(entry);
    }
    payload.transactions = txs;
  }

  return payload;
}

export const JSON_MIME_TYPE = "application/json";

export function serializeAccountsExport(
  payload: AccountsExportPayload,
): string {
  return JSON.stringify(payload, null, 2) + "\n";
}
