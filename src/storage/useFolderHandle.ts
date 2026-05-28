import { useCallback, useEffect, useState } from "react";

import { unlock } from "../data/achievements";
import type { PendingFolderLink } from "./cloud-link-types";
import type { StorageAdapter } from "./adapter";
import {
  type BackendId,
  type EncryptionMode,
  getBackend,
  setBackend,
} from "./backend-preference";
import { createFolderAdapter } from "./folder-adapter";
import {
  clearDirectoryHandle,
  ensurePermission,
  loadDirectoryHandle,
  saveDirectoryHandle,
} from "./folder-handle-store";
import { createIdbAdapter } from "./idb-adapter";
import type { AuthState } from "./useStorageBackend";
import { wrapForActive } from "./wrap-for-active";
import { createLogger } from "../utils/logger";

const log = createLogger("storage-folder");

// Inputs the folder-handle hook shares with the outer storage hook.
// Folder linking has the same "probe both sides, ask if both have
// data" shape as the cloud OAuth flows — but the data lives in a
// `FileSystemDirectoryHandle` parked in IndexedDB rather than behind
// an OAuth token, so the lifecycle (boot-time permission probe,
// reconnect-on-revoke, mirror-to-browser-on-disconnect) is the
// folder-specific machinery this hook isolates.
//
// `loadSourceText` and `wrapWithActiveEncryption` are passed in
// rather than owned here because they're shared with the cloud
// connect flows in the outer hook — the folder hook calls them but
// doesn't get to define them.
type Params = {
  auth: AuthState;
  encryption: EncryptionMode;
  passwordRef: React.MutableRefObject<string | null>;
  // Wrap a raw adapter with the active encryption envelope. Used to
  // probe the picked folder during link confirmation so the probe
  // reads/writes through the same envelope the steady-state app
  // does.
  wrapWithActiveEncryption: (raw: StorageAdapter) => StorageAdapter;
  // Read the source backend's current bytes (plaintext UserData
  // JSON) so the link flow can decide whether to push them into the
  // freshly-picked folder. Owned by the outer hook because both the
  // folder and cloud connect paths consume it.
  loadSourceText: (
    userId: string,
    fromBackend: BackendId,
  ) => Promise<string | null>;
  // Flip the per-user-persisted backend choice. Folder connect /
  // disconnect both need to update this, and the outer hook also
  // mirrors the choice into its own `backend` state so the
  // adapter useMemo rebuilds. Passed in as a single setter; the
  // hook calls it from both the commit and the disconnect paths.
  setBackendState: (next: BackendId) => void;
  // Mirror ref the hook keeps in sync with its `folderHandle` state.
  // Owned by the outer hook so `buildSourceRawAdapter` (which has to
  // be defined before this hook runs because `loadSourceText` depends
  // on it) can read the current handle without forming a circular
  // hook-order dependency.
  folderHandleRef: React.MutableRefObject<FileSystemDirectoryHandle | null>;
};

export type FolderHandleState = {
  folderHandle: FileSystemDirectoryHandle | null;
  // Distinguishes "still probing IDB" from "no handle exists". The
  // outer hook's adapter useMemo holds off on building the folder
  // adapter while this is false so the boot-time async probe can
  // resolve before the storage layer commits to a backend.
  folderHandleLoaded: boolean;
  // Set when a boot-time `queryPermission` returns anything other
  // than "granted" — the IDB record stays so the Settings hint can
  // offer one-click reconnect, but the active adapter falls back to
  // the browser backend so editing keeps working.
  folderReconnectNeeded: boolean;
  pendingFolderLink: PendingFolderLink | null;
  connectFolder: () => Promise<void>;
  reconnectFolder: () => Promise<void>;
  disconnectFolder: () => Promise<void>;
  resolveFolderLink: (action: "use-cloud" | "use-source") => Promise<void>;
  cancelFolderLink: () => void;
  // Drop the live handle and surface the reconnect cue. Called by the
  // live adapter's permission-lost callback when an in-flight save /
  // load hits a revoked grant — the IDB record stays so the Settings
  // hint can offer one-click reconnect against it.
  markPermissionLost: () => void;
};

