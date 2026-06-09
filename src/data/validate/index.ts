import { PRESET_CATEGORY_IDS } from "../presets/categories";
import { PRESET_COMPANY_CATEGORY_IDS } from "../presets/company-categories";
import { PRESET_ENTRY_TYPE_IDS } from "../presets/types";
import { LATEST_VERSION } from "../migrations";
import type {
  Account,
  Category,
  Company,
  CompanyCategory,
  Employer,
  EntryType,
  FileCategory,
  HistoryEntry,
  HistoryImport,
  Item,
  Loan,
  MatchRule,
  MerchantHint,
  PrimaryIncomeMerchant,
  Property,
  RenamePattern,
  Salary,
  Saving,
  SeriesMatchRule,
  SeriesMetadata,
  Sheet,
  Subtype,
  Tag,
  TaxProfile,
  Transfer,
  UserData,
} from "../types";
import {
  validateAccount,
  validateCategory,
  validateCompany,
  validateCompanyCategory,
  validateEntryType,
  validateFileCategory,
  validateItem,
  validateSubtype,
  validateTag,
} from "./account";
import { fail, isObject, sanitizeStringArray, type Result } from "./helpers";
import {
  validateHistoryEntry,
  validateHistoryImport,
  validateTransfer,
} from "./history";
import { validateEmployer, validateSalary } from "./salary";
import { validateProperty } from "./properties";
import { validateSaving } from "./savings";
import { validateLoan } from "./loans";
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
import { validateTaxProfile } from "./tax";

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

  // Employers are validated before salaries so a salary's `employerId`
  // can be checked against the resolvable set (a dangling reference is
  // dropped rather than rejecting the file).
  const rawEmployers = Array.isArray(raw.employers) ? raw.employers : [];
  const employers: Employer[] = [];
  const seenEmployerIds = new Set<string>();
  for (let i = 0; i < rawEmployers.length; i++) {
    const r = validateEmployer(rawEmployers[i], `employers[${i}]`);
    if (!r.ok) return r;
    if (seenEmployerIds.has(r.value.id))
      return fail(`employers[${i}].id`, `duplicate id "${r.value.id}"`);
    seenEmployerIds.add(r.value.id);
    employers.push(r.value);
  }
  // employerId → its role ids, so a salary's `roleId` can be checked
  // against the roles that actually live on its employer.
  const roleIdsByEmployer = new Map<string, ReadonlySet<string>>(
    employers.map((e) => [e.id, new Set(e.roles.map((r) => r.id))]),
  );

  const rawSalaries = Array.isArray(raw.salaries) ? raw.salaries : [];
  const salaries: Salary[] = [];
  const seenSalaryIds = new Set<string>();
  for (let i = 0; i < rawSalaries.length; i++) {
    const r = validateSalary(
      rawSalaries[i],
      `salaries[${i}]`,
      roleIdsByEmployer,
    );
    if (!r.ok) return r;
    if (seenSalaryIds.has(r.value.id))
      return fail(`salaries[${i}].id`, `duplicate id "${r.value.id}"`);
    seenSalaryIds.add(r.value.id);
    salaries.push(r.value);
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

  // Properties (homes / apartments). Validated after accounts and
  // companies so each property's `accountId` and `companyId` can be
  // checked against the resolvable sets (a dangling reference is dropped
  // rather than rejecting the file). Duplicate ids fail the load like the
  // other top-level arrays.
  const rawProperties = Array.isArray(raw.properties) ? raw.properties : [];
  const properties: Property[] = [];
  const seenPropertyIds = new Set<string>();
  for (let i = 0; i < rawProperties.length; i++) {
    const r = validateProperty(
      rawProperties[i],
      `properties[${i}]`,
      seenAccountIds,
      knownCompanyIds,
    );
    if (!r.ok) return r;
    if (seenPropertyIds.has(r.value.id))
      return fail(`properties[${i}].id`, `duplicate id "${r.value.id}"`);
    seenPropertyIds.add(r.value.id);
    properties.push(r.value);
  }

  // Savings accounts. Standalone (no cross-references to verify), so they
  // validate independently of the known-id sets. Duplicate ids fail the load
  // like the other top-level arrays. Validated before transfers and history
  // because a savings account is a first-class transfer endpoint and its
  // transactions live in `history` keyed by its id — see `knownLedgerIds`.
  const rawSavings = Array.isArray(raw.savings) ? raw.savings : [];
  const savings: Saving[] = [];
  const seenSavingIds = new Set<string>();
  for (let i = 0; i < rawSavings.length; i++) {
    const r = validateSaving(rawSavings[i], `savings[${i}]`);
    if (!r.ok) return r;
    if (seenSavingIds.has(r.value.id))
      return fail(`savings[${i}].id`, `duplicate id "${r.value.id}"`);
    seenSavingIds.add(r.value.id);
    savings.push(r.value);
  }

  // Loans. Validated after companies and properties so a loan's lender
  // `companyId` and its `propertyId` / `mortgageId` link pair can be
  // checked against the resolvable sets (dangling references are dropped
  // rather than rejecting the file). Duplicate ids fail the load like the
  // other top-level arrays.
  const rawLoans = Array.isArray(raw.loans) ? raw.loans : [];
  const loans: Loan[] = [];
  const seenLoanIds = new Set<string>();
  for (let i = 0; i < rawLoans.length; i++) {
    const r = validateLoan(
      rawLoans[i],
      `loans[${i}]`,
      knownCompanyIds,
      properties,
    );
    if (!r.ok) return r;
    if (seenLoanIds.has(r.value.id))
      return fail(`loans[${i}].id`, `duplicate id "${r.value.id}"`);
    seenLoanIds.add(r.value.id);
    loans.push(r.value);
  }

  // The combined id-space of transfer endpoints and history-bucket keys.
  // Both regular accounts and savings accounts can send / receive a
  // `Transfer` and carry imported transactions in `history` keyed by their
  // id, so every "is this a known ledger?" check downstream (transfer
  // endpoints, history / historyImports / renamePatterns buckets) widens to
  // this union — otherwise savings transactions would be silently dropped and
  // a transfer touching a savings account would reject the whole file.
  const knownLedgerIds = new Set<string>([...seenAccountIds, ...seenSavingIds]);

  // Property-file categories (the subfolders a property's uploaded files are
  // filed under). Name-only and entirely user-curated — no presets, no
  // cross-references to verify. Duplicate ids fail the load like the other
  // top-level arrays. A `PropertyFile.categoryId` that no longer resolves is
  // left dangling (renders uncategorised), mirroring how a repair's advisory
  // `subtypeId` is treated.
  const rawFileCategories = Array.isArray(raw.fileCategories)
    ? raw.fileCategories
    : [];
  const fileCategories: FileCategory[] = [];
  const seenFileCategoryIds = new Set<string>();
  for (let i = 0; i < rawFileCategories.length; i++) {
    const r = validateFileCategory(
      rawFileCategories[i],
      `fileCategories[${i}]`,
    );
    if (!r.ok) return r;
    if (seenFileCategoryIds.has(r.value.id))
      return fail(`fileCategories[${i}].id`, `duplicate id "${r.value.id}"`);
    seenFileCategoryIds.add(r.value.id);
    fileCategories.push(r.value);
  }

  const rawTags = Array.isArray(raw.tags) ? raw.tags : [];
  const tags: Tag[] = [];
  const seenTagIds = new Set<string>();
  for (let i = 0; i < rawTags.length; i++) {
    const r = validateTag(rawTags[i], `tags[${i}]`);
    if (!r.ok) return r;
    if (seenTagIds.has(r.value.id))
      return fail(`tags[${i}].id`, `duplicate id "${r.value.id}"`);
    seenTagIds.add(r.value.id);
    tags.push(r.value);
  }
  const knownTagIds: ReadonlySet<string> = seenTagIds;

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
  // to the built-in definitions in `data/presets/`; user-added
  // ids resolve to entries in the array above. Hidden presets stay
  // resolvable — hiding only affects picker / admin visibility, not
  // referential integrity.
  const knownCategoryIds = new Set<string>([
    ...PRESET_CATEGORY_IDS,
    ...seenCategoryIds,
  ]);

  // Company categories (merchant kinds). Same preset-collision rule as
  // budget categories; validated before the company-reference sweep
  // below so a `Company.companyCategoryId` can be checked against the
  // resolvable set.
  const rawCompanyCategories = Array.isArray(raw.companyCategories)
    ? raw.companyCategories
    : [];
  const companyCategories: CompanyCategory[] = [];
  const seenCompanyCategoryIds = new Set<string>();
  for (let i = 0; i < rawCompanyCategories.length; i++) {
    const r = validateCompanyCategory(
      rawCompanyCategories[i],
      `companyCategories[${i}]`,
    );
    if (!r.ok) return r;
    if (seenCompanyCategoryIds.has(r.value.id))
      return fail(`companyCategories[${i}].id`, `duplicate id "${r.value.id}"`);
    if (PRESET_COMPANY_CATEGORY_IDS.has(r.value.id))
      return fail(
        `companyCategories[${i}].id`,
        `collides with preset id "${r.value.id}"`,
      );
    seenCompanyCategoryIds.add(r.value.id);
    companyCategories.push(r.value);
  }
  const knownCompanyCategoryIds = new Set<string>([
    ...PRESET_COMPANY_CATEGORY_IDS,
    ...seenCompanyCategoryIds,
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

  // Subtypes (third taxonomy tier). No presets, so the known-id set is
  // just the user's array. Each references a type via `typeId`, checked
  // against `knownTypeIds` above — validated before items so an item's
  // `subtypeId` can be resolved.
  const rawSubtypes = Array.isArray(raw.subtypes) ? raw.subtypes : [];
  const subtypes: Subtype[] = [];
  const seenSubtypeIds = new Set<string>();
  for (let i = 0; i < rawSubtypes.length; i++) {
    const r = validateSubtype(rawSubtypes[i], `subtypes[${i}]`, knownTypeIds);
    if (!r.ok) return r;
    if (seenSubtypeIds.has(r.value.id))
      return fail(`subtypes[${i}].id`, `duplicate id "${r.value.id}"`);
    seenSubtypeIds.add(r.value.id);
    subtypes.push(r.value);
  }
  const knownSubtypeIds: ReadonlySet<string> = seenSubtypeIds;

  // Owned items. Validated after subtypes (an item's optional `subtypeId`
  // resolves against `knownSubtypeIds`) and before sheets / history (whose
  // inline `lineItems` resolve their `itemId` against `knownItemIds`).
  const rawItems = Array.isArray(raw.items) ? raw.items : [];
  const items: Item[] = [];
  const seenItemIds = new Set<string>();
  for (let i = 0; i < rawItems.length; i++) {
    const r = validateItem(rawItems[i], `items[${i}]`, knownSubtypeIds);
    if (!r.ok) return r;
    if (seenItemIds.has(r.value.id))
      return fail(`items[${i}].id`, `duplicate id "${r.value.id}"`);
    seenItemIds.add(r.value.id);
    items.push(r.value);
  }
  const knownItemIds: ReadonlySet<string> = seenItemIds;

  // Sweep dangling company references now that the known-type and
  // known-company-category sets exist (companies are validated first).
  // A company whose pinned type was later deleted drops that id (an
  // empty list collapses to absent); a company pointing at a
  // company-category that no longer resolves drops `companyCategoryId`.
  for (let i = 0; i < companies.length; i++) {
    const c = companies[i];
    const keptTypeIds = c.typeIds?.filter((id) => knownTypeIds.has(id));
    const typeIdsChanged =
      c.typeIds !== undefined && keptTypeIds!.length !== c.typeIds.length;
    const categoryDangling =
      c.companyCategoryId !== undefined &&
      !knownCompanyCategoryIds.has(c.companyCategoryId);
    if (!typeIdsChanged && !categoryDangling) continue;
    const next: Company = { id: c.id, name: c.name };
    const finalTypeIds = typeIdsChanged ? keptTypeIds! : c.typeIds;
    if (finalTypeIds && finalTypeIds.length > 0) next.typeIds = finalTypeIds;
    if (!categoryDangling && c.companyCategoryId !== undefined)
      next.companyCategoryId = c.companyCategoryId;
    companies[i] = next;
  }

  const rawTransfers = Array.isArray(raw.transfers) ? raw.transfers : [];
  const transfers: Transfer[] = [];
  const seenTransferIds = new Set<string>();
  for (let i = 0; i < rawTransfers.length; i++) {
    const r = validateTransfer(
      rawTransfers[i],
      `transfers[${i}]`,
      knownLedgerIds,
      knownTypeIds,
    );
    if (!r.ok) return r;
    if (seenTransferIds.has(r.value.id))
      return fail(`transfers[${i}].id`, `duplicate id "${r.value.id}"`);
    seenTransferIds.add(r.value.id);
    transfers.push(r.value);
  }

  // Tax profiles are validated before sheets so a salary sheet's
  // `taxProfileId` can be checked against the resolvable set (a dangling
  // reference is dropped rather than rejecting the file) — exactly as
  // employers precede salaries.
  const rawTaxProfiles = Array.isArray(raw.taxProfiles) ? raw.taxProfiles : [];
  const taxProfiles: TaxProfile[] = [];
  const seenTaxProfileIds = new Set<string>();
  for (let i = 0; i < rawTaxProfiles.length; i++) {
    const r = validateTaxProfile(rawTaxProfiles[i], `taxProfiles[${i}]`);
    if (!r.ok) return r;
    if (seenTaxProfileIds.has(r.value.id))
      return fail(`taxProfiles[${i}].id`, `duplicate id "${r.value.id}"`);
    seenTaxProfileIds.add(r.value.id);
    taxProfiles.push(r.value);
  }
  const knownTaxProfileIds: ReadonlySet<string> = seenTaxProfileIds;

  const sheets: Sheet[] = [];
  const seenSheetIds = new Set<string>();
  for (let i = 0; i < raw.sheets.length; i++) {
    const r = validateSheet(
      raw.sheets[i],
      `sheets[${i}]`,
      seenAccountIds,
      knownTypeIds,
      knownCompanyIds,
      knownTagIds,
      knownItemIds,
      knownTaxProfileIds,
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
    if (!knownLedgerIds.has(accountId)) continue;
    if (!Array.isArray(rawEntries)) continue;
    const entries: HistoryEntry[] = [];
    const seenIds = new Set<string>();
    for (let i = 0; i < rawEntries.length; i++) {
      const r = validateHistoryEntry(
        rawEntries[i],
        `history.${accountId}[${i}]`,
        knownTypeIds,
        knownCompanyIds,
        knownTagIds,
        knownItemIds,
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
    if (!knownLedgerIds.has(accountId)) continue;
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
  const ignoredItemEntryIds = sanitizeStringArray(raw.ignoredItemEntryIds);
  const itemFindExclusionPatterns = sanitizeStringArray(
    raw.itemFindExclusionPatterns,
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
    const rule = validateMatchRule(
      rawRule,
      knownTypeIds,
      knownCompanyIds,
      knownTagIds,
    );
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
    if (!knownLedgerIds.has(accountId)) continue;
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
  const hiddenPresetCompanyCategoryIds = sanitizeStringArray(
    raw.hiddenPresetCompanyCategoryIds,
  ).filter((id) => PRESET_COMPANY_CATEGORY_IDS.has(id));
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
      taxProfiles,
      salaries,
      employers,
      properties,
      savings,
      loans,
      fileCategories,
      companies,
      tags,
      categories,
      types,
      subtypes,
      items,
      hiddenPresetTypeIds,
      presetTypeKindOverrides,
      hiddenPresetCategoryIds,
      companyCategories,
      hiddenPresetCompanyCategoryIds,
      transfers,
      history,
      historyImports,
      merchantHints,
      recurringDismissals,
      transferCollapseDismissals,
      ignoredItemEntryIds,
      itemFindExclusionPatterns,
      matchRules,
      seriesMatchRules,
      renamePatterns,
      seriesMetadata,
      primaryIncomeMerchants,
      settings,
    },
  };
}
