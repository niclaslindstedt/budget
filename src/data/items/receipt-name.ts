import type { ReceiptNamePattern } from "../types";

// Canonical list of receipt-name presets, in the order the Items
// settings picker shows them. The validator derives its accept-set from
// this, so adding a preset here (plus a `buildReceiptPath` arm and i18n
// labels) is all that's needed. The first entry is the seeded default.
export const RECEIPT_NAME_PATTERNS: readonly ReceiptNamePattern[] = [
  "name-date",
  "date-name",
  "name",
  "type-name-date",
];

// Characters that are illegal (or asking for trouble) in a file or
// folder name across Windows / macOS / Linux and the cloud APIs,
// including the path separators so a stray "/" in an item name can't
// smear the receipt across an unintended subfolder. Spaces and hyphens
// are deliberately kept — they're legal and the patterns rely on them;
// any run of whitespace is collapsed afterwards.
const ILLEGAL_SEGMENT_CHARS = /[/\\:*?"<>|]/g;

// Cap each path segment so a pathological item name can't blow past
// filesystem / API name limits (255 on most; stay well under).
const MAX_SEGMENT_LENGTH = 80;

export function sanitizeSegment(value: string): string {
  return value
    .replace(ILLEGAL_SEGMENT_CHARS, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_SEGMENT_LENGTH)
    .trim();
}

// Normalise an uploaded file's name to a lower-case extension without
// the dot (e.g. "Scan.JPEG" -> "jpeg"), or "" when there is none.
export function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  if (dot <= 0 || dot === filename.length - 1) return "";
  return filename
    .slice(dot + 1)
    .toLowerCase()
    .replace(ILLEGAL_SEGMENT_CHARS, "");
}

export type BuildReceiptPathOpts = {
  pattern: ReceiptNamePattern;
  // The transaction's company (merchant) name — the primary token in
  // every pattern. The caller resolves it from the row's company and
  // falls back to the transaction description, then to "" (which the
  // builder turns into the literal "receipt").
  companyName: string;
  // The transaction (row / history-entry) id, used only to disambiguate
  // a name collision with another transaction's receipt.
  entryId: string;
  // ISO transaction date ("YYYY-MM-DD…"); the date token falls back to
  // `today` when absent.
  entryDate?: string;
  // ISO date used when `entryDate` is absent (pass the caller's today).
  today: string;
  // Lower-case extension without the dot (from `extensionOf`). "" omits
  // the extension entirely.
  extension: string;
  // Resolved type label for the `type-name-date` pattern's subdirectory.
  // Absent ⇒ unclassified, filed under `uncategorizedLabel`.
  typeLabel?: string;
  // i18n fallback subfolder name for an unclassified transaction.
  uncategorizedLabel: string;
  // The receipt paths already used by OTHER transactions, so a duplicate
  // name gets an id suffix rather than overwriting an unrelated file.
  usedPaths: ReadonlySet<string>;
};

// Build the relative receipt path (inside the backend's `receipts/`
// folder) for a transaction, per the user's chosen preset. The result
// may contain a single subdirectory segment (the `type-name-date`
// preset); every segment is sanitized, and a short id suffix is appended
// when the name would collide with another transaction's receipt so two
// same-merchant purchases never fight over one file.
export function buildReceiptPath(opts: BuildReceiptPathOpts): string {
  const {
    pattern,
    companyName,
    entryId,
    entryDate,
    today,
    extension,
    typeLabel,
    uncategorizedLabel,
    usedPaths,
  } = opts;

  const name = sanitizeSegment(companyName) || "receipt";
  const date = (entryDate && entryDate.slice(0, 10)) || today.slice(0, 10);
  const ext = extension ? `.${extension}` : "";

  let dir = "";
  let stem: string;
  switch (pattern) {
    case "name":
      stem = name;
      break;
    case "date-name":
      stem = `${date} - ${name}`;
      break;
    case "type-name-date":
      dir =
        sanitizeSegment(typeLabel ?? uncategorizedLabel) || uncategorizedLabel;
      stem = `${name} - ${date}`;
      break;
    case "name-date":
    default:
      stem = `${name} - ${date}`;
      break;
  }

  const prefix = dir ? `${dir}/` : "";
  const candidate = `${prefix}${stem}${ext}`;
  if (usedPaths.has(candidate)) {
    return `${prefix}${stem} (${entryId.slice(0, 6)})${ext}`;
  }
  return candidate;
}

export type BuildRepairReceiptPathOpts = {
  // The owning property's name — the subfolder every one of its repair
  // receipts files under, so the backend's `receipts/` folder reads like a
  // per-property log. Sanitised; falls back to `fallbackFolder` when it
  // sanitises to empty.
  propertyName: string;
  fallbackFolder: string;
  // The repair's resolved company (merchant) name. "" omits the company token.
  companyName: string;
  // The repair's user description of the work. "" omits the description token.
  description: string;
  // ISO repair date ("YYYY-MM-DD…"); falls back to `today` when absent.
  entryDate?: string;
  today: string;
  // Lower-case extension without the dot (from `extensionOf`). "" omits it.
  extension: string;
  // An id used only to disambiguate a name collision (the receipt's id, so two
  // receipts on the same repair with the same date / company / description
  // don't fight over one name).
  disambiguatorId: string;
  // Receipt paths already used by OTHER hosts, so a duplicate name gets an id
  // suffix rather than overwriting an unrelated file.
  usedPaths: ReadonlySet<string>;
};

