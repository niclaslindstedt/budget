import type {
  Account,
  HistoryEntry,
  HistoryImport,
  Transfer,
} from "./accounts";
import type {
  Category,
  Company,
  CompanyCategory,
  EntryType,
  EntryTypeKind,
  Subtype,
  Tag,
} from "./categories";
import type { Item } from "./items";
import type {
  MatchRule,
  MerchantHint,
  PrimaryIncomeMerchant,
  RenamePattern,
  SeriesMatchRule,
  SeriesMetadata,
} from "./rules";
import type { FileCategory, Property } from "./properties";
import type { Loan } from "./loans";
import type { Saving } from "./savings";
import type { InvestmentHolding, StockPosition } from "./investments";
import type { Employer, Salary } from "./salary";
import type { PersistedSettings } from "./settings";
import type { Sheet } from "./sheets";
import type { TaxProfile } from "../tax/types";

// Top-level persisted blob for one signed-in user. Holds everything
// that user owns: their sheets, the categories they've defined, and
// their display preferences. The user account itself (id, username,
// password hash) lives in the device-wide registry — see `StoredUser`
// and `UsersFile` below — so a UserData snapshot can be exported and
// imported across devices without dragging credentials along.
export type UserData = {
  version: 81;
  sheets: Sheet[];
  activeSheetId: string;
  accounts: Account[];
  // Reusable, named tax-input bundles (municipality, church membership,
  // age, income kind, country). Referenced from `SalaryView.taxProfileId`
  // so several salary sheets can share one profile. The Salary page uses
  // the referenced profile to estimate a paycheck's gross from its net
  // deposit when the user hasn't entered the gross. Empty on a fresh
  // budget; entirely user-curated.
  taxProfiles: TaxProfile[];
  // Salary payments over time, rendered by the Salary sheet. Each
  // entry is one paycheck (`net` is the bank deposit; `gross` the
  // user-entered brutto). Populated manually or via the "Find salaries"
  // detector that scans budget income. Empty on a fresh budget.
  salaries: Salary[];
  // Workplaces referenced from `Salary.employerId`. Each carries the
  // roles (titles) held there over time. Entirely user-curated — no
  // presets ship. Empty on a fresh budget.
  employers: Employer[];
  // Properties the user owns (homes, apartments), rendered by the
  // Properties sheet. Each carries what it was bought for, a manually
  // recorded market-value history, and the mortgages (loans) against it
  // with their monthly payments. Entirely user-curated — no presets
  // ship. Empty on a fresh budget.
  properties: Property[];
  // Savings accounts the user sets money aside in (buffer accounts, vacation
  // funds), rendered by the Savings sheet. Each carries its bank details and a
  // manually-recorded balance history (the current balance is the latest
  // point by date). Savings accounts also participate in cross-account
  // transfer detection: their transactions live in `history` keyed by the
  // saving's id, exactly like a regular account. Entirely user-curated — no
  // presets ship. Empty on a fresh budget.
  savings: Saving[];
  // Loans the user owes money on (student loans, car loans, mortgages,
  // money borrowed from a person), rendered by the Loans sheet. Each
  // carries its terms (start date / sum, monthly payment, optional rate
  // and setup fee), the payments recorded against it, and the learned
  // bank-description patterns that auto-attach future imported
  // transactions as payments. A mortgage loan can instead link one or
  // several of a `Property`'s mortgages by id — terms and payments then
  // resolve live from `properties`. Entirely user-curated — no presets
  // ship. Empty on a fresh budget.
  loans: Loan[];
  // Broad investment holdings the user owns (funds, baskets of shares,
  // gold, crypto, bonds), rendered by the Investment sheet's holdings
  // table. Each carries the wrapper it's held in (ISK / KF / depå, which
  // drives its sale tax), an optional cost basis, and a manually-recorded
  // market-value history (the current value is the latest point by date).
  // Entirely user-curated — no presets ship. Empty on a fresh budget.
  investmentHoldings: InvestmentHolding[];
  // Privately-bought single stocks, rendered by the Investment sheet's
  // private-stocks table. Each tracks buy / sell transactions (which drive
  // the share count and average cost) and a hand-recorded current price
  // per share, plus whether it's owned privately or by the user's company
  // (which drives the gain tax on its net value). Entirely user-curated —
  // no presets ship. Empty on a fresh budget.
  investmentStocks: StockPosition[];
  // User-defined categories for property file uploads (see `FileCategory`).
  // Each becomes a subfolder under a property's `files/` folder; a file with
  // no category lands in the `files/` root. Referenced from
  // `PropertyFile.categoryId`. No presets ship — created and renamed from the
  // Properties settings tab. Empty on a fresh budget.
  fileCategories: FileCategory[];
  // User-added tags (cross-cutting labels). Referenced from
  // `Row.tagIds` — a row can carry several. No presets ship; tags are
  // entirely user-curated through the inline create row on the
  // `TagsPicker` and the Tags tab in Settings. Empty on a fresh
  // budget. Unlike companies/types/categories, tags never render on the
  // sheet — they surface only in the entry edit/bulk-edit modals and as
  // a searchable field in the search modal.
  tags: Tag[];
  // User-added companies (merchants / organisations). Referenced from
  // `Row.companyId`, `HistoryEntry.userCompanyId`,
  // `MatchRule.companyId`, and `MerchantHint.companyId`. No presets
  // ship — companies are entirely user-curated through the inline
  // create row on the `CompanyPicker` and the Companies tab in
  // Settings. Empty on a fresh budget.
  companies: Company[];
  // User-added categories. On top of these the runtime also shows a
  // built-in list of broad Swedish-household preset categories
  // (`PRESET_CATEGORIES` in `data/presets/categories.ts`); preset categories
  // live in code, not in this array. The user can hide individual
  // presets via `hiddenPresetCategoryIds`.
  categories: Category[];
  // User-added entry types referenced by `Row.typeId`. On top of these
  // the runtime also shows a built-in list of typical-Swedish-household
  // preset types (`PRESET_ENTRY_TYPES` in `data/presets/types.ts`); preset
  // types live in code, not in this array. The user can hide
  // individual presets via `hiddenPresetTypeIds`.
  types: EntryType[];
  // User-defined subtypes — the third taxonomy tier below category → type
  // (see `Subtype`). Each references an `EntryType` via `typeId`. No presets
  // ship; subtypes are entirely user-curated and surface only in the item
  // creator, where an `Item` is tagged with one. Empty on a fresh budget.
  subtypes: Subtype[];
  // Owned physical items the user tracks (see `Item`). A top-level catalog
  // referenced from `LineItemLink.itemId` on `Row.lineItems` /
  // `HistoryEntry.lineItems`. No presets ship — items are created manually
  // from the line-item modal on the entry "…" menu. Empty on a fresh budget.
  items: Item[];
  // Preset type ids the user has hidden from pickers and the Types
  // admin list. Pure allowlist — entries that no longer match a known
  // preset (e.g. a preset removed in a later app version) are dropped
  // on load.
  hiddenPresetTypeIds: string[];
  // Per-user overrides for the `kind` of preset entry types (Income /
  // Expense / Any). Lets a user re-classify a built-in preset without
  // shipping a new app version — e.g. flip Barnbidrag from income to
  // any if their household treats it differently. Keys are preset
  // type ids; values are the override. Absent / unknown ids fall back
  // to the preset's hard-coded `kind`. User-added types carry their
  // own `kind` on the `EntryType` record instead.
  presetTypeKindOverrides: Record<string, EntryTypeKind>;
  // Same shape as `hiddenPresetTypeIds`, scoped to preset categories.
  hiddenPresetCategoryIds: string[];
  // User-added company categories (merchant kinds). On top of these the
  // runtime layers a built-in list of Swedish-perspective presets
  // (`PRESET_COMPANY_CATEGORIES` in `data/presets/company-categories.ts`);
  // preset company categories live in code, not in this array.
  // Referenced from `Company.companyCategoryId`. The user can hide
  // individual presets via `hiddenPresetCompanyCategoryIds`. Empty on a
  // fresh budget.
  companyCategories: CompanyCategory[];
  // Same shape as `hiddenPresetCategoryIds`, scoped to preset company
  // categories.
  hiddenPresetCompanyCategoryIds: string[];
  // Transfers between accounts. Each transfer renders as a read-only
  // synthesized row on every budget that tracks one of its endpoints,
  // and as a top-level row on the Accounts sheet's transfer log.
  // Empty on a fresh budget and on v8 imports the v9 migration upgrades.
  transfers: Transfer[];
  // Imported bank-statement entries, keyed by account id. Each entry
  // is the raw bank row — date, description, amount, balance — kept
  // independently of any budget rows the user has authored. The
  // History modal on the Accounts page reads it directly, and the
  // budget view projects entries inline so the user can promote them
  // to real recurring rows. Stored as a Record (rather than an array
  // on each Account) so `Account` stays a small display-metadata
  // object and future per-account streaming / partitioning has a
  // natural seam.
  history: Record<string, HistoryEntry[]>;
  // One record per file the user has imported, scoped by account. The
  // History modal renders this as an audit trail and a future
  // "undo last import" affordance reads it back to filter `history`
  // by `importedAt`.
  historyImports: Record<string, HistoryImport[]>;
  // Merchant-hint memory. See `MerchantHint`. Stored as a record so
  // a category-deletion can sweep dangling hints in a single pass
  // and so the on-disk size scales with the number of distinct
  // merchants, not with the number of transactions.
  merchantHints: Record<string, MerchantHint>;
  // Normalised-description keys the user dismissed with "Not
  // recurring" on the recurring-candidate panel. The detector skips
  // these so noise doesn't keep coming back on every import. The
  // settings UI surfaces a clear-all so a misclick is recoverable.
  recurringDismissals: string[];
  // Pair keys the user dismissed with "Never" on the transfer-
  // collapse modal. Same shape and contract as `recurringDismissals`:
  // detector reads it as an allowlist, settings UI offers a clear-all.
  transferCollapseDismissals: string[];
  // History-entry ids the user ignored from the Items sheet's "Find
  // items" scan. The scanner skips them so an entry the user decided
  // isn't an item purchase never resurfaces. Same shape and contract as
  // `recurringDismissals`; cleared via the Items settings tab.
  ignoredItemEntryIds: string[];
  // Normalised-description keys the user excluded from the Items sheet's
  // "Find items" scan via the "Exclude similar" button. Unlike
  // `ignoredItemEntryIds` (one entry at a time), each key matches every
  // entry whose resolved description collapses to it under
  // `normaliseDescription` — past and future imports alike — so a
  // recurring charge (rent, a budget transfer) is dismissed in one tap.
  // Cleared via the Items settings tab.
  itemFindExclusionPatterns: string[];
  // Wildcard-pattern overlays for synthesized history rows. Each
  // rule is created from the history-row pattern button; the rule
  // labels every matching entry (past + future imports) with the
  // user-typed description / category / type. Distinct from
  // `merchantHints` — those are auto-recorded via the lossy
  // normalised description, these are explicit globs with sign /
  // transfer filters the user owns.
  matchRules: MatchRule[];
  // Series-scoped auto-reconciliation rules. Learned when the user
  // confirms "Apply to whole series" in the reconciliation modal —
  // see `SeriesMatchRule`. Future bank-history imports consult these
  // and collapse any predicted row + history entry pair that fits
  // the rule's pattern + amount band + date lag, no modal needed.
  seriesMatchRules: SeriesMatchRule[];
  // Per-account rename memory. Each entry maps a normalised bank
  // description to the user-typed label they reach for when relabelling
  // entries that match it. See `RenamePattern`. Surfaced by the
  // `AccountRenamePredictorModal` as the last step of every import that has
  // suggestions to offer; learning happens silently inside the
  // `updateHistoryEntry` reducer action so any in-app rename feeds the
  // store.
  renamePatterns: Record<string, Record<string, RenamePattern>>;
  // Per-series toggles keyed by `seriesId`. Today only carries the
  // "primary income" flag + the anchor day-of-month — see `SeriesMetadata`.
  // Entries are orphan-tolerant: a series whose rows the user deleted
  // leaves a harmless entry until it's garbage-collected by a future
  // cleanup pass.
  seriesMetadata: Record<string, SeriesMetadata>;
  // Learned primary-income rules keyed off the normalised bank
  // description. Each entry stamps `fiscalMonthShift = 1` on matching
  // history entries that arrived earlier than the configured payday.
  // Held as an array so the user can accumulate multiple sources (a
  // job switch keeps the old key tagged for historical entries and
  // adds the new bank's pattern alongside).
  primaryIncomeMerchants: PrimaryIncomeMerchant[];
  settings: PersistedSettings;
};

// User account record persisted in the device-wide registry. The
// password is stored as a PBKDF2-SHA256 digest with a per-user salt
// and the iteration count it was computed under. The same plaintext
// password also derives the AES-GCM key used to encrypt that user's
// budget bytes (via a separate salt inside the envelope) so there is
// only ever one password per account.
//
// `isDefault` marks the no-password "guest" account created by the
// "Continue without account" flow on the auth screen. Default users
// have empty password fields, can only exist alone (no other accounts
// on the device), and are consumed by the first real account that
// gets created — see `handleCreateAccount` in `App.tsx`.
export type StoredUser = {
  id: string;
  username: string;
  passwordHash: string;
  passwordSalt: string;
  iterations: number;
  hash: "SHA-256";
  createdAt: number;
  isDefault?: boolean;
};

export type UsersFile = {
  version: 1;
  users: StoredUser[];
  // Id of the user whose budget the app should try to load on the
  // next launch. Null if the user explicitly signed out.
  activeUserId: string | null;
};
