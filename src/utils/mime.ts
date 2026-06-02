// Map a filename's extension to its MIME type for the attachment kinds
// the app deals with (images + PDF). Used when a storage backend hands
// back a blob with a missing or generic ("application/octet-stream")
// type — Dropbox's content-download endpoint does exactly that — so the
// in-app viewer can still tell an image from a PDF and pick the right
// inline renderer instead of falling through to "can't preview".
const EXTENSION_MIME: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
  avif: "image/avif",
  bmp: "image/bmp",
  svg: "image/svg+xml",
  tif: "image/tiff",
  tiff: "image/tiff",
};

// Resolve a filename's extension to a MIME type, or "" when the
// extension is missing or unrecognised.
export function mimeTypeFromFilename(filename: string): string {
  const dot = filename.lastIndexOf(".");
  if (dot < 0) return "";
  const ext = filename.slice(dot + 1).toLowerCase();
  return EXTENSION_MIME[ext] ?? "";
}

// The most reliable MIME type for a downloaded blob: trust the blob's
// own type unless it's empty or the generic octet-stream placeholder
// some backends return, in which case fall back to the extension.
export function effectiveMimeType(blob: Blob, filename: string): string {
  if (blob.type && blob.type !== "application/octet-stream") return blob.type;
  return mimeTypeFromFilename(filename);
}
