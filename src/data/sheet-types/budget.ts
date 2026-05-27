import { newId } from "../sheet";
import type { AccountBudget, Column } from "../types";

import type { SheetTypeDescriptor } from "./index";

// Default column layout for a newly-minted budget block: a typed
// ledger with date / description / type / amount / balance / done
// columns. Each column gets a fresh id so two budgets minted side by
// side don't share column identity.
export function createDefaultAccountBudget(
  accountId: string | null = null,
): AccountBudget {
  const columns: Column[] = [
    { id: newId(), type: "date", label: "Date" },
    { id: newId(), type: "description", label: "Description" },
    { id: newId(), type: "type", label: "Type" },
    { id: newId(), type: "amount", label: "Amount" },
    { id: newId(), type: "balance", label: "Balance" },
    { id: newId(), type: "completed", label: "Done" },
  ];
  return {
    id: newId(),
    type: "accountBudget",
    accountId,
    columns,
    rows: [],
  };
}

export const BUDGET_SHEET_DESCRIPTOR: SheetTypeDescriptor = {
  id: "budget",
  label: "Budget",
  description: "Track money in and out, month by month.",
  glyph: "wallet",
  createDefaultItem: ({ accountId }) => createDefaultAccountBudget(accountId),
};
