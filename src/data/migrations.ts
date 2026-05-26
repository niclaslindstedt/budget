// Forward-only migration chain for persisted UserData blobs.
//
// Each entry in `migrations` migrates from version `N` to `N+1`. Once a
// migration ships it must never be removed or rewritten — exports in the
// wild still depend on it to upgrade cleanly. To add a new version: bump
// `LATEST_VERSION`, update the `UserData.version` literal in `data/types.ts`,
// and add the next step here.

import { nsKey } from "./constants";
import {
  createSeedEntryTypes,
  DEFAULT_CATEGORY_ID,
  DEFAULT_DEVICE_SETTINGS_DESKTOP,
  DEFAULT_DEVICE_SETTINGS_MOBILE,
  DEFAULT_DOWNLOAD_ACCOUNTS,
  DEFAULT_DOWNLOAD_BUDGET,
  DEFAULT_SETTINGS,
  DEFAULT_SHEET_COLOR,
  DEFAULT_SHEET_GLYPH,
  PRESET_ENTRY_TYPES,
} from "./constants";
import { newId } from "./sheet";
import { DEVICE_SCOPED_KEYS } from "./settings";
import { clearRawStorage, readRawStorage } from "../storage/local-adapter";

// Typed as a literal so consumers (like the UserData type) can pin to it.
// When bumping, change BOTH this constant and the `UserData.version` literal
// in `data/types.ts` in the same commit.
export const LATEST_VERSION = 41 as const;

export type Versioned = { version: number; [key: string]: unknown };

// Per-call context for `migrate()`. Currently only carries the active
// `userId` so the v34 → v35 step can absorb the per-user download
// preferences from device-local localStorage; future migrations can
// extend this. Defaulting to `{}` keeps existing callers (including
// every test) source-compatible.
export type MigrationContext = {
  userId?: string;
};

const migrations: Record<
  number,
  (b: Versioned, ctx: MigrationContext) => Versioned
