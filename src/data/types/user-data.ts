import type {
  Account,
  HistoryEntry,
  HistoryImport,
  Transfer,
} from "./accounts";
import type { Category, Company, EntryType, EntryTypeKind } from "./categories";
import type {
  MatchRule,
  MerchantHint,
  PrimaryIncomeMerchant,
  RenamePattern,
  SeriesMatchRule,
  SeriesMetadata,
} from "./rules";
import type { PersistedSettings } from "./settings";
import type { Sheet } from "./sheets";

// Top-level persisted blob for one signed-in user. Holds everything
// that user owns: their sheets, the categories they've defined, and
// their display preferences. The user account itself (id, username,
// password hash) lives in the device-wide registry — see `StoredUser`
// and `UsersFile` below — so a UserData snapshot can be exported and
// imported across devices without dragging credentials along.
export type UserData = {
  version: 44;
  sheets: Sheet[];
  activeSheetId: string;
  accounts: Account[];
  // User-added companies (merchants / organisations). Referenced from
  // `Row.companyId`, `HistoryEntry.userCompanyId`,
  // `MatchRule.companyId`, and `MerchantHint.companyId`. No presets
  // ship — companies are entirely user-curated through the inline
  // create row on the `CompanyPicker` and the Companies tab in
  // Settings. Empty on a fresh budget.
  companies: Company[];
  // User-added categories. On top of these the runtime also shows a
  // built-in list of broad Swedish-household preset categories
  // (`PRESET_CATEGORIES` in `data/constants.ts`); preset categories
  // live in code, not in this array. The user can hide individual
  // presets via `hiddenPresetCategoryIds`.
  categories: Category[];
  // User-added entry types referenced by `Row.typeId`. On top of these
  // the runtime also shows a built-in list of typical-Swedish-household
  // preset types (`PRESET_ENTRY_TYPES` in `data/constants.ts`); preset
  // types live in code, not in this array. The user can hide
  // individual presets via `hiddenPresetTypeIds`.
  types: EntryType[];
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
