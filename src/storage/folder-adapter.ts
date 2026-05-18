import { ConflictError, type Snapshot, type StorageAdapter } from "./adapter";

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
      if (isNotFoundError(err)) return null;
      if (isPermissionError(err)) onPermissionLost?.();
      throw err;
    }
  }

  return {
    id: "folder",
    label: "Local folder",
    saveDebounceMs: 500,

    async load(): Promise<Snapshot | null> {
      const file = await readFile();
      if (!file) return null;
      const text = await file.text();
      return { text, revision: String(file.lastModified) };
    },

    async save(text: string, baseRevision?: string): Promise<Snapshot> {
      if (baseRevision !== undefined) {
        const current = await readFile();
        // If the file was deleted out from under us but the caller
        // believes a revision should exist, treat the missing-file
        // state as a conflict carrying a null snapshot — synthesize
        // it as an empty text so the storage hook can surface the
        // collision rather than silently overwriting.
        if (!current) {
          throw new ConflictError({ text: "", revision: undefined });
        }
        const currentRevision = String(current.lastModified);
        if (currentRevision !== baseRevision) {
          const currentText = await current.text();
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
        if (isPermissionError(err)) onPermissionLost?.();
        throw err;
      }

      try {
        const writable = await handle.createWritable({
          keepExistingData: false,
        });
        await writable.write(text);
        await writable.close();
      } catch (err) {
        if (isPermissionError(err)) onPermissionLost?.();
        throw err;
      }

      // Re-stat after close to get the post-write `lastModified`. The
      // pre-write mtime + a guess wouldn't be safe — some filesystems
      // quantize to whole seconds, others to the writable's open
      // time, and we need the value subsequent saves will compare
      // against.
      const written = await handle.getFile();
      return { text, revision: String(written.lastModified) };
    },
  };
}
