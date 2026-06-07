// Pure builder for a property-export archive. Turns a `Property` plus the
// lookups needed to denormalize its id references into a `manifest.json`
// shape and the list of backend file paths to pull into the ZIP. The byte
// I/O (downloading from the backend, zipping) lives in the attachment hook;
// this module is pure so it can be unit-tested without a storage adapter.

import type { FileCategory, Mortgage, Property, Subtype, Tag } from "../types";
import {
  PROPERTY_EXPORT_FORMAT,
  PROPERTY_EXPORT_VERSION,
  type ManifestFile,
  type ManifestRepair,
  type ManifestTag,
  type PropertyExportManifest,
} from "./manifest";
import { sanitizeSegment } from "../items/receipt-name";

// Resolved company + tags behind one repair, keyed by repair id. The caller
// (the Properties page) resolves these live — transaction-backed repairs read
// their company / tags off the source bank transaction, manual repairs carry
// their own — so the builder stays decoupled from that resolution.
export type RepairExportMeta = { companyName?: string; tags: ManifestTag[] };

export type PropertyExportLookups = {
  // The lender company's name (`Property.companyId` resolved). Only emitted
  // with the financial toggle.
  lenderName?: string;
  repairMeta: ReadonlyMap<string, RepairExportMeta>;
  categoriesById: ReadonlyMap<string, FileCategory>;
  tagsById: ReadonlyMap<string, Tag>;
  subtypesById: ReadonlyMap<string, Subtype>;
};

export type PropertyExportOptions = {
  // Include files flagged `private`. Default off (the export modal default).
  includePrivate: boolean;
  // Bundle repair receipt files. Default on. Repair records are included
  // regardless — this only governs the receipt bytes.
  includeReceipts: boolean;
  // Include the seller's financial records (mortgages + payment history,
  // purchase price, value history). Default off.
  includeFinancials: boolean;
};

export type PropertyExportResult = {
  manifest: PropertyExportManifest;
  // Backend source path -> ZIP-relative destination for every bundled file.
  binaryEntries: { sourcePath: string; zipPath: string }[];
};

function basename(path: string): string {
  return path.split("/").pop() || path;
}

// Reserve a unique ZIP path under `dir`, appending " (n)" before the
// extension on a collision so two same-named files don't clobber each other.
function reserveZipPath(used: Set<string>, dir: string, file: string): string {
  const dot = file.lastIndexOf(".");
  const stem = dot > 0 ? file.slice(0, dot) : file;
  const ext = dot > 0 ? file.slice(dot) : "";
  let candidate = `${dir}${file}`;
  let n = 2;
  while (used.has(candidate)) {
    candidate = `${dir}${stem} (${n})${ext}`;
    n += 1;
  }
  used.add(candidate);
  return candidate;
}

function tagsFor(
  ids: readonly string[] | undefined,
  tagsById: ReadonlyMap<string, Tag>,
): ManifestTag[] | undefined {
  if (!ids || ids.length === 0) return undefined;
  const out: ManifestTag[] = [];
  for (const id of ids) {
    const tag = tagsById.get(id);
    if (tag) out.push({ name: tag.name, color: tag.color });
  }
  return out.length > 0 ? out : undefined;
}

// Strip a mortgage down to what an importer can use: drop each payment's
// `sourceHistoryId` (it references the seller's bank import and is
// meaningless in another workspace).
function exportMortgage(mortgage: Mortgage): Mortgage {
  return {
    ...mortgage,
    payments: mortgage.payments.map(({ sourceHistoryId: _drop, ...rest }) => {
      void _drop;
      return rest;
    }),
  };
}

// Build the manifest + the list of backend files to pull into the archive.
// `availablePaths` is the set of backend paths whose bytes were successfully
// fetched — a file whose bytes are missing (an offline backend, a deleted
// blob) is dropped rather than referencing a ZIP entry that won't exist.
export function buildPropertyExport(
  property: Property,
  lookups: PropertyExportLookups,
  options: PropertyExportOptions,
  availablePaths: ReadonlySet<string>,
  exportedAt: string,
  appVersion?: string,
): PropertyExportResult {
  const usedZipPaths = new Set<string>();
  const binaryEntries: { sourcePath: string; zipPath: string }[] = [];

  // Uploaded files ------------------------------------------------------
  const files: ManifestFile[] = [];
  for (const file of property.files) {
    if (file.private && !options.includePrivate) continue;
    if (!availablePaths.has(file.path)) continue;
    const categoryName = file.categoryId
      ? lookups.categoriesById.get(file.categoryId)?.name
      : undefined;
    const dir = categoryName
      ? `files/${sanitizeSegment(categoryName)}/`
      : "files/";
    const zipPath = reserveZipPath(usedZipPaths, dir, basename(file.path));
    binaryEntries.push({ sourcePath: file.path, zipPath });
    const entry: ManifestFile = {
      id: file.id,
      zipPath,
      filename: basename(file.path),
    };
    if (file.description) entry.description = file.description;
    if (categoryName) entry.categoryName = categoryName;
    const tags = tagsFor(file.tagIds, lookups.tagsById);
    if (tags) entry.tags = tags;
    if (file.private) entry.private = true;
    files.push(entry);
  }

  // Repairs (records always included; receipt bytes gated by the toggle) -
  const repairs: ManifestRepair[] = property.repairs.map((repair) => {
    const meta = lookups.repairMeta.get(repair.id);
    const entry: ManifestRepair = {
      id: repair.id,
      date: repair.date,
      amount: repair.amount,
      description: repair.description,
      typeId: repair.typeId,
    };
    if (repair.subtypeId) {
      const subtypeName = lookups.subtypesById.get(repair.subtypeId)?.name;
      if (subtypeName) entry.subtypeName = subtypeName;
    }
    if (meta?.companyName) entry.companyName = meta.companyName;
    if (meta && meta.tags.length > 0) entry.tags = meta.tags;
    if (
      options.includeReceipts &&
      repair.receiptPath &&
      availablePaths.has(repair.receiptPath)
    ) {
      const zipPath = reserveZipPath(
        usedZipPaths,
        "receipts/",
        basename(repair.receiptPath),
      );
      binaryEntries.push({ sourcePath: repair.receiptPath, zipPath });
      entry.receiptZipPath = zipPath;
    }
    return entry;
  });

  const manifest: PropertyExportManifest = {
    format: PROPERTY_EXPORT_FORMAT,
    version: PROPERTY_EXPORT_VERSION,
    exportedAt,
    property: { name: property.name },
    repairs,
    files,
  };
  if (appVersion) manifest.appVersion = appVersion;
  if (property.size !== undefined) manifest.property.size = property.size;

  if (options.includeFinancials) {
    const financials: PropertyExportManifest["financials"] = {};
    if (property.purchaseAmount !== undefined)
      financials.purchaseAmount = property.purchaseAmount;
    if (property.purchaseDate !== undefined)
      financials.purchaseDate = property.purchaseDate;
    if (property.valueHistory.length > 0)
      financials.valueHistory = property.valueHistory;
    if (property.mortgages.length > 0)
      financials.mortgages = property.mortgages.map(exportMortgage);
    if (lookups.lenderName) financials.lenderName = lookups.lenderName;
    if (Object.keys(financials).length > 0) manifest.financials = financials;
  }

  return { manifest, binaryEntries };
}

// Serialize the manifest to pretty JSON for the archive's `manifest.json`.
export function serializePropertyManifest(
  manifest: PropertyExportManifest,
): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}
