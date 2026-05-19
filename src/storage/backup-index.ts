import type { BackupMetadata } from "./adapter";

// Pretty-printed JSON manifest of every backup the user has taken,
// stored alongside the backup files in the same `backups/` folder.
// Kept in plain JSON regardless of the active encryption mode — the
// adapter needs to render the restore list without a password held
// in memory (think: page reload before sign-in), and the metadata
// here (timestamps + counts + filenames) is far less sensitive than
// the budget body itself.

// Filename of the manifest, relative to the backups folder. Each
// adapter prepends its own folder prefix.
export const BACKUP_INDEX_FILENAME = "index.json";

type IndexEnvelope = {
  version: 1;
  entries: BackupMetadata[];
};

// Tolerant parser: a missing / unparsable / partial index is treated
// as an empty list rather than an error. The worst case is that a
// previously-recorded entry stops showing up in the restore picker —
// the backup file itself is still on disk and a fresh `create` call
// rebuilds the index around it.
export function parseBackupIndex(raw: string | null): BackupMetadata[] {
  if (raw === null || raw.trim() === "") return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (typeof parsed !== "object" || parsed === null) return [];
  const envelope = parsed as Partial<IndexEnvelope>;
  if (!Array.isArray(envelope.entries)) return [];
  const out: BackupMetadata[] = [];
  for (const item of envelope.entries) {
    if (!isBackupMetadata(item)) continue;
    out.push(item);
  }
  // Newest first regardless of how the manifest was ordered on disk.
  out.sort((a, b) => b.createdAt - a.createdAt);
  return out;
}

export function serializeBackupIndex(entries: BackupMetadata[]): string {
  const sorted = [...entries].sort((a, b) => b.createdAt - a.createdAt);
  const envelope: IndexEnvelope = { version: 1, entries: sorted };
  return JSON.stringify(envelope, null, 2) + "\n";
}

function isBackupMetadata(v: unknown): v is BackupMetadata {
  if (typeof v !== "object" || v === null) return false;
  const m = v as Record<string, unknown>;
  return (
    typeof m.filename === "string" &&
    typeof m.createdAt === "number" &&
    typeof m.accountCount === "number" &&
    typeof m.entryCount === "number"
  );
}
