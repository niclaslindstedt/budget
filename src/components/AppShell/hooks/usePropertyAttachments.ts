import { useCallback, useEffect } from "react";

import { unlock } from "../../../data/achievements";
import { collectReceiptPaths } from "../../../data/items/link";
import {
  buildPropertyFilePath,
  buildRepairReceiptPath,
  extensionOf,
  extensionOfPath,
} from "../../../data/items/receipt-name";
import {
  buildPropertyExport,
  serializePropertyManifest,
  type PropertyExportLookups,
  type PropertyExportOptions,
} from "../../../data/property-transfer/export";
import { planPropertyImport } from "../../../data/property-transfer/import";
import type { PropertyExportManifest } from "../../../data/property-transfer/manifest";
import type { Action } from "../../../data/reducer";
import { newId } from "../../../data/sheet";
import type {
  Property,
  PropertyFile,
  PropertyRepair,
  UserData,
} from "../../../data/types";
import { useT } from "../../../i18n";
import type { StorageAdapter } from "../../../storage/adapter";
import { APP_VERSION } from "../../../utils/build-env";
import { todayIso } from "../../../utils/date";
import { createLogger } from "../../../utils/logger";
import { buildZip, type ZipEntry } from "../../../utils/zip";

const log = createLogger("property-files");

// Metadata the user enters when uploading (or editing) a property file.
export type PropertyFileMeta = {
  description?: string;
  tagIds?: string[];
  categoryId?: string;
  // Whether the file is excluded from a property export by default (see
  // `PropertyFile.private`). Absent / false ⇒ exported.
  private?: boolean;
};

// Inputs for re-filing a repair receipt to its canonical
// "<property>/receipts/<date> <company> - <description>" path after the
// repair's naming inputs change (company / description / date) or its property
// is renamed. `reservedPaths` lets a batch (a property rename touching several
// repairs) avoid two repairs racing onto the same new name.
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

export type PropertyAttachments = {
  // Whether the active backend can store property attachments at all (the
  // folder / cloud backends do; plain localStorage does not). Hosts gate the
  // upload / manage affordance on this — but still surface "missing receipt"
  // warnings, which are advisory and backend-independent.
  canManage: boolean;
  // Fetch a stored attachment's bytes for the inline preview / download. Reads
  // from the per-property `properties/` store both repair receipts and
  // uploaded files live in.
  download: (path: string) => Promise<Blob>;
  // Repair receipts ------------------------------------------------------
  // Write the picked file to `<property>/receipts/` AND persist its path onto
  // the repair; resolves the stored path. `companyName` is the merchant the
  // row resolves (off the source transaction), used only to name the file.
  uploadRepairReceipt: (
    property: Property,
    repair: PropertyRepair,
    companyName: string,
    file: File,
  ) => Promise<string>;
  // Delete a repair receipt's bytes AND clear the repair's `receiptPath`.
  removeRepairReceipt: (
    property: Property,
    repair: PropertyRepair,
    path: string,
  ) => Promise<void>;
  // Re-file a repair receipt after its naming inputs change. Moves the bytes
  // (download → upload → remove), updates the repair's `receiptPath`, and
  // resolves the new path (or undefined when there was nothing to move / the
  // bytes are gone). A no-op when the path is already canonical.
  renameRepairReceipt: (
    args: RepairReceiptRename,
  ) => Promise<string | undefined>;
  // Uploaded files -------------------------------------------------------
  // Write the picked file to `<property>/files/[<category>/]` AND append a
  // `PropertyFile` record carrying its path + metadata; resolves the record.
  uploadPropertyFile: (
    property: Property,
    file: File,
    meta: PropertyFileMeta,
  ) => Promise<PropertyFile>;
  // Replace an existing file's bytes with a freshly-picked file, re-deriving
  // the path from the record's metadata + the new extension (so a same-format
  // replace overwrites in place; a format change re-files). Updates the
  // record's `path` and resolves the new path.
  replacePropertyFile: (
    property: Property,
    record: PropertyFile,
    file: File,
  ) => Promise<string>;
  // Delete a file's bytes AND drop its `PropertyFile` record.
  removePropertyFile: (
    propertyId: string,
    fileId: string,
    path: string,
  ) => Promise<void>;
  // Sale handover ---------------------------------------------------------
  // Build a property-export ZIP archive: the `manifest.json` plus the
  // bundled file / receipt bytes (downloaded from the backend, filtered by
  // the export options). `skipped` counts attachments whose bytes couldn't
  // be fetched (offline / deleted), so the caller can warn. The caller
  // resolves `lookups` (denormalized company / tag / category / subtype
  // names) since that resolution lives on the Properties page.
  exportProperty: (
    property: Property,
    lookups: PropertyExportLookups,
    options: PropertyExportOptions,
  ) => Promise<{ bytes: Uint8Array; skipped: number }>;
  // Whether the active backend can store generated export archives in its
  // sibling `exports/` folder. The export modal gates the "save to backend"
  // destination on this — when false, the only destination is a direct
  // download. Tracks the `exports` capability, which the folder / cloud
  // backends advertise and plain localStorage does not.
  canExportToBackend: boolean;
  // Write a generated export archive to the backend's `exports/` folder under
  // `filename` (a flat name, no path). Resolves once the bytes are persisted.
  // Throws when the active backend has no `exports` store (the caller gates on
  // `canExportToBackend` before offering the destination).
  saveExportToBackend: (filename: string, bytes: Uint8Array) => Promise<void>;
  // Import a parsed property-export archive as a NEW property: re-upload its
  // file / receipt bytes to the backend, then dispatch one `importProperty`
  // action (creating any companies / tags / categories / subtypes needed to
  // re-link names). `skipped` counts attachments dropped because the backend
  // can't store them (e.g. localStorage) or their bytes were missing.
  importProperty: (
    manifest: PropertyExportManifest,
    zip: ReadonlyMap<string, Uint8Array>,
  ) => Promise<{ propertyName: string; skipped: number }>;
};

