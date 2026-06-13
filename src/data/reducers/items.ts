import {
  isNormalisedKeyMeaningful,
  normaliseDescription,
} from "../description-normaliser";
import { applyPatch } from "./patch";
import type { Action } from "../reducer";
import type { UserData } from "../types";

// CRUD for the owned-items catalog (`UserData.items`) and the subtype
// taxonomy tier (`UserData.subtypes`). Both are entirely user-curated — no
// presets — so unlike categories / types there's no preset-immutability
// guard here. Mirrors the company / tag CRUD in `categories-and-types.ts`.
export function reduceItems(state: UserData, action: Action): UserData | null {
  if (action.type === "addSubtype") {
    return { ...state, subtypes: [...state.subtypes, action.subtype] };
  }
  if (action.type === "updateSubtype") {
    return {
      ...state,
      subtypes: state.subtypes.map((s) =>
        s.id === action.subtypeId ? { ...s, ...action.patch } : s,
      ),
    };
  }
  if (action.type === "deleteSubtype") {
    // Deleting a subtype clears `subtypeId` on every item that referenced
    // it (the item falls back to "unclassified"); items are never deleted
    // by a subtype removal.
    const id = action.subtypeId;
    return {
      ...state,
      subtypes: state.subtypes.filter((s) => s.id !== id),
      items: state.items.map((it) => {
        if (it.subtypeId !== id) return it;
        const { subtypeId: _drop, ...rest } = it;
        void _drop;
        return rest;
      }),
    };
  }
  if (action.type === "ignoreItemEntry") {
    // Append the history-entry id to the ignore allowlist the "Find
    // items" scanner reads (dedup). Mirrors `dismissRecurringCandidate`.
    if (state.ignoredItemEntryIds.includes(action.entryId)) return state;
    return {
      ...state,
      ignoredItemEntryIds: [...state.ignoredItemEntryIds, action.entryId],
    };
  }
  if (action.type === "clearIgnoredItemEntries") {
    if (state.ignoredItemEntryIds.length === 0) return state;
    return { ...state, ignoredItemEntryIds: [] };
  }
  if (action.type === "excludeSimilarItemEntries") {
    // Normalise the resolved label to a match key. A description that
    // collapses to nothing meaningful (e.g. "ATM", a bare reference
    // number) would match far too broadly, so it's a no-op — the
    // per-entry "ignore" still covers that case. Dedup like the ignore
    // allowlist.
    const key = normaliseDescription(action.description);
    if (!isNormalisedKeyMeaningful(key)) return state;
    if (state.itemFindExclusionPatterns.includes(key)) return state;
    return {
      ...state,
      itemFindExclusionPatterns: [...state.itemFindExclusionPatterns, key],
    };
  }
  if (action.type === "clearItemFindExclusions") {
    if (state.itemFindExclusionPatterns.length === 0) return state;
    return { ...state, itemFindExclusionPatterns: [] };
  }
  if (action.type === "addItem") {
    return { ...state, items: [...state.items, action.item] };
  }
  if (action.type === "updateItem") {
    return {
      ...state,
      items: state.items.map((it) =>
        it.id === action.itemId ? applyPatch(it, action.patch) : it,
      ),
    };
  }
  if (action.type === "addItemValue") {
    // Append one dated value snapshot to the item's `valueHistory` (the
    // current value is the latest point on or before today). Mirrors
    // `addInvestmentHoldingValue`.
    return {
      ...state,
      items: state.items.map((it) =>
        it.id === action.itemId
          ? { ...it, valueHistory: [...(it.valueHistory ?? []), action.point] }
          : it,
      ),
    };
  }
  if (action.type === "deleteItemValue") {
    // Drop one recorded value snapshot by id; the field empties to absent
    // so a freshly-cleared item matches the never-recorded shape.
    return {
      ...state,
      items: state.items.map((it) => {
        if (it.id !== action.itemId) return it;
        const next = (it.valueHistory ?? []).filter(
          (pt) => pt.id !== action.pointId,
        );
        if (next.length > 0) return { ...it, valueHistory: next };
        const { valueHistory: _drop, ...rest } = it;
        void _drop;
        return rest;
      }),
    };
  }
  if (action.type === "deleteItem") {
    // Deleting an item sweeps every inline line-item link that pointed at
    // it — across all budget rows AND all history entries — dropping the
    // `lineItems` field when its array empties (mirrors `deleteTag` for
    // `tagIds`). The validator would silently drop dangling links on the
    // next load anyway; doing it here keeps the live state clean.
    const id = action.itemId;
    const nextSheets = state.sheets.map((sheet) => ({
      ...sheet,
      items: sheet.items.map((item) => {
        if (item.type !== "accountBudget") return item;
        return {
          ...item,
          rows: item.rows.map((r) => {
            if (!r.lineItems || !r.lineItems.some((l) => l.itemId === id))
              return r;
            const next = r.lineItems.filter((l) => l.itemId !== id);
            if (next.length > 0) return { ...r, lineItems: next };
            const { lineItems: _drop, ...rest } = r;
            void _drop;
            return rest;
          }),
        };
      }),
    }));
    const nextHistory: Record<string, (typeof state.history)[string]> = {};
    for (const [accountId, entries] of Object.entries(state.history)) {
      nextHistory[accountId] = entries.map((e) => {
        if (!e.lineItems || !e.lineItems.some((l) => l.itemId === id)) return e;
        const next = e.lineItems.filter((l) => l.itemId !== id);
        if (next.length > 0) return { ...e, lineItems: next };
        const { lineItems: _drop, ...rest } = e;
        void _drop;
        return rest;
      });
    }
    return {
      ...state,
      items: state.items.filter((it) => it.id !== id),
      sheets: nextSheets,
      history: nextHistory,
    };
  }
  return null;
}