> = {
  // v1 → v2: introduce categories at the budget level and ensure every
  // sheet has a `category` column, inserted just after the description
  // column so existing rows can be tagged without re-arranging.
  1: (v1) => {
    const sheets = Array.isArray(v1.sheets) ? v1.sheets : [];
    return {
      ...v1,
      version: 2,
      categories: [],
      sheets: sheets.map((raw) => {
        if (typeof raw !== "object" || raw === null) return raw;
        const sheet = raw as { columns?: unknown };
        if (!Array.isArray(sheet.columns)) return sheet;
        const hasCategory = sheet.columns.some(
          (c) =>
            typeof c === "object" &&
            c !== null &&
            (c as { type?: unknown }).type === "category",
        );
        if (hasCategory) return sheet;
        const descIdx = sheet.columns.findIndex(
          (c) =>
            typeof c === "object" &&
            c !== null &&
            (c as { type?: unknown }).type === "description",
        );
        const insertAt = descIdx >= 0 ? descIdx + 1 : sheet.columns.length;
        const newColumn = {
          id: newId(),
          type: "category",
          label: "Category",
        };
        const nextColumns = [...sheet.columns];
        nextColumns.splice(insertAt, 0, newColumn);
        return { ...sheet, columns: nextColumns };
      }),
    };
  },

  // v2 → v3: introduces an optional `seriesId` field on rows so the app
  // can scope "edit / delete future" operations across rows generated
  // from the same recurrence. No row data needs rewriting; bumping the
  // version flags that this build understands the new shape so older
  // builds know not to silently drop unknown fields.
  2: (v2) => ({ ...v2, version: 3 }),

  // v3 → v4: introduces budget-level `settings` covering fiscal-month
  // start, date format, currency, number format, and display toggles.
  // Existing budgets get the canonical defaults so behaviour matches
  // pre-settings builds until the user changes them.
  3: (v3) => ({
    ...v3,
    version: 4,
    settings: { ...DEFAULT_SETTINGS },
  }),

  // v4 → v5: introduces explicit Accounts and turns each Sheet into a
  // container of typed items. Pre-v5 sheets carried their columns and
  // rows directly; in v5 those become the body of one `AccountBudget`
  // item that points at a freshly minted default Account. The shape
  // supports future SheetItem variants (graphs, notes, etc.) without
  // another migration.
  4: (v4) => {
    const defaultAccountId = newId();
    const sheets = Array.isArray(v4.sheets) ? v4.sheets : [];
    return {
      ...v4,
      version: 5,
      accounts: [{ id: defaultAccountId, name: "Default" }],
      sheets: sheets.map((raw) => {
        if (typeof raw !== "object" || raw === null) return raw;
        const sheet = raw as {
          id?: unknown;
          name?: unknown;
          columns?: unknown;
          rows?: unknown;
        };
        const columns = Array.isArray(sheet.columns) ? sheet.columns : [];
        const rows = Array.isArray(sheet.rows) ? sheet.rows : [];
        return {
          id: sheet.id,
          name: sheet.name,
          items: [
            {
              id: newId(),
              type: "accountBudget",
              accountId: defaultAccountId,
              columns,
              rows,
            },
          ],
        };
      }),
    };
  },

  // v5 → v6: `AccountBudget.accountId` widens from `string` to
  // `string | null` so a budget can exist without being tied to an
  // account, and `accounts` may now be empty. Existing string ids
  // remain valid — the migration is a bare version bump and the
  // type widening is backward-compatible on disk.
  5: (v5) => ({ ...v5, version: 6 }),

  // v6 → v7: introduces sheet metadata (`type`, `glyph`, `color`,
  // `description`) so users can run multiple named, colour-coded
  // sheets side by side and pick between them from the bottom tab
  // bar. Existing sheets get the canonical defaults so they keep
  // working unchanged until the user edits them.
  6: (v6) => {
    const sheets = Array.isArray(v6.sheets) ? v6.sheets : [];
    return {
      ...v6,
      version: 7,
      sheets: sheets.map((raw) => {
        if (typeof raw !== "object" || raw === null) return raw;
        const sheet = raw as Record<string, unknown>;
        return {
          ...sheet,
          type: typeof sheet.type === "string" ? sheet.type : "budget",
          glyph:
            typeof sheet.glyph === "string" ? sheet.glyph : DEFAULT_SHEET_GLYPH,
          color:
            typeof sheet.color === "string" && sheet.color.length > 0
              ? sheet.color
              : DEFAULT_SHEET_COLOR,
          description:
            typeof sheet.description === "string" ? sheet.description : "",
        };
      }),
    };
  },

  // v7 → v8: introduces an optional `glyph` field on rows so a
  // recurring entry can carry a custom icon shown in the description
  // cell (and replacing the mobile ellipsis trigger). No row data
  // needs rewriting; bumping the version flags that this build
  // understands the new shape so older builds know not to silently
  // drop the field.
  7: (v7) => ({ ...v7, version: 8 }),

  // v8 → v9: introduces top-level `transactions` (transfers between
  // accounts) and the "accounts" sheet flavour with its `AccountsView`
  // item variant. Accounts also gain optional bank-detail metadata
  // (description, glyph, color, bank, clearing, accountNumber, iban,
  // bic, currency). Existing data needs no rewrite: the migration is
  // a bare version bump plus an empty `transactions` array, and every
  // new field is optional so v8 records pass the v9 validator
  // unchanged.
  8: (v8) => {
    const transactions = Array.isArray(v8.transactions) ? v8.transactions : [];
    return { ...v8, version: 9, transactions };
  },

  // v9 → v10: introduces an optional `isCorrection` flag on rows so the
  // "update balance" flow on the Accounts page can mark the delta rows
  // it appends and the budget view can render them as a full-width
  // divider line instead of a normal columned row. No row data needs
  // rewriting; bumping the version flags that this build understands
  // the new shape so older builds know not to silently drop the field.
  9: (v9) => ({ ...v9, version: 10 }),

  // v10 → v11: introduces imported bank-statement history at the
  // UserData level (`history`, `historyImports`) and an optional
  // anchored `openingBalance` field on Account. Both collections
  // default to empty so v10 records pass the v11 validator unchanged
  // and the runtime balance math is undisturbed until the user
  // imports a statement.
  10: (v10) => ({
    ...v10,
    version: 11,
    history: {},
    historyImports: {},
  }),

  // v11 → v12: introduces three correlation surfaces on top of the
  // existing history data — `merchantHints` (a user's per-merchant
  // category memory), `recurringDismissals` (normalised-description
  // keys the user said "not recurring" to), and
  // `transferCollapseDismissals` (cross-account pair keys the user
  // said "never" to). HistoryEntry also gains an optional
  // `collapsedIntoTransactionId` backref (renamed to
  // `collapsedIntoTransferId` by the v39 → v40 migration) so the
  // collapse flow is reversible; no row data needs rewriting because
  // the new field is optional and absent entries continue to validate.
  // All three new top-level collections default to empty so v11
  // records pass the v12 validator unchanged.
  11: (v11) => ({
    ...v11,
    version: 12,
    merchantHints: {},
    recurringDismissals: [],
    transferCollapseDismissals: [],
  }),

  // v12 → v13: introduces the `abbreviateNumbers` display toggle. The
  // validator falls back to the default (off) for v12 records that
  // don't carry the field, so no settings data needs rewriting — the
  // version bump just flags that this build understands the new shape.
  12: (v12) => ({ ...v12, version: 13 }),

  // v13 → v14: introduces reusable `EntryType` records and a
  // `Row.typeId` reference. Types replace the per-row `glyph` field —
  // a type carries a name + colour + glyph that every row using it
  // shares, so grouping for stats works while the visual identity
  // moves with it. The migration seeds a handful of Swedish-typical
  // defaults so the picker isn't empty on first promote, and strips
  // any existing `row.glyph` (the user chose "drop, don't salvage" on
  // the migration prompt). No rows gain a `typeId` automatically.
  13: (v13) => {
    const sheets = Array.isArray(v13.sheets) ? v13.sheets : [];
    return {
      ...v13,
      version: 14,
      types: createSeedEntryTypes(),
      sheets: sheets.map((raw) => {
        if (typeof raw !== "object" || raw === null) return raw;
        const sheet = raw as { items?: unknown };
        if (!Array.isArray(sheet.items)) return sheet;
        return {
          ...sheet,
          items: sheet.items.map((rawItem) => {
            if (typeof rawItem !== "object" || rawItem === null) return rawItem;
            const item = rawItem as { type?: unknown; rows?: unknown };
            if (item.type !== "accountBudget" || !Array.isArray(item.rows)) {
              return item;
            }
            return {
              ...item,
              rows: item.rows.map((rawRow) => {
                if (typeof rawRow !== "object" || rawRow === null)
                  return rawRow;
                const row = rawRow as Record<string, unknown>;
                if (!("glyph" in row)) return row;
                const rest: Record<string, unknown> = {};
                for (const [k, v] of Object.entries(row)) {
                  if (k !== "glyph") rest[k] = v;
                }
                return rest;
              }),
            };
          }),
        };
      }),
    };
  },

  // v14 → v15: `MerchantHint` gains optional `typeId` and
  // `description` fields. The history-row promote-to-recurring flow
  // writes them so past and future synthesized history rows can
  // display the user's label and entry type instead of the raw bank
  // text. Existing hints carry neither field — they're optional and
  // readers fall through to the raw description and no-type
  // rendering, so no payload rewrite is needed.
  14: (v14) => ({ ...v14, version: 15 }),

  // v15 → v16: introduces `matchRules`, a list of user-authored
  // wildcard rules that relabel synthesized history rows by pattern
  // (distinct from the lossy normalised-description matching that
  // drives `merchantHints`). Existing exports default to an empty
  // list — no rules have been authored yet, so behaviour matches
  // pre-v16 builds until the user creates one.
  15: (v15) => ({ ...v15, version: 16, matchRules: [] }),

  // v16 → v17: `HistoryEntry.balance` becomes optional so credit-card
  // exports without a per-row running balance (e.g. Bank Norwegian)
  // can be imported. Existing entries carry a balance and continue to
  // validate — no payload rewrite, the bump only signals that this
  // build understands the looser shape so older builds don't silently
  // drop unrelated fields when they encounter a v17 file.
  16: (v16) => ({ ...v16, version: 17 }),

  // v17 → v18: introduces the `fontScale` display setting (UI text-size
  // multiplier). The validator falls back to the default (1) for v17
  // records that don't carry the field, so no settings data needs
  // rewriting — the version bump just flags that this build understands
  // the new shape.
  17: (v17) => ({ ...v17, version: 18 }),

  // v18 → v19: introduces `Settings.lastSeenChangelogVersion`, the
  // version string the user last acknowledged on the "What's new"
  // popup. The validator defaults missing values to null so v18
  // records pass the v19 validator unchanged — the field flips to a
  // real version string the first time the running app's mount-time
  // check stamps it.
  18: (v18) => ({ ...v18, version: 19 }),

  // v19 → v20: introduces built-in preset entry types and preset
  // categories (`PRESET_ENTRY_TYPES`, `PRESET_CATEGORIES` in
  // `data/constants.ts`) plus per-user hide lists for each.
  // Existing user-added types and categories are kept as-is; the
  // migration just initialises both hide arrays as empty so every
  // preset shows up until the user toggles one off from
  // Settings → Types / Categories.
  19: (v19) => ({
    ...v19,
    version: 20,
    hiddenPresetTypeIds: [],
    hiddenPresetCategoryIds: [],
  }),

  // v20 → v21: introduces the `alwaysAbbreviateBalance` display toggle.
  // The validator falls back to the default for v20 records that don't
  // carry the field, so no settings data needs rewriting — the version
  // bump just flags that this build understands the new shape.
  20: (v20) => ({ ...v20, version: 21 }),

  // v21 → v22: introduces `seriesMatchRules`, a list of user-confirmed
  // auto-reconciliation rules that collapse predicted recurring-series
  // rows with their bank-history counterparts on future imports.
  // Defaults to an empty list — no rules exist until the user confirms
  // "Apply to whole series" in the reconciliation modal, so behaviour
  // matches pre-v22 builds until then.
  21: (v21) => ({ ...v21, version: 22, seriesMatchRules: [] }),

  // v22 → v23: introduces `Row.amountFormula`, an optional formula
  // string that produces the row's effective amount at render time.
  // No existing data needs rewriting — pre-v23 rows simply have no
  // formula and continue to use the literal value in their amount
  // cell. The bump only flags that this build understands the new
  // shape so older builds refuse to open snapshots that may contain
  // formulas they can't evaluate.
  22: (v22) => ({ ...v22, version: 23 }),

  // v23 → v24: introduces optional `amountMin` / `amountMax` bounds on
  // `MatchRule` so a rule can narrow to a specific price band on top
  // of the existing sign filter. The validator falls back to absent
  // bounds for v23 records that don't carry the fields, so no data
  // needs rewriting — the version bump just flags that this build
  // understands the new shape.
  23: (v23) => ({ ...v23, version: 24 }),

  // v24 → v25: restructures the type/category relationship so
  // categories *contain* types. Concretely:
  //
  // - `EntryType` gains a required `categoryId` field — every type
  //   belongs to exactly one category. Preset types adopt their
  //   built-in mapping (see `PRESET_ENTRY_TYPES`). User types try to
  //   reuse the category most of their rows already pointed at; ties
  //   and orphans fall back to `DEFAULT_CATEGORY_ID` ("Other").
  // - The `"category"` column type is removed. Every category column
  //   on every sheet is stripped; for rows that carried a category
  //   cell but no `typeId`, a synthesized "{Category name} (generic)"
  //   type is minted under that category and attached to the row so
  //   the meaning isn't lost. The original cell value is dropped
  //   along with the column.
  // - `Transaction.categoryId` (now `Transfer.categoryId`),
  //   `MerchantHint.categoryId`, and
  //   `MatchRule.categoryId` are removed. Entities that only knew
  //   their category get a generic type minted the same way the row
  //   migration above does, so a future picker can still surface
  //   them as "Food (generic)" / "Bills (generic)" / etc.
  24: (v24) => migrateV24ToV25(v24),

  // v25 → v26: re-introduces a dedicated `"type"` column on every
  // AccountBudget. The v24 → v25 step removed the legacy `"category"`
  // column once category became derived from `row.typeId`; users still
  // wanted a visible column for the row's type, so this step inserts
  // one just after `"description"` (matching where the legacy category
  // column lived). The column has no associated cell value — the
  // `updateCell` reducer routes writes for it straight into
  // `row.typeId`, which already carries the source-of-truth id.
  // Idempotent: budgets that somehow already carry a `"type"` column
  // are left alone.
  25: (v25) => {
    const sheets = Array.isArray(v25.sheets) ? v25.sheets : [];
    return {
      ...v25,
      version: 26,
      sheets: sheets.map((rawSheet) => {
        if (!isObj(rawSheet)) return rawSheet;
        const items = Array.isArray(rawSheet.items) ? rawSheet.items : [];
        return {
          ...rawSheet,
          items: items.map((rawItem) => {
            if (!isObj(rawItem)) return rawItem;
            if (rawItem.type !== "accountBudget") return rawItem;
            const columns = Array.isArray(rawItem.columns)
              ? rawItem.columns
              : [];
            const hasTypeColumn = columns.some(
              (c) => isObj(c) && c.type === "type",
            );
            if (hasTypeColumn) return rawItem;
            const descIdx = columns.findIndex(
              (c) => isObj(c) && c.type === "description",
            );
            const insertAt = descIdx >= 0 ? descIdx + 1 : columns.length;
            const nextColumns = [...columns];
            nextColumns.splice(insertAt, 0, {
              id: newId(),
              type: "type",
              label: "Type",
            });
            return { ...rawItem, columns: nextColumns };
          }),
        };
      }),
    };
  },

  // v26 → v27: adds a `language` field to settings. Existing buckets
  // get "en" so a returning user's UI doesn't suddenly flip language
  // — the auto-detect path only runs on a brand-new install (see
  // `detectInitialLanguage` in `src/i18n/locale.ts`).
  26: (v26) => {
    const settings =
      typeof v26.settings === "object" && v26.settings !== null
        ? (v26.settings as Record<string, unknown>)
        : {};
    return {
      ...v26,
      version: 27,
      settings: {
        ...settings,
        language:
          settings.language === "sv" || settings.language === "en"
            ? settings.language
            : "en",
      },
    };
  },

  // v27 → v28: introduces optional `userDescription` and `userTypeId`
  // on `HistoryEntry` so individual bank rows can carry per-entry
  // overrides (set by the pen button on a history row). Old exports
  // simply lack the fields and `synthesizeHistoryRow` falls through to
  // its existing rule / hint / raw-text priority; the migration is a
  // bare version bump.
  27: (v27) => ({ ...v27, version: 28 }),

  // v28 → v29: introduces `Settings.hideTransfers` (default false), an
  // optional `Row.isTransfer` flag, and an optional `HistoryEntry.isTransfer`
  // flag. Together they let users suppress inter-account transfers from
  // the budget tables while the amounts continue to feed the running
  // balance. Existing exports lack the fields entirely; the settings
  // validator fills in `hideTransfers: false` and the row / entry
  // validators leave the flag absent, which matches the legacy "always
  // show every row" behaviour. The migration is a bare version bump.
  28: (v28) => ({ ...v28, version: 29 }),

  // v29 → v30: introduces optional `splits` on `HistoryEntry` so a
  // single bank transaction (a bankgiro that paid for several
  // categorised items in one go, a mortgage payment that's part
  // interest and part amortization, …) can render as multiple rows
  // in the synthesized budget view. Old exports simply lack the
  // field; the synthesizer falls back to its existing single-row
  // path. Bare version bump.
  29: (v29) => ({ ...v29, version: 30 }),

  // v30 → v31: introduces the theme picker (`Settings.theme`), the
  // font-family picker (`Settings.fontFamily`), and the nested
  // `Settings.customTheme` overrides (colours + radius + density +
  // border width + reduce-motion). The settings validator fills the
  // canonical defaults for v30 records that don't carry the fields,
  // so no payload rewrite is needed — the version bump just flags
  // that this build understands the new shape. Existing users land
  // on `theme: "system"` and `fontFamily: "mono"`, matching the
  // pre-picker behaviour so the UI doesn't change on upgrade.
  30: (v30) => ({ ...v30, version: 31 }),

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
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      format: parsed.format === "xlsx" ? "xlsx" : "csv",
      includeHistory:
        typeof parsed.includeHistory === "boolean"
          ? parsed.includeHistory
          : DEFAULT_DOWNLOAD_BUDGET.includeHistory,
    };
  } catch {
    return null;
  }
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
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
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
  } catch {
    return null;
  }
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

