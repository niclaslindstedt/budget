import { DEFAULT_PERSISTED_SETTINGS } from "../data/constants";
import type { MigrationContext } from "../data/migrations";
import { createDefaultSheet } from "../data/sheet";
import type { UserData } from "../data/types";
import { detectInitialCurrency, detectInitialLanguage } from "../i18n/locale";
import { createLogger } from "../utils/logger";
import { parseUserData } from "./file";

const log = createLogger("parse");

export function freshUserData(): UserData {
  // Fresh budgets start with no account attached. Accounts are
  // user-created — "an account can be anything you want" — so the
  // app no longer fabricates a "Default" account on first run.
  // Categories and types also start empty here — the runtime layers
  // the built-in `PRESET_CATEGORIES` / `PRESET_ENTRY_TYPES` on top of
  // these arrays, so the user sees a full picker without any seeded
  // data living in their export.
  const sheet = createDefaultSheet("Budget");
  return {
    version: 35,
    sheets: [sheet],
    activeSheetId: sheet.id,
    accounts: [],
    categories: [],
    types: [],
    hiddenPresetTypeIds: [],
    presetTypeKindOverrides: {},
    hiddenPresetCategoryIds: [],
    transactions: [],
    history: {},
    historyImports: {},
    merchantHints: {},
    recurringDismissals: [],
    transferCollapseDismissals: [],
    matchRules: [],
    seriesMatchRules: [],
    // Auto-detect language and currency from the browser only for
    // genuinely new installs. Existing buckets keep whatever they had
    // (the v26 → v27 migration pinned language to "en"; currency is
    // never touched by a migration) so a returning user's UI doesn't
    // flip when they upgrade. `currency`, `currencyPosition`, and
    // `currencySpace` are common-scope so they land at the top level
    // of the persisted shape; the device buckets stay at defaults.
    settings: {
      ...DEFAULT_PERSISTED_SETTINGS,
      ...detectInitialCurrency(),
      language: detectInitialLanguage(),
    },
  };
}

// Pure: given the raw stored text (or null), produce a UserData. Falls
// back to a fresh value on any failure so a corrupt entry never traps
// the user. Consumed by both the local adapter and the storage hook so
// every load path shares the same parse / migrate / validate pipeline.
// The optional `ctx` is forwarded to the migration chain (the v34 →
// v35 step uses `ctx.userId` to absorb per-user values from
// device-local localStorage).
export function readUserDataFromText(
  raw: string | null,
  ctx: MigrationContext = {},
): UserData {
  return tryReadUserDataFromText(raw, ctx).data;
}

export type ReadUserDataResult =
  | { data: UserData; status: "fresh" }
  | { data: UserData; status: "parsed"; migrated: boolean }
  | { data: UserData; status: "parse-failed"; error: string };

// Variant that tells the caller whether the bytes parsed cleanly,
// whether they were absent (fresh seed), or whether they were
// non-empty but rejected by the validator. The storage hook uses
// the `parse-failed` signal to refuse to autosave the fresh fallback
// over the user's real cloud data — a parse failure on bytes that
// *did* come back from the adapter means the file on disk is real,
// just unreadable by this build, and silently overwriting it with
// `freshUserData()` is data loss.
export function tryReadUserDataFromText(
  raw: string | null,
  ctx: MigrationContext = {},
): ReadUserDataResult {
  if (!raw) {
    log.info("readUserDataFromText: no bytes — seeding fresh budget");
    return { data: freshUserData(), status: "fresh" };
  }
  const result = parseUserData(raw, ctx);
  if (result.ok) {
    log.info(
      `readUserDataFromText: parsed ok (migrated=${result.migrated}) bytes=${raw.length}`,
    );
    return { data: result.data, status: "parsed", migrated: result.migrated };
  }
  log.error(
    `readUserDataFromText: parse failed — falling back to fresh budget. error=${result.error}`,
  );
  return { data: freshUserData(), status: "parse-failed", error: result.error };
}
