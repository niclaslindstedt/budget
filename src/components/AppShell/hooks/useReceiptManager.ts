import { useCallback } from "react";

import { unlock } from "../../../data/achievements";
import { collectReceiptPaths } from "../../../data/items/link";
import {
  buildReceiptPath,
  buildRepairReceiptPath,
  extensionOf,
  extensionOfPath,
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
  // Re-file a repair's existing receipt to the canonical
  // "<property>/<date> <company> - <description>" path after the repair's
  // naming inputs change (company / description / date) or its property is
  // renamed. Moves the bytes (download → upload → remove), updates the
  // repair's `receiptPath`, and resolves the new path (or undefined when
  // there was nothing to move / the bytes are gone). A no-op when the path
  // is already canonical.
  renameRepairReceipt: (
    args: RepairReceiptRename,
  ) => Promise<string | undefined>;
};

// Inputs for re-filing a repair receipt: the live `currentPath` plus the new
// naming values (the caller passes the post-edit values, since the hook's
// `data` snapshot still holds the pre-edit repair when called synchronously
// after a dispatch). `reservedPaths` lets a batch (a property rename touching
// several repairs) avoid two repairs racing onto the same new name.
export type RepairReceiptRename = {
  propertyId: string;
  repairId: string;
  currentPath: string;
  propertyName: string;
  companyName: string;
  description: string;
  entryDate?: string;
  reservedPaths?: ReadonlySet<string>;
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
      // Excluding the target's own current path reuses its tidy name on
      // replace, so the new file overwrites it in place — no orphan.
      const usedPaths = collectReceiptPaths(data, current?.receiptPath);
      const path =
        target.kind === "repair"
          ? buildRepairReceiptPath({
              // A repair receipt files under its property's folder with a
              // fixed "<date> <company> - <description>" log name, ignoring
              // the global pattern.
              propertyName: naming.subfolder ?? "",
              fallbackFolder: t("properties.repairsFolderFallback"),
              companyName: naming.companyName,
              description: naming.description ?? "",
              entryDate: naming.entryDate,
              today: todayIso(),
              extension: extensionOf(file.name),
              repairId: naming.entryId,
              usedPaths,
            })
          : buildReceiptPath({
              pattern: settings.receiptNamePattern,
              companyName: naming.companyName,
              entryId: naming.entryId,
              entryDate: naming.entryDate,
              today: todayIso(),
              extension: extensionOf(file.name),
              typeLabel: naming.typeLabel,
              uncategorizedLabel: t("items.receiptUncategorized"),
              usedPaths,
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

  const renameRepairReceipt = useCallback(
    async (args: RepairReceiptRename): Promise<string | undefined> => {
      if (!adapter.receipts) return undefined;
      const {
        propertyId,
        repairId,
        currentPath,
        propertyName,
        companyName,
        description,
        entryDate,
        reservedPaths,
      } = args;
      if (!currentPath) return undefined;

      const usedPaths = new Set(collectReceiptPaths(data, currentPath));
      if (reservedPaths) for (const p of reservedPaths) usedPaths.add(p);
      const newPath = buildRepairReceiptPath({
        propertyName,
        fallbackFolder: t("properties.repairsFolderFallback"),
        companyName,
        description,
        entryDate,
        today: todayIso(),
        // Keep the existing file's extension — only the name / folder change.
        extension: extensionOfPath(currentPath),
        repairId,
        usedPaths,
      });
      if (newPath === currentPath) return currentPath;

      // Move the bytes by copy-then-delete (the backend has no rename).
      // Best-effort: the rename is a cosmetic re-file, so a failed file op
      // (offline, transient) leaves the receipt working at its old path rather
      // than surfacing an error mid-edit. If the file is already gone, leave
      // the reference alone rather than pointing it at a path with no bytes.
      try {
        const blob = await adapter.receipts.download(currentPath);
        if (!blob) return undefined;
        await adapter.receipts.upload(newPath, blob);
        await adapter.receipts.remove(currentPath);
      } catch {
        return undefined;
      }
      dispatch({
        type: "setRepairReceipt",
        propertyId,
        repairId,
        receiptPath: newPath,
      });
      return newPath;
    },
    [adapter, data, t, dispatch],
  );

  return {
    canManageReceipt,
    uploadReceipt,
    downloadReceipt,
    removeReceipt,
    renameRepairReceipt,
  };
}
