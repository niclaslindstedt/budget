import type {
  Account,
  Category,
  CommonSettings,
  Company,
  DeviceSettings,
  EntryType,
  EntryTypeKind,
  HistoryEntrySplit,
  MatchRule,
  SeriesMatchRule,
  Settings,
  Sheet,
  Tag,
  Transfer,
  UserData,
} from "./types";
import type { SheetDraft } from "./action-payloads";
import type { ParsedBankEntry } from "../storage/banks";
import { type ItemAction } from "./reducers/item";
import { SHEET_TYPE_REGISTRY } from "./sheet-types";
import { reduceAchievements } from "./reducers/achievements";
import { reduceSheets } from "./reducers/sheets";
import { reduceSettings } from "./reducers/settings";
import { reduceCategoriesAndTypes } from "./reducers/categories-and-types";
import { reduceMatchRules } from "./reducers/match-rules";
import { reduceTransfers } from "./reducers/transfers";
import { reduceRecurring } from "./reducers/recurring";
import { reduceAccounts } from "./reducers/accounts";
import { reduceHistory } from "./reducers/history";
import { reduceSeriesMetadata } from "./reducers/series-metadata";
import { reduceHistoryPrimaryIncome } from "./reducers/history-primary-income";

export type Action =
  | ItemAction
  | { type: "replace"; data: UserData }
  | { type: "addCategory"; category: Category }
  | {
      type: "updateCategory";
      categoryId: string;
      patch: Partial<Omit<Category, "id">>;
    }
  | { type: "deleteCategory"; categoryId: string }
  | { type: "setPresetCategoryHidden"; presetId: string; hidden: boolean }
  | { type: "addType"; entryType: EntryType }
  | {
      type: "updateType";
      typeId: string;
      patch: Partial<Omit<EntryType, "id">>;
    }
  | { type: "deleteType"; typeId: string }
  | { type: "setPresetTypeHidden"; presetId: string; hidden: boolean }
  | { type: "setPresetTypeKind"; presetId: string; kind: EntryTypeKind }
  | { type: "addCompany"; company: Company }
  | {
      // Edit a user-defined company by id. Each field in `patch` is
      // optional; absent fields stay untouched. Companies are name-
      // only so the only meaningful field is `name`, but the patch
      // shape mirrors the Category / EntryType actions so a future
      // surface (notes, address, …) drops in without another reducer
      // signature.
      type: "updateCompany";
      companyId: string;
      patch: Partial<Omit<Company, "id">>;
    }
  | {
      // Delete a user-defined company. Cascades through every place
      // that references the id: row.companyId, history.userCompanyId,
      // history.splits[i].companyId, merchantHints[*].companyId,
      // matchRules[*].companyId, and renamePatterns[*].suggestedCompanyId
      // all get the reference dropped so the validator's
      // referential-integrity guards never trip on a dangling id.
      type: "deleteCompany";
      companyId: string;
    }
  | { type: "addTag"; tag: Tag }
  | {
      // Edit a user-defined tag by id. Each field in `patch` is
      // optional; absent fields stay untouched. Mirrors the Company /
      // Category patch shape.
      type: "updateTag";
      tagId: string;
      patch: Partial<Omit<Tag, "id">>;
    }
  | {
      // Delete a user-defined tag. Cascades by removing the id from
      // every `Row.tagIds` array (dropping the field when the array
      // empties) so the validator's referential-integrity guard never
      // trips on a dangling id. Tags live only on rows, so the cascade
      // is narrower than `deleteCompany`.
      type: "deleteTag";
      tagId: string;
    }
  | {
      // Save handler from the SettingsModal. `draft` is the flat
      // effective view the user edited; `scope` is which device
      // bucket they edited from (mobile when their viewport is below
      // the sm breakpoint, desktop otherwise). The reducer splits
      // the draft back into the bucketed `PersistedSettings` shape
      // via `applySettingsDraft`, leaving the other scope untouched.
      type: "updateSettings";
      draft: Settings;
      scope: "mobile" | "desktop";
    }
  // Targeted device-scoped patch. Used by callers that own a single
  // device-scoped field (e.g. the download-modal confirm path) and
  // don't want to round-trip a whole `Settings` draft through the
  // SettingsModal save handler.
  | {
      type: "updateDeviceSettings";
      scope: "mobile" | "desktop";
      patch: Partial<DeviceSettings>;
    }
  // Targeted common-scope patch. Mirrors `updateDeviceSettings` for
  // common-only callers (today: the "cloud reauth auto-open" toggle
  // which used to live in device-local localStorage).
  | { type: "updateCommonSettings"; patch: Partial<CommonSettings> }
  | { type: "renameSheet"; sheetId: string; name: string }
  | {
      type: "setItemAccount";
      sheetId: string;
      itemId: string;
      accountId: string | null;
    }
  | { type: "createAccount"; account: Account }
  | { type: "updateAccount"; accountId: string; patch: Partial<Account> }
  | { type: "deleteAccount"; accountId: string }
  | {
      // Drop bank history, transfers, and import-audit rows that
      // predate `cutoffDate` for the named account. Used when the
      // account's purpose changes (e.g. a private account turning into
      // a shared household account) and the user no longer wants the
      // pre-cutoff history dangling. Entries dated on or after the
      // cutoff are kept untouched.
      type: "cutAccountHistory";
      accountId: string;
      cutoffDate: string;
    }
  | {
      // Append a balance-correction row to the first AccountBudget that
      // tracks `accountId`. The amount carries the signed delta needed
      // to bring the account's running total to the user-asserted
      // value; `date` is the day to stamp the correction with. No-op
      // when no budget references the account — the UI gates the click
      // on that condition but the reducer enforces it too.
      type: "correctAccountBalance";
      accountId: string;
      date: string;
      amount: number;
    }
  | { type: "createTransfer"; transfer: Transfer }
  | {
      type: "updateTransfer";
      transferId: string;
      patch: Partial<Transfer>;
    }
  | { type: "deleteTransfer"; transferId: string }
  | { type: "addSheet"; sheet: Sheet }
  | { type: "updateSheetMeta"; sheetId: string; meta: SheetDraft }
  | { type: "deleteSheet"; sheetId: string }
  | { type: "selectSheet"; sheetId: string }
  | {
      // Merge a parsed bank statement into the named account. The
      // reducer dedups entries against existing history (by content
      // hash), records a `HistoryImport` audit row, re-anchors the
      // account's `openingBalance` to the earliest entry's pre-row
      // balance, back-fills `clearing` / `accountNumber` on the
      // account when those fields are empty, and drops any balance
      // corrections whose date falls inside the imported range (the
      // bank is now authoritative there). Pure: every payload field
      // is data, so the action can be replayed for tests.
      type: "importBankHistory";
      accountId: string;
      bankParserId: string;
      filename: string;
      bankClearing?: string;
      bankAccountNumber?: string;
      entries: ParsedBankEntry[];
      now: number;
    }
  | {
      // Promote a recurring-detection candidate into a real series of
      // budget rows on the active budget. The action carries the full
      // payload the reducer needs — description, amount, glyph,
      // categoryId, dates — so the dispatcher stays a pure function of
      // its inputs (the candidate + the user's confirmed adjustments).
      // The reducer also records the chosen typeId as a merchant
      // hint (keyed by `sourceDescription` so future imports of the same
      // bank text resolve to it) and adds `key` to
      // `recurringDismissals` so the candidate disappears from the
      // panel — consumed candidates don't keep resurfacing on every
      // subsequent import.
      type: "promoteRecurringCandidate";
      sheetId: string;
      itemId: string;
      key: string;
      // Raw bank text from the detected candidate. Used as the
      // merchant-hint normalisation key so the hint matches future
      // imports of the same merchant, even when the user adjusted the
      // displayed `description` on the promote modal.
      sourceDescription: string;
      description: string;
      amount: number;
      typeId: string | null;
      dates: string[];
      now: number;
    }
  | {
      // Promote a single imported history entry into a recurring
      // series on the active budget. Mirrors `promoteRecurringCandidate`
      // for the row-minting half, then extends the recorded merchant
      // hint with the user-typed description and typeId so every
      // other history entry that normalises to the same merchant key
      // displays under the user's label without further writes.
      type: "promoteHistoryToRecurring";
      sheetId: string;
      itemId: string;
      // The bank-supplied description on the source history entry.
      // Used to normalise into the merchant-hint key — the user's
      // typed label drives the overlay but the key itself is bank-
      // text-derived so the lookup matches future imports too.
      sourceDescription: string;
      description: string;
      amount: number;
      typeId: string | null;
      // Company stamped on every minted future row and folded into the
      // merchant-hint when `applyToHistoric` is true so past synthesized
      // history rows inherit the same tag. `null` means "no company
      // override" — the row stays untagged.
      companyId: string | null;
      dates: string[];
      // When false, the merchant hint is not stamped — past entries
      // sharing the merchant key keep their raw bank text. The future
      // series still gets minted.
      applyToHistoric: boolean;
      // Account holding the source history entry. Used to locate the
      // history list in `state.history` when `excludedHistoryEntryIds`
      // is non-empty. `null` is a no-op for the exclusion stamp.
      accountId: string | null;
      // Per-entry opt-out from the merchant-hint overlay. Each id in
      // the list refers to a `HistoryEntry` in `state.history[accountId]`
      // and gets `hintIgnored: true` stamped on it so the synthesizer
      // keeps its raw bank text. Only consulted when `applyToHistoric`
      // is true — when the master toggle is off the hint isn't stamped
      // in the first place, so the per-entry flags would be redundant.
      excludedHistoryEntryIds: readonly string[];
      now: number;
    }
  | {
      // Persist a "Not recurring" dismissal so the detector skips this
      // bucket on every subsequent import. `key` is the candidate's
      // normalised description (the same key the detector and hint
      // store use). The settings UI clears the whole list via
      // `clearRecurringDismissals` so a misclick is recoverable.
      type: "dismissRecurringCandidate";
      key: string;
    }
  | {
      // Bulk variant of `dismissRecurringCandidate` for the panel's
      // "Dismiss all" button — adds every key in one reducer pass so
      // the panel doesn't re-render between dismissals.
      type: "dismissRecurringCandidates";
      keys: readonly string[];
    }
  | { type: "clearRecurringDismissals" }
  | {
      // Collapse one detected cross-account pair into a single
      // Transfer and mark both HistoryEntrys as `hidden: true` with
      // the new transfer's id stored on `collapsedIntoTransferId`
      // so the operation is reversible (delete the tx → clear the
      // backref → un-hide) and idempotent (subsequent runs skip
      // already-collapsed pairs).
      type: "collapseTransferPair";
      fromAccountId: string;
      toAccountId: string;
      fromEntryId: string;
      toEntryId: string;
      date: string;
      description: string;
      amount: number;
    }
  | {
      // Persist a "Never collapse this pair" dismissal so the detector
      // stops re-surfacing it. The key is the pair's stable identifier
      // (sorted entry ids joined). `clearTransferDismissals` unwinds
      // the list from settings.
      type: "dismissTransferPair";
      pairKey: string;
    }
  | { type: "clearTransferDismissals" }
  | { type: "clearMerchantHints" }
  | {
      // Append a new wildcard match rule to `UserData.matchRules`. The
      // rule labels every history entry whose raw description matches
      // its pattern; rendered through `synthesizeHistoryRow` so past
      // and future imports both pick it up without rewriting any
      // stored entries.
      type: "createMatchRule";
      rule: MatchRule;
    }
  | {
      // Replace one rule in place, identified by `rule.id`. No-op if
      // the id is unknown so a stale modal can't silently append a
      // new rule under an old id.
      type: "updateMatchRule";
      rule: MatchRule;
    }
  | { type: "deleteMatchRule"; ruleId: string }
  | {
      // Swap a rule with its neighbour in `matchRules`. Earlier in the
      // array = higher priority, so "up" lifts a rule above the rules
      // that currently shadow it and "down" demotes it. No-op at the
      // ends of the array, or if the rule id is unknown.
      type: "moveMatchRule";
      ruleId: string;
      direction: "up" | "down";
    }
  | {
      // Manually walk every budget row and re-evaluate against the
      // current ruleset. The reducer already runs this walk on
      // `createMatchRule` / `updateMatchRule`, so the only reason to
      // dispatch this directly is the Patterns settings tab's
      // "Reapply all" button — it lets the user sweep without
      // pretending to edit a rule. No-ops when no rule wins anything
      // new (state is referentially identical so React skips a
      // wasted render).
      type: "reapplyMatchRules";
    }
  | {
      // One-shot application of a match rule that the user explicitly
      // chose NOT to persist (the "Save pattern" checkbox in the
      // Label-by-pattern modal). Stamps every matching budget row
      // with the rule's typeId + `typeIdLocked: true`, and every
      // matching history entry with `userTypeId` (and
      // `userDescription` when the rule carries one). The rule
      // itself is discarded — handy when the user wants to bulk-label
      // older entries from a merchant they'll never see again.
      type: "applyMatchRuleOnce";
      rule: MatchRule;
    }
  | {
      // Per-entry override on a single `HistoryEntry`. Patches the
      // entry's `userDescription` and / or `userTypeId` in place so
      // the synthesized row picks the override up at the top of the
      // merge priority in `synthesizeHistoryRow`. Each patch field is
      // a tri-state: `undefined` = don't touch, `null` (typeId only)
      // or `""` (description) = clear the override, a non-empty
      // string = set the override.
      type: "updateHistoryEntry";
      accountId: string;
      entryId: string;
      patch: {
        userDescription?: string;
        userTypeId?: string | null;
        userCompanyId?: string | null;
        // Full replacement of the entry's per-entry tag override.
        // `undefined` leaves the existing `userTagIds` untouched; an
        // empty array clears it. The synthesizer unions these with any
        // matching rule's tags, so clearing the per-entry set still
        // leaves the row carrying whatever a rule contributes.
        userTagIds?: string[];
        isTransfer?: boolean;
        // `true` stamps the "no company applies" flag so metadata
        // mode stops surfacing the entry over a missing company.
        // `false` clears it. `undefined` leaves the flag untouched.
        noCompany?: boolean;
      };
    }
  | {
      // Metadata-mode bulk apply. Stamps the labels the user gave one
      // history entry onto its lookalikes — every other entry on the
      // same account whose raw bank description matches `pattern` (a
      // glob derived from the source entry, dates / ref numbers
      // stripped). Fills BLANK fields only (a per-entry override on a
      // match is never overwritten); tags union. The source entry is
      // excluded — it's saved through `updateHistoryEntry` separately.
      type: "applyMetadataToMatchingHistory";
      accountId: string;
      pattern: string;
      excludeEntryId: string;
      patch: {
        userDescription?: string;
        userTypeId?: string;
        userCompanyId?: string;
        userTagIds?: readonly string[];
      };
    }
  | {
      // Split a bank-statement entry into multiple categorised parts.
      // `splits` is the full decomposition — the validator (and the
      // modal) ensure the signed amounts sum to the entry's bank
      // amount so the running balance stays anchored. An empty array
      // clears the existing split (back to single-row rendering).
      type: "splitHistoryEntry";
      accountId: string;
      entryId: string;
      splits: HistoryEntrySplit[];
    }
  | {
      // Apply user choices from the post-import reconciliation modal.
      // `mergedRowIds` are user rows the user confirmed map to a
      // history entry — they're deleted in a single transition.
      // `entryOverrides` carry the curated description / typeId from
      // each merged row, stamped onto the matching history entry as
      // `userDescription` / `userTypeId` so the user's fine-tuning
      // survives the row deletion. Only blank fields on the entry are
      // filled — prior per-entry overrides are preserved.
      // `seriesRules` are auto-reconciliation rules learned from
      // "Apply to whole series" — appended verbatim.
      // `orphans` carry per-row triage decisions for predictions
      // that didn't post: either "delete" the row outright, or
      // "move" it to a new date (typically the next payday).
      type: "applyReconciliation";
      accountId: string;
      mergedRowIds: string[];
      entryOverrides: Array<{
        historyEntryId: string;
        userDescription?: string;
        userTypeId?: string;
      }>;
      seriesRules: SeriesMatchRule[];
      orphans: Array<
        | { rowId: string; action: "delete" }
        | { rowId: string; action: "move"; toDate: string }
      >;
    }
  | {
      // Achievement unlock. Idempotent: if `id` is already present in
      // `settings.achievements`, the action is a no-op so timestamps
      // never get overwritten. New unlocks land in `achievements` (with
      // the timestamp) and `unseenAchievements` (the queue the
      // HeaderStar reads to decide whether to glow).
      type: "recordAchievementUnlock";
      id: string;
      timestamp: number;
    }
  | {
      // Dispatched when the user dismisses the achievement-unlock
      // modal — clears the unseen queue but leaves the unlocked map
      // untouched. Empties to `[]`; if the queue is already empty the
      // state object is returned unchanged so React doesn't re-render
      // dependents pointlessly.
      type: "clearUnseenAchievements";
    }
  | {
      // Apply user-accepted predictions from the `AccountRenamePredictorModal`
      // — the last step of an import that has rename suggestions to
      // offer. Each entry in `renames` stamps `userDescription` on the
      // matching history entry. Distinct from `updateHistoryEntry`:
      // this action does NOT feed the learning hook (the suggestion
      // came from an existing learned pattern by definition, so
      // re-recording would be circular). Instead, the matching
      // pattern's `hitCount` / `lastUsedAt` get bumped so accepted
      // predictions float to the top of future rounds. When the user
      // edits the suggested text inline before accepting — i.e. the
      // accepted text differs from what the pattern holds — the
      // accepted text is recorded as a fresh rename so the next import
      // suggests the edited version.
      type: "applyImportRenames";
      accountId: string;
      renames: Array<{
        entryId: string;
        userDescription: string;
        // Optional company learned alongside the description on the
        // matching `RenamePattern`. Absent when the pattern has none —
        // the reducer leaves `userCompanyId` on the entry untouched
        // in that case.
        userCompanyId?: string;
      }>;
    }
  | {
      // Set / clear the "primary income" flag for a recurring series.
      // When `isPrimaryIncome` is true, every existing row in the series
      // is re-scanned and gets its `fiscalMonthShift` recomputed from
      // `anchorDayOfMonth` so the cascade applies retroactively. When
      // false, the metadata entry is dropped and every existing row in
      // the series has its `fiscalMonthShift` cleared.
      type: "setSeriesPrimaryIncome";
      seriesId: string;
      isPrimaryIncome: boolean;
      anchorDayOfMonth: number | null;
    }
  | {
      // Manual per-entry fiscal-month override for a bank-imported
      // history entry. Mirrors `setRowFiscalMonthShift` but routes
      // through `UserData.history` (the source of truth for synthesized
      // history rows). `shift === null` clears the field.
      type: "setHistoryEntryFiscalMonthShift";
      accountId: string;
      entryId: string;
      shift: -1 | 1 | null;
    }
  | {
      // Toggle the "primary income" flag for the merchant a history
      // entry represents (keyed by the normalised description). When
      // true, the merchant is recorded in `UserData.primaryIncomeMerchants`
      // with `anchorDayOfMonth` and every existing history entry whose
      // normalised description matches the key gets `fiscalMonthShift`
      // recomputed against that anchor. When false, the merchant is
      // dropped and the shift is cleared on every matching entry.
      type: "setHistoryEntryPrimaryIncome";
      accountId: string;
      entryId: string;
      isPrimaryIncome: boolean;
      anchorDayOfMonth: number | null;
    }
  | {
      // Drop one learned primary-income merchant outright. Clears the
      // auto-stamped `fiscalMonthShift` on every matching entry across
      // every account. Used by the settings management surface when the
      // user wants to retire an old job's pattern after switching.
      type: "removePrimaryIncomeMerchant";
      key: string;
    };

export function reducer(state: UserData, action: Action): UserData {
  if (action.type === "replace") return action.data;

  // Domain sub-reducers — each returns the next state when it handles
  // the action, or null to defer to the next reducer in the chain.
  const handled =
    reduceAchievements(state, action) ??
    reduceSheets(state, action) ??
    reduceSettings(state, action) ??
    reduceCategoriesAndTypes(state, action) ??
    reduceMatchRules(state, action) ??
    reduceTransfers(state, action) ??
    reduceRecurring(state, action) ??
    reduceAccounts(state, action) ??
    reduceHistory(state, action) ??
    reduceSeriesMetadata(state, action) ??
    reduceHistoryPrimaryIncome(state, action);
  if (handled !== null) return handled;

  // Item-level dispatch tail. Walks the sheet-type registry until one
  // descriptor's `reduceItem` claims the action; falls through to the
  // defensive `state` fallback when the action is not an item action
  // (unreachable at runtime — the union is closed).
  for (const descriptor of SHEET_TYPE_REGISTRY) {
    const next = descriptor.reduceItem?.(state, action);
    if (next !== undefined && next !== null) return next;
  }
  return state;
}
