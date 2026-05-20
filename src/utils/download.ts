// Trigger a browser file download from in-memory bytes. Wraps the
// usual hidden-anchor dance so call sites don't repeat it. Accepts
// either a string (CSV / JSON text) or a `Uint8Array` (XLSX binary).
export function triggerDownload(
  body: string | Uint8Array,
  filename: string,
  mimeType: string,
): void {
  const blob =
    typeof body === "string"
      ? new Blob([body], { type: mimeType })
      : new Blob([body as BlobPart], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Stamp a filename slug derived from the sheet name so a user with
// several budgets gets distinct files instead of `budget-2026-05-20.csv`
// for every one.
export function slugifyFilename(input: string): string {
  const cleaned = input
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return cleaned.length === 0 ? "sheet" : cleaned;
}

export function todayStamp(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
