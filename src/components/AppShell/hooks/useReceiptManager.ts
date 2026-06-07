import { useCallback } from "react";

import { unlock } from "../../../data/achievements";
import { collectReceiptPaths } from "../../../data/items/link";
import {
  buildReceiptPath,
  extensionOf,
} from "../../../data/items/receipt-name";
import {
  resolveTxnReceipt,
  type ReceiptNaming,
  type TxnReceiptTarget,
} from "../../../data/receipts/target";
import type { Action } from "../../../data/reducer";
import type { Settings, UserData } from "../../../data/types";
import { useT } from "../../../i18n";
import type { StorageAdapter } from "../../../storage/adapter";
import { todayIso } from "../../../utils/date";

export type ReceiptManager = {
  // Whether the active backend can store receipts at all (the folder /
  // cloud backends do; plain localStorage does not). Hosts gate the
  // upload / manage affordance on this — but still surface "missing
  // receipt" warnings, which are advisory and backend-independent.
  canManageReceipt: boolean;
  // Write the picked file to the backend's `receipts/` folder AND persist
  // its path onto the addressed transaction (preserving the transaction's
  // existing line-item links); resolves the stored path.
  uploadReceipt: (
    target: TxnReceiptTarget,
    file: File,
    naming: ReceiptNaming,
  ) => Promise<string>;
  // Fetch a stored receipt's bytes for the inline preview / download.
  downloadReceipt: (path: string) => Promise<Blob>;
  // Delete the file AND clear the path on the addressed transaction.
  removeReceipt: (target: TxnReceiptTarget, path: string) => Promise<void>;
};

type Args = {
  data: UserData;
  adapter: StorageAdapter;
  settings: Settings;
  dispatch: (action: Action) => void;
};

// Host-generic receipt handling. A receipt's bytes live in the backend's
// `receipts/` folder; its reference is stored on the host it hangs off — an
// imported bank entry (`HistoryEntry.receiptPath`), a user budget row
// (`Row.receiptPath`), or a property repair (`PropertyRepair.receiptPath`).
// This hook owns both halves (the file write and the data commit) for ANY
// host, so the Items sheet and the Properties repairs view share one
// implementation instead of each re-deriving the per-page resolution. For a
// transaction host the commit re-reads the current line-item links and hands
// them back unchanged via the existing line-item reducers, so attaching a
// receipt never disturbs the links; a repair host has no links and commits
// through `setRepairReceipt`.
export function useReceiptManager({
  data,
  adapter,
  settings,
  dispatch,
}: Args): ReceiptManager {
  const t = useT();

  const canManageReceipt = adapter.capabilities.has("receipts");

  // Persist `receiptPath` onto the target host. For a transaction host it
  // resolves the live line-item links at commit time (a stale target can't
  // clobber freshly-edited links) and routes through the EXISTING line-item
  // action for the host's kind; a repair host routes through
  // `setRepairReceipt`. The `receiptPath` contract matches those actions: a
  // string sets it, "" clears it.
  const commitReceipt = useCallback(
    (target: TxnReceiptTarget, receiptPath: string): void => {
      const resolved = resolveTxnReceipt(data, target);
      if (!resolved) return;
      if (target.kind === "history") {
        dispatch({
          type: "linkLineItemsToHistoryEntry",
          accountId: target.accountId,
          entryId: target.entryId,
          lineItems: resolved.lineItems,
          receiptPath,
        });
        return;
      }
      if (target.kind === "repair") {
        // A repair owns its receipt directly — no line-item plumbing.
        dispatch({
          type: "setRepairReceipt",
          propertyId: target.propertyId,
          repairId: target.repairId,
          receiptPath,
        });
        return;
      }
      dispatch({
        type: "setRowLineItems",
        sheetId: target.sheetId,
        itemId: target.sheetItemId,
        rowId: target.rowId,
        lineItems: resolved.lineItems,
        receiptPath,
      });
    },
    [data, dispatch],
  );

  const uploadReceipt = useCallback(
    async (
      target: TxnReceiptTarget,
      file: File,
      naming: ReceiptNaming,
    ): Promise<string> => {
      if (!adapter.receipts) throw new Error("receipts unavailable");
      const current = resolveTxnReceipt(data, target);
      const path = buildReceiptPath({
        pattern: settings.receiptNamePattern,
        companyName: naming.companyName,
        entryId: naming.entryId,
        entryDate: naming.entryDate,
        today: todayIso(),
        extension: extensionOf(file.name),
        typeLabel: naming.typeLabel,
        uncategorizedLabel: t("items.receiptUncategorized"),
        // Excluding the target's own current path reuses its tidy name on
        // replace, so the new file overwrites it in place — no orphan.
        usedPaths: collectReceiptPaths(data, current?.receiptPath),
      });
      await adapter.receipts.upload(path, file);
      unlock("receiptKeeper");
      commitReceipt(target, path);
      return path;
    },
    [adapter, data, settings.receiptNamePattern, t, commitReceipt],
  );

  const downloadReceipt = useCallback(
    async (path: string): Promise<Blob> => {
      if (!adapter.receipts) throw new Error("receipts unavailable");
      const blob = await adapter.receipts.download(path);
      if (!blob) throw new Error("receipt missing");
      return blob;
    },
    [adapter],
  );

  const removeReceipt = useCallback(
    async (target: TxnReceiptTarget, path: string): Promise<void> => {
      if (!adapter.receipts) throw new Error("receipts unavailable");
      await adapter.receipts.remove(path);
      // Empty string clears the receiptPath; the line items are preserved.
      commitReceipt(target, "");
    },
    [adapter, commitReceipt],
  );

  return {
    canManageReceipt,
    uploadReceipt,
    downloadReceipt,
    removeReceipt,
  };
}
