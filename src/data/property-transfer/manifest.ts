// The on-disk shape of a property-export archive's `manifest.json` — the
// sale-handover bundle a user produces from a property's "…" menu and the
// new owner imports into their own workspace. The archive is a ZIP:
//
//   manifest.json                         (this shape, serialized)
//   files/[<category>/]<filename>         (uploaded documents / photos)
//   receipts/<filename>                   (repair receipts, one or more per repair)
//
// Everything the property references by id (the lender / contractor
// companies, tags, file categories, repair subtypes) is denormalized to
// NAMES here, because the importer's workspace has different ids — it
// re-links each name to an existing entity or creates a fresh one. Bank
// account bindings (`Property.accountId`, payment `sourceHistoryId`) are
// the seller's and are dropped entirely.

import type { Mortgage, PropertyValuePoint } from "../types";

// Stable header identifying the archive shape, like `UserData.version` does
// for the whole-workspace export. Bumped only on a breaking manifest change;
// `parsePropertyManifest` rejects a newer version it can't read.
export const PROPERTY_EXPORT_FORMAT = "budget-property-export";
// v1 carried a single `receiptZipPath` per repair; v2 carries a `receipts`
// list (each with its own date), since a repair can group several dated
// invoices. `parsePropertyManifest` still reads v1 (the single path becomes a
// one-element list).
export const PROPERTY_EXPORT_VERSION = 2;

// A tag carried in the manifest — denormalized name + colour so the importer
// can recreate it faithfully, or match an existing tag by name.
export type ManifestTag = { name: string; color: string };

// One repair receipt carried in the manifest — the ZIP-relative path of the
// bundled file plus the receipt's own date, so the importer rebuilds the dated
// list faithfully.
export type ManifestReceipt = { zipPath: string; date: string };

// One repair / renovation. `typeId` is a preset id
// (`preset-type-repairs` / `preset-type-renovations`) which is stable across
// installs, so it's carried verbatim; everything else id-shaped is a name.
// On import every repair lands as a "manual" repair (the seller's source
// bank transactions aren't in the archive), keeping its date / amount /
// description / type / subtype / company / tags / receipts.
export type ManifestRepair = {
  id: string;
  date: string;
  amount: number;
  description: string;
  typeId: string;
  subtypeName?: string;
  companyName?: string;
  tags?: ManifestTag[];
  // The bundled receipts (each a ZIP-relative path + its date), present only
  // when receipts were included (the "include receipts" toggle, and the bytes
  // existed). Omitted when the repair has no included receipt.
  receipts?: ManifestReceipt[];
};

// One uploaded document / photo.
export type ManifestFile = {
  id: string;
  // ZIP-relative path where the bytes live in the archive.
  zipPath: string;
  // Original filename, for the extension + fallback name on re-upload.
  filename: string;
  description?: string;
  categoryName?: string;
  tags?: ManifestTag[];
  private?: boolean;
};

// The seller's financial records — only present when the user opts into
// "include mortgages & transactions". `mortgages` keep their payment
// history (payment `sourceHistoryId`s are stripped — they reference the
// seller's bank import). `lenderName` is the lender company's name.
export type ManifestFinancials = {
  purchaseAmount?: number;
  purchaseDate?: string;
  valueHistory?: PropertyValuePoint[];
  mortgages?: Mortgage[];
  lenderName?: string;
};

export type PropertyExportManifest = {
  format: typeof PROPERTY_EXPORT_FORMAT;
  version: number;
  exportedAt: string; // ISO timestamp the archive was produced
  appVersion?: string; // the producing app's version, for diagnostics
  property: {
    name: string;
    size?: number;
  };
  // Present only when the financial toggle was on at export time.
  financials?: ManifestFinancials;
  repairs: ManifestRepair[];
  files: ManifestFile[];
};
