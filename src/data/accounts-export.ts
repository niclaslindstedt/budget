// Build the JSON payload for the Accounts sheet download. Picks
// out the selected accounts (full record) and, when the user opted
// in, the per-account transactions, cross-account transfers, and
// budget-sheet rows bound to one of the selected accounts. The shape
// is a purpose-built export — not a UserData snapshot — so other
// tools can consume the list without dealing with the budget app's
// wider schema.

import { findColumnByType } from "./sheet";
import type {
  Account,
  HistoryEntry,
  HistoryEntrySplit,
  Sheet,
  Transaction,
} from "./types";

export type AccountsExportPayload = {
  exportedAt: string;
  accounts: AccountExportEntry[];
  // Per-account +/- posts (imported bank-statement entries). Keyed
  // by account id so a consumer can group them without re-walking
  // the accounts list.
  transactions?: Record<string, TransactionExportEntry[]>;
  // Cross-account transfers paired by the user. Flat array because
  // each transfer has two endpoints.
  transfers?: TransferExportEntry[];
  // Confirmed budget-sheet rows for AccountBudget items bound to any
  // selected account. Keyed by account id; the inclusion of
  // unconfirmed / future entries is gated by the modal toggles.
  budgetEntries?: Record<string, BudgetEntryExportEntry[]>;
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

// One per-account transaction (an imported bank-statement entry).
// Per the project lingo: a "transaction" is any +/- post on an
// account, a "transfer" is a cross-account move.
export type TransactionExportEntry = {
  id: string;
  date: string;
  description: string;
  amount: number;
  balance?: number;
  importedAt: number;
  isTransfer?: boolean;
  userDescription?: string;
  userTypeId?: string;
  splits?: HistoryEntrySplit[];
};

export type TransferExportEntry = {
  id: string;
  date: string;
  description: string;
  amount: number;
  fromAccountId: string;
  toAccountId: string;
  typeId?: string;
  completed?: boolean;
};

export type BudgetEntryExportEntry = {
  id: string;
  sheetId: string;
  itemId: string;
  date: string;
  description: string;
  amount: number;
  completed?: boolean;
  typeId?: string;
  seriesId?: string;
  isCorrection?: boolean;
  isTransfer?: boolean;
};

export type BuildAccountsExportArgs = {
  accounts: readonly Account[];
  // Cross-account transfers (data.transactions in UserData).
  transfers: readonly Transaction[];
  // Per-account +/- posts (data.history in UserData).
  transactions: Readonly<Record<string, readonly HistoryEntry[]>>;
  // Workspace sheets. The exporter walks AccountBudget items bound
  // to any selected account and emits their rows as budgetEntries.
  sheets: readonly Sheet[];
  selectedAccountIds: ReadonlyArray<string>;
  // Per-account toggles. When `accountInfo[id]` is false, the
  // exported account entry trims out everything but id, name, color,
  // glyph, and opening balance so the downstream consumer just sees
  // the bare account skeleton.
  accountInfo: Readonly<Record<string, boolean>>;
  // Per-account "include transactions for this account" toggle.
  // Gates both the per-account `transactions` map entry and any
  // `transfers` touching the account.
  accountTransactions: Readonly<Record<string, boolean>>;
  // Global gate for the transactions + transfers section. When
  // false, neither list is emitted regardless of per-account flags.
  includeTransactions: boolean;
  // Today's date (ISO YYYY-MM-DD) used to split past vs future
  // budget rows. Injected so callers can override for tests.
  today: string;
  // When true, budget rows with `completed !== true` are included.
  // Default behaviour (false) emits confirmed entries only.
  includeUnconfirmed: boolean;
  // When true, budget rows whose date is strictly after `today` are
  // included. Default (false) keeps the export to past + today.
  includeFuture: boolean;
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

function pickTransaction(entry: HistoryEntry): TransactionExportEntry {
  const out: TransactionExportEntry = {
    id: entry.id,
    date: entry.date,
    description: entry.description,
    amount: entry.amount,
    importedAt: entry.importedAt,
  };
  if (entry.balance !== undefined) out.balance = entry.balance;
  if (entry.isTransfer) out.isTransfer = true;
  if (entry.userDescription) out.userDescription = entry.userDescription;
  if (entry.userTypeId) out.userTypeId = entry.userTypeId;
  if (entry.splits && entry.splits.length > 0) out.splits = entry.splits;
  return out;
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
    // Per-account allowlist: a selected account whose TRANSACTIONS
    // toggle is on. Gates both the per-account history map entry
    // and any transfers touching the account.
    const allowed = new Set<string>();
    for (const id of args.selectedAccountIds) {
      if (args.accountTransactions[id] ?? true) allowed.add(id);
    }

    const transactions: Record<string, TransactionExportEntry[]> = {};
    for (const id of args.selectedAccountIds) {
      if (!allowed.has(id)) continue;
      const entries = args.transactions[id];
      if (!entries || entries.length === 0) continue;
      transactions[id] = entries.map(pickTransaction);
    }
    if (Object.keys(transactions).length > 0)
      payload.transactions = transactions;

    const transfers: TransferExportEntry[] = [];
    for (const tx of args.transfers) {
      if (!allowed.has(tx.fromAccountId) && !allowed.has(tx.toAccountId)) {
        continue;
      }
      const entry: TransferExportEntry = {
        id: tx.id,
        date: tx.date,
        description: tx.description,
        amount: tx.amount,
        fromAccountId: tx.fromAccountId,
        toAccountId: tx.toAccountId,
      };
      if (tx.typeId) entry.typeId = tx.typeId;
      if (tx.completed !== undefined) entry.completed = tx.completed;
      transfers.push(entry);
    }
    if (transfers.length > 0) payload.transfers = transfers;
  }

  // Budget entries — always emitted when a selected account has
  // matching AccountBudget rows. The modal toggles let the user
  // widen the filter to unconfirmed / future, but the default of
  // "confirmed past entries only" still produces useful output.
  const budgetEntries: Record<string, BudgetEntryExportEntry[]> = {};
  for (const sheet of args.sheets) {
    for (const item of sheet.items) {
      if (item.type !== "accountBudget") continue;
      if (!item.accountId || !selected.has(item.accountId)) continue;
      const dateCol = findColumnByType(item.columns, "date");
      const descCol = findColumnByType(item.columns, "description");
      const amountCol = findColumnByType(item.columns, "amount");
      const completedCol = findColumnByType(item.columns, "completed");
      if (!dateCol || !amountCol) continue;
      const bucket = (budgetEntries[item.accountId] ||= []);
      for (const row of item.rows) {
        const date = row.cells[dateCol.id];
        if (typeof date !== "string" || !date) continue;
        if (!args.includeFuture && date > args.today) continue;
        const completedRaw = completedCol
          ? row.cells[completedCol.id]
          : undefined;
        const completed = completedRaw === true;
        if (!args.includeUnconfirmed && !completed) continue;
        const amountRaw = row.cells[amountCol.id];
        const amount = typeof amountRaw === "number" ? amountRaw : 0;
        const descRaw = descCol ? row.cells[descCol.id] : "";
        const description = typeof descRaw === "string" ? descRaw : "";
        const entry: BudgetEntryExportEntry = {
          id: row.id,
          sheetId: sheet.id,
          itemId: item.id,
          date,
          description,
          amount,
        };
        if (completedCol) entry.completed = completed;
        if (row.typeId) entry.typeId = row.typeId;
        if (row.seriesId) entry.seriesId = row.seriesId;
        if (row.isCorrection) entry.isCorrection = true;
        if (row.isTransfer) entry.isTransfer = true;
        bucket.push(entry);
      }
    }
  }
  if (Object.keys(budgetEntries).length > 0) {
    payload.budgetEntries = budgetEntries;
  }

  return payload;
}

export const JSON_MIME_TYPE = "application/json";

export function serializeAccountsExport(
  payload: AccountsExportPayload,
): string {
  return JSON.stringify(payload, null, 2) + "\n";
}
