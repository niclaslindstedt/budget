// In-flight cloud / folder link awaiting the user's confirmation. The
// types live here (in `storage/`) rather than alongside the
// `CloudLinkDialog` that renders them because they represent
// post-OAuth / post-gesture state owned by the storage layer — the
// `storage` → `components` boundary forbids reaching the other way
// (see AGENTS.md "Dependency direction"). The dialog re-imports from
// here. Mirrors the `data/action-payloads.ts` pattern for the inverse
// case.

import type { Snapshot } from "./adapter";
import type { BackendId } from "./backend-preference";
import type { DropboxAuthResult } from "./dropbox-adapter";

// In-flight cloud-link awaiting the user's confirmation. OAuth has
// completed (so we hold valid tokens) and the target cloud and the
// active source backend have both been probed — `remoteSnapshot` is
// the cloud's existing file (or `null` when the cloud is empty), and
// `sourceText` is the bytes currently on the source side (or `null`
// when the source has nothing yet). The dialog uses the
// presence / absence of each side to decide what to ask; resolving
// uploads `sourceText` to the cloud (threading
// `remoteSnapshot.revision` so the write lands as an update rather
// than a colliding `add`) when the user picks "use this device's
// budget", and otherwise just flips the backend.
export type PendingCloudLink =
  | {
      provider: "dropbox";
      auth: DropboxAuthResult;
      // The backend the user is linking *from*, used to phrase the
      // dialog ("this device" vs. "your current Dropbox" etc.).
      fromBackend: BackendId;
      remoteSnapshot: Snapshot | null;
      sourceText: string | null;
    }
  | {
      provider: "gdrive";
      accessToken: string;
      fromBackend: BackendId;
      remoteSnapshot: Snapshot | null;
      sourceText: string | null;
    };

// In-flight folder-link awaiting the user's confirmation. Same shape
// as `PendingCloudLink` but gesture-driven rather than OAuth-driven —
// the handle is already granted by the time we get here. Kept
// separate from `PendingCloudLink` so the dialog wording and the
// commit path stay specific to each flow (OAuth tokens vs. a directory
// handle, "your Dropbox" vs. "the folder you picked").
export type PendingFolderLink = {
  handle: FileSystemDirectoryHandle;
  fromBackend: BackendId;
  remoteSnapshot: Snapshot | null;
  sourceText: string | null;
};
