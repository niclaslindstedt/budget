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

function sanitizeSegment(value: string): string {
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
  // The item's display name — the primary token in every pattern.
  itemName: string;
  // The item id, used only to disambiguate a name collision with
  // another item's receipt.
  itemId: string;
  // ISO acquired date ("YYYY-MM-DD…"); the date token falls back to
  // `today` when absent.
  acquiredAt?: string;
  // ISO date used when `acquiredAt` is absent (pass the caller's today).
  today: string;
  // Lower-case extension without the dot (from `extensionOf`). "" omits
  // the extension entirely.
  extension: string;
  // Resolved type / category label for the `type-name-date` pattern's
  // subdirectory. Absent ⇒ unclassified, filed under `uncategorizedLabel`.
  typeLabel?: string;
  // i18n fallback subfolder name for an unclassified item.
  uncategorizedLabel: string;
  // The receipt paths already used by OTHER items, so a duplicate name
  // gets an id suffix rather than overwriting an unrelated item's file.
  usedPaths: ReadonlySet<string>;
};

// Build the relative receipt path (inside the backend's `receipts/`
// folder) for an item, per the user's chosen preset. The result may
// contain a single subdirectory segment (the `type-name-date` preset);
// every segment is sanitized, and a short id suffix is appended when the
// name would collide with another item's receipt so two same-named
// items never fight over one file.
export function buildReceiptPath(opts: BuildReceiptPathOpts): string {
  const {
    pattern,
    itemName,
    itemId,
    acquiredAt,
    today,
    extension,
    typeLabel,
    uncategorizedLabel,
    usedPaths,
  } = opts;

  const name = sanitizeSegment(itemName) || "receipt";
  const date = (acquiredAt && acquiredAt.slice(0, 10)) || today.slice(0, 10);
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
    return `${prefix}${stem} (${itemId.slice(0, 6)})${ext}`;
  }
  return candidate;
}
