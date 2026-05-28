import type { SheetGlyph, SheetItem, SheetType, UserData } from "../types";
import type { Action } from "../reducer";

import {
  ACCOUNTS_SHEET_DESCRIPTOR,
  createDefaultAccountsView,
} from "./accounts";
import { BUDGET_SHEET_DESCRIPTOR, createDefaultAccountBudget } from "./budget";

// Single source of truth for every Sheet flavour. Adding a new sheet
// type (savings, loans, scenario, …) is one new file in this directory
// exporting a descriptor, plus one entry in `SHEET_TYPE_REGISTRY`.
// Today the validator in `data/validate/sheet.ts` and the AppShell
// page-routing switch in `components/AppShell/AppShell.tsx` still
// hard-code per-type dispatch — their per-type code shapes differ
// enough (validator context, page prop signatures) that folding them
// into the descriptor would obscure more than it would consolidate.
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
  // Mint the seed `SheetItem` a new Sheet of this flavour starts with.
  // `accountId` is only honoured by flavours that have a per-account
  // budget item; singleton flavours (Accounts) ignore it.
  createDefaultItem(opts: { accountId: string | null }): SheetItem;
  // Item-level dispatch entry point. Returns the next state when the
  // action targets one of this flavour's items; returns `null` when
  // the action belongs to a different sheet type so the outer reducer
  // can defer to the next descriptor. Singleton flavours that hold no
  // row-shaped data (e.g. Accounts) leave this undefined.
  reduceItem?: (state: UserData, action: Action) => UserData | null;
};

export const SHEET_TYPE_REGISTRY: readonly SheetTypeDescriptor[] = [
  BUDGET_SHEET_DESCRIPTOR,
  ACCOUNTS_SHEET_DESCRIPTOR,
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

// Re-exported so legacy importers don't have to know which per-type
// file each factory lives in.
export { createDefaultAccountBudget, createDefaultAccountsView };
