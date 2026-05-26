import {
  findColumnByType,
  mintBudgetRow,
  newId,
  updateAccountBudget,
  updateHistoryEntry,
} from "./sheet";
import { findRuleDrivenCandidates } from "./reconciliation";
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
import type { SheetDraft } from "./action-payloads";
import {
  computeOpeningBalanceFromHistory,
  mergeHistory,
  type ParsedBankEntry,
} from "../storage/bank-parsers";
import { type ItemAction, reduceItemDispatch } from "./reducers/item";
import { reduceAchievements } from "./reducers/achievements";
import { reduceSheets } from "./reducers/sheets";
import { reduceSettings } from "./reducers/settings";
import { reduceCategoriesAndTypes } from "./reducers/categories-and-types";
import { reduceMatchRules } from "./reducers/match-rules";
import { reduceTransfers } from "./reducers/transfers";
import { reduceRecurring } from "./reducers/recurring";

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
    reduceRecurring(state, action);
  if (handled !== null) return handled;

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
  // Item-level dispatch tail. Handles every ItemAction; falls through
  // to the defensive `state` fallback when the action is not an item
  // action (unreachable at runtime — the union is closed).
  return reduceItemDispatch(state, action) ?? state;
}
