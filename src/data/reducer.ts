import {
  DEFAULT_CATEGORY_ID,
  PRESET_CATEGORY_IDS,
  PRESET_ENTRY_TYPE_IDS,
} from "./constants";
import {
  findColumnByType,
  mintBudgetRow,
  newId,
  updateAccountBudget,
  updateHistoryEntry,
} from "./sheet";
import {
  applyMatchRuleOnceToAllSheets,
  applyMatchRuleOnceToHistory,
  reapplyPatternsToAllSheets,
} from "./pattern-apply";
import { findRuleDrivenCandidates } from "./reconciliation";
import { recordMerchantHints } from "./merchant-hints";
import {
  bumpRenamePattern,
  effectiveDescription,
  recordRename,
} from "./rename-patterns";
import type {
  Account,
  Category,
  CommonSettings,
  DeviceSettings,
  EntryType,
  EntryTypeKind,
  HistoryEntry,
  HistoryEntrySplit,
  MatchRule,
  Row,
  SeriesMatchRule,
  Settings,
  Sheet,
  Transfer,
  UserData,
} from "./types";
import { applyDeviceSettingPatch, applySettingsDraft } from "./settings";
import type { SheetDraft } from "./action-payloads";
import {
  computeOpeningBalanceFromHistory,
  mergeHistory,
  type ParsedBankEntry,
} from "../storage/bank-parsers";
import { type ItemAction, reduceItemDispatch } from "./reducers/item";
import { reduceAchievements } from "./reducers/achievements";

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
        isTransfer?: boolean;
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
      // Apply user-accepted predictions from the `RenamePredictorModal`
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
      }>;
    };

// Shared row-minting body for the two recurring-promote actions
// (`promoteRecurringCandidate` and `promoteHistoryToRecurring`).
// Both produce a series of N rows from a single (description, amount,
// typeId, dates) tuple targeting one AccountBudget; only their hint
// recording bookkeeping differs, which stays in the per-action body.
function appendSeriesRowsToBudget(
  sheets: readonly Sheet[],
  action: {
    sheetId: string;
    itemId: string;
    dates: string[];
    description: string;
    amount: number;
    typeId: string | null;
  },
): Sheet[] {
  const seriesId = action.dates.length > 1 ? newId() : undefined;
  return updateAccountBudget(sheets, action.sheetId, action.itemId, (item) => {
    const newRows: Row[] = [];
    for (const date of action.dates) {
      const row = mintBudgetRow(item.columns, {
        date,
        description: action.description,
        amount: action.amount,
        typeId: action.typeId,
        seriesId,
      });
      if (!row) return item;
      newRows.push(row);
    }
    return { ...item, rows: [...item.rows, ...newRows] };
  });
}

