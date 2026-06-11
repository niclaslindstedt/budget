import type { Result } from "../validate/helpers";
import type { SheetItemValidationContext } from "../validate/sheet-items";
import type {
  CategoryIcon,
  Row,
  SheetGlyph,
  SheetItem,
  SheetType,
  UserData,
} from "../types";
import type { Action } from "../reducer";

import {
  ACCOUNTS_SHEET_DESCRIPTOR,
  createDefaultAccountsView,
} from "./accounts";
import { BUDGET_SHEET_DESCRIPTOR, createDefaultAccountBudget } from "./budget";
import {
  INSIGHTS_SHEET_DESCRIPTOR,
  createDefaultInsightsView,
} from "./insights";
import {
  INVESTMENT_SHEET_DESCRIPTOR,
  createDefaultInvestmentView,
} from "./investment";
import { ITEMS_SHEET_DESCRIPTOR, createDefaultItemsView } from "./items";
import {
  PROPERTIES_SHEET_DESCRIPTOR,
  createDefaultPropertiesView,
} from "./properties";
import { LOANS_SHEET_DESCRIPTOR, createDefaultLoansView } from "./loans";
import { SALARY_SHEET_DESCRIPTOR, createDefaultSalaryView } from "./salary";
import { SAVINGS_SHEET_DESCRIPTOR, createDefaultSavingsView } from "./savings";

// Single source of truth for every Sheet flavour. Adding a new sheet
// type (savings, loans, scenario, …) is one new file in this directory
// exporting a descriptor, plus one entry in `SHEET_TYPE_REGISTRY`. The
// descriptor now also carries the validator dispatch, the item-action
// discriminator, and the cross-page row accessor so a new flavour
// threads through load/import, the reducer walk, and the search /
// achievements / backup traversals without each of those hard-coding a
// `type === "accountBudget"` arm. The AppShell page-routing switch in
// `components/AppShell/AppShell.tsx` still branches on the literal —
// its per-page prop signatures differ enough that folding them in
// would obscure more than it consolidates.
export type SheetTypeDescriptor = {
  id: SheetType;
  // English fallback shown by the SheetModal type picker. The picker
  // does not currently translate these — the same "No hardcoded
  // user-facing strings" hole the rest of the chrome carries. Pending
  // the i18n sweep, the labels live with the descriptor so a future
  // pass can switch them to `i18nKey` lookups in one place.
  label: string;
  description: string;
  glyph: SheetGlyph;
  // Curated glyph palette the SheetModal offers when this flavour is
  // selected. Absent ⇒ fall back to the planner-leaning
  // `SHEET_GLYPH_NAMES`. Item-tracking flavours override it with a
  // possessions-oriented set so the picker matches what the sheet
  // stands for (a thing, not a financial concept).
  glyphNames?: readonly CategoryIcon[];
  // Mint the seed `SheetItem` a new Sheet of this flavour starts with.
  // `accountId` is only honoured by flavours that have a per-account
  // budget item; singleton flavours (Accounts, Items) ignore it.
  createDefaultItem(opts: { accountId: string | null }): SheetItem;
  // Validate one raw `SheetItem` of this flavour during load / import.
  // Called by `validateSheetItem` once it has matched `raw.type` to
  // this descriptor's discriminant(s) via `itemTypes`. The single gate
  // on load — a wrong arm breaks file import, so round-trip is tested.
  validate(
    raw: unknown,
    path: string,
    ctx: SheetItemValidationContext,
  ): Result<SheetItem>;
  // The `SheetItem.type` discriminant(s) this flavour owns. Used by the
  // validator to pick the right `validate`, so the dispatch lives with
  // the descriptor instead of an if-chain. One entry today per flavour;
  // an array leaves room for a flavour that renders more than one item
  // variant.
  itemTypes: readonly SheetItem["type"][];
  // Item-level dispatch entry point. Returns the next state when the
  // action targets one of this flavour's items; returns `null` when
  // the action belongs to a different sheet type so the outer reducer
  // can defer to the next descriptor. Singleton flavours that hold no
  // row-shaped data (e.g. Accounts, Items) leave this undefined.
  reduceItem?: (state: UserData, action: Action) => UserData | null;
  // The action `type` literals this flavour's `reduceItem` claims.
  // Declared here so each flavour's owned actions live in one place
  // rather than a private discriminator switch; `ownsAction` resolves
  // membership for any consumer that needs it (today the budget
  // descriptor's own dispatch guard). Absent on flavours without a
  // `reduceItem`.
  itemActionTypes?: readonly string[];
  // The persisted rows this flavour's items contribute, flattened
  // across one item. Cross-page traversals (search index, achievement
  // progress, backup entry count) walk `eachSheetItemRow` instead of
  // hard-coding `type === "accountBudget"`, so a future row-bearing
  // flavour is counted automatically. Flavours with no row-shaped data
  // (Accounts, Items) leave this undefined and contribute nothing.
  rowsForItem?: (item: SheetItem) => readonly Row[];
};

