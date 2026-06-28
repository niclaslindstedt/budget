// Modern migrations (v31 → v49). Anything from v34 → v35 onward is
// the first migration ordinary readers need to understand today, so
// keeping the modern half scannable matters more than its predecessors.
// Earlier steps (v1 → v30) live in `./legacy.ts`.

import {
  DEFAULT_DEVICE_SETTINGS_DESKTOP,
  DEFAULT_DEVICE_SETTINGS_MOBILE,
  DEFAULT_DOWNLOAD_ACCOUNTS,
  DEFAULT_DOWNLOAD_BUDGET,
  DEFAULT_SEARCH_RANKING,
  DEFAULT_SETTINGS,
} from "../constants/defaults";
import { nsKey } from "../constants/storage";
import { DEVICE_SCOPED_KEYS } from "../settings";
import { newId } from "../sheet";
import { clearRawStorage, readRawStorage } from "../../storage/local-adapter";
import { addDaysIso, todayIso } from "../../utils/date";
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
  // that backs the `AccountRenamePredictorModal` (shown as the last step of
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

  // v44 → v45: introduces user-curated `tags` (cross-cutting labels
  // assigned to budget rows via `Row.tagIds`). Additive — the array is
  // seeded empty; rows gain `tagIds` only when the user assigns a tag
  // in the entry edit / bulk-edit modal. See the Tags tab in Settings.
  44: (v44) => ({ ...v44, version: 45, tags: [] }),

  // v45 → v46: introduces optional `HistoryEntry.userTagIds` (per-entry
  // tag override set from the edit-history modal) and `MatchRule.tagIds`
  // (tags stamped on every match by the label-by-pattern modal). Both
  // are additive and reference the already-existing `tags` array — a
  // v45 record simply lacks them and passes the v46 validator
  // unchanged, so this is a bare version bump.
  45: (v45) => ({ ...v45, version: 46 }),

  // v46 → v47: add `Settings.searchRanking`, the user-tunable knobs for
  // the transaction-search ranker (field weights, match-quality vs
  // field priority, recency mode, amount tolerance, result cap). Seed
  // existing buckets with the defaults so search behaves identically
  // until the user opens the new Search settings tab; the validator
  // coerces a malformed block back to the same defaults.
  46: (v46) => {
    const settings = isObj(v46.settings) ? v46.settings : {};
    return {
      ...v46,
      version: 47,
      settings: {
        ...settings,
        searchRanking: DEFAULT_SEARCH_RANKING,
      },
    };
  },

  // v47 → v48: introduces optional `tagIds` on `HistoryEntrySplit` so a
  // single bank entry split into parts (a Klarna autogiro covering
  // several unrelated purchases) can tag each part independently. Old
  // exports simply lack the field; the synthesizer renders no tags for
  // splits that don't carry it. Bare version bump.
  47: (v47) => ({ ...v47, version: 48 }),

  // v48 → v49: introduces user-curated `subtypes` (the third taxonomy
  // tier below category → type) and `items` (owned physical things the
  // user tracks), plus optional `Row.lineItems` / `HistoryEntry.lineItems`
  // links tying part of an entry's amount to an item. Both collections
  // seed empty; line items are optional per entry, so a v48 record simply
  // lacks them and passes the v49 validator unchanged. Bare additive bump.
  48: (v48) => ({ ...v48, version: 49, subtypes: [], items: [] }),

  // v49 → v50 adds the optional `Company.typeIds` (manual type
  // associations) and retires `Settings.companyTypeAutoFillMinOccurrences`.
  // Both are additive/absence-tolerant — companies without the field
  // validate fine and `validateSettings` rebuilds settings ignoring the
  // dropped knob — so the step is a plain version bump.
  49: (v49) => ({ ...v49, version: 50 }),

  // v50 → v51: introduces user-curated `companyCategories` (merchant
  // kinds the user can classify a company under — grocery stores,
  // pharmacies, fuel …) plus `hiddenPresetCompanyCategoryIds`, and an
  // optional `Company.companyCategoryId`. The runtime layers the
  // built-in `PRESET_COMPANY_CATEGORIES` on top, so both arrays seed
  // empty. Every new field is additive/absence-tolerant — a v50
  // company simply lacks `companyCategoryId` and passes the v51
  // validator unchanged — so the step is a plain additive bump.
  50: (v50) => ({
    ...v50,
    version: 51,
    companyCategories: [],
    hiddenPresetCompanyCategoryIds: [],
  }),

  // v51 → v52: grows `Item` with the inputs the future Item sheet needs —
  // `purchasePrice`, a `depreciation` rule, a `resaleValue` override, and
  // disposal (`disposedAt` / `soldFor`). Every new field is optional per
  // item, so a v51 record simply lacks them and passes the v52 validator
  // unchanged. Bare additive bump.
  51: (v51) => ({ ...v51, version: 52 }),

  // v52 → v53: introduces optional `HistoryEntry.userSeriesId`, the
  // per-entry link tying an imported bank transaction to a recurring
  // series when reconciliation matches it to a series budget row. Old
  // exports simply lack the field — an entry without it validates fine
  // and synthesizes a row with no series link, exactly as before. Bare
  // additive bump.
  52: (v52) => ({ ...v52, version: 53 }),

  // v53 → v54: introduces the Salary sheet's two top-level collections —
  // `salaries` (one entry per paycheck) and `employers` (workplaces with
  // their roles). Both seed empty; old exports simply lack them and a
  // fresh-empty default passes the v54 validator unchanged.
  53: (v53) => ({ ...v53, version: 54, salaries: [], employers: [] }),

  // v54 → v55: introduces `UserData.ignoredItemEntryIds`, the history-
  // entry ids the user ignored from the Items sheet's "Find items" scan
  // (same shape and contract as `recurringDismissals`). Seeds empty; old
  // exports simply lack it and a fresh-empty default passes the v55
  // validator unchanged. Bare additive bump.
  54: (v54) => ({ ...v54, version: 55, ignoredItemEntryIds: [] }),

  // v55 → v56: introduces `UserData.itemFindExclusionPatterns`, the
  // normalised-description keys the user excluded from the Items sheet's
  // "Find items" scan via "Exclude similar". Seeds empty; old exports
  // simply lack it and a fresh-empty default passes the v56 validator
  // unchanged. Bare additive bump.
  55: (v55) => ({ ...v55, version: 56, itemFindExclusionPatterns: [] }),

  // v56 → v57: add `Settings.receiptNamePattern`, the preset that names
  // an item's uploaded receipt file. Seed existing buckets with
  // `"name-date"` (the default) so the choice is well-defined before
  // the user opens the Items settings tab; the validator coerces an
  // unknown value back to the same default.
  56: (v56) => {
    const settings = isObj(v56.settings) ? v56.settings : {};
    return {
      ...v56,
      version: 57,
      settings: {
        ...settings,
        receiptNamePattern: "name-date",
      },
    };
  },

  // v57 → v58: the Salary sheet now binds the bank account its pay
  // lands in (`SalaryView.accountId`) so "Find salaries" scans that
  // account directly instead of prompting for one each time. Seed every
  // existing `salaryView` item with `accountId: null` (unbound) so the
  // v58 validator accepts old exports; the user picks the account from
  // the sheet's edit modal afterwards.
  57: (v57) => {
    const sheets = Array.isArray(v57.sheets) ? v57.sheets : [];
    return {
      ...v57,
      version: 58,
      sheets: sheets.map((raw) => {
        if (!isObj(raw) || !Array.isArray(raw.items)) return raw;
        return {
          ...raw,
          items: raw.items.map((rawItem) => {
            if (!isObj(rawItem) || rawItem.type !== "salaryView")
              return rawItem;
            if ("accountId" in rawItem) return rawItem;
            return { ...rawItem, accountId: null };
          }),
        };
      }),
    };
  },

  // v58 → v59: introduces `UserData.taxProfiles`, the reusable tax-input
  // bundles the Salary sheet uses to estimate a paycheck's gross from its
  // net deposit. Seeds empty; old exports simply lack it and a
  // fresh-empty default passes the v59 validator unchanged.
  // `SalaryView.taxProfileId` is an optional field on existing items, so
  // it needs no migration — a v58 salary sheet simply lacks it and
  // estimates nothing until the user picks a profile. Bare additive bump.
  58: (v58) => ({ ...v58, version: 59, taxProfiles: [] }),

  // v59 → v60: the job title a paycheck was paid under moves from a
  // date-windowed lookup to an explicit `Salary.roleId` reference, and
  // `Role` loses its `startDate` / `endDate` (a role's span is now
  // derived from the salaries that point at it). Resolve each salary's
  // role with the old date-window rule one last time and pin it as a
  // `roleId`, then strip the dates off every role. A salary whose date
  // fell outside every role window simply gets no `roleId` (no title),
  // matching the pre-migration display.
  59: (v59) => {
    const rawEmployers = Array.isArray(v59.employers) ? v59.employers : [];
    // employerId → its date-windowed roles, kept only long enough to
    // resolve each salary's `roleId` before the dates are dropped.
    const roleWindows = new Map<
      string,
      Array<{ id: string; startDate?: string; endDate?: string }>
    >();
    for (const rawEmployer of rawEmployers) {
      if (!isObj(rawEmployer) || typeof rawEmployer.id !== "string") continue;
      const roles = Array.isArray(rawEmployer.roles) ? rawEmployer.roles : [];
      const windows: Array<{
        id: string;
        startDate?: string;
        endDate?: string;
      }> = [];
      for (const rawRole of roles) {
        if (!isObj(rawRole) || typeof rawRole.id !== "string") continue;
        windows.push({
          id: rawRole.id,
          startDate:
            typeof rawRole.startDate === "string"
              ? rawRole.startDate
              : undefined,
          endDate:
            typeof rawRole.endDate === "string" ? rawRole.endDate : undefined,
        });
      }
      roleWindows.set(rawEmployer.id, windows);
    }

    const resolveRoleId = (
      employerId: string | undefined,
      date: string,
    ): string | undefined => {
      if (employerId === undefined) return undefined;
      const windows = roleWindows.get(employerId);
      if (!windows) return undefined;
      // Mirror the old `roleForDate`: the covering role with the latest
      // start wins (the most recent promotion).
      let best: { id: string; startDate?: string } | undefined;
      for (const w of windows) {
        if (w.startDate !== undefined && date < w.startDate) continue;
        if (w.endDate !== undefined && date > w.endDate) continue;
        if (
          best === undefined ||
          (w.startDate ?? "") > (best.startDate ?? "")
        ) {
          best = w;
        }
      }
      return best?.id;
    };

    const rawSalaries = Array.isArray(v59.salaries) ? v59.salaries : [];
    const salaries = rawSalaries.map((raw) => {
      if (!isObj(raw) || typeof raw.date !== "string") return raw;
      const employerId =
        typeof raw.employerId === "string" ? raw.employerId : undefined;
      const roleId = resolveRoleId(employerId, raw.date);
      if (roleId === undefined) return raw;
      return { ...raw, roleId };
    });

    const employers = rawEmployers.map((raw) => {
      if (!isObj(raw) || !Array.isArray(raw.roles)) return raw;
      return {
        ...raw,
        roles: raw.roles.map((rawRole) => {
          if (!isObj(rawRole)) return rawRole;
          const { startDate: _s, endDate: _e, ...rest } = rawRole;
          void _s;
          void _e;
          return rest;
        }),
      };
    });

    return { ...v59, version: 60, salaries, employers };
  },

  // v60 → v61: a line item no longer carries its own `amount` — it is now
  // purely a link from a transaction to an owned `Item`, and what the item
  // cost lives on the item (`Item.purchasePrice`). Fold each link's old
  // amount onto its item: the first link that references an item whose
  // `purchasePrice` is unset seeds the price from `Math.abs(amount)`
  // (purchase prices are non-negative; the link amount was signed by the
  // transaction's direction). Then strip `amount` off every link across
  // both budget rows and bank history so the persisted shape matches the
  // new type. Items already carrying a price are left untouched.
  60: (v60) => {
    const rawItems = Array.isArray(v60.items) ? v60.items : [];
    // itemId → the price to seed, captured from the first link that names an
    // item still lacking a `purchasePrice`.
    const seededPrice = new Map<string, number>();
    const hasPrice = new Set<string>();
    for (const rawItem of rawItems) {
      if (!isObj(rawItem) || typeof rawItem.id !== "string") continue;
      if (
        typeof rawItem.purchasePrice === "number" &&
        Number.isFinite(rawItem.purchasePrice)
      ) {
        hasPrice.add(rawItem.id);
      }
    }

    // Walk every inline `lineItems` array, recording a price for items that
    // need one and returning the array with `amount` stripped from each link.
    const stripLinks = (raw: unknown): unknown => {
      if (!Array.isArray(raw)) return raw;
      return raw.map((link) => {
        if (!isObj(link)) return link;
        const itemId =
          typeof link.itemId === "string" ? link.itemId : undefined;
        const amount =
          typeof link.amount === "number" && Number.isFinite(link.amount)
            ? link.amount
            : undefined;
        if (
          itemId !== undefined &&
          amount !== undefined &&
          !hasPrice.has(itemId) &&
          !seededPrice.has(itemId)
        ) {
          seededPrice.set(itemId, Math.abs(amount));
        }
        const { amount: _drop, ...rest } = link;
        void _drop;
        return rest;
      });
    };

    const sheets = Array.isArray(v60.sheets)
      ? v60.sheets.map((sheet) => {
          if (!isObj(sheet) || !Array.isArray(sheet.items)) return sheet;
          return {
            ...sheet,
            items: sheet.items.map((item) => {
              if (!isObj(item) || !Array.isArray(item.rows)) return item;
              return {
                ...item,
                rows: item.rows.map((row) => {
                  if (!isObj(row) || row.lineItems === undefined) return row;
                  return { ...row, lineItems: stripLinks(row.lineItems) };
                }),
              };
            }),
          };
        })
      : v60.sheets;

    const history = isObj(v60.history)
      ? Object.fromEntries(
          Object.entries(v60.history).map(([accountId, entries]) => {
            if (!Array.isArray(entries)) return [accountId, entries];
            return [
              accountId,
              entries.map((entry) => {
                if (!isObj(entry) || entry.lineItems === undefined)
                  return entry;
                return { ...entry, lineItems: stripLinks(entry.lineItems) };
              }),
            ];
          }),
        )
      : v60.history;

    const items = rawItems.map((item) => {
      if (!isObj(item) || typeof item.id !== "string") return item;
      const price = seededPrice.get(item.id);
      if (price === undefined) return item;
      return { ...item, purchasePrice: price };
    });

    return { ...v60, version: 61, sheets, history, items };
  },

  // v61 → v62: introduces `UserData.properties`, the homes / apartments
  // rendered by the new Properties sheet (each with its purchase amount,
  // a manually recorded value history, and the mortgages against it).
  // Seeds empty; old exports simply lack it and a fresh-empty default
  // passes the v62 validator unchanged. Bare additive bump.
  61: (v61) => ({ ...v61, version: 62, properties: [] }),

  // v62 → v63: merges the two mortgage preset types — "Mortgage principal"
  // (`preset-type-mortgage`) and "Mortgage interest"
  // (`preset-type-mortgage-interest`) — into a single "Mortgage" type
  // (`preset-type-mortgage`). Every stored reference to the interest id is
  // remapped to the surviving id so no row / entry / rule / hint orphans;
  // the interest preset is then gone from the picker. Mirrors the
  // `deleteType` cascade's reference-site list, extended to the sites that
  // cascade skips for presets (history overrides, splits, transfers,
  // hidden / kind-override / item-find lists).
  //
  // The same step collapses each `MortgagePayment` from its old
  // `principal` + `interest` legs into a single `amount = principal +
  // interest`, matching the simplified payment shape. The Properties
  // feature is unreleased, but the `/preview` and `/branch` slots may hold
  // v62 mortgage data, so the conversion runs rather than relying on the
  // validator's fold-back.
  62: (v62) => {
    const OLD = "preset-type-mortgage-interest";
    const NEW = "preset-type-mortgage";
    const remap = (id: unknown): unknown => (id === OLD ? NEW : id);
    // Remap an id array and drop the duplicate the merge can introduce
    // (both the old and new id present collapse to one entry).
    const remapIdList = (arr: unknown): unknown => {
      if (!Array.isArray(arr)) return arr;
      const seen = new Set<unknown>();
      const out: unknown[] = [];
      for (const raw of arr) {
        const id = remap(raw);
        if (seen.has(id)) continue;
        seen.add(id);
        out.push(id);
      }
      return out;
    };
    // Set `obj[key]` to its remapped value, returning a fresh object only
    // when the value actually changes so untouched records stay identical.
    const remapField = <T extends Record<string, unknown>>(
      obj: T,
      key: string,
    ): T => {
      if (!(key in obj)) return obj;
      const next = remap(obj[key]);
      return next === obj[key] ? obj : { ...obj, [key]: next };
    };

    const sheets = Array.isArray(v62.sheets)
      ? v62.sheets.map((sheet) => {
          if (!isObj(sheet) || !Array.isArray(sheet.items)) return sheet;
          return {
            ...sheet,
            items: sheet.items.map((item) => {
              if (!isObj(item) || !Array.isArray(item.rows)) return item;
              return {
                ...item,
                rows: item.rows.map((row) =>
                  isObj(row) ? remapField(row, "typeId") : row,
                ),
              };
            }),
          };
        })
      : v62.sheets;

    const history = isObj(v62.history)
      ? Object.fromEntries(
          Object.entries(v62.history).map(([accountId, entries]) => {
            if (!Array.isArray(entries)) return [accountId, entries];
            return [
              accountId,
              entries.map((entry) => {
                if (!isObj(entry)) return entry;
                let next = remapField(entry, "userTypeId");
                const rawSplits = next.splits;
                if (Array.isArray(rawSplits)) {
                  const splits = rawSplits.map((s) =>
                    isObj(s) ? remapField(s, "typeId") : s,
                  );
                  if (splits.some((s, i) => s !== rawSplits[i]))
                    next = { ...next, splits };
                }
                return next;
              }),
            ];
          }),
        )
      : v62.history;

    const transfers = Array.isArray(v62.transfers)
      ? v62.transfers.map((tx) => (isObj(tx) ? remapField(tx, "typeId") : tx))
      : v62.transfers;

    const matchRules = Array.isArray(v62.matchRules)
      ? v62.matchRules.map((rule) =>
          isObj(rule) ? remapField(rule, "typeId") : rule,
        )
      : v62.matchRules;

    const merchantHints = isObj(v62.merchantHints)
      ? Object.fromEntries(
          Object.entries(v62.merchantHints).map(([key, hint]) => [
            key,
            isObj(hint) ? remapField(hint, "typeId") : hint,
          ]),
        )
      : v62.merchantHints;

    const companies = Array.isArray(v62.companies)
      ? v62.companies.map((c) => {
          if (!isObj(c) || !Array.isArray(c.typeIds)) return c;
          return { ...c, typeIds: remapIdList(c.typeIds) };
        })
      : v62.companies;

    const subtypes = Array.isArray(v62.subtypes)
      ? v62.subtypes.map((s) => (isObj(s) ? remapField(s, "typeId") : s))
      : v62.subtypes;

    const hiddenPresetTypeIds = remapIdList(v62.hiddenPresetTypeIds);

    // The kind override is keyed by preset id. Drop the interest key; the
    // surviving "Mortgage" type keeps its own override (or its built-in
    // expense kind when none was set).
    const presetTypeKindOverrides = isObj(v62.presetTypeKindOverrides)
      ? Object.fromEntries(
          Object.entries(v62.presetTypeKindOverrides).filter(
            ([key]) => key !== OLD,
          ),
        )
      : v62.presetTypeKindOverrides;

    const settings = isObj(v62.settings)
      ? {
          ...v62.settings,
          itemFindTypeIds: remapIdList(v62.settings.itemFindTypeIds),
        }
      : v62.settings;

    // Collapse each mortgage payment's principal + interest legs into one
    // amount, dropping the now-defunct `interestSourceHistoryId`.
    const properties = Array.isArray(v62.properties)
      ? v62.properties.map((property) => {
          if (!isObj(property) || !Array.isArray(property.mortgages))
            return property;
          return {
            ...property,
            mortgages: property.mortgages.map((mortgage) => {
              if (!isObj(mortgage) || !Array.isArray(mortgage.payments))
                return mortgage;
              return {
                ...mortgage,
                payments: mortgage.payments.map((pay) => {
                  if (!isObj(pay)) return pay;
                  const principal =
                    typeof pay.principal === "number" ? pay.principal : 0;
                  const interest =
                    typeof pay.interest === "number" ? pay.interest : 0;
                  const amount =
                    typeof pay.amount === "number"
                      ? pay.amount
                      : principal + interest;
                  const {
                    principal: _p,
                    interest: _i,
                    interestSourceHistoryId: _isid,
                    ...rest
                  } = pay;
                  void _p;
                  void _i;
                  void _isid;
                  return { ...rest, amount };
                }),
              };
            }),
          };
        })
      : v62.properties;

    return {
      ...v62,
      version: 63,
      sheets,
      history,
      transfers,
      matchRules,
      merchantHints,
      companies,
      subtypes,
      hiddenPresetTypeIds,
      presetTypeKindOverrides,
      settings,
      properties,
    };
  },

  // v63 → v64: a property's lender moves from each mortgage up to the
  // property — every loan against a home is paid to the same bank, so one
  // `companyId` belongs on the property, not repeated per mortgage. Lift
  // the first mortgage's `companyId` onto the property (when it doesn't
  // already carry one) and strip it from every mortgage. The Properties
  // feature is unreleased, but the `/preview` and `/branch` slots may hold
  // v63 mortgage-level lenders, so the lift runs rather than dropping them.
  63: (v63) => {
    const properties = Array.isArray(v63.properties)
      ? v63.properties.map((property) => {
          if (!isObj(property) || !Array.isArray(property.mortgages))
            return property;
          let companyId =
            typeof property.companyId === "string"
              ? property.companyId
              : undefined;
          const mortgages = property.mortgages.map((mortgage) => {
            if (!isObj(mortgage) || typeof mortgage.companyId !== "string")
              return mortgage;
            if (companyId === undefined) companyId = mortgage.companyId;
            const { companyId: _drop, ...rest } = mortgage;
            void _drop;
            return rest;
          });
          return companyId === undefined
            ? { ...property, mortgages }
            : { ...property, companyId, mortgages };
        })
      : v63.properties;
    return { ...v63, version: 64, properties };
  },

  // v64 → v65: the bound bank account moves from each mortgage up to the
  // property — a property is paid to the bank as a single charge covering
  // every loan against it, so one `accountId` belongs on the property, not
  // repeated per mortgage (mirrors the v63 → v64 lender lift). Lift the
  // first mortgage's `accountId` onto the property (when it doesn't already
  // carry one) and strip it from every mortgage. The Properties feature is
  // unreleased, but the `/preview` and `/branch` slots may hold v64
  // mortgage-level accounts, so the lift runs rather than dropping them.
  64: (v64) => {
    const properties = Array.isArray(v64.properties)
      ? v64.properties.map((property) => {
          if (!isObj(property) || !Array.isArray(property.mortgages))
            return property;
          let accountId =
            typeof property.accountId === "string"
              ? property.accountId
              : undefined;
          const mortgages = property.mortgages.map((mortgage) => {
            if (!isObj(mortgage) || !("accountId" in mortgage)) return mortgage;
            if (
              accountId === undefined &&
              typeof mortgage.accountId === "string"
            )
              accountId = mortgage.accountId;
            const { accountId: _drop, ...rest } = mortgage;
            void _drop;
            return rest;
          });
          return accountId === undefined
            ? { ...property, mortgages }
            : { ...property, accountId, mortgages };
        })
      : v64.properties;
    return { ...v64, version: 65, properties };
  },
  // Introduces the optional `Sheet.favorite` flag (up to 3 sheets can be
  // favorited and pinned to the bottom bar). Purely additive — absent ⇒
  // not favorited — so no per-sheet transformation is needed.
  65: (v65) => ({ ...v65, version: 66 }),

  // v66 → v67: introduces `Property.repairs`, the transaction-linked
  // repairs / renovations on each property (each sourced from a bank charge
  // the user tagged Repairs / Renovations, recorded for a future deductible
  // "net value" calc). Seeds an empty list on every property; old exports
  // simply lack it and the v67 validator fills `repairs: []` regardless, so
  // this is a bare additive bump that keeps the persisted shape explicit.
  66: (v66) => {
    const properties = Array.isArray(v66.properties)
      ? v66.properties.map((property) =>
          isObj(property)
            ? { ...property, repairs: property.repairs ?? [] }
            : property,
        )
      : v66.properties;
    return { ...v66, version: 67, properties };
  },

  // v67 → v68: introduces property file uploads. Seeds `files: []` on every
  // property and `fileCategories: []` on the workspace (both additive, filled
  // by the v68 validator regardless). It also **clears any existing
  // `PropertyRepair.receiptPath`**: repair receipts move from the sibling
  // `receipts/` folder into the new per-property `properties/` store
  // (`<name>/receipts/`), so the old paths no longer resolve. Dropping the
  // stale reference (rather than leaving it dangling) makes those repairs read
  // as "missing receipt" so the user can re-upload, instead of a viewer that
  // 404s. The orphaned old bytes are left in `receipts/` — few users have any,
  // and the reducer has no file-system reach to move them.
  67: (v67) => {
    const properties = Array.isArray(v67.properties)
      ? v67.properties.map((property) => {
          if (!isObj(property)) return property;
          const repairs = Array.isArray(property.repairs)
            ? property.repairs.map((repair) => {
                if (!isObj(repair) || !("receiptPath" in repair)) return repair;
                const { receiptPath: _drop, ...rest } = repair;
                void _drop;
                return rest;
              })
            : property.repairs;
          return { ...property, repairs, files: property.files ?? [] };
        })
      : v67.properties;
    return { ...v67, version: 68, properties, fileCategories: [] };
  },

  // v68 → v69: a property repair / renovation now owns a **list** of dated
  // receipts (`receipts`) instead of a single `receiptPath` — a job can arrive
  // as several invoices over time, each on its own date. Converts any existing
  // single `receiptPath` into a one-element list, dating that receipt with the
  // repair's own date (the only date we have for the pre-existing document).
  // The receipt id is derived from the repair id (one receipt per repair
  // pre-migration) so the transform stays deterministic. Repairs with no
  // receipt are untouched — this is otherwise additive.
  68: (v68) => {
    const properties = Array.isArray(v68.properties)
      ? v68.properties.map((property) => {
          if (!isObj(property) || !Array.isArray(property.repairs))
            return property;
          const repairs = property.repairs.map((repair) => {
            if (!isObj(repair) || !("receiptPath" in repair)) return repair;
            const { receiptPath, ...rest } = repair;
            if (typeof receiptPath !== "string" || receiptPath === "")
              return rest;
            const date =
              typeof rest.date === "string" ? rest.date.slice(0, 10) : "";
            return {
              ...rest,
              receipts: [
                { id: `${String(rest.id)}-receipt`, path: receiptPath, date },
              ],
            };
          });
          return { ...property, repairs };
        })
      : v68.properties;
    return { ...v68, version: 69, properties };
  },

  // v69 → v70: introduces `UserData.savings`, the savings accounts rendered by
  // the new Savings sheet (each with its bank details and a manually-recorded
  // balance history). Seeds empty; old exports simply lack it and the v70
  // validator fills `savings: []` regardless, so this is a bare additive bump.
  69: (v69) => ({ ...v69, version: 70, savings: [] }),

  // v70 → v71: repair history entries stranded by a pre-fix
  // `cutAccountHistory`. Cutting an account's history dropped the
  // transfers that predated the cutoff but never restored the bank
  // entries those transfers had collapsed, leaving the partner leg on
  // the *other* account `hidden` with a `collapsedIntoTransferId`
  // pointing at a transfer that no longer exists — invisible in its
  // account and permanently excluded from transfer detection. Un-hide
  // and clear the backref on every entry whose `collapsedIntoTransferId`
  // matches no surviving transfer, so those legs reappear and can
  // re-pair on a future import. Entries pointing at a live transfer are
  // untouched. Additive in spirit — no shape change beyond removing two
  // optional fields from the affected entries.
  70: (v70) => {
    const transferIds = new Set<string>();
    if (Array.isArray(v70.transfers)) {
      for (const tx of v70.transfers) {
        if (isObj(tx) && typeof tx.id === "string") transferIds.add(tx.id);
      }
    }
    const history = isObj(v70.history)
      ? Object.fromEntries(
          Object.entries(v70.history).map(([accountId, entries]) => {
            if (!Array.isArray(entries)) return [accountId, entries];
            return [
              accountId,
              entries.map((entry) => {
                if (
                  !isObj(entry) ||
                  typeof entry.collapsedIntoTransferId !== "string" ||
                  transferIds.has(entry.collapsedIntoTransferId)
                ) {
                  return entry;
                }
                const {
                  collapsedIntoTransferId: _drop,
                  hidden: _hidden,
                  ...rest
                } = entry;
                void _drop;
                void _hidden;
                return rest;
              }),
            ];
          }),
        )
      : v70.history;
    return { ...v70, version: 71, history };
  },
  // Bare bump: adds the `customTheme.tableSpacing` preset. The settings
  // validator fills it from the canonical default when absent, so older
  // buckets upgrade cleanly without touching the blob here.
  71: (v71) => ({ ...v71, version: 72 }),

  // v72 → v73: introduces `UserData.loans`, the loans rendered by the new
  // Loans sheet (terms, recorded payments, learned payment patterns).
  // Seeds empty; old exports simply lack it and the v73 validator fills
  // `loans: []` regardless, so this is a bare additive bump.
  72: (v72) => ({ ...v72, version: 73, loans: [] }),

  // v73 → v74: a mortgage loan links MANY property mortgages instead of
  // one — `Loan.mortgageId: string` becomes `Loan.mortgageIds: string[]`,
  // because a property's combined monthly charge covers every loan
  // against it and the Loans sheet lists that as one row. Existing
  // single links convert to one-element arrays.
  73: (v73) => {
    const loans = Array.isArray(v73.loans)
      ? v73.loans.map((loan) => {
          if (!isObj(loan) || typeof loan.mortgageId !== "string") return loan;
          const { mortgageId, ...rest } = loan;
          return { ...rest, mortgageIds: [mortgageId] };
        })
      : v73.loans;
    return { ...v73, version: 74, loans };
  },

  // v74 → v75: loans gain dated balance snapshots (`Loan.balanceHistory`,
  // recorded via "Update balance" on the row's "…" menu, every kind) and
  // lose the hand-entered `monthlyPayment` — the Monthly column now
  // derives from the recorded payments. A STUDENT loan's start sum also
  // converts to one snapshot and is dropped: CSN debt accrues over the
  // study years, so the editor no longer collects a starting principal
  // for that kind. The snapshot folds in the financed setup fee, dated
  // at the start date when recorded; without one it lands the day before
  // the earliest payment so every payment still amortises from it —
  // preserving the old "start sum + fee − payments" figure — or today as
  // the last resort (no payments ⇒ the date can't change the derived
  // balance). Other kinds keep `startSum`, which now acts as the
  // implicit opening balance anchor.
  74: (v74) => {
    const loans = Array.isArray(v74.loans)
      ? v74.loans.map((loan) => {
          if (!isObj(loan)) return loan;
          const { monthlyPayment: _monthlyPayment, ...kept } = loan;
          void _monthlyPayment;
          if (kept.kind !== "student") {
            return { ...kept, balanceHistory: [] };
          }
          const { startSum, ...rest } = kept;
          const balanceHistory: unknown[] = [];
          if (typeof startSum === "number" && Number.isFinite(startSum)) {
            const fee =
              typeof rest.startFee === "number" &&
              Number.isFinite(rest.startFee)
                ? rest.startFee
                : 0;
            let date: string | undefined =
              typeof rest.startDate === "string" ? rest.startDate : undefined;
            if (date === undefined && Array.isArray(rest.payments)) {
              for (const payment of rest.payments) {
                if (!isObj(payment) || typeof payment.date !== "string")
                  continue;
                if (date === undefined || payment.date < date)
                  date = payment.date;
              }
              if (date !== undefined) date = addDaysIso(date, -1);
            }
            balanceHistory.push({
              id: newId(),
              date: date ?? todayIso(),
              value: startSum + fee,
            });
          }
          return { ...rest, balanceHistory };
        })
      : v74.loans;
    return { ...v74, version: 75, loans };
  },

  // Bare bump: grows `Item` with an optional `lifetimeYears` (expected
  // useful life driving the spending dashboard's "spread item costs"
  // mode). Absent on every pre-v76 item, and the validator simply omits
  // it when missing, so the blob needs no touch-up.
  75: (v75) => ({ ...v75, version: 76 }),

  // v76 → v77: introduces `UserData.investmentHoldings` and
  // `UserData.investmentStocks`, the two collections rendered by the new
  // Investment sheet (broad holdings with a hand-recorded value history,
  // and privately-bought single stocks tracked at the share level). Both
  // seed empty; old exports simply lack them and the v77 validator fills
  // `[]` regardless, so this is a bare additive bump.
  76: (v76) => ({
    ...v76,
    version: 77,
    investmentHoldings: [],
    investmentStocks: [],
  }),

  // v77 → v78: items gain dated value snapshots (`Item.valueHistory`,
  // an `ItemValuePoint[]`), recorded via the Items sheet's "Update value"
  // modal so an appreciating item (art, collectibles) tracks its rising
  // value over time and feeds the net-worth roll-up. The field is optional
  // and absent on every old export — the v78 validator simply omits it
  // when missing, so this is a bare additive bump.
  77: (v77) => ({ ...v77, version: 78 }),

  // v78 → v79: a property mortgage gains `amortizationHistory`
  // (`MortgageAmortizationChange[]`), the effective-dated amortisation-plan
  // changes that mirror `rateHistory` — so a bank-agreed step (e.g. 3% → 2%)
  // splits each historical payment against the plan in effect that month. The
  // field is optional and absent on every old export; the v79 validator omits
  // it when missing, so this is a bare additive bump.
  78: (v78) => ({ ...v78, version: 79 }),

  // v79 → v80: a property gains `associationLoan` (`AssociationLoan`), its
  // share of the housing association's own debt — a figure per kvm / sqft plus
  // the association's interest rate, the way an årsredovisning reports it. The
  // value chart deducts the indirect interest that rides the monthly fee so a
  // high-fee flat no longer looks like pure gain. The field is optional and
  // absent on every old export; the v80 validator omits it when missing, so
  // this is a bare additive bump.
  79: (v79) => ({ ...v79, version: 80 }),

  // v80 → v81: a budget row / history entry gains optional `ignored`, the
  // "ignore for statistics" flag set from the entry "…" menu. An ignored
  // entry stays in the ledger and running balance but drops out of the
  // spending dashboard's facts. The field is optional and absent on every
  // old export; the v81 validator omits it when missing, so this is a bare
  // additive bump.
  80: (v80) => ({ ...v80, version: 81 }),

  // v81 → v82: introduces `UserData.duplicateIgnores`, the "not a
  // duplicate" rules the cross-account duplicate finder consults to skip
  // a legitimate same-day, same-amount charge that posts to two accounts
  // (a recurring card payment). Seeds empty; old exports simply lack it
  // and a fresh-empty default passes the v82 validator unchanged. Bare
  // additive bump.
  81: (v81) => ({ ...v81, version: 82, duplicateIgnores: [] }),
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
