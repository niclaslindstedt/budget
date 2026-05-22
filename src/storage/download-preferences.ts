import { nsKey } from "../data/constants";
import { readRawStorage, writeRawStorage } from "./local-adapter";

// Per-device download-modal defaults. Kept out of `UserData` on
// purpose: the choice is device-local UX state — a user who downloads
// XLSX on their desktop is probably happy with the same default
// there, while the same user on mobile might prefer JSON. Settings
// don't need to roundtrip through the encrypted export either.

export type BudgetDownloadFormat = "csv" | "xlsx";

export type BudgetDownloadPrefs = {
  format: BudgetDownloadFormat;
  includeHistory: boolean;
};

export type AccountsDownloadPrefs = {
  // Per-account "include account info" toggles, keyed by account id.
  // Missing keys default to `true` so a fresh account inherits the
  // sensible default.
  accountInfo: Record<string, boolean>;
  // Per-account "include transactions for this account" toggles.
  // Mirrors `accountInfo` — default true. The exporter ANDs this
  // against `includeTransactions` so the top-level toggle still gates
  // the whole transactions list.
  accountTransactions: Record<string, boolean>;
  // Per-account "include this account at all" toggles. Default true.
  accountSelected: Record<string, boolean>;
  includeTransactions: boolean;
  // Widen the budget-entries filter to include unconfirmed rows.
  // Default off — the export is "confirmed past entries only" unless
  // the user explicitly opts in.
  includeUnconfirmed: boolean;
  // Widen the budget-entries filter to include future-dated rows.
  // Default off.
  includeFutureEntries: boolean;
};

const BUDGET_PREFIX = "budget.download.budget.";
const ACCOUNTS_PREFIX = "budget.download.accounts.";

function budgetKey(userId: string): string {
  return nsKey(`${BUDGET_PREFIX}${userId}`);
}

function accountsKey(userId: string): string {
  return nsKey(`${ACCOUNTS_PREFIX}${userId}`);
}

const DEFAULT_BUDGET: BudgetDownloadPrefs = {
  format: "csv",
  includeHistory: true,
};

const DEFAULT_ACCOUNTS: AccountsDownloadPrefs = {
  accountInfo: {},
  accountTransactions: {},
  accountSelected: {},
  includeTransactions: true,
  includeUnconfirmed: false,
  includeFutureEntries: false,
};

export function getBudgetDownloadPrefs(userId: string): BudgetDownloadPrefs {
  const raw = readRawStorage(budgetKey(userId));
  if (!raw) return { ...DEFAULT_BUDGET };
  try {
    const parsed = JSON.parse(raw) as Partial<BudgetDownloadPrefs>;
    return {
      format: parsed.format === "xlsx" ? "xlsx" : "csv",
      includeHistory:
        typeof parsed.includeHistory === "boolean"
          ? parsed.includeHistory
          : DEFAULT_BUDGET.includeHistory,
    };
  } catch {
    return { ...DEFAULT_BUDGET };
  }
}

export function setBudgetDownloadPrefs(
  userId: string,
  prefs: BudgetDownloadPrefs,
): void {
  writeRawStorage(JSON.stringify(prefs), budgetKey(userId));
}

export function getAccountsDownloadPrefs(
  userId: string,
): AccountsDownloadPrefs {
  const raw = readRawStorage(accountsKey(userId));
  if (!raw) return cloneAccountsPrefs(DEFAULT_ACCOUNTS);
  try {
    const parsed = JSON.parse(raw) as Partial<AccountsDownloadPrefs>;
    return {
      accountInfo: toBoolRecord(parsed.accountInfo),
      accountTransactions: toBoolRecord(parsed.accountTransactions),
      accountSelected: toBoolRecord(parsed.accountSelected),
      includeTransactions:
        typeof parsed.includeTransactions === "boolean"
          ? parsed.includeTransactions
          : DEFAULT_ACCOUNTS.includeTransactions,
      includeUnconfirmed:
        typeof parsed.includeUnconfirmed === "boolean"
          ? parsed.includeUnconfirmed
          : DEFAULT_ACCOUNTS.includeUnconfirmed,
      includeFutureEntries:
        typeof parsed.includeFutureEntries === "boolean"
          ? parsed.includeFutureEntries
          : DEFAULT_ACCOUNTS.includeFutureEntries,
    };
  } catch {
    return cloneAccountsPrefs(DEFAULT_ACCOUNTS);
  }
}

export function setAccountsDownloadPrefs(
  userId: string,
  prefs: AccountsDownloadPrefs,
): void {
  writeRawStorage(JSON.stringify(prefs), accountsKey(userId));
}

function toBoolRecord(value: unknown): Record<string, boolean> {
  if (!value || typeof value !== "object") return {};
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === "boolean") out[k] = v;
  }
  return out;
}

function cloneAccountsPrefs(p: AccountsDownloadPrefs): AccountsDownloadPrefs {
  return {
    accountInfo: { ...p.accountInfo },
    accountTransactions: { ...p.accountTransactions },
    accountSelected: { ...p.accountSelected },
    includeTransactions: p.includeTransactions,
    includeUnconfirmed: p.includeUnconfirmed,
    includeFutureEntries: p.includeFutureEntries,
  };
}
