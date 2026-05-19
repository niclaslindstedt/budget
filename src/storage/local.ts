import { DEFAULT_SETTINGS } from "../data/constants";
import { createDefaultSheet } from "../data/sheet";
import type { UserData } from "../data/types";
import { debug } from "../utils/debug";
import { parseUserData } from "./file";

const log = debug("parse");

export function freshUserData(): UserData {
  // Fresh budgets start with no account attached. Accounts are
  // user-created — "an account can be anything you want" — so the
  // app no longer fabricates a "Default" account on first run.
  // Categories and types also start empty here — the runtime layers
  // the built-in `PRESET_CATEGORIES` / `PRESET_ENTRY_TYPES` on top of
  // these arrays, so the user sees a full picker without any seeded
  // data living in their export.
  const sheet = createDefaultSheet("Sheet 1");
  return {
    version: 20,
    sheets: [sheet],
    activeSheetId: sheet.id,
    accounts: [],
    categories: [],
    types: [],
    hiddenPresetTypeIds: [],
    hiddenPresetCategoryIds: [],
    transactions: [],
    history: {},
    historyImports: {},
    merchantHints: {},
    recurringDismissals: [],
    transferCollapseDismissals: [],
    matchRules: [],
    settings: { ...DEFAULT_SETTINGS },
  };
}

// Pure: given the raw stored text (or null), produce a UserData. Falls
// back to a fresh value on any failure so a corrupt entry never traps
// the user. Consumed by both the local adapter and the storage hook so
// every load path shares the same parse / migrate / validate pipeline.
export function readUserDataFromText(raw: string | null): UserData {
  if (!raw) {
    log.log("readUserDataFromText: no bytes — seeding fresh budget");
    return freshUserData();
  }
  const result = parseUserData(raw);
  if (result.ok) {
    log.log(
      `readUserDataFromText: parsed ok (migrated=${result.migrated}) bytes=${raw.length}`,
    );
    return result.data;
  }
  log.error(
    `readUserDataFromText: parse failed — falling back to fresh budget. error=${result.error}`,
  );
  return freshUserData();
}
