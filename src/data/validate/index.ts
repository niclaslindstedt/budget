import { PRESET_CATEGORY_IDS, PRESET_ENTRY_TYPE_IDS } from "../constants";
import { LATEST_VERSION } from "../migrations";
import type {
  Account,
  Category,
  Company,
  EntryType,
  HistoryEntry,
  HistoryImport,
  MatchRule,
  MerchantHint,
  PrimaryIncomeMerchant,
  RenamePattern,
  SeriesMatchRule,
  SeriesMetadata,
  Sheet,
  Transfer,
  UserData,
} from "../types";
import {
  validateAccount,
  validateCategory,
  validateCompany,
  validateEntryType,
} from "./account";
import { fail, isObject, sanitizeStringArray, type Result } from "./helpers";
import {
  validateHistoryEntry,
  validateHistoryImport,
  validateTransfer,
} from "./history";
import {
  validateMatchRule,
  validateMerchantHint,
  validatePresetTypeKindOverrides,
  validatePrimaryIncomeMerchant,
  validateRenamePattern,
  validateSeriesMatchRule,
  validateSeriesMetadata,
} from "./rules";
import { validateSettings } from "./settings";
import { validateSheet } from "./sheet";

export type { Result } from "./helpers";

export function validateUserData(raw: unknown): Result<UserData> {
  if (!isObject(raw)) return fail("root", "expected an object");
  if (raw.version !== LATEST_VERSION)
    return fail(
      "version",
      `expected ${LATEST_VERSION}, got ${String(raw.version)}`,
    );
  if (!Array.isArray(raw.sheets) || raw.sheets.length === 0)
    return fail("sheets", "expected a non-empty array");
  if (typeof raw.activeSheetId !== "string")
    return fail("activeSheetId", "expected a string");

  const rawAccounts = Array.isArray(raw.accounts) ? raw.accounts : [];
  const accounts: Account[] = [];
  const seenAccountIds = new Set<string>();
  for (let i = 0; i < rawAccounts.length; i++) {
    const r = validateAccount(rawAccounts[i], `accounts[${i}]`);
    if (!r.ok) return r;
    if (seenAccountIds.has(r.value.id))
      return fail(`accounts[${i}].id`, `duplicate id "${r.value.id}"`);
    seenAccountIds.add(r.value.id);
    accounts.push(r.value);
  }

  const rawCompanies = Array.isArray(raw.companies) ? raw.companies : [];
  const companies: Company[] = [];
  const seenCompanyIds = new Set<string>();
  for (let i = 0; i < rawCompanies.length; i++) {
    const r = validateCompany(rawCompanies[i], `companies[${i}]`);
    if (!r.ok) return r;
    if (seenCompanyIds.has(r.value.id))
      return fail(`companies[${i}].id`, `duplicate id "${r.value.id}"`);
    seenCompanyIds.add(r.value.id);
    companies.push(r.value);
  }
  const knownCompanyIds: ReadonlySet<string> = seenCompanyIds;

  const rawCategories = Array.isArray(raw.categories) ? raw.categories : [];
  const categories: Category[] = [];
  const seenCategoryIds = new Set<string>();
  for (let i = 0; i < rawCategories.length; i++) {
    const r = validateCategory(rawCategories[i], `categories[${i}]`);
    if (!r.ok) return r;
    if (seenCategoryIds.has(r.value.id))
      return fail(`categories[${i}].id`, `duplicate id "${r.value.id}"`);
    // Reject user-added rows that collide with a preset id — preset
    // ids are reserved so the runtime can always resolve them to the
    // built-in definition.
    if (PRESET_CATEGORY_IDS.has(r.value.id))
      return fail(
        `categories[${i}].id`,
        `collides with preset id "${r.value.id}"`,
      );
    seenCategoryIds.add(r.value.id);
    categories.push(r.value);
  }

  // Resolvable category-id set built before types validate so a
  // type's `categoryId` can be checked against it. Preset ids resolve
  // to the built-in definitions in `data/constants.ts`; user-added
  // ids resolve to entries in the array above. Hidden presets stay
  // resolvable — hiding only affects picker / admin visibility, not
  // referential integrity.
  const knownCategoryIds = new Set<string>([
    ...PRESET_CATEGORY_IDS,
    ...seenCategoryIds,
  ]);

  const rawTypes = Array.isArray(raw.types) ? raw.types : [];
  const types: EntryType[] = [];
  const seenTypeIds = new Set<string>();
  for (let i = 0; i < rawTypes.length; i++) {
    const r = validateEntryType(rawTypes[i], `types[${i}]`, knownCategoryIds);
    if (!r.ok) return r;
    if (seenTypeIds.has(r.value.id))
      return fail(`types[${i}].id`, `duplicate id "${r.value.id}"`);
    if (PRESET_ENTRY_TYPE_IDS.has(r.value.id))
      return fail(`types[${i}].id`, `collides with preset id "${r.value.id}"`);
    seenTypeIds.add(r.value.id);
    types.push(r.value);
  }

  const knownTypeIds = new Set<string>([
    ...PRESET_ENTRY_TYPE_IDS,
    ...seenTypeIds,
  ]);

  const rawTransfers = Array.isArray(raw.transfers) ? raw.transfers : [];
  const transfers: Transfer[] = [];
  const seenTransferIds = new Set<string>();
  for (let i = 0; i < rawTransfers.length; i++) {
    const r = validateTransfer(
      rawTransfers[i],
      `transfers[${i}]`,
      seenAccountIds,
      knownTypeIds,
    );
    if (!r.ok) return r;
    if (seenTransferIds.has(r.value.id))
      return fail(`transfers[${i}].id`, `duplicate id "${r.value.id}"`);
    seenTransferIds.add(r.value.id);
    transfers.push(r.value);
  }

  const sheets: Sheet[] = [];
  const seenSheetIds = new Set<string>();
  for (let i = 0; i < raw.sheets.length; i++) {
    const r = validateSheet(
      raw.sheets[i],
      `sheets[${i}]`,
      seenAccountIds,
      knownTypeIds,
      knownCompanyIds,
    );
    if (!r.ok) return r;
    if (seenSheetIds.has(r.value.id))
      return fail(`sheets[${i}].id`, `duplicate id "${r.value.id}"`);
    seenSheetIds.add(r.value.id);
    sheets.push(r.value);
  }

  // Recover gracefully if activeSheetId points at a missing sheet.
  const activeSheetId = seenSheetIds.has(raw.activeSheetId)
    ? raw.activeSheetId
    : sheets[0].id;

  // `history` and `historyImports` are per-account maps. Entries
  // belonging to a deleted account are silently dropped so removing
  // an account can't make the workspace unloadable, and duplicate
  // entry ids within an account collapse to one (the parser is
  // expected to dedup, but a hand-edited file shouldn't crash).
  const rawHistory = isObject(raw.history) ? raw.history : {};
  const history: Record<string, HistoryEntry[]> = {};
  for (const [accountId, rawEntries] of Object.entries(rawHistory)) {
    if (!seenAccountIds.has(accountId)) continue;
    if (!Array.isArray(rawEntries)) continue;
    const entries: HistoryEntry[] = [];
    const seenIds = new Set<string>();
    for (let i = 0; i < rawEntries.length; i++) {
      const r = validateHistoryEntry(
        rawEntries[i],
        `history.${accountId}[${i}]`,
        knownTypeIds,
        knownCompanyIds,
      );
      if (!r.ok) return r;
      if (seenIds.has(r.value.id)) continue;
      seenIds.add(r.value.id);
      entries.push(r.value);
    }
    if (entries.length > 0) history[accountId] = entries;
  }

  const rawHistoryImports = isObject(raw.historyImports)
    ? raw.historyImports
    : {};
  const historyImports: Record<string, HistoryImport[]> = {};
  for (const [accountId, rawImports] of Object.entries(rawHistoryImports)) {
    if (!seenAccountIds.has(accountId)) continue;
    if (!Array.isArray(rawImports)) continue;
    const imports: HistoryImport[] = [];
    for (let i = 0; i < rawImports.length; i++) {
      const r = validateHistoryImport(
        rawImports[i],
        `historyImports.${accountId}[${i}]`,
      );
      if (!r.ok) return r;
      imports.push(r.value);
    }
    if (imports.length > 0) historyImports[accountId] = imports;
  }

  // Merchant-hint memory. Each entry is independent and advisory, so
  // a single bad hint should never reject the whole load — bogus
  // entries are silently dropped. Hints whose typeId no longer
  // resolves are also dropped so a deleted type doesn't leave zombies
  // behind.
  const rawHints = isObject(raw.merchantHints) ? raw.merchantHints : {};
  const merchantHints: Record<string, MerchantHint> = {};
  for (const [key, value] of Object.entries(rawHints)) {
    if (typeof key !== "string" || key === "") continue;
    const hint = validateMerchantHint(value, knownTypeIds, knownCompanyIds);
    if (hint) merchantHints[key] = hint;
  }

  // Dismissal allowlists. Both are plain string arrays — we strip
  // duplicates and empty values so a hand-edited file can't bloat
  // the lookup sets the detectors build from them.
  const recurringDismissals = sanitizeStringArray(raw.recurringDismissals);
  const transferCollapseDismissals = sanitizeStringArray(
    raw.transferCollapseDismissals,
  );

  // User-authored wildcard match rules. Like merchant hints, each
  // rule is advisory and independent — a bogus entry is silently
  // dropped rather than rejecting the load. Duplicate ids collapse
  // to the first occurrence so a hand-edited file can't trap the
  // loader in a referentially ambiguous state.
  const rawRules = Array.isArray(raw.matchRules) ? raw.matchRules : [];
  const matchRules: MatchRule[] = [];
  const seenRuleIds = new Set<string>();
  for (const rawRule of rawRules) {
    const rule = validateMatchRule(rawRule, knownTypeIds, knownCompanyIds);
    if (!rule) continue;
    if (seenRuleIds.has(rule.id)) continue;
    seenRuleIds.add(rule.id);
    matchRules.push(rule);
  }

  // Auto-reconciliation rules learned from "Apply to whole series".
  // Advisory and independent — duplicates collapse to the first
  // occurrence so a hand-edited file can't trap the loader in an
  // ambiguous state.
  const rawSeriesRules = Array.isArray(raw.seriesMatchRules)
    ? raw.seriesMatchRules
    : [];
  const seriesMatchRules: SeriesMatchRule[] = [];
  const seenSeriesRuleIds = new Set<string>();
  for (const rawRule of rawSeriesRules) {
    const rule = validateSeriesMatchRule(rawRule);
    if (!rule) continue;
    if (seenSeriesRuleIds.has(rule.id)) continue;
    seenSeriesRuleIds.add(rule.id);
    seriesMatchRules.push(rule);
  }

  // Per-account rename memory. Each account bucket is an independent
  // record of normalised-bank-description → user-typed label; bogus
  // entries are silently dropped (the patterns are advisory and
  // re-learn naturally as the user renames things). Buckets keyed by
  // an account id that no longer resolves are dropped too — no point
  // suggesting renames for accounts the user removed.
  const rawRenamePatterns = isObject(raw.renamePatterns)
    ? raw.renamePatterns
    : {};
  const renamePatterns: Record<string, Record<string, RenamePattern>> = {};
  for (const [accountId, rawBucket] of Object.entries(rawRenamePatterns)) {
    if (!seenAccountIds.has(accountId)) continue;
    if (!isObject(rawBucket)) continue;
    const bucket: Record<string, RenamePattern> = {};
    for (const [key, rawPattern] of Object.entries(rawBucket)) {
      if (typeof key !== "string" || key === "") continue;
      const pattern = validateRenamePattern(rawPattern, knownCompanyIds);
      if (pattern) bucket[key] = pattern;
    }
    if (Object.keys(bucket).length > 0) renamePatterns[accountId] = bucket;
  }

  // Hide-list allowlists for preset entries. Both arrays are
  // sanitised (duplicates / empty strings stripped) and intersected
  // with the active preset id sets so an entry that no longer matches
  // a known preset — e.g. a preset removed in a later app version —
  // is silently dropped on load.
  const hiddenPresetTypeIds = sanitizeStringArray(
    raw.hiddenPresetTypeIds,
  ).filter((id) => PRESET_ENTRY_TYPE_IDS.has(id));
  const hiddenPresetCategoryIds = sanitizeStringArray(
    raw.hiddenPresetCategoryIds,
  ).filter((id) => PRESET_CATEGORY_IDS.has(id));
  const presetTypeKindOverrides = validatePresetTypeKindOverrides(
    raw.presetTypeKindOverrides,
  );

  // Per-series user metadata. Each entry is independent and the values
  // are advisory toggles — a malformed entry is silently dropped rather
  // than failing the whole load. Keys are arbitrary series ids (an
  // orphan-tolerant map, see `SeriesMetadata`); we don't cross-check
  // against existing rows because the user may flag a series before
  // adding rows to it, and stale entries are harmless.
  const rawSeriesMeta = isObject(raw.seriesMetadata) ? raw.seriesMetadata : {};
  const seriesMetadata: Record<string, SeriesMetadata> = {};
  for (const [key, value] of Object.entries(rawSeriesMeta)) {
    if (typeof key !== "string" || key === "") continue;
    const meta = validateSeriesMetadata(value);
    if (meta) seriesMetadata[key] = meta;
  }

  // Learned primary-income merchant rules. Dedup by `key` (first wins)
  // so a hand-edited file can't trap the loader with two contradictory
  // rules on the same merchant.
  const rawPrimaryMerchants = Array.isArray(raw.primaryIncomeMerchants)
    ? raw.primaryIncomeMerchants
    : [];
  const primaryIncomeMerchants: PrimaryIncomeMerchant[] = [];
  const seenPrimaryKeys = new Set<string>();
  for (const rawMerchant of rawPrimaryMerchants) {
    const merchant = validatePrimaryIncomeMerchant(rawMerchant);
    if (!merchant) continue;
    if (seenPrimaryKeys.has(merchant.key)) continue;
    seenPrimaryKeys.add(merchant.key);
    primaryIncomeMerchants.push(merchant);
  }

  const settings = validateSettings(raw.settings);

  return {
    ok: true,
    value: {
      version: LATEST_VERSION,
      sheets,
      activeSheetId,
      accounts,
      companies,
      categories,
      types,
      hiddenPresetTypeIds,
      presetTypeKindOverrides,
      hiddenPresetCategoryIds,
      transfers,
      history,
      historyImports,
      merchantHints,
      recurringDismissals,
      transferCollapseDismissals,
      matchRules,
      seriesMatchRules,
      renamePatterns,
      seriesMetadata,
      primaryIncomeMerchants,
      settings,
    },
  };
}
