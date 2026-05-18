// Storage backend interface. The app talks to a `StorageAdapter`
// instead of `localStorage` directly so cloud-drive backends (Dropbox,
// Google Drive, …) can slot in without touching the reducer or the UI.
//
// Adapters speak bytes, not `UserData` values: migration, validation,
// and pretty-printing all live in `./file.ts` and run on every load
// and save regardless of which backend is active. That keeps each
// adapter small and prevents a backend from accidentally bypassing
// the parse / migrate / validate pipeline.

export type Snapshot = {
  // The serialized UserData JSON, exactly as produced by
  // `serializeUserData` in `./file.ts`. Includes the trailing newline.
  text: string;

  // Opaque, adapter-defined token used for optimistic concurrency.
  // Dropbox returns a `rev`, Drive returns an ETag, a mtime works
  // too. The hook hands it back unchanged on the next save so the
  // adapter can refuse to overwrite a newer remote revision.
  revision?: string;
};

export type StorageAdapter = {
  // Stable identifier so device-local settings (auth tokens,
  // last-used adapter) can be keyed per backend.
  readonly id: "browser" | "folder" | "dropbox" | "gdrive";

  // Human-readable label for the future settings UI.
  readonly label: string;

  // Optional synchronous fast path. localStorage can return data
  // before the first paint; cloud adapters cannot. Implementing this
  // avoids a one-frame empty-budget flash on mount.
  loadSync?(): Snapshot | null;

  // Load the current snapshot. Returns null when nothing has been
  // stored yet (first run, or an empty cloud app folder).
  load(): Promise<Snapshot | null>;

  // Save the snapshot. If `baseRevision` is provided and the remote
  // has moved beyond it, the adapter must throw `ConflictError`
  // carrying the newer snapshot. Local adapters can ignore the
  // argument because nothing else writes to the same key.
  save(text: string, baseRevision?: string): Promise<Snapshot>;

  // Optional subscription to out-of-band remote changes. Cloud
  // adapters that support long-poll or push notifications wake the
  // app when another device pushes. Returns an unsubscribe function.
  // Local can omit this — nothing else writes the same key from
  // outside the tab.
  watch?(onRemoteChange: (snapshot: Snapshot) => void): () => void;

  // Milliseconds to wait after the last edit before pushing a save.
  // Defaults to 0 (save immediately) — appropriate for localStorage.
  // Cloud adapters should set this around one second to coalesce
  // keystrokes inside a single edit gesture into one network request
  // while still feeling like "save on every change".
  readonly saveDebounceMs?: number;
};

export class ConflictError extends Error {
  constructor(readonly remote: Snapshot) {
    super("Remote revision moved");
    this.name = "ConflictError";
  }
}