// Build-time lookup of preset-type-name → preset-category-id, used by
// the v24 → v25 migration to assign legacy seed types (whose ids were
// minted with `seedEntryTypeId()` but whose names match a preset) to
// the same category their preset counterpart now sits under. The
// lookup is case-insensitive on the name so a user-tweaked spelling
// like "groceries" still resolves to "Groceries".
const PRESET_NAME_TO_CATEGORY_ID: ReadonlyMap<string, string> = (() => {
  const m = new Map<string, string>();
  for (const t of PRESET_ENTRY_TYPES) m.set(t.name.toLowerCase(), t.categoryId);
  return m;
})();

function migrateV24ToV25(v24: Versioned): Versioned {
  const sheets = Array.isArray(v24.sheets) ? v24.sheets : [];
  const existingTypes = Array.isArray(v24.types)
    ? (v24.types as Array<Record<string, unknown>>)
    : [];
  const existingCategories = Array.isArray(v24.categories)
    ? (v24.categories as Array<Record<string, unknown>>)
    : [];

  // Walk every row that has both a typeId and a category cell, and
  // count how often each (typeId, categoryId) pair appears. The most
  // popular categoryId per type is what the migration assigns it to.
  const typeUsage = new Map<string, Map<string, number>>();
  // Track the category cell values of rows that have NO typeId — we
  // mint a per-(item, category) "generic" type for each one so the
  // meaning is preserved when the cell is dropped.
  const rowCategoryWithoutType: Array<{
    sheetIdx: number;
    itemIdx: number;
    rowIdx: number;
    categoryId: string;
  }> = [];

  sheets.forEach((rawSheet, sheetIdx) => {
    if (!isObj(rawSheet)) return;
    const items = Array.isArray(rawSheet.items) ? rawSheet.items : [];
    items.forEach((rawItem, itemIdx) => {
      if (!isObj(rawItem)) return;
      if (rawItem.type !== "accountBudget") return;
      const columns = Array.isArray(rawItem.columns) ? rawItem.columns : [];
      const categoryColIds = new Set<string>();
      for (const rawCol of columns) {
        if (!isObj(rawCol)) continue;
        if (rawCol.type === "category" && typeof rawCol.id === "string") {
          categoryColIds.add(rawCol.id);
        }
      }
      if (categoryColIds.size === 0) return;
      const rows = Array.isArray(rawItem.rows) ? rawItem.rows : [];
      rows.forEach((rawRow, rowIdx) => {
        if (!isObj(rawRow)) return;
        const cells = isObj(rawRow.cells) ? rawRow.cells : {};
        let cellCatId: string | null = null;
        for (const colId of categoryColIds) {
          const v = cells[colId];
          if (typeof v === "string" && v !== "") {
            cellCatId = v;
            break;
          }
        }
        if (cellCatId === null) return;
        const typeId =
          typeof rawRow.typeId === "string" && rawRow.typeId !== ""
            ? rawRow.typeId
            : null;
        if (typeId) {
          const bucket = typeUsage.get(typeId) ?? new Map<string, number>();
          bucket.set(cellCatId, (bucket.get(cellCatId) ?? 0) + 1);
          typeUsage.set(typeId, bucket);
        } else {
          rowCategoryWithoutType.push({
            sheetIdx,
            itemIdx,
            rowIdx,
            categoryId: cellCatId,
          });
        }
      });
    });
  });

  // Pick the most-used categoryId for each typeId; fall back to the
  // preset-name lookup, then to the catch-all category.
  function pickCategoryForType(rawType: Record<string, unknown>): string {
    const id = typeof rawType.id === "string" ? rawType.id : "";
    const usage = typeUsage.get(id);
    if (usage && usage.size > 0) {
      let bestId = "";
      let bestCount = -1;
      for (const [catId, count] of usage) {
        if (count > bestCount) {
          bestId = catId;
          bestCount = count;
        }
      }
      if (bestId) return bestId;
    }
    if (typeof rawType.name === "string") {
      const fromPreset = PRESET_NAME_TO_CATEGORY_ID.get(
        rawType.name.toLowerCase(),
      );
      if (fromPreset) return fromPreset;
    }
    return DEFAULT_CATEGORY_ID;
  }

  // Build the migrated user-types list. Drop any non-object entries
  // (the v25 validator would reject them anyway) and stamp each with
  // its computed categoryId. Names + colors + glyphs come through
  // unchanged.
  const types: Array<Record<string, unknown>> = existingTypes
    .filter(isObj)
    .map((t) => ({
      ...t,
      categoryId: pickCategoryForType(t),
    }));

  // Synthesize a "generic" type per category that orphan rows need.
  // Keyed by categoryId so the same category only mints one helper
  // type even if dozens of rows reference it. The name reads like
  // "{Category name} (generic)" so the picker surfaces it as an
  // obvious holdover.
  const knownCategoryNames = new Map<string, string>();
  for (const c of existingCategories) {
    if (isObj(c) && typeof c.id === "string" && typeof c.name === "string") {
      knownCategoryNames.set(c.id, c.name);
    }
  }
  // Preset categories aren't in `existingCategories` — they live in
  // code. The migration only needs their display names for the
  // generic-type labels; importing them from constants would be
  // ideal, but to keep this migration self-contained we name the
  // generic type after the slug ("preset-cat-food (generic)" → "Food
  // (generic)") via a small lookup.
  const PRESET_CAT_NAMES: ReadonlyMap<string, string> = new Map([
    ["preset-cat-housing", "Housing"],
    ["preset-cat-food", "Food"],
    ["preset-cat-transport", "Transport"],
    ["preset-cat-health", "Health"],
    ["preset-cat-bills", "Bills"],
    ["preset-cat-entertainment", "Entertainment"],
    ["preset-cat-savings", "Savings"],
    ["preset-cat-income", "Income"],
    ["preset-cat-family", "Family"],
    ["preset-cat-personal", "Personal"],
    ["preset-cat-travel", "Travel"],
    ["preset-cat-other", "Other"],
  ]);
  const genericTypeByCategoryId = new Map<string, string>();
  function ensureGenericTypeFor(categoryId: string): string {
    const existing = genericTypeByCategoryId.get(categoryId);
    if (existing) return existing;
    const baseName =
      knownCategoryNames.get(categoryId) ??
      PRESET_CAT_NAMES.get(categoryId) ??
      "Uncategorized";
    const id = newId();
    types.push({
      id,
      name: `${baseName} (generic)`,
      color: "#5c6370",
      glyph: "tag",
      categoryId,
    });
    genericTypeByCategoryId.set(categoryId, id);
    return id;
  }

  // Rewrite sheets: drop "category" columns, drop the matching cells,
  // and attach a generic typeId to rows that lost a category cell but
  // had no typeId of their own.
  const orphanLookup = new Map<string, string>();
  for (const orphan of rowCategoryWithoutType) {
    const key = `${orphan.sheetIdx}:${orphan.itemIdx}:${orphan.rowIdx}`;
    orphanLookup.set(key, ensureGenericTypeFor(orphan.categoryId));
  }

  const migratedSheets = sheets.map((rawSheet, sheetIdx) => {
    if (!isObj(rawSheet)) return rawSheet;
    const items = Array.isArray(rawSheet.items) ? rawSheet.items : [];
    return {
      ...rawSheet,
      items: items.map((rawItem, itemIdx) => {
        if (!isObj(rawItem)) return rawItem;
        if (rawItem.type !== "accountBudget") return rawItem;
        const columns = Array.isArray(rawItem.columns) ? rawItem.columns : [];
        const categoryColIds = new Set<string>();
        const keptColumns = columns.filter((rawCol) => {
          if (!isObj(rawCol)) return true;
          if (rawCol.type === "category" && typeof rawCol.id === "string") {
            categoryColIds.add(rawCol.id);
            return false;
          }
          return true;
        });
        const rows = Array.isArray(rawItem.rows) ? rawItem.rows : [];
        const migratedRows = rows.map((rawRow, rowIdx) => {
          if (!isObj(rawRow)) return rawRow;
          const cells = isObj(rawRow.cells) ? rawRow.cells : {};
          let cellsChanged = false;
          const nextCells: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(cells)) {
            if (categoryColIds.has(k)) {
              cellsChanged = true;
              continue;
            }
            nextCells[k] = v;
          }
          const orphanType = orphanLookup.get(
            `${sheetIdx}:${itemIdx}:${rowIdx}`,
          );
          if (!cellsChanged && !orphanType) return rawRow;
          const nextRow: Record<string, unknown> = {
            ...rawRow,
            cells: nextCells,
          };
          if (orphanType && typeof rawRow.typeId !== "string") {
            nextRow.typeId = orphanType;
          }
          return nextRow;
        });
        return { ...rawItem, columns: keptColumns, rows: migratedRows };
      }),
    };
  });

  // Strip `categoryId` from transactions; if a transaction had only a
  // categoryId (no other type info), synthesize a generic type under
  // that category and attach it.
  const transactions = Array.isArray(v24.transactions) ? v24.transactions : [];
  const migratedTransactions = transactions.map((rawTx) => {
    if (!isObj(rawTx)) return rawTx;
    const { categoryId, ...rest } = rawTx;
    if (typeof categoryId === "string" && categoryId !== "") {
      const next: Record<string, unknown> = { ...rest };
      if (typeof rawTx.typeId !== "string") {
        next.typeId = ensureGenericTypeFor(categoryId);
      }
      return next;
    }
    return rest;
  });

  // Merchant hints: drop categoryId; if the hint had no typeId, mint
  // one under the categoryId so the hint stays useful.
  const merchantHints = isObj(v24.merchantHints) ? v24.merchantHints : {};
  const migratedHints: Record<string, unknown> = {};
  for (const [key, rawHint] of Object.entries(merchantHints)) {
    if (!isObj(rawHint)) continue;
    const { categoryId, ...rest } = rawHint;
    if (typeof rawHint.typeId === "string" && rawHint.typeId !== "") {
      migratedHints[key] = rest;
      continue;
    }
    if (typeof categoryId === "string" && categoryId !== "") {
      migratedHints[key] = {
        ...rest,
        typeId: ensureGenericTypeFor(categoryId),
      };
      continue;
    }
    // No category and no type — the hint carries nothing actionable
    // anymore, so drop it. The validator would drop it on load anyway.
  }

  // Match rules: drop categoryId; if the rule had no typeId, mint one
  // under the categoryId so the rule still labels.
  const matchRules = Array.isArray(v24.matchRules) ? v24.matchRules : [];
  const migratedRules = matchRules.map((rawRule) => {
    if (!isObj(rawRule)) return rawRule;
    const { categoryId, ...rest } = rawRule;
    if (typeof rawRule.typeId === "string" && rawRule.typeId !== "") {
      return rest;
    }
    if (
      (typeof categoryId === "string" && categoryId !== "") ||
      categoryId === null
    ) {
      if (typeof categoryId === "string" && categoryId !== "") {
        return { ...rest, typeId: ensureGenericTypeFor(categoryId) };
      }
    }
    return rest;
  });

  return {
    ...v24,
    version: 25,
    types,
    sheets: migratedSheets,
    transactions: migratedTransactions,
    merchantHints: migratedHints,
    matchRules: migratedRules,
  };
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export type MigrationResult = {
  data: Versioned;
  migrated: boolean;
};

export function migrate(
  raw: Versioned,
  ctx: MigrationContext = {},
): MigrationResult {
  if (raw.version > LATEST_VERSION) {
    throw new Error(
      `Data was created by a newer version of the app (v${raw.version}); ` +
        `this build supports up to v${LATEST_VERSION}.`,
    );
  }
  let current = raw;
  let migrated = false;
  while (current.version < LATEST_VERSION) {
    const step = migrations[current.version];
    if (!step) {
      throw new Error(
        `No migration registered from v${current.version} to v${current.version + 1}.`,
      );
    }
    current = step(current, ctx);
    migrated = true;
  }
  return { data: current, migrated };
}