// Build the relative path (inside the backend's per-property `properties/`
// store) for a property repair's receipt: `<property>/receipts/<date>
// <company> - <description>`, so the receipts read like a dated log of the
// work done on each property. The `<date>` is the receipt's own date (a job's
// invoices span different dates). Unlike `buildReceiptPath` this ignores the
// user's global name pattern — the folder + log shape is the whole point.
// Every segment is sanitised, and a short id suffix is appended on a name
// collision.
export function buildRepairReceiptPath(
  opts: BuildRepairReceiptPathOpts,
): string {
  const {
    propertyName,
    fallbackFolder,
    companyName,
    description,
    entryDate,
    today,
    extension,
    disambiguatorId,
    usedPaths,
  } = opts;

  const dir = sanitizeSegment(propertyName) || fallbackFolder;
  const date = (entryDate && entryDate.slice(0, 10)) || today.slice(0, 10);
  const company = sanitizeSegment(companyName);
  const desc = sanitizeSegment(description);
  const ext = extension ? `.${extension}` : "";

  // "<date> <company>" (each present part joined by a space), then
  // " - <description>" when there's a description. Falls back to just the
  // date so a charge with neither company nor description still files cleanly.
  const lead = [date, company].filter(Boolean).join(" ");
  const stem = desc ? `${lead} - ${desc}` : lead;

  // The receipts live in the property's own `receipts/` subfolder so they sit
  // alongside the `files/` tree the uploaded documents land in.
  const prefix = `${dir}/receipts/`;
  const candidate = `${prefix}${stem}${ext}`;
  if (usedPaths.has(candidate)) {
    return `${prefix}${stem} (${disambiguatorId.slice(0, 6)})${ext}`;
  }
  return candidate;
}

export type BuildPropertyFilePathOpts = {
  // The owning property's name — the top folder its files file under inside
  // the backend's `properties/` store. Sanitised; falls back to
  // `fallbackFolder` when it sanitises to empty.
  propertyName: string;
  fallbackFolder: string;
  // The file category's name — a subfolder under the property's `files/`
  // folder. Absent / "" ⇒ the file lands in the `files/` root.
  categoryName?: string;
  // The user's description (the preferred base name). Falls back to the
  // uploaded file's own stem, then the literal "file".
  description?: string;
  // The uploaded file's original name (e.g. "Scan 1.PDF"), used for the
  // extension and as the base name when there is no description.
  originalFilename: string;
  // The file's id, used only to disambiguate a name collision.
  fileId: string;
  // Receipt / file paths already used elsewhere, so a duplicate name gets an
  // id suffix rather than overwriting an unrelated file.
  usedPaths: ReadonlySet<string>;
};

// Build the relative path for an uploaded property file:
// `<property>/files/[<category>/]<name>.<ext>`. The base name is the user's
// description when given, else the uploaded file's own stem; the extension is
// preserved from the original filename. Every segment is sanitised, and a
// short file-id suffix is appended on a name collision so two uploads never
// fight over one path.
export function buildPropertyFilePath(opts: BuildPropertyFilePathOpts): string {
  const {
    propertyName,
    fallbackFolder,
    categoryName,
    description,
    originalFilename,
    fileId,
    usedPaths,
  } = opts;

  const propertyDir = sanitizeSegment(propertyName) || fallbackFolder;
  const extension = extensionOf(originalFilename);
  const ext = extension ? `.${extension}` : "";
  // Strip the extension off the original filename to get its stem, so the
  // description / stem fallback never doubles the extension.
  const originalStem = extension
    ? originalFilename.slice(0, originalFilename.length - extension.length - 1)
    : originalFilename;
  const stem =
    sanitizeSegment(description ?? "") ||
    sanitizeSegment(originalStem) ||
    "file";

  const categorySeg = categoryName ? sanitizeSegment(categoryName) : "";
  const prefix = categorySeg
    ? `${propertyDir}/files/${categorySeg}/`
    : `${propertyDir}/files/`;
  const candidate = `${prefix}${stem}${ext}`;
  if (usedPaths.has(candidate)) {
    return `${prefix}${stem} (${fileId.slice(0, 6)})${ext}`;
  }
  return candidate;
}

// The basename's lower-case extension (no dot) — extension lookup scoped to
// the final path segment so a dot in a subfolder name (a property "Apt 2.0")
// can't be mistaken for the file's extension.
export function extensionOfPath(path: string): string {
  const slash = path.lastIndexOf("/");
  return extensionOf(slash >= 0 ? path.slice(slash + 1) : path);
}
