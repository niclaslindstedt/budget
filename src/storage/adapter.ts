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

  // Set by adapters that can serve cached bytes when the live
  // backend is unreachable (see `withCloudMirror`). The hook turns
  // a truthy value into an `offline` status so the UI can tell the
  // user they're editing a local copy, and keeps trying to push on
  // the next save instead of latching into a hard error.
  offline?: boolean;
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

  // Adopt an externally-supplied snapshot as the new in-sync state
  // without round-tripping through the network. Implemented by the
  // `withCloudMirror` wrapper so the hook can resolve a "keep
  // remote" conflict by stamping the local mirror with the remote
  // bytes — without it a reload would see the unsynced local edits
  // still in the mirror and re-surface the conflict. Adapters with
  // no internal cache can omit it; the hook treats absence as a
  // no-op.
  markSynced?(snapshot: Snapshot): void;

  // Optional support for explicit timestamped backups, stored in a
  // sibling `backups/` folder next to the live budget file. Cloud
  // backends and the local-folder backend implement this; the
  // browser-localStorage adapter doesn't (there's no notion of a
  // sibling folder there). Always present when the user can see a
  // "Backup" button in Settings.
  readonly backups?: BackupOps;
};

// One backup file's metadata, mirrored in the on-disk index so the
// restore list can be rendered without decrypting (or even
// downloading) the backup body. `accountCount` and `entryCount` are
// extracted from the budget at backup time so the user can pick the
// right snapshot at a glance.
export type BackupMetadata = {
  // Filename within the `backups/` folder. Stable identifier the
  // adapter uses to fetch this specific backup. Includes the
  // encryption suffix (e.g. `.enc.json`) when the bytes are wrapped.
  filename: string;
  // Unix ms timestamp when the backup was created.
  createdAt: number;
  // Number of accounts in the backup.
  accountCount: number;
  // Number of budget rows in the backup (sum of `rows.length` across
  // every `AccountBudget` item on every sheet). Doesn't count
  // imported bank-history entries — those are auxiliary and would
  // dominate the figure on accounts with long statements.
  entryCount: number;
  // True when the bytes on disk are wrapped in the AES-GCM envelope.
  // Set by the encrypting wrapper; raw adapters always emit false.
  encrypted?: boolean;
  // Marker for the auto-backup that the restore flow takes of the
  // current file before replacing it. Surfaced in the restore list
  // so the user can tell at a glance which entries are theirs vs.
  // safety nets the app dropped on their behalf.
  autoCreated?: boolean;
};

export type BackupOps = {
  // Read the manifest of all backups, in descending creation order.
  // Returns an empty array when no backups have been created yet.
  list(): Promise<BackupMetadata[]>;
  // Persist `text` as a new backup file at the path implied by
  // `metadata.filename` and append the entry to the manifest.
  create(text: string, metadata: BackupMetadata): Promise<void>;
  // Fetch the raw bytes of a previously-created backup. The text is
  // whatever the create call passed in — encrypted or plain. The
  // encrypting wrapper decrypts on the way back out so callers see
  // serialized `UserData` JSON regardless.
  read(filename: string): Promise<string>;
  // Remove a previously-created backup and drop its entry from the
  // manifest. The user-facing modal exposes this as a trash button on
  // each row — older snapshots go stale quickly and the user wants to
  // prune them as they go. Missing files are treated as already gone;
  // the implementation must still update the manifest.
  remove(filename: string): Promise<void>;
};

export class ConflictError extends Error {
  // `local` is set by the `withCloudMirror` wrapper when an offline
  // edit collides with another device's edit — the wrapper has the
  // unsynced local bytes in its mirror and surfaces them alongside
  // the remote so the resolution modal can offer "keep mine" /
  // "keep the other" without having to dig the bytes out again. The
  // bare cloud adapters don't set it because they only know about
  // the remote side.
  constructor(
    readonly remote: Snapshot,
    readonly local?: Snapshot,
  ) {
    super("Remote revision moved");
    this.name = "ConflictError";
  }
}

// Thrown by cloud adapters when an HTTP 401 surfaces after any silent
// refresh has already been attempted (Dropbox) or when the access token
// has expired with no refresh path (Google Drive — GIS popup tokens are
// short-lived and don't ship a refresh token). The storage hook turns
// this into an `auth-error` status so the UI can show a Reconnect
// affordance instead of a generic "Try again" that would fail the same
// way.
export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

// Thrown by cloud adapters when the backend rate-limits a write (HTTP
// 429). The storage hook treats this as a soft, transient signal:
// instead of surfacing a red sync error and stopping autosave, it flips
// status to `throttled`, paints the cloud icon orange, and schedules a
// resume once the carried cooldown has elapsed. Saves coalesce for
// free during the cooldown because every save serialises the full
// `UserData` blob.
export class RateLimitError extends Error {
  constructor(readonly retryAfterMs: number) {
    super(`Rate limited; retry after ${retryAfterMs}ms`);
    this.name = "RateLimitError";
  }
}