export const SHEET_TYPE_REGISTRY: readonly SheetTypeDescriptor[] = [
  BUDGET_SHEET_DESCRIPTOR,
  ACCOUNTS_SHEET_DESCRIPTOR,
  ITEMS_SHEET_DESCRIPTOR,
  SALARY_SHEET_DESCRIPTOR,
  PROPERTIES_SHEET_DESCRIPTOR,
  SAVINGS_SHEET_DESCRIPTOR,
  LOANS_SHEET_DESCRIPTOR,
  INSIGHTS_SHEET_DESCRIPTOR,
  INVESTMENT_SHEET_DESCRIPTOR,
];

// Set-shaped view for validators and any other consumer that needs an
// O(1) `has(id)` check. Derived from the registry so adding a sheet
// type can't leave the validator behind.
export const SHEET_TYPE_IDS: ReadonlySet<SheetType> = new Set(
  SHEET_TYPE_REGISTRY.map((d) => d.id),
);

// Centralised lookup so call sites don't re-implement the `.find()` +
// fallback dance. Falls back to the first registered descriptor when
// the id is unknown, which mirrors the existing pre-registry behaviour
// in SheetModal and createDefaultSheet.
export function getSheetTypeDescriptor(id: SheetType): SheetTypeDescriptor {
  return SHEET_TYPE_REGISTRY.find((d) => d.id === id) ?? SHEET_TYPE_REGISTRY[0];
}

// Find the descriptor that owns a given `SheetItem.type` discriminant,
// or `undefined` when no flavour claims it (an unknown item type from a
// corrupt / newer file). Used by the validator dispatch.
export function descriptorForItemType(
  itemType: string,
): SheetTypeDescriptor | undefined {
  return SHEET_TYPE_REGISTRY.find((d) =>
    (d.itemTypes as readonly string[]).includes(itemType),
  );
}

// Whether any registered flavour's `reduceItem` claims this action.
// Lets a descriptor's dispatch guard ask the registry rather than
// re-listing the action types in a private switch.
export function ownsItemAction(actionType: string): boolean {
  return SHEET_TYPE_REGISTRY.some((d) =>
    d.itemActionTypes?.includes(actionType),
  );
}

// Walk every persisted row across every sheet item of every flavour
// that declares a `rowsForItem` accessor, calling `fn` for each. Stops
// early (returns true) the moment `fn` returns true — the
// "does any row satisfy …" shape the achievement predicates want.
// Cross-page traversals use this instead of hard-coding
// `type === "accountBudget"`, so a future row-bearing flavour is
// included automatically.
export function someSheetItemRow(
  state: UserData,
  fn: (row: Row) => boolean,
): boolean {
  for (const sheet of state.sheets) {
    for (const item of sheet.items) {
      const rows = descriptorForItemType(item.type)?.rowsForItem?.(item);
      if (rows && rows.some(fn)) return true;
    }
  }
  return false;
}

// Total count of persisted rows across every row-bearing sheet item.
// The backup-metadata `entryCount` reads this so the figure follows
// every flavour's rows, not just budgets'.
export function countSheetItemRows(state: UserData): number {
  let count = 0;
  for (const sheet of state.sheets) {
    for (const item of sheet.items) {
      const rows = descriptorForItemType(item.type)?.rowsForItem?.(item);
      if (rows) count += rows.length;
    }
  }
  return count;
}

// Re-exported so legacy importers don't have to know which per-type
// file each factory lives in.
export {
  createDefaultAccountBudget,
  createDefaultAccountsView,
  createDefaultInsightsView,
  createDefaultInvestmentView,
  createDefaultItemsView,
  createDefaultLoansView,
  createDefaultPropertiesView,
  createDefaultSalaryView,
  createDefaultSavingsView,
};
