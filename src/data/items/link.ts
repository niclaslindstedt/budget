import type { Item, LineItemLink, UserData } from "../types";

// The single transaction an owned `Item` is linked to. An item may be
// linked to at most one purchase (enforced by filtering the item pickers),
// so this is the item's one home: a user-authored budget row or an
// imported bank-history entry. It carries the ids the line-item reducers
// need (`setRowLineItems` for a row, `linkLineItemsToHistoryEntry` for a
// history entry) plus the transaction's current line-item set and receipt
// reference, so a caller can rewrite the receipt without disturbing the
// links it must hand back unchanged.
export type ItemTxnLink =
  | {
      kind: "row";
      sheetId: string;
      // The `AccountBudget` SheetItem id — the `itemId` param the
      // `setRowLineItems` action expects, NOT the owned-item id.
      sheetItemId: string;
      rowId: string;
      lineItems: LineItemLink[];
      receiptPath?: string;
    }
  | {
      kind: "history";
      accountId: string;
      entryId: string;
      lineItems: LineItemLink[];
      receiptPath?: string;
    };

// Find the single transaction the owned item `itemId` is linked to, or
// null when it isn't tied to any purchase yet. Scans user rows across
// every budget sheet first, then imported bank history, and returns the
// first hit — the one-transaction-per-item invariant guarantees there is
// at most one.
export function findItemLink(
  data: UserData,
  itemId: string,
): ItemTxnLink | null {
  for (const sheet of data.sheets) {
    for (const sheetItem of sheet.items) {
      if (sheetItem.type !== "accountBudget") continue;
      for (const row of sheetItem.rows) {
        if (!row.lineItems?.some((l) => l.itemId === itemId)) continue;
        return {
          kind: "row",
          sheetId: sheet.id,
          sheetItemId: sheetItem.id,
          rowId: row.id,
          lineItems: row.lineItems,
          receiptPath: row.receiptPath,
        };
      }
    }
  }
  for (const [accountId, entries] of Object.entries(data.history)) {
    for (const entry of entries) {
      if (!entry.lineItems?.some((l) => l.itemId === itemId)) continue;
      return {
        kind: "history",
        accountId,
        entryId: entry.id,
        lineItems: entry.lineItems,
        receiptPath: entry.receiptPath,
      };
    }
  }
  return null;
}

// Every receipt path currently in use across all receipt hosts (user rows,
// imported history, and property repairs), so a fresh upload that would
// collide with another host's receipt name gets a disambiguating suffix
// instead of overwriting it. `exclude` (the target host's own current path)
// is dropped so replacing a receipt reuses its tidy name in place.
export function collectReceiptPaths(
  data: UserData,
  exclude?: string,
): Set<string> {
  const paths = new Set<string>();
  for (const sheet of data.sheets) {
    for (const sheetItem of sheet.items) {
      if (sheetItem.type !== "accountBudget") continue;
      for (const row of sheetItem.rows) {
        if (row.receiptPath) paths.add(row.receiptPath);
      }
    }
  }
  for (const entries of Object.values(data.history)) {
    for (const entry of entries) {
      if (entry.receiptPath) paths.add(entry.receiptPath);
    }
  }
  // Property repairs own their receipt paths too — include every one so a
  // fresh upload never collides with a repair's invoice receipt. Uploaded
  // property files live in a different physical store (the `properties/`
  // folder, not `receipts/`), but they share this one collision set so a fresh
  // upload's name stays unique across every property attachment regardless of
  // store.
  for (const property of data.properties) {
    for (const repair of property.repairs) {
      if (repair.receipts) {
        for (const receipt of repair.receipts) paths.add(receipt.path);
      }
    }
    for (const file of property.files) {
      if (file.path) paths.add(file.path);
    }
  }
  if (exclude) paths.delete(exclude);
  return paths;
}

// The owned items that may still be linked to a transaction — every item
// not already linked to a purchase, since an item can belong to at most
// one. `keepLinkedTo` (the line items of the transaction currently being
// edited) is re-admitted so its own items stay selectable while editing.
// Feeds the item pickers so a linked item never offers itself for a second
// purchase.
export function unlinkedItems(
  data: UserData,
  keepLinkedTo?: readonly LineItemLink[],
): Item[] {
  const linked = new Set(collectItemReceipts(data).keys());
  if (keepLinkedTo) for (const l of keepLinkedTo) linked.delete(l.itemId);
  return data.items.filter((it) => !linked.has(it.id));
}

// Map every linked owned-item id to the receipt reference of the
// transaction it hangs off (undefined when that transaction carries no
// receipt). The keys are exactly the items currently linked to a purchase,
// so `new Set(map.keys())` is the "already linked" set the item pickers
// subtract to keep an item from being attached to a second transaction.
// One pass over all rows + history; the first link to name an item wins
// (the invariant means there is only one).
export function collectItemReceipts(
  data: UserData,
): Map<string, string | undefined> {
  const out = new Map<string, string | undefined>();
  for (const sheet of data.sheets) {
    for (const sheetItem of sheet.items) {
      if (sheetItem.type !== "accountBudget") continue;
      for (const row of sheetItem.rows) {
        if (!row.lineItems) continue;
        for (const link of row.lineItems) {
          if (!out.has(link.itemId)) out.set(link.itemId, row.receiptPath);
        }
      }
    }
  }
  for (const entries of Object.values(data.history)) {
    for (const entry of entries) {
      if (!entry.lineItems) continue;
      for (const link of entry.lineItems) {
        if (!out.has(link.itemId)) out.set(link.itemId, entry.receiptPath);
      }
    }
  }
  return out;
}