type Args = {
  data: UserData;
  adapter: StorageAdapter;
  dispatch: (action: Action) => void;
};

// Property-attachment handling. Both a property's repair receipts and the
// arbitrary files the user uploads against it live in the backend's
// per-property `properties/` store (`<name>/receipts/` and
// `<name>/files/[<category>/]`), so this one hook owns the file write + the
// data commit for both — the Properties page wires the repairs view and the
// files manager to it. Repair receipts used to ride the transaction-generic
// `useReceiptManager`; they moved here when the store split out from the flat
// `receipts/` folder, since a repair receipt is addressed by its property +
// repair, not by a transaction.
export function usePropertyAttachments({
  data,
  adapter,
  dispatch,
}: Args): PropertyAttachments {
  const t = useT();

  const store = adapter.propertyFiles;
  const canManage = adapter.capabilities.has("propertyFiles");

  const exportsStore = adapter.exports;
  const canExportToBackend = adapter.capabilities.has("exports");

  // The UI gates the upload / manage affordance on `canManage` (the
  // capability), so if the capability is advertised but the ops object is
  // missing, every operation throws "property files unavailable" and the user
  // sees a generic failure with no clue why. That only happens when an adapter
  // wrapper copies the capability set but forgets to forward the ops object —
  // log it loudly (once per adapter) so the next such regression is caught
  // from the Logs tab rather than a screenshot.
  useEffect(() => {
    if (canManage && !store) {
      log.error(
        `adapter "${adapter.id}" advertises the propertyFiles capability but has no propertyFiles ops — uploads will fail`,
      );
    }
  }, [canManage, store, adapter.id]);

  const download = useCallback(
    async (path: string): Promise<Blob> => {
      if (!store) throw new Error("property files unavailable");
      const blob = await store.download(path);
      if (!blob) throw new Error("attachment missing");
      return blob;
    },
    [store],
  );

  const uploadRepairReceipt = useCallback(
    async (
      property: Property,
      repair: PropertyRepair,
      companyName: string,
      file: File,
    ): Promise<string> => {
      if (!store) throw new Error("property files unavailable");
      // Excluding the repair's own current path reuses its tidy name on
      // replace, so the new file overwrites it in place — no orphan.
      const usedPaths = collectReceiptPaths(data, repair.receiptPath);
      const path = buildRepairReceiptPath({
        propertyName: property.name,
        fallbackFolder: t("properties.repairsFolderFallback"),
        companyName,
        description: repair.description,
        entryDate: repair.date,
        today: todayIso(),
        extension: extensionOf(file.name),
        repairId: repair.id,
        usedPaths,
      });
      await store.upload(path, file);
      unlock("receiptKeeper");
      dispatch({
        type: "setRepairReceipt",
        propertyId: property.id,
        repairId: repair.id,
        receiptPath: path,
      });
      return path;
    },
    [store, data, dispatch, t],
  );

  const removeRepairReceipt = useCallback(
    async (
      property: Property,
      repair: PropertyRepair,
      path: string,
    ): Promise<void> => {
      if (!store) throw new Error("property files unavailable");
      await store.remove(path);
      // Empty string clears the receiptPath.
      dispatch({
        type: "setRepairReceipt",
        propertyId: property.id,
        repairId: repair.id,
        receiptPath: "",
      });
    },
    [store, dispatch],
  );

  const renameRepairReceipt = useCallback(
    async (args: RepairReceiptRename): Promise<string | undefined> => {
      if (!store) return undefined;
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
        const blob = await store.download(currentPath);
        if (!blob) return undefined;
        await store.upload(newPath, blob);
        await store.remove(currentPath);
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
    [store, data, t, dispatch],
  );

  const uploadPropertyFile = useCallback(
    async (
      property: Property,
      file: File,
      meta: PropertyFileMeta,
    ): Promise<PropertyFile> => {
      if (!store) throw new Error("property files unavailable");
      const category = meta.categoryId
        ? data.fileCategories.find((c) => c.id === meta.categoryId)
        : undefined;
      const id = newId();
      const path = buildPropertyFilePath({
        propertyName: property.name,
        fallbackFolder: t("properties.repairsFolderFallback"),
        categoryName: category?.name,
        description: meta.description,
        originalFilename: file.name,
        fileId: id,
        usedPaths: collectReceiptPaths(data),
      });
      await store.upload(path, file);
      unlock("propertyFiler");
      const record: PropertyFile = { id, path };
      const description = meta.description?.trim();
      if (description) record.description = description;
      if (meta.tagIds && meta.tagIds.length > 0) record.tagIds = meta.tagIds;
      // Only keep the category when it still resolves — a stale pick lands the
      // file in the `files/` root rather than a phantom subfolder.
      if (category) record.categoryId = category.id;
      if (meta.private) record.private = true;
      dispatch({
        type: "addPropertyFile",
        propertyId: property.id,
        file: record,
      });
      return record;
    },
    [store, data, dispatch, t],
  );

  const replacePropertyFile = useCallback(
    async (
      property: Property,
      record: PropertyFile,
      file: File,
    ): Promise<string> => {
      if (!store) throw new Error("property files unavailable");
      const category = record.categoryId
        ? data.fileCategories.find((c) => c.id === record.categoryId)
        : undefined;
      // Exclude the record's own path so a same-format replace reuses its tidy
      // name and overwrites in place.
      const usedPaths = collectReceiptPaths(data, record.path);
      const newPath = buildPropertyFilePath({
        propertyName: property.name,
        fallbackFolder: t("properties.repairsFolderFallback"),
        categoryName: category?.name,
        description: record.description,
        originalFilename: file.name,
        fileId: record.id,
        usedPaths,
      });
      await store.upload(newPath, file);
      // Drop the old bytes when the name moved (a format change), so the
      // previous file isn't orphaned next to the replacement.
      if (newPath !== record.path) {
        try {
          await store.remove(record.path);
        } catch {
          // Best-effort cleanup — a failed delete leaves a harmless orphan.
        }
        dispatch({
          type: "updatePropertyFile",
          propertyId: property.id,
          fileId: record.id,
          patch: { path: newPath },
        });
      }
      return newPath;
    },
    [store, data, dispatch, t],
  );

  const removePropertyFile = useCallback(
    async (propertyId: string, fileId: string, path: string): Promise<void> => {
      if (!store) throw new Error("property files unavailable");
      await store.remove(path);
      dispatch({ type: "deletePropertyFile", propertyId, fileId });
    },
    [store, dispatch],
  );

  const exportProperty = useCallback(
    async (
      property: Property,
      lookups: PropertyExportLookups,
      options: PropertyExportOptions,
    ): Promise<{ bytes: Uint8Array; skipped: number }> => {
      // Gather the attachment paths the options want, then fetch their bytes.
      // A path whose bytes can't be fetched is counted and dropped — the
      // builder only references successfully-fetched files.
      const candidatePaths = new Set<string>();
      for (const file of property.files) {
        if (file.private && !options.includePrivate) continue;
        candidatePaths.add(file.path);
      }
      if (options.includeReceipts) {
        for (const repair of property.repairs) {
          if (repair.receiptPath) candidatePaths.add(repair.receiptPath);
        }
      }

      const bytesBySource = new Map<string, Uint8Array>();
      let skipped = 0;
      for (const path of candidatePaths) {
        if (!store) {
          skipped += 1;
          continue;
        }
        try {
          const blob = await store.download(path);
          if (!blob) {
            skipped += 1;
            continue;
          }
          bytesBySource.set(path, new Uint8Array(await blob.arrayBuffer()));
        } catch (err) {
          log.error(`property export: failed to fetch ${path}`, err);
          skipped += 1;
        }
      }

      const { manifest, binaryEntries } = buildPropertyExport(
        property,
        lookups,
        options,
        new Set(bytesBySource.keys()),
        new Date().toISOString(),
        APP_VERSION,
      );
      const entries: ZipEntry[] = [
        { name: "manifest.json", data: serializePropertyManifest(manifest) },
        ...binaryEntries.map((e) => ({
          name: e.zipPath,
          // Present by construction — the builder only emits entries whose
          // source bytes are in the available set.
          data: bytesBySource.get(e.sourcePath) as Uint8Array,
        })),
      ];
      unlock("propertyHandover");
      return { bytes: buildZip(entries), skipped };
    },
    [store],
  );

  const saveExportToBackend = useCallback(
    async (filename: string, bytes: Uint8Array): Promise<void> => {
      if (!exportsStore) throw new Error("exports unavailable");
      await exportsStore.upload(
        filename,
        new Blob([bytes as BlobPart], { type: "application/zip" }),
      );
      unlock("propertyHandover");
    },
    [exportsStore],
  );

  const importProperty = useCallback(
    async (
      manifest: PropertyExportManifest,
      zip: ReadonlyMap<string, Uint8Array>,
    ): Promise<{ propertyName: string; skipped: number }> => {
      const plan = planPropertyImport(manifest, data);

      // Resolve category names (existing + newly-planned) for path building.
      const categoryNameById = new Map<string, string>();
      for (const c of data.fileCategories) categoryNameById.set(c.id, c.name);
      for (const c of plan.newFileCategories)
        categoryNameById.set(c.id, c.name);

      // Seed the collision set with every path already in use so a re-upload
      // never clobbers an unrelated file.
      const usedPaths = new Set<string>(collectReceiptPaths(data));
      const fallbackFolder = t("properties.repairsFolderFallback");

      const files: PropertyFile[] = [];
      const repairs: PropertyRepair[] = [];
      let skipped = 0;

      for (const pf of plan.files) {
        const bytes = zip.get(pf.zipPath);
        if (!store || !bytes) {
          skipped += 1;
          continue;
        }
        const categoryName = pf.categoryId
          ? categoryNameById.get(pf.categoryId)
          : undefined;
        const path = buildPropertyFilePath({
          propertyName: plan.propertyName,
          fallbackFolder,
          categoryName,
          description: pf.description,
          originalFilename: pf.filename,
          fileId: pf.id,
          usedPaths,
        });
        usedPaths.add(path);
        await store.upload(path, new Blob([bytes as BlobPart]));
        const record: PropertyFile = { id: pf.id, path };
        if (pf.description) record.description = pf.description;
        if (pf.categoryId) record.categoryId = pf.categoryId;
        if (pf.tagIds) record.tagIds = pf.tagIds;
        if (pf.private) record.private = true;
        files.push(record);
      }

      for (const pr of plan.repairs) {
        const repair: PropertyRepair = {
          id: pr.id,
          date: pr.date,
          amount: pr.amount,
          description: pr.description,
          typeId: pr.typeId,
        };
        if (pr.subtypeId) repair.subtypeId = pr.subtypeId;
        if (pr.companyId) repair.companyId = pr.companyId;
        if (pr.tagIds) repair.tagIds = pr.tagIds;
        const bytes = pr.receiptZipPath
          ? zip.get(pr.receiptZipPath)
          : undefined;
        if (pr.receiptZipPath && store && bytes) {
          const path = buildRepairReceiptPath({
            propertyName: plan.propertyName,
            fallbackFolder,
            companyName: "",
            description: pr.description,
            entryDate: pr.date,
            today: todayIso(),
            extension: extensionOfPath(pr.receiptZipPath),
            repairId: pr.id,
            usedPaths,
          });
          usedPaths.add(path);
          await store.upload(path, new Blob([bytes as BlobPart]));
          repair.receiptPath = path;
        } else if (pr.receiptZipPath) {
          // The receipt couldn't be re-uploaded (no backend / missing bytes);
          // the repair still imports, just without its receipt.
          skipped += 1;
        }
        repairs.push(repair);
      }

      const property: Property = {
        id: plan.propertyId,
        name: plan.propertyName,
        valueHistory: plan.valueHistory,
        mortgages: plan.mortgages,
        repairs,
        files,
      };
      if (plan.size !== undefined) property.size = plan.size;
      if (plan.purchaseAmount !== undefined)
        property.purchaseAmount = plan.purchaseAmount;
      if (plan.purchaseDate !== undefined)
        property.purchaseDate = plan.purchaseDate;
      if (plan.lenderCompanyId) property.companyId = plan.lenderCompanyId;

      dispatch({
        type: "importProperty",
        property,
        newCompanies: plan.newCompanies,
        newTags: plan.newTags,
        newFileCategories: plan.newFileCategories,
        newSubtypes: plan.newSubtypes,
      });
      unlock("propertyHandover");
      return { propertyName: plan.propertyName, skipped };
    },
    [store, data, dispatch, t],
  );

  return {
    canManage,
    download,
    uploadRepairReceipt,
    removeRepairReceipt,
    renameRepairReceipt,
    uploadPropertyFile,
    replacePropertyFile,
    removePropertyFile,
    exportProperty,
    canExportToBackend,
    saveExportToBackend,
    importProperty,
  };
}
