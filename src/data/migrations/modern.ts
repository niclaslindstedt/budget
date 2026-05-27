// Modern migrations (v31 → v44). Anything from v34 → v35 onward is
// the first migration ordinary readers need to understand today, so
// keeping the modern half scannable matters more than its predecessors.
// Earlier steps (v1 → v30) live in `./legacy.ts`.

import {
  DEFAULT_DEVICE_SETTINGS_DESKTOP,
  DEFAULT_DEVICE_SETTINGS_MOBILE,
  DEFAULT_DOWNLOAD_ACCOUNTS,
  DEFAULT_DOWNLOAD_BUDGET,
  DEFAULT_SETTINGS,
  nsKey,
} from "../constants";
import { DEVICE_SCOPED_KEYS } from "../settings";
import { clearRawStorage, readRawStorage } from "../../storage/local-adapter";
import { safeJsonParse } from "../../utils/json";
import { isObj, type MigrationTable, type Versioned } from "./shared";

export const MODERN_MIGRATIONS: MigrationTable = {
  // v31 → v32: introduces `EntryType.kind` (income / expense / any)
  // and the matching `UserData.presetTypeKindOverrides` map. Preset
  // types ship with their built-in kind (Salary / Bonus / Tax refund /
  // Barnbidrag are income, the rest are expense or "any" for
  // ambiguous savings instruments). User-added types default to
  // "any" by omitting the field. The validator fills in an empty
  // overrides map when missing, so this is a bare version bump for
  // the payload.
  31: (v31) => ({ ...v31, version: 32, presetTypeKindOverrides: {} }),

  // v32 → v33: add the achievements system. `Settings.achievements`
  // holds the user's unlocked-id → timestamp map; the parallel
  // `unseenAchievements` queue drives the filled-star "you've got new
  // unlocks" state. Both default to empty for existing buckets — the
  // catalog is forward-going only, so prior usage doesn't pre-unlock
  // anything; the user earns each achievement by doing the thing once
  // more after upgrade.
  32: (v32) => {
    const settings =
      typeof v32.settings === "object" && v32.settings !== null
        ? (v32.settings as Record<string, unknown>)
        : {};
    return {
      ...v32,
      version: 33,
      settings: {
        ...settings,
        achievements: {},
        unseenAchievements: [],
      },
    };
  },

  // v33 → v34: add `Settings.headerAction`, the configurable target
  // for clicking the "budget" wordmark in the page header. Defaults
  // to "go to top" — the web convention for a clickable wordmark and
  // a safe choice on a fresh install where the user has nowhere
  // else to be. The validator coerces unknown / malformed shapes to
  // the same default so a hand-edited file can't put the click
  // handler in an unreachable state.
  33: (v33) => {
    const settings =
      typeof v33.settings === "object" && v33.settings !== null
        ? (v33.settings as Record<string, unknown>)
        : {};
    return {
      ...v33,
      version: 34,
      settings: {
        ...settings,
        headerAction: { kind: "top" },
      },
    };
  },

  // v34 → v35: split `Settings` into common + device scopes. Seven
  // existing fields (`formatNumbers`, `showCurrency`, `showDecimals`,
  // `abbreviateNumbers`, `alwaysAbbreviateBalance`, `fontScale`,
  // `headerAction`) move from the flat top level into a new
  // `settings.device.{mobile,desktop}` shape so each viewport can
  // hold its own value. Both buckets are seeded with the user's
  // pre-migration value so the device they upgrade from looks
  // identical; either side diverges as the user edits.
  //
  // Three additional surfaces also move out of device-local
  // localStorage into the synced bucket on the same migration:
  // `cloudReauthAutoOpen` becomes a common-scope `Settings` field;
  // `downloadBudget` / `downloadAccounts` become device-scoped
  // (desktop tends to prefer XLSX, mobile tends to prefer CSV).
  // The absorb only fires when a `userId` is supplied via
  // `MigrationContext` — that's the production load path. The import
  // path (`parseUserData` on a file the user picked) has no
  // matching localStorage on the importing device, so it seeds the
  // new fields with defaults instead.
  34: (v34, ctx) => {
    const settings = isObj(v34.settings) ? v34.settings : {};

    // Lift the device-scoped fields out of the flat settings shape.
    // Each falls back to the canonical default when the source is
    // missing or malformed; the validator on the next load applies
    // its own bounds, so we don't reproduce them here.
    const deviceCarry = {
      formatNumbers: extractBool(
        settings.formatNumbers,
        DEFAULT_SETTINGS.formatNumbers,
      ),
      showCurrency: extractBool(
        settings.showCurrency,
        DEFAULT_SETTINGS.showCurrency,
      ),
      showDecimals: extractBool(
        settings.showDecimals,
        DEFAULT_SETTINGS.showDecimals,
      ),
      abbreviateNumbers: extractBool(
        settings.abbreviateNumbers,
        DEFAULT_SETTINGS.abbreviateNumbers,
      ),
      alwaysAbbreviateBalance: extractBool(
        settings.alwaysAbbreviateBalance,
        DEFAULT_SETTINGS.alwaysAbbreviateBalance,
      ),
      fontScale:
        typeof settings.fontScale === "number" &&
        Number.isFinite(settings.fontScale)
          ? settings.fontScale
          : DEFAULT_SETTINGS.fontScale,
      headerAction:
        isObj(settings.headerAction) && settings.headerAction !== null
          ? settings.headerAction
          : DEFAULT_SETTINGS.headerAction,
    };

    // Pull the absorbing-from-localStorage values, scoped to the
    // active user when one was supplied. All three writes are best-
    // effort: if a key is absent, malformed, or unreadable we fall
    // back to the v35 default rather than failing the migration.
    const userId = ctx.userId;
    const reauthFromLocal = readLegacyCloudReauthAutoOpen();
    const budgetPrefsFromLocal = userId
      ? readLegacyBudgetDownloadPrefs(userId)
      : null;
    const accountsPrefsFromLocal = userId
      ? readLegacyAccountsDownloadPrefs(userId)
      : null;

    // Clear the absorbed keys so the next load doesn't see stale
    // shadows next to the migrated values. Safe to call even when
    // the key is absent.
    clearLegacyCloudReauthAutoOpen();
    if (userId) {
      clearLegacyBudgetDownloadPrefs(userId);
      clearLegacyAccountsDownloadPrefs(userId);
    }

    const deviceBucket = {
      ...deviceCarry,
      downloadBudget: budgetPrefsFromLocal ?? { ...DEFAULT_DOWNLOAD_BUDGET },
      downloadAccounts: accountsPrefsFromLocal ?? {
        ...DEFAULT_DOWNLOAD_ACCOUNTS,
        accountInfo: { ...DEFAULT_DOWNLOAD_ACCOUNTS.accountInfo },
        accountTransactions: {
          ...DEFAULT_DOWNLOAD_ACCOUNTS.accountTransactions,
        },
        accountSelected: { ...DEFAULT_DOWNLOAD_ACCOUNTS.accountSelected },
      },
    };

    // Strip the device-scoped keys from the flat settings rest so
    // they don't sit at the top level twice — the validator on the
    // next load reads `settings.device.{mobile,desktop}.fontScale`
    // and ignores any stale flat `settings.fontScale`.
    const common: Record<string, unknown> = { ...settings };
    for (const key of DEVICE_SCOPED_KEYS) {
      delete common[key];
    }

    return {
      ...v34,
      version: 35,
      settings: {
        ...common,
        cloudReauthAutoOpen:
          reauthFromLocal ?? DEFAULT_SETTINGS.cloudReauthAutoOpen,
        device: {
          mobile: { ...DEFAULT_DEVICE_SETTINGS_MOBILE, ...deviceBucket },
          desktop: { ...DEFAULT_DEVICE_SETTINGS_DESKTOP, ...deviceBucket },
        },
      },
    };
  },

  // v35 → v36: introduces optional `hintIgnored` on `HistoryEntry` so
  // a user can opt individual past entries out of the merchant-hint
  // overlay via the "Past matches" list in the promote-to-recurring
  // modal. Old exports simply lack the field; the synthesizer treats
  // absent as `false` and keeps applying hints as before. Bare bump.
  35: (v35) => ({ ...v35, version: 36 }),

  // v36 → v37: introduces `Settings.columnBorders` (default false), the
  // toggle that gates vertical column dividers across the budget sheet
  // and the accounts transfer log. Old exports lack the field; the
  // validator substitutes the default so existing budgets land on the
  // new clean look without rewriting their settings blob. Bare bump.
  36: (v36) => ({ ...v36, version: 37 }),

  // v37 → v38: removes `Settings.columnBorders` again. The unified-
  // table redesign that field gated was reverted, so the field has no
  // backing UI and no longer affects rendering. Strip it from settings
  // so a future v38+ export round-trips cleanly without a dangling
  // unknown key. Users who never saw v37 (the validator left it absent)
  // still pass through this step harmlessly — `delete settings.columnBorders`
  // is a no-op when the field isn't there.
  37: (v37) => {
    const out: Record<string, unknown> = { ...v37, version: 38 };
    if (isObj(out.settings)) {
      const settings = { ...out.settings };
      delete settings.columnBorders;
      out.settings = settings;
    }
    return out as Versioned;
  },

  // v38 → v39: introduces optional `Row.typeIdLocked` so the reducer
  // can distinguish "user picked this type by hand" from "pattern
  // auto-assigned this type". Locked rows survive description edits
  // unchanged; unlocked rows pick up a fresh pattern match when their
  // description / amount commits, but only when a rule actually wins —
  // see the header note in `pattern-apply.ts`. A pre-existing typeId
  // on an unlocked row is never stripped by the auto-apply pass, so
  // rows that carried hand-set types from before this feature shipped
  // keep them whether or not any pattern happens to match. Bare
  // version bump.
  38: (v38) => ({ ...v38, version: 39 }),

  // v39 → v40: renames the persisted field `transactions` → `transfers`
  // on the user-data envelope, and `HistoryEntry.collapsedIntoTransactionId`
  // → `collapsedIntoTransferId` on every entry in `history`. The code
  // type used to be called `Transaction` but always referred to a
  // cross-own-account transfer; the user word "transaction" maps to a
  // bank-statement entry (`HistoryEntry`). Renaming the type to `Transfer`
  // aligns code with user vocabulary. Old exports that lack either field
  // default to an empty array / leave the entry untouched.
  39: (v39) => {
    const transfers = Array.isArray(v39.transactions)
      ? v39.transactions
      : Array.isArray(v39.transfers)
        ? v39.transfers
        : [];
    const { transactions: _drop, history: rawHistory, ...rest } = v39;
    void _drop;
    const nextHistory: Record<string, unknown[]> = {};
    if (rawHistory && typeof rawHistory === "object") {
      for (const [accountId, entries] of Object.entries(
        rawHistory as Record<string, unknown>,
      )) {
        if (!Array.isArray(entries)) {
          nextHistory[accountId] = [];
          continue;
        }
        nextHistory[accountId] = entries.map((entry) => {
          if (!entry || typeof entry !== "object") return entry;
          const e = entry as Record<string, unknown>;
          if (e.collapsedIntoTransactionId === undefined) return e;
          const { collapsedIntoTransactionId, ...restEntry } = e;
          return {
            ...restEntry,
            collapsedIntoTransferId: collapsedIntoTransactionId,
          };
        });
      }
    }
    return {
      ...rest,
      version: 40,
      transfers,
      history: nextHistory,
    };
  },

  // v40 → v41: introduces `renamePatterns`, the per-account memory
  // that backs the `RenamePredictorModal` (shown as the last step of
  // every history import that has suggestions to offer). Each entry
  // maps a normalised bank description to the user-typed label the
  // user reached for when relabelling matching entries. Defaults to
  // an empty record — no patterns are pre-seeded, the store fills as
  // the user renames history entries via the pen-button modal or the
  // budget-view quick-rename (both route through the
  // `updateHistoryEntry` reducer chokepoint). Bare bump.
  40: (v40) => ({ ...v40, version: 41, renamePatterns: {} }),

  // v41 → v42: introduces user-curated `companies` (merchants /
  // organisations a row pays) plus optional `companyId` fields on
  // `Row`, `HistoryEntry.userCompanyId`, `HistoryEntrySplit.companyId`,
  // `MerchantHint.companyId`, `MatchRule.companyId`, and
  // `RenamePattern.suggestedCompanyId`. Defaults to an empty array —
  // no presets ship; the list fills as the user picks "New company" in
  // the picker dropdown or adds entries on the Companies settings tab.
  // Every new field is optional so v41 records pass the v42 validator
  // unchanged.
  41: (v41) => ({ ...v41, version: 42, companies: [] }),

  // v42 → v43: introduces an optional `Row.fiscalMonthShift` plus the
  // `UserData.seriesMetadata` map. Both are additive — existing rows /
  // series simply lack the new fields and the grouping pipeline behaves
  // identically until a user flags a series as primary income or hits
  // the manual "Push to next month" action. Defaults to an empty map.
  42: (v42) => ({ ...v42, version: 43, seriesMetadata: {} }),

  // v43 → v44: introduces `HistoryEntry.fiscalMonthShift` (optional,
  // mirrors `Row.fiscalMonthShift`) plus the
  // `UserData.primaryIncomeMerchants` array. Both are additive — the
  // array is seeded empty and the per-entry shift is undefined until
  // a user marks an entry as primary income.
  43: (v43) => ({ ...v43, version: 44, primaryIncomeMerchants: [] }),
};