export function reducer(state: UserData, action: Action): UserData {
  if (action.type === "replace") return action.data;

  // Domain sub-reducers — each returns the next state when it handles
  // the action, or null to defer to the next reducer in the chain.
  const handled = reduceAchievements(state, action);
  if (handled !== null) return handled;

  if (action.type === "addCategory") {
    return { ...state, categories: [...state.categories, action.category] };
  }
  if (action.type === "updateCategory") {
    // Presets are immutable — Settings hides the Edit button for them
    // and the action is a no-op if the id somehow targets a preset.
    if (PRESET_CATEGORY_IDS.has(action.categoryId)) return state;
    return {
      ...state,
      categories: state.categories.map((c) =>
        c.id === action.categoryId ? { ...c, ...action.patch } : c,
      ),
    };
  }
  if (action.type === "deleteCategory") {
    // Deleting a category cascades through the types that lived under
    // it: every user-added type with a matching `categoryId` is
    // reassigned to the catch-all "Other" category so rows that
    // referenced those types stay valid. Presets are immutable, same
    // as updateCategory.
    if (PRESET_CATEGORY_IDS.has(action.categoryId)) return state;
    const id = action.categoryId;
    return {
      ...state,
      categories: state.categories.filter((c) => c.id !== id),
      types: state.types.map((t) =>
        t.categoryId === id ? { ...t, categoryId: DEFAULT_CATEGORY_ID } : t,
      ),
    };
  }
  if (action.type === "setPresetCategoryHidden") {
    if (!PRESET_CATEGORY_IDS.has(action.presetId)) return state;
    const current = state.hiddenPresetCategoryIds;
    const isHidden = current.includes(action.presetId);
    if (action.hidden === isHidden) return state;
    return {
      ...state,
      hiddenPresetCategoryIds: action.hidden
        ? [...current, action.presetId]
        : current.filter((id) => id !== action.presetId),
    };
  }
  if (action.type === "addType") {
    return { ...state, types: [...state.types, action.entryType] };
  }
  if (action.type === "updateType") {
    if (PRESET_ENTRY_TYPE_IDS.has(action.typeId)) return state;
    return {
      ...state,
      types: state.types.map((t) =>
        t.id === action.typeId ? { ...t, ...action.patch } : t,
      ),
    };
  }
  if (action.type === "deleteType") {
    // Deleting a type cascades: every row's `typeId`, every merchant
    // hint's `typeId`, and every match rule's `typeId` that referenced
    // it gets the reference dropped. Presets are hide-only.
    if (PRESET_ENTRY_TYPE_IDS.has(action.typeId)) return state;
    const id = action.typeId;
    return {
      ...state,
      types: state.types.filter((t) => t.id !== id),
      sheets: state.sheets.map((sheet) => ({
        ...sheet,
        items: sheet.items.map((item) => {
          if (item.type !== "accountBudget") return item;
          return {
            ...item,
            rows: item.rows.map((r) => {
              if (r.typeId !== id) return r;
              const { typeId: _drop, ...rest } = r;
              void _drop;
              return rest;
            }),
          };
        }),
      })),
      // Hints whose typeId points at the deleted type lose their only
      // actionable field — drop the entry entirely. The next time the
      // user assigns a type to a row matching the same merchant key,
      // a fresh hint will land here.
      merchantHints: Object.fromEntries(
        Object.entries(state.merchantHints).filter(
          ([, hint]) => hint.typeId !== id,
        ),
      ),
      matchRules: state.matchRules.map((rule) =>
        rule.typeId === id ? { ...rule, typeId: null } : rule,
      ),
    };
  }
  if (action.type === "setPresetTypeHidden") {
    if (!PRESET_ENTRY_TYPE_IDS.has(action.presetId)) return state;
    const current = state.hiddenPresetTypeIds;
    const isHidden = current.includes(action.presetId);
    if (action.hidden === isHidden) return state;
    return {
      ...state,
      hiddenPresetTypeIds: action.hidden
        ? [...current, action.presetId]
        : current.filter((id) => id !== action.presetId),
    };
  }
  if (action.type === "setPresetTypeKind") {
    if (!PRESET_ENTRY_TYPE_IDS.has(action.presetId)) return state;
    const current = state.presetTypeKindOverrides;
    if (current[action.presetId] === action.kind) return state;
    const next = { ...current, [action.presetId]: action.kind };
    return { ...state, presetTypeKindOverrides: next };
  }
  if (action.type === "updateSettings") {
    // Achievements and the unseen queue have their own dispatch path
    // (`recordAchievementUnlock` / `clearUnseenAchievements`). Preserve
    // them across a settings replacement so a concurrent unlock that
    // landed in the reducer between the caller capturing `settings`
    // and the dispatch firing isn't silently overwritten. This applies
    // to the SettingsModal save (whose draft was seeded from `settings`
    // on open) and to `useChangelogAutoOpen`, which captures
    // `settingsRef.current` on mount before the achievement-watcher
    // gets a chance to drain its bus.
    //
    // `applySettingsDraft` splits the flat editing surface back into
    // the bucketed `PersistedSettings` shape: common keys land at the
    // top level; device-scoped keys land in the scope the user edited
    // from, leaving the opposite scope untouched.
    const split = applySettingsDraft(
      state.settings,
      action.scope,
      action.draft,
    );
    return {
      ...state,
      settings: {
        ...split,
        achievements: state.settings.achievements,
        unseenAchievements: state.settings.unseenAchievements,
      },
    };
  }
  if (action.type === "updateDeviceSettings") {
    return {
      ...state,
      settings: applyDeviceSettingPatch(
        state.settings,
        action.scope,
        action.patch,
      ),
    };
  }
  if (action.type === "updateCommonSettings") {
    // Defensive: never let a common-scope patch clobber the
    // achievement state (which has its own dispatch path) or the
    // device bucket. Stripping the keys here is cheaper than relying
    // on every caller to remember the contract.
    const patch = action.patch as Partial<CommonSettings> & {
      achievements?: unknown;
      unseenAchievements?: unknown;
    };
    const allowed: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(patch)) {
      if (key === "achievements" || key === "unseenAchievements") continue;
      allowed[key] = value;
    }
    return {
      ...state,
      settings: { ...state.settings, ...allowed },
    };
  }
  if (action.type === "createAccount") {
    return { ...state, accounts: [...state.accounts, action.account] };
  }
  if (action.type === "updateAccount") {
    return {
      ...state,
      accounts: state.accounts.map((a) =>
        a.id === action.accountId ? { ...a, ...action.patch } : a,
      ),
    };
  }
  if (action.type === "deleteAccount") {
    // Cascading detach: clear `accountId` on any AccountBudget that
    // referenced this account so the budgets keep working as
    // free-standing ledgers, and drop any transfers that touched
    // it (a transfer between two known accounts loses its other half
    // once one side is gone, so the cleanest answer is removal).
    // Imported history and import audit rows belong to the account
    // and are dropped alongside it.
    const nextHistory = { ...state.history };
    delete nextHistory[action.accountId];
    const nextHistoryImports = { ...state.historyImports };
    delete nextHistoryImports[action.accountId];
    return {
      ...state,
      accounts: state.accounts.filter((a) => a.id !== action.accountId),
      sheets: state.sheets.map((sheet) => ({
        ...sheet,
        items: sheet.items.map((item) =>
          item.type === "accountBudget" && item.accountId === action.accountId
            ? { ...item, accountId: null }
            : item,
        ),
      })),
      transfers: state.transfers.filter(
        (tx) =>
          tx.fromAccountId !== action.accountId &&
          tx.toAccountId !== action.accountId,
      ),
      history: nextHistory,
      historyImports: nextHistoryImports,
    };
  }
  if (action.type === "cutAccountHistory") {
    const accountId = action.accountId;
    const cutoff = action.cutoffDate;
    const nextHistory = { ...state.history };
    const existing = nextHistory[accountId] ?? [];
    nextHistory[accountId] = existing.filter((entry) => entry.date >= cutoff);
    const nextHistoryImports = { ...state.historyImports };
    const existingImports = nextHistoryImports[accountId] ?? [];
    nextHistoryImports[accountId] = existingImports.filter(
      (rec) => rec.rangeEnd >= cutoff,
    );
    return {
      ...state,
      history: nextHistory,
      historyImports: nextHistoryImports,
      transfers: state.transfers.filter(
        (tx) =>
          !(
            (tx.fromAccountId === accountId || tx.toAccountId === accountId) &&
            tx.date < cutoff
          ),
      ),
    };
  }
  if (action.type === "importBankHistory") {
    const existing = state.history[action.accountId] ?? [];
    const { merged, addedCount, duplicateCount, addedIds } = mergeHistory(
      existing,
      action.entries,
      action.now,
    );
    // Silently apply stored series rules: any newly-imported entry
    // that fits one of the user's prior "Apply to whole series"
    // confirmations cancels the predicted row without going through
    // the modal. The modal only opens for residual unresolved pairs.
    const newlyAdded = merged.filter((e) => addedIds.has(e.id));
    const autoDeletedRowIds = new Set<string>();
    if (state.seriesMatchRules.length > 0 && newlyAdded.length > 0) {
      for (const sheet of state.sheets) {
        for (const item of sheet.items) {
          if (item.type !== "accountBudget") continue;
          if (item.accountId !== action.accountId) continue;
          const matches = findRuleDrivenCandidates(
            state.seriesMatchRules,
            newlyAdded,
            item.rows,
            item.columns,
          );
          for (const m of matches) autoDeletedRowIds.add(m.rowId);
        }
      }
    }
    // Re-anchor the opening balance from the earliest entry in the
    // merged set so the running balance lines up with what the bank
    // says, even if the user later imports an older statement that
    // pushes the earliest date back further.
    const opening = computeOpeningBalanceFromHistory(merged);
    const importRecord = {
      id: newId(),
      importedAt: action.now,
      filename: action.filename,
      bankParserId: action.bankParserId,
      rangeStart: action.entries.reduce(
        (min, e) => (min === "" || e.date < min ? e.date : min),
        "",
      ),
      rangeEnd: action.entries.reduce(
        (max, e) => (e.date > max ? e.date : max),
        "",
      ),
      addedCount,
      duplicateCount,
    };
    const priorImports = state.historyImports[action.accountId] ?? [];
    // Sweep balance corrections out of the imported date range: once the
    // bank has authoritative entries for those dates, a manual delta
    // sitting in the same window would just double-count.
    const { rangeStart, rangeEnd } = importRecord;
    const sheets =
      rangeStart === "" && rangeEnd === "" && autoDeletedRowIds.size === 0
        ? state.sheets
        : state.sheets.map((sheet) => {
            let touched = false;
            const items = sheet.items.map((item) => {
              if (item.type !== "accountBudget") return item;
              if (item.accountId !== action.accountId) return item;
              const dateCol = findColumnByType(item.columns, "date");
              const filtered = item.rows.filter((r) => {
                if (autoDeletedRowIds.has(r.id)) return false;
                if (!r.isCorrection) return true;
                if (rangeStart === "" || rangeEnd === "") return true;
                if (!dateCol) return true;
                const d = r.cells[dateCol.id];
                if (typeof d !== "string") return true;
                return d < rangeStart || d > rangeEnd;
              });
              if (filtered.length === item.rows.length) return item;
              touched = true;
              return { ...item, rows: filtered };
            });
            return touched ? { ...sheet, items } : sheet;
          });
    return {
      ...state,
      accounts: state.accounts.map((a) => {
        if (a.id !== action.accountId) return a;
        const patch: Partial<typeof a> = {};
        if (opening !== null) patch.openingBalance = opening;
        // Back-fill clearing / accountNumber only when they're empty,
        // so a manual override isn't clobbered by a re-import.
        if (!a.clearing && action.bankClearing)
          patch.clearing = action.bankClearing;
        if (!a.accountNumber && action.bankAccountNumber)
          patch.accountNumber = action.bankAccountNumber;
        return { ...a, ...patch };
      }),
      sheets,
      history: { ...state.history, [action.accountId]: merged },
      historyImports: {
        ...state.historyImports,
        [action.accountId]: [...priorImports, importRecord],
      },
    };
  }
  if (action.type === "correctAccountBalance") {
    // Find the first AccountBudget that tracks the target account.
    // When an account is referenced by multiple budgets, the correction
    // lands in the earliest one — `accountBalance` walks all budgets so
    // the displayed total still agrees regardless of where the row
    // physically sits. No-op when nothing matches.
    let target: { sheetId: string; itemId: string } | null = null;
    outer: for (const sheet of state.sheets) {
      for (const item of sheet.items) {
        if (item.type !== "accountBudget") continue;
        if (item.accountId !== action.accountId) continue;
        target = { sheetId: sheet.id, itemId: item.id };
        break outer;
      }
    }
    if (!target) return state;
    // The reducer is pure — no useT() available here. The balance-
    // correction row gets a description in whichever language the
    // user's chosen at the moment they correct the balance.
    const description =
      state.settings.language === "sv"
        ? "Saldokorrigering"
        : "Balance correction";
    const sheets = updateAccountBudget(
      state.sheets,
      target.sheetId,
      target.itemId,
      (item) => {
        const row = mintBudgetRow(item.columns, {
          date: action.date,
          description,
          amount: action.amount,
        });
        if (!row) return item;
        row.isCorrection = true;
        return { ...item, rows: [...item.rows, row] };
      },
    );
    if (sheets === state.sheets) return state;
    return { ...state, sheets };
  }
  if (action.type === "createTransfer") {
    const next = {
      ...state,
      transfers: [...state.transfers, action.transfer],
    };
    return recordMerchantHints(
      next,
      [
        {
          description: action.transfer.description,
          typeId: action.transfer.typeId ?? null,
        },
      ],
      Date.now(),
    );
  }
  if (action.type === "updateTransfer") {
    const prev = state.transfers.find((t) => t.id === action.transferId);
    const next = {
      ...state,
      transfers: state.transfers.map((tx) =>
        tx.id === action.transferId ? { ...tx, ...action.patch } : tx,
      ),
    };
    // Only fire a hint recording when the type was actually touched
    // by this update; otherwise unrelated edits (date, amount, …)
    // would re-stamp `lastUsedAt` on an unrelated hint.
    if (prev && action.patch.typeId !== undefined) {
      const description =
        action.patch.description !== undefined
          ? action.patch.description
          : prev.description;
      return recordMerchantHints(
        next,
        [{ description, typeId: action.patch.typeId ?? null }],
        Date.now(),
      );
    }
    return next;
  }
  if (action.type === "deleteTransfer") {
    // Also clear the `collapsedIntoTransferId` backref on any
    // history entry that pointed at this transfer, and un-hide
    // those entries — collapse is reversible only if the entries
    // come back when the transfer goes away. We don't try to
    // distinguish "this transfer was a collapse" from "this was
    // a user-created transfer" because the backref disambiguates: an
    // entry only un-hides if it's pointing at the deleted tx.
    const txId = action.transferId;
    let touchedHistory = false;
    const history: Record<string, HistoryEntry[]> = {};
    for (const [accountId, entries] of Object.entries(state.history)) {
      let touched = false;
      const next = entries.map((e) => {
        if (e.collapsedIntoTransferId !== txId) return e;
        touched = true;
        const restored: HistoryEntry = { ...e };
        delete restored.collapsedIntoTransferId;
        delete restored.hidden;
        return restored;
      });
      history[accountId] = touched ? next : entries;
      if (touched) touchedHistory = true;
    }
    return {
      ...state,
      transfers: state.transfers.filter((tx) => tx.id !== action.transferId),
      history: touchedHistory ? history : state.history,
    };
  }
  if (action.type === "promoteRecurringCandidate") {
    // Mint a fresh series from a recurring-detection candidate.
    // Mirrors `addRowsFromComplex` (which the user-driven complex
    // entry modal uses) so the resulting series is indistinguishable
    // from one the user typed in by hand — same seriesId semantics,
    // same glyph propagation, same row shape. The candidate's key is
    // pushed onto `recurringDismissals` after row creation so the
    // panel drops it on the next render and future imports won't
    // resurface a series the user has already promoted.
    const nextSheets = appendSeriesRowsToBudget(state.sheets, action);
    const dismissals = state.recurringDismissals.includes(action.key)
      ? state.recurringDismissals
      : [...state.recurringDismissals, action.key];
    const next = {
      ...state,
      sheets: nextSheets,
      recurringDismissals: dismissals,
    };
    if (action.typeId === null) return next;
    // Key the merchant hint by the raw bank text (`sourceDescription`)
    // so future imports of the same merchant pick up the suggestion
    // even when the user edited the displayed description. When the
    // edit differs from the bank text, record it as an override so
    // synthesized history rows surface the user's label too.
    const override =
      action.description.trim() !== action.sourceDescription.trim()
        ? action.description
        : undefined;
    return recordMerchantHints(
      next,
      [
        {
          description: action.sourceDescription,
          typeId: action.typeId,
          description_override: override,
        },
      ],
      action.now,
    );
  }
  if (action.type === "promoteHistoryToRecurring") {
    // Mint a series like the recurring-candidate promote does, then
    // stamp the merchant hint with the user's chosen typeId and
    // description override so every synthesized history row that
    // normalises to the same key inherits the labels on the next
    // render. The source description (raw bank text) is what we feed
    // to `recordMerchantHints` so the normalised key matches future
    // imports too.
    let next = {
      ...state,
      sheets: appendSeriesRowsToBudget(state.sheets, action),
    };
    // The hint must carry typeId (`recordMerchantHints` derives the
    // category through `type.categoryId`), so skip the recording when
    // the user declined to set a type. The new rows still got minted;
    // the user can backfill labels later by promoting again with one.
    if (action.typeId === null) return next;
    // Honour the "apply to historic matches" opt-out from the modal:
    // when the user unchecked it, mint the future series but skip the
    // merchant-hint stamp so past entries keep their bank text.
    if (!action.applyToHistoric) return next;
    // Stamp `hintIgnored: true` on each excluded entry so the
    // synthesizer skips the merchant-hint step for them while the
    // remaining matches inherit the overlay. The hint itself is still
    // recorded (below) so future imports of matching entries get the
    // label automatically — only the user-picked past entries opt out.
    if (
      action.accountId !== null &&
      action.excludedHistoryEntryIds.length > 0
    ) {
      const excluded = new Set(action.excludedHistoryEntryIds);
      const entries = next.history[action.accountId] ?? [];
      let changed = false;
      const updated = entries.map((e) => {
        if (!excluded.has(e.id)) return e;
        if (e.hintIgnored) return e;
        changed = true;
        return { ...e, hintIgnored: true };
      });
      if (changed) {
        next = {
          ...next,
          history: { ...next.history, [action.accountId]: updated },
        };
      }
    }
    return recordMerchantHints(
      next,
      [
        {
          description: action.sourceDescription,
          typeId: action.typeId,
          description_override: action.description,
        },
      ],
      action.now,
    );
  }
  if (action.type === "dismissRecurringCandidate") {
    if (state.recurringDismissals.includes(action.key)) return state;
    return {
      ...state,
      recurringDismissals: [...state.recurringDismissals, action.key],
    };
  }
  if (action.type === "dismissRecurringCandidates") {
    const existing = new Set(state.recurringDismissals);
    const additions = action.keys.filter((k) => !existing.has(k));
    if (additions.length === 0) return state;
    return {
      ...state,
      recurringDismissals: [...state.recurringDismissals, ...additions],
    };
  }
  if (action.type === "clearRecurringDismissals") {
    if (state.recurringDismissals.length === 0) return state;
    return { ...state, recurringDismissals: [] };
  }
  if (action.type === "collapseTransferPair") {
    // Mint a new Transfer and stamp the two source entries as
    // collapsed + hidden. Idempotent: a re-run that finds the same
    // pair already carrying a backref skips the action entirely.
    const fromEntries = state.history[action.fromAccountId] ?? [];
    const toEntries = state.history[action.toAccountId] ?? [];
    const fromEntry = fromEntries.find((e) => e.id === action.fromEntryId);
    const toEntry = toEntries.find((e) => e.id === action.toEntryId);
    if (!fromEntry || !toEntry) return state;
    if (fromEntry.collapsedIntoTransferId) return state;
    if (toEntry.collapsedIntoTransferId) return state;
    const transfer: Transfer = {
      id: newId(),
      date: action.date,
      description: action.description,
      amount: action.amount,
      fromAccountId: action.fromAccountId,
      toAccountId: action.toAccountId,
    };
    return {
      ...state,
      transfers: [...state.transfers, transfer],
      history: {
        ...state.history,
        [action.fromAccountId]: fromEntries.map((e) =>
          e.id === action.fromEntryId
            ? {
                ...e,
                hidden: true,
                collapsedIntoTransferId: transfer.id,
              }
            : e,
        ),
        [action.toAccountId]: toEntries.map((e) =>
          e.id === action.toEntryId
            ? {
                ...e,
                hidden: true,
                collapsedIntoTransferId: transfer.id,
              }
            : e,
        ),
      },
    };
  }
  if (action.type === "dismissTransferPair") {
    if (state.transferCollapseDismissals.includes(action.pairKey)) return state;
    return {
      ...state,
      transferCollapseDismissals: [
        ...state.transferCollapseDismissals,
        action.pairKey,
      ],
    };
  }
  if (action.type === "clearTransferDismissals") {
    if (state.transferCollapseDismissals.length === 0) return state;
    return { ...state, transferCollapseDismissals: [] };
  }
  if (action.type === "clearMerchantHints") {
    if (Object.keys(state.merchantHints).length === 0) return state;
    return { ...state, merchantHints: {} };
  }
  if (action.type === "createMatchRule") {
    // Append, not prepend: rules earlier in the array win, and a
    // fresh rule should defer to whatever the user already set up
    // unless they reorder. The Patterns tab's up/down buttons go
    // through `moveMatchRule` to promote a new rule above its
    // current shadower.
    const matchRules = [...state.matchRules, action.rule];
    // Walk every budget row and re-evaluate against the new ruleset
    // so a freshly authored pattern catches up the rows that were
    // sitting unlabelled because no rule matched when they were
    // first typed. History entries don't need this — they're matched
    // at render time via `findMatchingRule` so they pick up new
    // rules automatically. `typeIdLocked` rows are skipped so the
    // user's manual choices stay sticky.
    const sheets = reapplyPatternsToAllSheets(state.sheets, matchRules);
    return { ...state, matchRules, sheets };
  }
  if (action.type === "updateMatchRule") {
    const idx = state.matchRules.findIndex((r) => r.id === action.rule.id);
    if (idx < 0) return state;
    const matchRules = state.matchRules.slice();
    matchRules[idx] = action.rule;
    // Same retroactive re-evaluation as `createMatchRule` — editing a
    // rule's pattern, type, or filters should immediately re-label
    // every budget row the new shape now wins (or loses) against.
    const sheets = reapplyPatternsToAllSheets(state.sheets, matchRules);
    return { ...state, matchRules, sheets };
  }
  if (action.type === "reapplyMatchRules") {
    const sheets = reapplyPatternsToAllSheets(state.sheets, state.matchRules);
    if (sheets === state.sheets) return state;
    return { ...state, sheets };
  }
  if (action.type === "applyMatchRuleOnce") {
    const sheets = applyMatchRuleOnceToAllSheets(state.sheets, action.rule);
    const history = applyMatchRuleOnceToHistory(state.history, action.rule);
    if (sheets === state.sheets && history === state.history) return state;
    return { ...state, sheets, history };
  }
  if (action.type === "deleteMatchRule") {
    const next = state.matchRules.filter((r) => r.id !== action.ruleId);
    if (next.length === state.matchRules.length) return state;
    return { ...state, matchRules: next };
  }
  if (action.type === "moveMatchRule") {
    const idx = state.matchRules.findIndex((r) => r.id === action.ruleId);
    if (idx < 0) return state;
    const swapWith = action.direction === "up" ? idx - 1 : idx + 1;
    if (swapWith < 0 || swapWith >= state.matchRules.length) return state;
    const matchRules = state.matchRules.slice();
    [matchRules[idx], matchRules[swapWith]] = [
      matchRules[swapWith],
      matchRules[idx],
    ];
    // Same retroactive re-evaluation as create / update / delete: the
    // reorder changes which rule wins for every row whose previous
    // winner moved relative to a sibling that also matched. typeIdLocked
    // rows are skipped inside reapplyPatternsToAllSheets so manual picks
    // stay sticky.
    const sheets = reapplyPatternsToAllSheets(state.sheets, matchRules);
    return { ...state, matchRules, sheets };
  }
  if (action.type === "updateHistoryEntry") {
    // Capture the prior entry so the rename-learning hook below can
    // diff `userDescription` against the previously effective text
    // (the user override if one was set, otherwise the raw bank
    // description). Both branches of the chokepoint — the per-entry
    // pen-button modal and the budget-view quick-rename — route
    // through this action, so the hook here covers both surfaces.
    const priorEntry =
      state.history[action.accountId]?.find((e) => e.id === action.entryId) ??
      null;
    const history = updateHistoryEntry(
      state.history,
      action.accountId,
      action.entryId,
      (prev) => {
        const next: HistoryEntry = { ...prev };
        if (action.patch.userDescription !== undefined) {
          // Whitespace-only collapses to "no override" so the user can
          // clear the field through the modal without the synthesized
          // row falling back to an empty label. Otherwise persist the
          // raw value — trimming here would strip a trailing space the
          // moment the user typed it, leaving the controlled textarea
          // looking like the keystroke never landed.
          const raw = action.patch.userDescription;
          if (raw.trim() === "") delete next.userDescription;
          else next.userDescription = raw;
        }
        if (action.patch.userTypeId !== undefined) {
          if (action.patch.userTypeId === null) delete next.userTypeId;
          else next.userTypeId = action.patch.userTypeId;
        }
        if (action.patch.isTransfer !== undefined) {
          // Only persist `true` — absent means "not a transfer".
          if (action.patch.isTransfer) next.isTransfer = true;
          else delete next.isTransfer;
        }
        // Bail if the patch is a no-op so React skips a wasted render.
        if (
          next.userDescription === prev.userDescription &&
          next.userTypeId === prev.userTypeId &&
          next.isTransfer === prev.isTransfer
        ) {
          return prev;
        }
        return next;
      },
    );
    if (history === state.history) return state;
    // Learn from genuine renames: the new `userDescription` is set,
    // non-empty, and differs from whatever the row read as before. A
    // pure type / transfer edit doesn't trip the hook. A blank-out
    // (clear the override) doesn't trip it either — clears would
    // teach the predictor to suggest empty strings on future imports.
    let renamePatterns = state.renamePatterns;
    if (
      priorEntry &&
      action.patch.userDescription !== undefined &&
      action.patch.userDescription.trim() !== ""
    ) {
      const trimmed = action.patch.userDescription.trim();
      const previousText = effectiveDescription(priorEntry);
      if (trimmed !== previousText.trim()) {
        renamePatterns = recordRename(
          renamePatterns,
          action.accountId,
          priorEntry.description,
          trimmed,
          Date.now(),
        );
      }
    }
    if (renamePatterns === state.renamePatterns) {
      return { ...state, history };
    }
    return { ...state, history, renamePatterns };
  }
  if (action.type === "applyImportRenames") {
    if (action.renames.length === 0) return state;
    const existing = state.history[action.accountId];
    if (!existing) return state;
    const renameById = new Map(action.renames.map((r) => [r.entryId, r]));
    let historyTouched = false;
    const patched = existing.map((entry) => {
      const r = renameById.get(entry.id);
      if (!r) return entry;
      const trimmed = r.userDescription.trim();
      if (trimmed === "") return entry;
      if (entry.userDescription === trimmed) return entry;
      historyTouched = true;
      return { ...entry, userDescription: trimmed };
    });
    let renamePatterns = state.renamePatterns;
    const now = Date.now();
    for (const r of action.renames) {
      const entry = existing.find((e) => e.id === r.entryId);
      if (!entry) continue;
      const trimmed = r.userDescription.trim();
      if (trimmed === "") continue;
      // `bumpRenamePattern` falls back to `recordRename` when the
      // accepted text drifted from what the pattern holds (the user
      // edited the suggestion before accepting), so an inline edit
      // becomes a fresh learning event without any branching here.
      renamePatterns = bumpRenamePattern(
        renamePatterns,
        action.accountId,
        entry.description,
        trimmed,
        now,
      );
    }
    if (!historyTouched && renamePatterns === state.renamePatterns) {
      return state;
    }
    return {
      ...state,
      history: historyTouched
        ? { ...state.history, [action.accountId]: patched }
        : state.history,
      renamePatterns,
    };
  }
  if (action.type === "splitHistoryEntry") {
    const history = updateHistoryEntry(
      state.history,
      action.accountId,
      action.entryId,
      (prev) => {
        const next: HistoryEntry = { ...prev };
        // An empty splits array means "clear the split" — drop the field
        // so the synthesizer falls back to the single-row path.
        if (action.splits.length === 0) {
          delete next.splits;
        } else {
          // Defensive copy so the reducer never holds a reference to the
          // dispatcher's payload.
          next.splits = action.splits.map((s) => ({ ...s }));
        }
        return next;
      },
    );
    if (history === state.history) return state;
    return { ...state, history };
  }
  if (action.type === "applyReconciliation") {
    const mergedSet = new Set(action.mergedRowIds);
    const orphanByRow = new Map(action.orphans.map((o) => [o.rowId, o]));
    // Stamp curated description / typeId from each merged row onto the
    // matching history entry as `userDescription` / `userTypeId`.
    // Conflict policy: only fill blanks — prior per-entry edits win.
    const overrideByEntry = new Map(
      action.entryOverrides.map((o) => [o.historyEntryId, o]),
    );
    const existingHistory = state.history[action.accountId] ?? [];
    let historyTouched = false;
    const patchedHistory = existingHistory.map((entry) => {
      const o = overrideByEntry.get(entry.id);
      if (!o) return entry;
      const next: HistoryEntry = { ...entry };
      let changed = false;
      if (
        o.userDescription &&
        (entry.userDescription === undefined ||
          entry.userDescription.trim() === "")
      ) {
        next.userDescription = o.userDescription;
        changed = true;
      }
      if (o.userTypeId && entry.userTypeId === undefined) {
        next.userTypeId = o.userTypeId;
        changed = true;
      }
      if (changed) {
        historyTouched = true;
        return next;
      }
      return entry;
    });
    // Index rows touched by both lists so we can prune sheets in
    // a single pass — modifying / deleting per-row is cheaper than
    // recomputing every sheet's rows from scratch.
    if (mergedSet.size === 0 && orphanByRow.size === 0) {
      if (action.seriesRules.length === 0 && !historyTouched) return state;
      return {
        ...state,
        history: historyTouched
          ? { ...state.history, [action.accountId]: patchedHistory }
          : state.history,
        seriesMatchRules:
          action.seriesRules.length > 0
            ? [...state.seriesMatchRules, ...action.seriesRules]
            : state.seriesMatchRules,
      };
    }
    const sheets = state.sheets.map((sheet) => {
      let touched = false;
      const items = sheet.items.map((item) => {
        if (item.type !== "accountBudget") return item;
        const dateCol = findColumnByType(item.columns, "date");
        let rowsTouched = false;
        const nextRows: Row[] = [];
        for (const row of item.rows) {
          if (mergedSet.has(row.id)) {
            rowsTouched = true;
            continue; // delete
          }
          const orphan = orphanByRow.get(row.id);
          if (orphan?.action === "delete") {
            rowsTouched = true;
            continue;
          }
          if (orphan?.action === "move" && dateCol) {
            rowsTouched = true;
            nextRows.push({
              ...row,
              cells: { ...row.cells, [dateCol.id]: orphan.toDate },
            });
            continue;
          }
          nextRows.push(row);
        }
        if (!rowsTouched) return item;
        touched = true;
        return { ...item, rows: nextRows };
      });
      return touched ? { ...sheet, items } : sheet;
    });
    return {
      ...state,
      sheets,
      history: historyTouched
        ? { ...state.history, [action.accountId]: patchedHistory }
        : state.history,
      seriesMatchRules:
        action.seriesRules.length > 0
          ? [...state.seriesMatchRules, ...action.seriesRules]
          : state.seriesMatchRules,
    };
  }
  if (action.type === "renameSheet") {
    return {
      ...state,
      sheets: state.sheets.map((sheet) =>
        sheet.id === action.sheetId ? { ...sheet, name: action.name } : sheet,
      ),
    };
  }
  if (action.type === "addSheet") {
    // New sheets become the active sheet so the user lands on the
    // empty ledger they just created instead of having to chase down
    // its tab.
    return {
      ...state,
      sheets: [...state.sheets, action.sheet],
      activeSheetId: action.sheet.id,
    };
  }
  if (action.type === "updateSheetMeta") {
    return {
      ...state,
      sheets: state.sheets.map((sheet) =>
        sheet.id === action.sheetId ? { ...sheet, ...action.meta } : sheet,
      ),
    };
  }
  if (action.type === "deleteSheet") {
    // Guard against deleting the only sheet — the UI never offers it
    // but the reducer enforces it too so an externally dispatched
    // action can't strand the user with an empty workspace.
    if (state.sheets.length <= 1) return state;
    const nextSheets = state.sheets.filter((s) => s.id !== action.sheetId);
    const nextActive =
      state.activeSheetId === action.sheetId
        ? nextSheets[0].id
        : state.activeSheetId;
    return { ...state, sheets: nextSheets, activeSheetId: nextActive };
  }
  if (action.type === "selectSheet") {
    if (!state.sheets.some((s) => s.id === action.sheetId)) return state;
    return { ...state, activeSheetId: action.sheetId };
  }
  if (action.type === "setItemAccount") {
    return {
      ...state,
      sheets: updateAccountBudget(
        state.sheets,
        action.sheetId,
        action.itemId,
        (item) => ({ ...item, accountId: action.accountId }),
      ),
    };
  }
  // Item-level dispatch tail. Handles every ItemAction; falls through
  // to the defensive `state` fallback when the action is not an item
  // action (unreachable at runtime — the union is closed).
  return reduceItemDispatch(state, action) ?? state;
}
