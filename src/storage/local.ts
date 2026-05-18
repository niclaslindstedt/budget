import { DEFAULT_SETTINGS } from "../data/constants";
import { createDefaultSheet } from "../data/sheet";
import type { UserData } from "../data/types";
import { parseUserData } from "./file";

export function freshUserData(): UserData {
  // Fresh budgets start with no account attached. Accounts are
  // user-created — "an account can be anything you want" — so the
  // app no longer fabricates a "Default" account on first run.
  const sheet = createDefaultSheet("Sheet 1");
  return {
    version: 13,
    sheets: [sheet],
    activeSheetId: sheet.id,
    accounts: [],
    categories: [],
    transactions: [],
    history: {},
    historyImports: {},
    merchantHints: {},
    recurringDismissals: [],
    transferCollapseDismissals: [],
    settings: { ...DEFAULT_SETTINGS },
  };
}

// Pure: given the raw stored text (or null), produce a UserData. Falls
// back to a fresh value on any failure so a corrupt entry never traps
// the user. Consumed by both the local adapter and the storage hook so
// every load path shares the same parse / migrate / validate pipeline.
export function readUserDataFromText(raw: string | null): UserData {
  if (!raw) return freshUserData();
  const result = parseUserData(raw);
  return result.ok ? result.data : freshUserData();
}