function extractBool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

// Legacy localStorage absorb helpers for the v34 → v35 migration. The
// matching writers in `src/storage/backend-preference.ts` (cloud
// reauth) and `src/storage/download-preferences.ts` were deleted on
// the same change; the keys may still sit on the user's machine until
// the migration runs once, after which they're cleared.
const LEGACY_CLOUD_REAUTH_KEY = nsKey("budget.cloud.reauthAutoOpen");

function legacyBudgetDownloadKey(userId: string): string {
  return nsKey(`budget.download.budget.${userId}`);
}

function legacyAccountsDownloadKey(userId: string): string {
  return nsKey(`budget.download.accounts.${userId}`);
}

function readLegacyCloudReauthAutoOpen(): boolean | null {
  const raw = readRawStorage(LEGACY_CLOUD_REAUTH_KEY);
  if (raw === null) return null;
  return raw !== "off";
}

function clearLegacyCloudReauthAutoOpen(): void {
  clearRawStorage(LEGACY_CLOUD_REAUTH_KEY);
}

function readLegacyBudgetDownloadPrefs(
  userId: string,
): { format: "csv" | "xlsx"; includeHistory: boolean } | null {
  const raw = readRawStorage(legacyBudgetDownloadKey(userId));
  const parsed = safeJsonParse<Record<string, unknown>>(raw);
  if (parsed === null) return null;
  return {
    format: parsed.format === "xlsx" ? "xlsx" : "csv",
    includeHistory:
      typeof parsed.includeHistory === "boolean"
        ? parsed.includeHistory
        : DEFAULT_DOWNLOAD_BUDGET.includeHistory,
  };
}

