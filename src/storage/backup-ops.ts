import type { Logger } from "../utils/logger";
import type { BackupMetadata, BackupOps } from "./adapter";
import { parseBackupIndex, serializeBackupIndex } from "./backup-index";

// The per-backend file primitives the backup lifecycle drives. Every
// adapter that advertises the `backups` capability (Dropbox, Google
// Drive, the local-folder backend) already has these three operations
// — they just wrap a different transport (an HTTP upload, a multipart
// Drive request, a File System Access write). The lifecycle around them
// (read the manifest, prepend / filter an entry, re-serialize) is
// identical, so it lives here once instead of being hand-rolled in each
// adapter.
export type BackupStore = {
  // Read the bytes stored at `key`. Returns null when nothing is there
  // (an empty backups folder, a manifest that hasn't been written yet),
  // which the lifecycle treats as an empty index rather than an error.
  readFile(key: string): Promise<string | null>;
  // Write `text` at `key`, overwriting any existing file.
  writeFile(key: string, text: string): Promise<void>;
  // Delete the file at `key`. A missing file is a no-op — the manifest
  // update still runs so a half-deleted backup can't strand its entry.
  deleteFile(key: string): Promise<void>;
  // Map a backup filename to the storage key its body lives at. Cloud
  // adapters that address files by full path prepend their backups
  // folder; adapters that address files by bare name return it as-is.
  backupKey(filename: string): string;
  // Storage key the manifest (`index.json`) lives at.
  indexKey: string;
  // Adapter logger so the `backups: …` breadcrumbs stay scoped to the
  // backend they ran on.
  log: Logger;
};

// Builds the `BackupOps` surface from a backend's file primitives. The
// list / create / read / remove flow is shared verbatim; the only
// per-adapter knowledge is the `BackupStore` it's handed.
export function createBackupOps(store: BackupStore): BackupOps {
  async function readIndex(): Promise<BackupMetadata[]> {
    return parseBackupIndex(await store.readFile(store.indexKey));
  }

  async function writeIndex(entries: BackupMetadata[]): Promise<void> {
    await store.writeFile(store.indexKey, serializeBackupIndex(entries));
  }

  return {
    async list() {
      store.log.info("backups: list");
      return readIndex();
    },
    async create(text, metadata) {
      store.log.info(
        `backups: create ${metadata.filename} bytes=${text.length}`,
      );
      await store.writeFile(store.backupKey(metadata.filename), text);
      const existing = await readIndex();
      await writeIndex([
        metadata,
        ...existing.filter((m) => m.filename !== metadata.filename),
      ]);
    },
    async read(filename) {
      store.log.info(`backups: read ${filename}`);
      const text = await store.readFile(store.backupKey(filename));
      if (text === null) {
        throw new Error(`Backup not found: ${filename}`);
      }
      return text;
    },
    async remove(filename) {
      store.log.info(`backups: remove ${filename}`);
      await store.deleteFile(store.backupKey(filename));
      const existing = await readIndex();
      await writeIndex(existing.filter((m) => m.filename !== filename));
    },
  };
}
