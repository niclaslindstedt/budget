import {
  DEFAULT_CATEGORY_ID,
  PRESET_CATEGORY_IDS,
} from "../presets/categories";
import { PRESET_ENTRY_TYPE_IDS } from "../presets/types";
import type { Action } from "../reducer";
import type { UserData } from "../types";

export function reduceCategoriesAndTypes(
  state: UserData,
  action: Action,
): UserData | null {
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
  if (action.type === "addCompany") {
    return { ...state, companies: [...state.companies, action.company] };
  }
  if (action.type === "updateCompany") {
    return {
      ...state,
      companies: state.companies.map((c) =>
        c.id === action.companyId ? { ...c, ...action.patch } : c,
      ),
    };
  }
  if (action.type === "deleteCompany") {
    const id = action.companyId;
    const stripCompany = <T extends { companyId?: string | null }>(v: T): T => {
      if (v.companyId !== id) return v;
      const { companyId: _drop, ...rest } = v;
      void _drop;
      return rest as T;
    };
    const nextSheets = state.sheets.map((sheet) => ({
      ...sheet,
      items: sheet.items.map((item) => {
        if (item.type !== "accountBudget") return item;
        return {
          ...item,
          rows: item.rows.map((r) =>
            r.companyId === id ? stripCompany(r) : r,
          ),
        };
      }),
    }));
    const nextHistory: Record<string, (typeof state.history)[string]> = {};
    for (const [accountId, entries] of Object.entries(state.history)) {
      nextHistory[accountId] = entries.map((e) => {
        let next = e;
        if (next.userCompanyId === id) {
          const { userCompanyId: _drop, ...rest } = next;
          void _drop;
          next = rest;
        }
        if (next.splits && next.splits.length > 0) {
          const splits = next.splits.map((s) =>
            s.companyId === id ? stripCompany(s) : s,
          );
          if (splits.some((s, i) => s !== next.splits![i])) {
            next = { ...next, splits };
          }
        }
        return next;
      });
    }
    const nextMerchantHints = { ...state.merchantHints };
    for (const [key, hint] of Object.entries(nextMerchantHints)) {
      if (hint.companyId === id) {
        const { companyId: _drop, ...rest } = hint;
        void _drop;
        nextMerchantHints[key] = rest;
      }
    }
    const nextMatchRules = state.matchRules.map((rule) =>
      rule.companyId === id ? { ...rule, companyId: null } : rule,
    );
    const nextRenamePatterns: typeof state.renamePatterns = {};
    for (const [accountId, bucket] of Object.entries(state.renamePatterns)) {
      const nextBucket: typeof bucket = {};
      for (const [key, pattern] of Object.entries(bucket)) {
        if (pattern.suggestedCompanyId === id) {
          const { suggestedCompanyId: _drop, ...rest } = pattern;
          void _drop;
          nextBucket[key] = rest;
        } else {
          nextBucket[key] = pattern;
        }
      }
      nextRenamePatterns[accountId] = nextBucket;
    }
    return {
      ...state,
      companies: state.companies.filter((c) => c.id !== id),
      sheets: nextSheets,
      history: nextHistory,
      merchantHints: nextMerchantHints,
      matchRules: nextMatchRules,
      renamePatterns: nextRenamePatterns,
    };
  }
  if (action.type === "addTag") {
    return { ...state, tags: [...state.tags, action.tag] };
  }
  if (action.type === "updateTag") {
    return {
      ...state,
      tags: state.tags.map((t) =>
        t.id === action.tagId ? { ...t, ...action.patch } : t,
      ),
    };
  }
  if (action.type === "deleteTag") {
    const id = action.tagId;
    // Strip the id from every row's `tagIds`, dropping the field when
    // the array empties so a row never persists an empty `tagIds: []`.
    return {
      ...state,
      tags: state.tags.filter((t) => t.id !== id),
      sheets: state.sheets.map((sheet) => ({
        ...sheet,
        items: sheet.items.map((item) => {
          if (item.type !== "accountBudget") return item;
          return {
            ...item,
            rows: item.rows.map((r) => {
              if (!r.tagIds || !r.tagIds.includes(id)) return r;
              const next = r.tagIds.filter((tagId) => tagId !== id);
              if (next.length > 0) return { ...r, tagIds: next };
              const { tagIds: _drop, ...rest } = r;
              void _drop;
              return rest;
            }),
          };
        }),
      })),
    };
  }
  return null;
}
