import { createLogger } from "../utils/logger";
import { ConflictError, type Snapshot, type StorageAdapter } from "./adapter";
import { BACKUP_INDEX_FILENAME } from "./backup-index";
import { createBackupOps } from "./backup-ops";

const log = createLogger("folder");

// `StorageAdapter` over a user-picked directory, via the File System
// Access API. The adapter reads and writes a single file
// (`fileName`, defaults to `budget.json`) inside the handle's
// directory. The handle itself is acquired by the App layer through
// `showDirectoryPicker` and persisted in IndexedDB via
// `folder-handle-store.ts`; this module only sees a live handle.
//
// Concurrency uses the file's `lastModified` ms timestamp as the
// opaque revision. There is no atomic check-then-write across the
// FSA bridge, but the window between stat and write is small enough
// that two same-device tabs editing the same folder will catch each
// other in practice.

const DEFAULT_FILE_NAME = "budget.json";
export const FOLDER_BACKUPS_DIR_NAME = "backups";
export const FOLDER_RECEIPTS_DIR_NAME = "receipts";

// Chrome reports filesystem errors as `DOMException` with these
// names. We treat `NotAllowedError` (revoked by browser policy) and
// `SecurityError` (user revoked via site-settings) as permission
// signals so the App can flip to the "Reconnect folder" banner;
// `NotFoundError` is just an empty-state.
function isPermissionError(err: unknown): boolean {
  if (!(err instanceof DOMException)) return false;
  return err.name === "NotAllowedError" || err.name === "SecurityError";
}

function isNotFoundError(err: unknown): boolean {
  return err instanceof DOMException && err.name === "NotFoundError";
}

export type CreateFolderAdapterOptions = {
  directoryHandle: FileSystemDirectoryHandle;
  fileName?: string;
  // Fires once when a load / save fails because the OS-level
  // permission was revoked between sessions. The App uses this to
  // clear the in-state handle and surface a reconnect banner without
  // having to await the next operation.
  onPermissionLost?: () => void;
};