// Owns the folder-backend lifecycle: the FileSystemDirectoryHandle
// stored in IndexedDB, the boot-time permission probe, the
// pick-and-link flow, the post-revoke reconnect path, and the
// disconnect mirror back to the browser backend.
export function useFolderHandle(params: Params): FolderHandleState {
  const {
    auth,
    encryption,
    passwordRef,
    wrapWithActiveEncryption,
    loadSourceText,
    setBackendState,
    folderHandleRef,
  } = params;

  const [folderHandle, setFolderHandle] =
    useState<FileSystemDirectoryHandle | null>(null);
  // Keep the caller-provided `folderHandleRef` in sync with our state
  // so closures defined before this hook runs (the outer storage
  // hook's `buildSourceRawAdapter`) see the current handle.
  useEffect(() => {
    folderHandleRef.current = folderHandle;
  }, [folderHandle, folderHandleRef]);
  // Seeded `true` for non-folder users so the adapter useMemo isn't
  // gated on a probe that has nothing to find — without this gate,
  // every cloud-backed refresh would flicker through
  // `folderHandleLoaded=false → true` and rebuild the adapter for no
  // reason.
  const [folderHandleLoaded, setFolderHandleLoaded] = useState<boolean>(() => {
    if (auth.kind !== "signed-in") return true;
    return getBackend(auth.user.id) !== "folder";
  });
  const [folderReconnectNeeded, setFolderReconnectNeeded] = useState(false);
  const [pendingFolderLink, setPendingFolderLink] =
    useState<PendingFolderLink | null>(null);

  // Boot-time async probe: load the stored handle from IDB, ask the
  // OS whether permission is still granted, and either rehydrate
  // (handle in state, ready to mount) or fall back to the browser
  // backend with a reconnect cue. The IDB record stays so the
  // Reconnect button in Settings can re-grant in one click against
  // the stored handle.
  useEffect(() => {
    if (auth.kind !== "signed-in") {
      setFolderHandle(null);
      setFolderHandleLoaded(true);
      setFolderReconnectNeeded(false);
      return;
    }
    const userId = auth.user.id;
    // Skip the probe when the user isn't on folder backend — the
    // adapter useMemo only consults `folderHandle` /
    // `folderHandleLoaded` when `backend === "folder"`, so probing
    // IDB on every refresh for every cloud / browser user just churns
    // state and rebuilds the adapter for nothing.
    if (getBackend(userId) !== "folder") {
      setFolderHandle(null);
      setFolderHandleLoaded(true);
      setFolderReconnectNeeded(false);
      return;
    }
    let cancelled = false;
    setFolderHandleLoaded(false);
    setFolderReconnectNeeded(false);
    void (async () => {
      const stored = await loadDirectoryHandle(userId);
      if (cancelled) return;
      if (!stored) {
        setFolderHandle(null);
        setFolderHandleLoaded(true);
        return;
      }
      const status = await ensurePermission(stored, "readwrite", false);
      if (cancelled) return;
      if (status === "granted") {
        setFolderHandle(stored);
        setFolderReconnectNeeded(false);
      } else {
        setFolderHandle(null);
        setFolderReconnectNeeded(true);
      }
      setFolderHandleLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [auth]);

  // Commit a freshly-picked folder as the active backend. Persists
  // the handle to IDB, then flips state.
  const commitFolderLink = useCallback(
    async (userId: string, handle: FileSystemDirectoryHandle) => {
      await saveDirectoryHandle(userId, handle);
      setBackend(userId, "folder");
      setFolderHandle(handle);
      setFolderHandleLoaded(true);
      setFolderReconnectNeeded(false);
      setBackendState("folder");
      unlock("cloudWalker");
    },
    [setBackendState],
  );

  // Pick a folder and probe both sides for an existing budget. Same
  // probe-and-confirm pattern as the cloud OAuth flow: if both the
  // folder and the current source already hold data, the dialog asks
  // the user which one to keep. Otherwise commits straight away.
  const connectFolder = useCallback(async () => {
    if (auth.kind !== "signed-in") return;
    if (typeof window === "undefined" || !window.showDirectoryPicker) return;
    let handle: FileSystemDirectoryHandle;
    try {
      handle = await window.showDirectoryPicker({ mode: "readwrite" });
    } catch (err) {
      // AbortError = user cancelled the picker; nothing to do.
      if (err instanceof DOMException && err.name === "AbortError") return;
      log.error("folder picker failed", err);
      return;
    }
    const userId = auth.user.id;
    const fromBackend = getBackend(userId);
    const probeInner = createFolderAdapter({ directoryHandle: handle });
    const probe = wrapWithActiveEncryption(probeInner);
    const [remote, sourceText] = await Promise.all([
      probe.load().catch((err: unknown) => {
        log.error("folder probe failed during link", err);
        return null;
      }),
      loadSourceText(userId, fromBackend),
    ]);
    if (auth.kind !== "signed-in") return;
    if (remote === null && sourceText === null) {
      // Nothing on either side — just commit, no dialog needed.
      await commitFolderLink(userId, handle);
      return;
    }
    if (remote !== null && sourceText === null) {
      // Folder already has bytes, source is empty — adopt them silently
      // (matches the cloud-link "use cloud" branch with nothing to lose).
      await commitFolderLink(userId, handle);
      return;
    }
    if (remote === null && sourceText !== null) {
      // Folder is empty, source has bytes — push the source into the
      // folder before flipping so the folder's first read returns the
      // user's actual budget rather than nothing.
      try {
        await probe.save(sourceText);
      } catch (err) {
        log.error("folder seed failed during link", err);
      }
      await commitFolderLink(userId, handle);
      return;
    }
    // Both sides have data — ask the user which one wins.
    setPendingFolderLink({
      handle,
      fromBackend,
      remoteSnapshot: remote,
      sourceText,
    });
  }, [auth, commitFolderLink, loadSourceText, wrapWithActiveEncryption]);

  // Resolve the folder-link confirmation. Mirrors `resolveCloudLink`:
  // "use-source" pushes the parked source bytes into the folder
  // (threading the remote revision so the write lands as an update),
  // then commits; "use-cloud" — the folder's existing budget wins —
  // just commits.
  const resolveFolderLink = useCallback(
    async (action: "use-cloud" | "use-source"): Promise<void> => {
      const pending = pendingFolderLink;
      if (!pending || auth.kind !== "signed-in") return;
      setPendingFolderLink(null);
      const userId = auth.user.id;
      try {
        if (action === "use-source" && pending.sourceText !== null) {
          const probeInner = createFolderAdapter({
            directoryHandle: pending.handle,
          });
          const probe = wrapWithActiveEncryption(probeInner);
          await probe.save(
            pending.sourceText,
            pending.remoteSnapshot?.revision,
          );
        }
        await commitFolderLink(userId, pending.handle);
      } catch (err) {
        log.error("folder link failed", err);
      }
    },
    [auth, pendingFolderLink, commitFolderLink, wrapWithActiveEncryption],
  );

  const cancelFolderLink = useCallback(() => {
    setPendingFolderLink(null);
  }, []);

  const markPermissionLost = useCallback(() => {
    log.warn("folder: permission lost during operation");
    setFolderHandle(null);
    setFolderReconnectNeeded(true);
  }, []);

  // Re-grant permission against the already-stored handle. The
  // `requestPermission` call requires a user gesture, which is why
  // this lives in a click handler rather than the boot effect.
  const reconnectFolder = useCallback(async () => {
    if (auth.kind !== "signed-in") return;
    const userId = auth.user.id;
    const stored = await loadDirectoryHandle(userId);
    if (!stored) {
      // No stored handle to re-grant against — escalate to the full
      // picker flow instead.
      void connectFolder();
      return;
    }
    const status = await ensurePermission(stored, "readwrite", true);
    if (status === "granted") {
      setFolderHandle(stored);
      setFolderReconnectNeeded(false);
    }
  }, [auth, connectFolder]);

  // Mirror the folder's current bytes back into the browser backend
  // (same pattern as the Dropbox / GDrive disconnect), then clear the
  // handle from IDB and flip state. Best-effort: a stale browser copy
  // is a few-edit regression at worst, since `useUserDataStorage`
  // saves on debounce.
  const disconnectFolder = useCallback(async () => {
    if (auth.kind !== "signed-in") return;
    const userId = auth.user.id;
    if (folderHandle) {
      try {
        const folderInner = createFolderAdapter({
          directoryHandle: folderHandle,
        });
        const folder = wrapForActive(folderInner, encryption, passwordRef);
        const snap = await folder.load();
        if (snap) {
          const browserInner = createIdbAdapter({ userId });
          const browserAdapter = wrapForActive(
            browserInner,
            encryption,
            passwordRef,
          );
          await browserAdapter.save(snap.text);
        }
      } catch (err) {
        log.error("folder disconnect: failed to mirror to browser", err);
      }
    }
    await clearDirectoryHandle(userId);
    setBackend(userId, "browser");
    setFolderHandle(null);
    setFolderReconnectNeeded(false);
    setBackendState("browser");
  }, [auth, folderHandle, encryption, passwordRef, setBackendState]);

  return {
    folderHandle,
    folderHandleLoaded,
    folderReconnectNeeded,
    pendingFolderLink,
    connectFolder,
    reconnectFolder,
    disconnectFolder,
    resolveFolderLink,
    cancelFolderLink,
    markPermissionLost,
  };
}
