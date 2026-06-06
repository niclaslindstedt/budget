import type { LineItemLink, UserData } from "../types";

// Where a receipt physically hangs: a single transaction — an imported
// bank-history entry, or a user-authored budget row. A receipt's bytes
// live in the backend's `receipts/` folder; the reference (`receiptPath`)
// is stored on that transaction, alongside its line-item links. This
// target is the page-agnostic address of that transaction, so the receipt
// flow (upload / view / remove) can serve the Items sheet, the Properties
// repairs view, and any future receipt host with one set of handlers.
//
// `history` mirrors the ids `linkLineItemsToHistoryEntry` expects; `row`
// mirrors the ids `setRowLineItems` expects (note `sheetItemId` is the
// `AccountBudget` SheetItem id the action calls `itemId`, NOT an owned-item
// id). Shared with `ItemTxnLink` in `src/data/items/link.ts`, which carries
// the same ids plus the item-specific resolution.
export type TxnReceiptTarget =
  | { kind: "history"; accountId: string; entryId: string }
  | { kind: "row"; sheetId: string; sheetItemId: string; rowId: string };

// Naming inputs for a receipt file — everything the filename builder needs
// that the generic target can't supply. The host knows the merchant name,
// the date to stamp, and the type label to file it under. `entryId` is used
// ONLY to disambiguate a name collision with another transaction's receipt
// (the builder appends a short suffix), so a host may pass any stable id: the
// Items flow passes the item id to keep filenames byte-identical to before,
// the repairs flow passes the source bank entry id.
export type ReceiptNaming = {
  companyName: string;
  entryId: string;
  entryDate?: string;
  typeLabel?: string;
};

// The current `receiptPath` + `lineItems` of the transaction a target
// addresses, read LIVE from `data`. A receipt commit must hand the existing
// line-item links back unchanged (the line-item reducers rewrite both the
// receipt reference and the links in one action), so the caller resolves
// them at commit time rather than trusting a stale snapshot captured when a
// modal opened. `null` when the transaction can't be found — a stale id
// (the row / entry was deleted, or the source account was re-imported) — so
// the caller can skip the commit instead of clobbering an unrelated record.
export function resolveTxnReceipt(
  data: UserData,
  target: TxnReceiptTarget,
): { receiptPath?: string; lineItems: LineItemLink[] } | null {
  if (target.kind === "history") {
    const entries = data.history[target.accountId];
    const entry = entries?.find((e) => e.id === target.entryId);
    if (!entry) return null;
    return { receiptPath: entry.receiptPath, lineItems: entry.lineItems ?? [] };
  }
  const sheet = data.sheets.find((s) => s.id === target.sheetId);
  if (!sheet) return null;
  for (const sheetItem of sheet.items) {
    if (
      sheetItem.type !== "accountBudget" ||
      sheetItem.id !== target.sheetItemId
    )
      continue;
    const row = sheetItem.rows.find((r) => r.id === target.rowId);
    if (!row) return null;
    return { receiptPath: row.receiptPath, lineItems: row.lineItems ?? [] };
  }
  return null;
}