export function createFolderAdapter(
  options: CreateFolderAdapterOptions,
): StorageAdapter {
  const { directoryHandle, onPermissionLost } = options;
  const fileName = options.fileName ?? DEFAULT_FILE_NAME;

  async function readFile(): Promise<File | null> {
    try {
      const handle = await directoryHandle.getFileHandle(fileName, {
        create: false,
      });
      return await handle.getFile();
    } catch (err) {
      if (isNotFoundError(err)) {
        log.info(`readFile: NotFoundError (${fileName} absent)`);
        return null;
      }
      if (isPermissionError(err)) {
        log.error("readFile: permission lost", err);
        onPermissionLost?.();
      } else {
        log.error("readFile: error", err);
      }
      throw err;
    }
  }

  log.info(`adapter created file=${fileName}`);

  async function getBackupsDir(
    create: boolean,
  ): Promise<FileSystemDirectoryHandle | null> {
    try {
      return await directoryHandle.getDirectoryHandle(FOLDER_BACKUPS_DIR_NAME, {
        create,
      });
    } catch (err) {
      if (isNotFoundError(err)) return null;
      if (isPermissionError(err)) {
        onPermissionLost?.();
      }
      throw err;
    }
  }

  async function readBackupFile(name: string): Promise<string | null> {
    const dir = await getBackupsDir(false);
    if (!dir) return null;
    try {
      const handle = await dir.getFileHandle(name, { create: false });
      const file = await handle.getFile();
      return file.text();
    } catch (err) {
      if (isNotFoundError(err)) return null;
      if (isPermissionError(err)) onPermissionLost?.();
      throw err;
    }
  }

  async function removeBackupFile(name: string): Promise<void> {
    const dir = await getBackupsDir(false);
    if (!dir) return;
    try {
      await dir.removeEntry(name);
    } catch (err) {
      if (isNotFoundError(err)) return;
      if (isPermissionError(err)) onPermissionLost?.();
      throw err;
    }
  }

  async function writeBackupFile(name: string, text: string): Promise<void> {
    const dir = await getBackupsDir(true);
    if (!dir) throw new Error("backups folder unavailable");
    try {
      const handle = await dir.getFileHandle(name, { create: true });
      const writable = await handle.createWritable({ keepExistingData: false });
      await writable.write(text);
      await writable.close();
    } catch (err) {
      if (isPermissionError(err)) onPermissionLost?.();
      throw err;
    }
  }

  const backups = createBackupOps({
    readFile: readBackupFile,
    writeFile: writeBackupFile,
    deleteFile: removeBackupFile,
    backupKey: (filename) => filename,
    indexKey: BACKUP_INDEX_FILENAME,
    log,
  });

  // Walk a `/`-separated receipt path to its parent directory handle,
  // creating each segment when `create` is set, and return the parent
  // handle plus the leaf filename. The receipts root is the first
  // segment, then at most one type-subdirectory, then the file.
  async function resolveReceiptParent(
    path: string,
    create: boolean,
  ): Promise<{ dir: FileSystemDirectoryHandle; name: string } | null> {
    const segments = path.split("/").filter((s) => s.length > 0);
    if (segments.length === 0) return null;
    const name = segments.pop() as string;
    let dir: FileSystemDirectoryHandle;
    try {
      dir = await directoryHandle.getDirectoryHandle(FOLDER_RECEIPTS_DIR_NAME, {
        create,
      });
      for (const segment of segments) {
        dir = await dir.getDirectoryHandle(segment, { create });
      }
    } catch (err) {
      if (isNotFoundError(err)) return null;
      if (isPermissionError(err)) onPermissionLost?.();
      throw err;
    }
    return { dir, name };
  }

  const receipts = {
    async upload(path: string, blob: Blob): Promise<void> {
      const parent = await resolveReceiptParent(path, true);
      if (!parent) throw new Error("receipts folder unavailable");
      try {
        const handle = await parent.dir.getFileHandle(parent.name, {
          create: true,
        });
        const writable = await handle.createWritable({
          keepExistingData: false,
        });
        await writable.write(blob);
        await writable.close();
      } catch (err) {
        if (isPermissionError(err)) onPermissionLost?.();
        throw err;
      }
    },

    async download(path: string): Promise<Blob | null> {
      const parent = await resolveReceiptParent(path, false);
      if (!parent) return null;
      try {
        const handle = await parent.dir.getFileHandle(parent.name, {
          create: false,
        });
        return await handle.getFile();
      } catch (err) {
        if (isNotFoundError(err)) return null;
        if (isPermissionError(err)) onPermissionLost?.();
        throw err;
      }
    },

    async remove(path: string): Promise<void> {
      const parent = await resolveReceiptParent(path, false);
      if (!parent) return;
      try {
        await parent.dir.removeEntry(parent.name);
      } catch (err) {
        if (isNotFoundError(err)) return;
        if (isPermissionError(err)) onPermissionLost?.();
        throw err;
      }
    },
  };

  return {
    id: "folder",
    label: "Local folder",
    saveDebounceMs: 500,
    capabilities: new Set(["backups", "receipts"]),
    backups,
    receipts,

    async load(): Promise<Snapshot | null> {
      log.info("load: start");
      const file = await readFile();
      if (!file) {
        log.info("load: no file");
        return null;
      }
      const text = await file.text();
      log.info(`load: bytes=${text.length} mtime=${file.lastModified}`);
      return { text, revision: String(file.lastModified) };
    },

    async save(text: string, baseRevision?: string): Promise<Snapshot> {
      log.info(
        `save: bytes=${text.length} baseRev=${baseRevision ?? "<none>"}`,
      );
      if (baseRevision !== undefined) {
        const current = await readFile();
        // If the file was deleted out from under us but the caller
        // believes a revision should exist, treat the missing-file
        // state as a conflict carrying a null snapshot — synthesize
        // it as an empty text so the storage hook can surface the
        // collision rather than silently overwriting.
        if (!current) {
          log.warn("save: baseRev set but file gone — conflict (empty)");
          throw new ConflictError({ text: "", revision: undefined });
        }
        const currentRevision = String(current.lastModified);
        if (currentRevision !== baseRevision) {
          const currentText = await current.text();
          log.warn(
            `save: mtime drift (have ${currentRevision}, expected ${baseRevision}) — conflict`,
          );
          throw new ConflictError({
            text: currentText,
            revision: currentRevision,
          });
        }
      }

      let handle: FileSystemFileHandle;
      try {
        handle = await directoryHandle.getFileHandle(fileName, {
          create: true,
        });
      } catch (err) {
        if (isPermissionError(err)) {
          log.error("save: permission lost during getFileHandle", err);
          onPermissionLost?.();
        } else {
          log.error("save: getFileHandle failed", err);
        }
        throw err;
      }

      try {
        const writable = await handle.createWritable({
          keepExistingData: false,
        });
        await writable.write(text);
        await writable.close();
      } catch (err) {
        if (isPermissionError(err)) {
          log.error("save: permission lost during write", err);
          onPermissionLost?.();
        } else {
          log.error("save: write failed", err);
        }
        throw err;
      }

      // Re-stat after close to get the post-write `lastModified`. The
      // pre-write mtime + a guess wouldn't be safe — some filesystems
      // quantize to whole seconds, others to the writable's open
      // time, and we need the value subsequent saves will compare
      // against.
      const written = await handle.getFile();
      log.info(`save: ok mtime=${written.lastModified}`);
      return { text, revision: String(written.lastModified) };
    },
  };
}