function clearLegacyBudgetDownloadPrefs(userId: string): void {
  clearRawStorage(legacyBudgetDownloadKey(userId));
}

function readLegacyAccountsDownloadPrefs(userId: string): {
  accountInfo: Record<string, boolean>;
  accountTransactions: Record<string, boolean>;
  accountSelected: Record<string, boolean>;
  includeTransactions: boolean;
  includeUnconfirmed: boolean;
  includeFutureEntries: boolean;
} | null {
  const raw = readRawStorage(legacyAccountsDownloadKey(userId));
  const parsed = safeJsonParse<Record<string, unknown>>(raw);
  if (parsed === null) return null;
  return {
    accountInfo: toBoolRecord(parsed.accountInfo),
    accountTransactions: toBoolRecord(parsed.accountTransactions),
    accountSelected: toBoolRecord(parsed.accountSelected),
    includeTransactions:
      typeof parsed.includeTransactions === "boolean"
        ? parsed.includeTransactions
        : DEFAULT_DOWNLOAD_ACCOUNTS.includeTransactions,
    includeUnconfirmed:
      typeof parsed.includeUnconfirmed === "boolean"
        ? parsed.includeUnconfirmed
        : DEFAULT_DOWNLOAD_ACCOUNTS.includeUnconfirmed,
    includeFutureEntries:
      typeof parsed.includeFutureEntries === "boolean"
        ? parsed.includeFutureEntries
        : DEFAULT_DOWNLOAD_ACCOUNTS.includeFutureEntries,
  };
}

function clearLegacyAccountsDownloadPrefs(userId: string): void {
  clearRawStorage(legacyAccountsDownloadKey(userId));
}

function toBoolRecord(value: unknown): Record<string, boolean> {
  if (!value || typeof value !== "object") return {};
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === "boolean") out[k] = v;
  }
  return out;
}
