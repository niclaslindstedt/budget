import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { unlock } from "../data/achievements";
import type { UserData } from "../data/types";
import type { PendingCloudLink, PendingFolderLink } from "./cloud-link-types";
import type { StorageAdapter } from "./adapter";
import {
  type BackendId,
  type EncryptionMode,
  clearGdriveToken,
  getBackend,
  getCloudOfflineMode,
  getDropboxRefreshToken,
  getDropboxToken,
  getEncryption,
  getGdriveToken,
  setBackend,
  setCloudOfflineMode,
  setDropboxToken,
  setEncryption,
} from "./backend-preference";
import { withCloudMirror } from "./cloud-mirror";
import { createDropboxAdapter, startDropboxAuth } from "./dropbox-adapter";
import { withEncryption } from "./encrypting-adapter";
import { serializeUserData } from "./file";
import { createFolderAdapter } from "./folder-adapter";
import { createGdriveAdapter } from "./gdrive-adapter";
import {
  clearCloudMirrorBytes,
  createIdbAdapter,
  createIdbCloudMirrorStorage,
} from "./idb-adapter";
import type { StoredUser } from "../data/types";
import { useDropboxAuth } from "./useDropboxAuth";
import { useFolderHandle } from "./useFolderHandle";
import { useGdriveAuth } from "./useGdriveAuth";
import { wrapForActive } from "./wrap-for-active";
import { createLogger } from "../utils/logger";

const log = createLogger("app");

// Auth shape mirrored from App.tsx so the hook stays decoupled from the
// auth machinery — we only ever read `auth.kind` and `auth.user.id` /
// `auth.user.isDefault` from it.
export type AuthState =
  | { kind: "signed-out"; lastUsername: string | null }
  | { kind: "signed-in"; user: StoredUser; password: string };

// Build a raw `StorageAdapter` for one of the four backends. Single
// switch shared by the live-adapter `useMemo`, by the source probe
// path during link confirmation, by the disconnect handlers, and by
// the encryption-toggle re-wrap — every callsite that needs an inner
// adapter on demand. Returns `null` when the requested cloud backend
// has no token in hand (a token-less folder backend is handled the
// same way as "permission lost" by the caller and falls back to the
// browser adapter — kept inline here rather than null-returning so
// the caller doesn't have to special-case the folder branch).
type BuildInnerArgs = {
  userId: string;
  backend: BackendId;
  dropboxToken: string | null;
  dropboxRefreshTokenRef: React.MutableRefObject<string | null>;
  gdriveToken: string | null;
  folderHandle: FileSystemDirectoryHandle | null;
  onDropboxAccessTokenRefreshed: (next: string) => void;
  // Only the live-adapter callsite cares about permission loss; the
  // one-shot probes don't because they don't outlive a single load /
  // save round trip.
  onFolderPermissionLost?: () => void;
};

function buildInnerAdapter(args: BuildInnerArgs): StorageAdapter {
  const {
    userId,
    backend,
    dropboxToken,
    dropboxRefreshTokenRef,
    gdriveToken,
    folderHandle,
    onDropboxAccessTokenRefreshed,
    onFolderPermissionLost,
  } = args;
  if (backend === "dropbox" && dropboxToken) {
    return createDropboxAdapter({
      accessToken: dropboxToken,
      refreshToken: dropboxRefreshTokenRef.current,
      onAccessTokenRefreshed: onDropboxAccessTokenRefreshed,
    });
  }
  if (backend === "gdrive" && gdriveToken) {
    return createGdriveAdapter(gdriveToken);
  }
  if (backend === "folder" && folderHandle) {
    return createFolderAdapter({
      directoryHandle: folderHandle,
      onPermissionLost: onFolderPermissionLost,
    });
  }
  return createIdbAdapter({ userId });
}

export type UseStorageBackendOptions = {
  auth: AuthState;
  // Held password for the active user. Read by the encrypting adapter
  // on every save / load; the hook reads it through the ref so silent
  // token refreshes don't have to rebuild the adapter `useMemo`.
  passwordRef: React.MutableRefObject<string | null>;
  // Mirror of AppShell's in-memory `UserData` so the OAuth-completion
  // and conflict-resolution paths can push the user's current budget
  // into a freshly-linked cloud backend.
  currentDataRef: React.MutableRefObject<UserData | null>;
};

export type UseStorageBackendResult = {
  adapter: StorageAdapter | null;
  backend: BackendId;
  dropboxConnected: boolean;
  gdriveConnected: boolean;
  folderConnected: boolean;
  folderReconnectNeeded: boolean;
  encryption: EncryptionMode;
  cloudOfflineMode: boolean;
  pendingCloudLink: PendingCloudLink | null;
  pendingFolderLink: PendingFolderLink | null;
  connectDropbox: () => void;
  disconnectDropbox: () => Promise<void>;
  connectGdrive: () => Promise<void>;
  disconnectGdrive: () => Promise<void>;
  connectFolder: () => Promise<void>;
  reconnectFolder: () => Promise<void>;
  disconnectFolder: () => Promise<void>;
  reconnectCloud: () => Promise<void>;
  selectBrowser: () => void;
  setEncryption: (mode: EncryptionMode) => Promise<void>;
  setCloudOfflineMode: (on: boolean) => void;
  resolveCloudLink: (action: "use-cloud" | "use-source") => Promise<void>;
  cancelCloudLink: () => void;
  resolveFolderLink: (action: "use-cloud" | "use-source") => Promise<void>;
  cancelFolderLink: () => void;
  // Eager per-user state sync. Called by App's auth handlers right
  // before `setAuth(...)` so the very first post-flip render sees both
  // the new auth AND the new per-user backend state in a single React
  // batch. Without this, the auth-effect below still catches up, but
  // not until after a render with stale per-user state — which is the
  // documented "blink" race the boot-time seeding goes to such lengths
  // to avoid.
  applySignedInUser: (user: StoredUser) => void;
};

export function useStorageBackend({
  auth,
  passwordRef,
  currentDataRef,
}: UseStorageBackendOptions): UseStorageBackendResult {
  // Per-user device-local storage preferences. Seeded from the current
  // `auth` so the very first adapter built by the `useMemo` below
  // matches what the auth effect would later set — same fix shape as
  // encryption below. Without this, a refresh on a cloud-backed account
  // boots with backend="browser", builds a local adapter whose
  // `loadSync()` hands back whatever stale bytes happen to live under
  // `userDataKey(uid)`, shows them on screen for a frame, then the auth
  // effect swaps the adapter to the real cloud one — which races a
  // queued auto-save of the stale bytes against the in-flight cloud
  // load. On mobile this surfaces as the real budget flashing in for a
  // moment ("blink") and then collapsing back to a fresh "Budget" with
  // the save button lit up dirty (the empty in-memory state vs. the
  // bytes the racing save wrote into `lastSavedText`).
  const [backend, setBackendState] = useState<BackendId>(() =>
    auth.kind === "signed-in" ? getBackend(auth.user.id) : "browser",
  );
  // Mirror of `useFolderHandle`'s `folderHandle` state, declared here
  // so `buildSourceRawAdapter` (defined below, used by `loadSourceText`,
  // used by `useFolderHandle`) can read the current handle without
  // forming a circular hook-order dependency. The folder hook receives
  // this ref and keeps it in sync with its state via an effect.
  const folderHandleRef = useRef<FileSystemDirectoryHandle | null>(null);
  // Seeded from boot so the very first adapter built by the `useMemo`
  // below matches what the auth effect would later set. Without this,
  // a guest-with-data session boots with encryption="encrypted", the
  // adapter is wrapped with `withEncryption` (no `loadSync`), the
  // storage hook latches into status:"loading", and the auth effect's
  // swap to the bare local adapter races the in-flight load — the
  // load gets cancelled and "Loading budget…" never clears.
  const [encryption, setEncryptionState] = useState<EncryptionMode>(() => {
    if (auth.kind !== "signed-in") return "encrypted";
    return auth.user.isDefault ? "plaintext" : getEncryption(auth.user.id);
  });
  // Per-user, per-device toggle for the cloud-mirror fallback. On by
  // default — a cloud-backed session renders its locally cached copy
  // immediately and revalidates against the cloud in the background,
  // so the budget appears instantly instead of blanking until the
  // cloud answers. Seeded from the same per-user key as `encryption`
  // above so the adapter `useMemo` below sees the right wrapping on
  // first render.
  const [cloudOfflineMode, setCloudOfflineModeState] = useState<boolean>(() => {
    if (auth.kind !== "signed-in") return false;
    return getCloudOfflineMode(auth.user.id);
  });

  // Pending cloud-link conflict resolution. Non-null while the user is
  // being asked to decide between adopting the cloud file or replacing
  // it with their current budget — the tokens collected by OAuth are
  // parked here so the dialog's "Use cloud" / "Replace with current
  // budget" branches can finish the link with the right effect.
  const [pendingCloudLink, setPendingCloudLink] =
    useState<PendingCloudLink | null>(null);

  // Sync state with the active user every time auth flips. The
  // default (no-password) user is pinned to plaintext storage — there
  // is no password to derive a key from, and the user explicitly
  // opted out of accounts. `useDropboxAuth` and `useGdriveAuth` each
  // run their own parallel sync effect for their cloud token state
  // so this one stays focused on the non-cloud per-user prefs.
  useEffect(() => {
    if (auth.kind !== "signed-in") {
      log.info("auth: signed-out — clearing per-user preferences");
      setBackendState("browser");
      setEncryptionState("encrypted");
      setCloudOfflineModeState(false);
      return;
    }
    const nextBackend = getBackend(auth.user.id);
    const nextEncryption = auth.user.isDefault
      ? "plaintext"
      : getEncryption(auth.user.id);
    const nextOffline = getCloudOfflineMode(auth.user.id);
    log.info(
      `auth: signed-in user=${auth.user.username} isDefault=${Boolean(auth.user.isDefault)} backend=${nextBackend} encryption=${nextEncryption} cloudOffline=${nextOffline}`,
    );
    setBackendState(nextBackend);
    setEncryptionState(nextEncryption);
    setCloudOfflineModeState(nextOffline);
  }, [auth]);

  // Wrap a raw adapter with `withEncryption` when the active user has
  // encryption on AND a password is in hand — mirrors the same gate
  // used when assembling the live `adapter` below, so source / target
  // probes during the link flow see and write the bytes through the
  // same envelope the steady-state app does.
  const wrapWithActiveEncryption = useCallback(
    (raw: StorageAdapter): StorageAdapter =>
      wrapForActive(raw, encryption, passwordRef),
    [encryption, passwordRef],
  );

  // Build a raw adapter for the *source* backend so the OAuth-
  // completion path can load the user's current bytes without
  // depending on `currentDataRef` — which only reflects whatever
  // AppShell happens to have loaded by the time the redirect lands
  // (typically `freshUserData()` on a cold boot, since cloud loads
  // are async). Returns null only when the source is a cloud backend
  // and the token has gone missing.
  const buildSourceRawAdapter = useCallback(
    (userId: string, fromBackend: BackendId): StorageAdapter | null => {
      if (fromBackend === "dropbox") {
        const token = getDropboxToken(userId);
        if (!token) return null;
        const refresh = getDropboxRefreshToken(userId);
        return createDropboxAdapter({
          accessToken: token,
          refreshToken: refresh,
          onAccessTokenRefreshed: (next) => {
            setDropboxToken(userId, next);
          },
        });
      }
      if (fromBackend === "gdrive") {
        const token = getGdriveToken(userId);
        if (!token) return null;
        return createGdriveAdapter(token);
      }
      if (fromBackend === "folder") {
        // The folder source needs the live handle held in App state,
        // not something we can rebuild from localStorage. Caller falls
        // back to the in-memory snapshot when the handle isn't there
        // — e.g. permission was revoked between sessions. Read through
        // `folderHandleRef` (kept in sync by `useFolderHandle`) so this
        // callback can be defined before the folder hook runs without
        // creating a circular hook-order dependency — `useFolderHandle`
        // needs `loadSourceText`, which needs `buildSourceRawAdapter`,
        // which would otherwise need the folder hook's state.
        const handle = folderHandleRef.current;
        if (!handle) return null;
        return createFolderAdapter({ directoryHandle: handle });
      }
      return createIdbAdapter({ userId });
    },
    [],
  );

  // Read the source backend's current bytes, falling back to the
  // in-memory snapshot if the source adapter can't be built (e.g. a
  // cloud source whose token expired between sessions). The result
  // is plaintext UserData JSON ready to be re-written through a
  // wrapped target adapter on the resolve path.
  const loadSourceText = useCallback(
    async (userId: string, fromBackend: BackendId): Promise<string | null> => {
      const raw = buildSourceRawAdapter(userId, fromBackend);
      if (raw) {
        try {
          const wrapped = wrapWithActiveEncryption(raw);
          const snap = await wrapped.load();
          if (snap) return snap.text;
        } catch (err) {
          log.error("source load failed during cloud link", err);
        }
      }
      const fallback = currentDataRef.current;
      return fallback ? serializeUserData(fallback) : null;
    },
    [buildSourceRawAdapter, wrapWithActiveEncryption, currentDataRef],
  );

  const {
    dropboxToken,
    dropboxRefreshTokenRef,
    connectDropbox,
    commitDropboxLink,
    markDisconnected: markDropboxDisconnected,
    applySignedInUser: applyDropboxSignedInUser,
  } = useDropboxAuth({
    auth,
    loadSourceText,
    setPendingCloudLink,
    setBackendState,
  });

  const {
    gdriveToken,
    connectGdrive,
    commitGdriveLink,
    reauthorizeGdrive,
    markDisconnected: markGdriveDisconnected,
    applySignedInUser: applyGdriveSignedInUser,
  } = useGdriveAuth({
    auth,
    loadSourceText,
    setPendingCloudLink,
    setBackendState,
  });

  // Resolve a parked cloud-link confirmation. "use-cloud" just flips
  // the backend and lets the storage hook reload from the cloud (which
  // may itself be empty — that's the "both sides empty, just confirm"
  // case). "use-source" pushes the stashed `sourceText` through the
  // probe adapter first, threading the remote revision so the write
  // lands as an update rather than a colliding `add` when the cloud
  // already had a file; then flips the backend. The dialog is
  // dismissed as soon as the user picks so the path stays snappy;
  // any error from the upload is logged and the link silently aborts
  // (the user can retry from Settings).
  const resolveCloudLink = useCallback(
    async (action: "use-cloud" | "use-source"): Promise<void> => {
      const pending = pendingCloudLink;
      if (!pending || auth.kind !== "signed-in") return;
      log.info(
        `cloud-link resolve: ${pending.provider} action=${action} fromBackend=${pending.fromBackend}`,
      );
      setPendingCloudLink(null);
      const userId = auth.user.id;
      try {
        if (action === "use-source" && pending.sourceText !== null) {
          log.info(
            `cloud-link: pushing source bytes (${pending.sourceText.length}) into ${pending.provider}`,
          );
          const probeRaw =
            pending.provider === "dropbox"
              ? createDropboxAdapter({
                  accessToken: pending.auth.accessToken,
                  refreshToken: pending.auth.refreshToken,
                  onAccessTokenRefreshed: (next) => {
                    setDropboxToken(userId, next);
                  },
                })
              : createGdriveAdapter(pending.accessToken);
          const probe = wrapWithActiveEncryption(probeRaw);
          await probe.save(
            pending.sourceText,
            pending.remoteSnapshot?.revision,
          );
        }
        // Drop any cloud-mirror cache the previous backend left
        // behind. The mirror is per-user only, so without this the
        // new provider's load() would see the old provider's
        // pending edits and either push them into the new cloud or
        // surface a bogus cross-provider conflict — both of which
        // end with a blank budget on the freshly linked backend.
        // The cloud-mirror wrapper now also guards against this
        // internally via the backendId tag, but clearing here is
        // the explicit, observable handoff.
        log.info(
          `cloud-link: clearing cloud-mirror before flipping backend to ${pending.provider}`,
        );
        await clearCloudMirrorBytes(userId);
        log.info(
          `cloud-link: committing — flipping backend to ${pending.provider}`,
        );
        if (pending.provider === "dropbox") {
          commitDropboxLink(userId, pending.auth);
        } else {
          commitGdriveLink(userId, pending.accessToken);
        }
      } catch (err) {
        log.error(`cloud-link: ${pending.provider} link failed`, err);
      }
    },
    [
      auth,
      pendingCloudLink,
      commitDropboxLink,
      commitGdriveLink,
      wrapWithActiveEncryption,
    ],
  );

  const cancelCloudLink = useCallback(() => {
    setPendingCloudLink(null);
  }, []);

  const {
    folderHandle,
    folderHandleLoaded,
    folderReconnectNeeded,
    pendingFolderLink,
    connectFolder,
    reconnectFolder,
    disconnectFolder,
    resolveFolderLink,
    cancelFolderLink,
    markPermissionLost: markFolderPermissionLost,
  } = useFolderHandle({
    auth,
    encryption,
    passwordRef,
    wrapWithActiveEncryption,
    loadSourceText,
    setBackendState,
    folderHandleRef,
  });

  const adapter = useMemo<StorageAdapter | null>(() => {
    if (auth.kind !== "signed-in") {
      log.info("adapter: null (not signed in)");
      return null;
    }
    const userId = auth.user.id;
    // Folder backend with the handle still being restored from IDB —
    // return null so the storage hook waits (same null-tolerated path
    // as the auth handshake). Without this gate the first render
    // would pick the browser fallback below and trigger an unwanted
    // load + replace before the folder handle lands.
    if (backend === "folder" && !folderHandleLoaded) {
      log.info("adapter: null (folder handle still loading)");
      return null;
    }
    const isCloud =
      (backend === "dropbox" && dropboxToken !== null) ||
      (backend === "gdrive" && gdriveToken !== null);
    if (backend === "dropbox" && dropboxToken) {
      log.info(
        `adapter: building dropbox (hasRefresh=${Boolean(dropboxRefreshTokenRef.current)})`,
      );
    } else if (backend === "gdrive" && gdriveToken) {
      log.info("adapter: building gdrive");
    } else if (backend === "folder" && folderHandle) {
      log.info("adapter: building folder");
    } else {
      log.info(
        `adapter: building browser (backend=${backend} dropboxToken=${Boolean(
          dropboxToken,
        )} gdriveToken=${Boolean(gdriveToken)} folderHandle=${Boolean(
          folderHandle,
        )})`,
      );
    }
    let inner = buildInnerAdapter({
      userId,
      backend,
      dropboxToken,
      dropboxRefreshTokenRef,
      gdriveToken,
      folderHandle,
      // Persist the silently-refreshed access token so the next
      // page load picks it up; deliberately do NOT touch React
      // state, since rebuilding the adapter mid-session would
      // discard our `lastSnapshot` and force a reload of the
      // user's data.
      onDropboxAccessTokenRefreshed: (next) => {
        log.info("dropbox: persisting refreshed access token");
        setDropboxToken(userId, next);
      },
      // The OS revoked access mid-session (rare, but possible
      // via site-settings while the tab is open). Drop the live
      // handle so the next render falls back to the browser
      // adapter, and surface the reconnect banner — the IDB
      // record is intentionally kept so the user can re-grant
      // with one click against the stored handle.
      onFolderPermissionLost: markFolderPermissionLost,
    });
    // Wrap cloud backends with the offline-mirror so a session that
    // boots without network can still load the last-known bytes and
    // accept edits. The wrapper sits *under* `withEncryption` so it
    // sees and mirrors the same ciphertext the cloud holds, keeping
    // the on-disk threat model end-to-end. Gated on the per-user
    // `cloudOfflineMode` preference — when off, cloud sessions
    // behave the historical way (wait for the cloud, surface errors
    // on failure).
    if (isCloud && cloudOfflineMode) {
      log.info(`adapter: wrapping ${inner.id} with cloud-mirror`);
      inner = withCloudMirror(inner, {
        storage: createIdbCloudMirrorStorage(userId),
      });
    }
    // Skip the encryption wrapper entirely when the user has opted
    // out — keeps `loadSync` available on local and writes plaintext
    // bytes to whichever inner backend is active (including the
    // cloud backends).
    if (encryption === "plaintext") {
      log.info(`adapter: encryption off — inner=${inner.id}`);
      return inner;
    }
    if (!passwordRef.current) {
      log.warn(
        `adapter: encryption on but no password held — load will fail with "password required" if the file is encrypted (inner=${inner.id})`,
      );
    } else {
      log.info(`adapter: wrapping ${inner.id} with encryption`);
    }
    return withEncryption(inner, passwordRef);
  }, [
    auth,
    backend,
    dropboxToken,
    dropboxRefreshTokenRef,
    gdriveToken,
    folderHandle,
    folderHandleLoaded,
    encryption,
    cloudOfflineMode,
    passwordRef,
    markFolderPermissionLost,
  ]);

  // Re-issue OAuth for the active cloud backend after an
  // `auth-error` status. Distinct from `connectGdrive` /
  // `connectDropbox`, which go through the
  // `pendingCloudLink` confirmation flow — that flow exists for
  // linking a fresh backend, not refreshing a token on a backend the
  // user is already on. Here both copies live in the same cloud, so
  // we just persist the new token and let `useUserDataStorage`
  // re-run its load on the rebuilt adapter.
  //
  // Throws on failure (popup blocked, user dismissed, network) so the
  // calling button / modal can show the message inline instead of
  // silently swallowing it.
  const reconnectCloud = useCallback(async (): Promise<void> => {
    if (auth.kind !== "signed-in") return;
    if (backend === "gdrive") {
      await reauthorizeGdrive(auth.user.id);
      // Re-issued the token without going through Settings — the
      // `rekindled` gesture. Fired after the popup resolves so a
      // cancelled re-auth doesn't unlock it.
      unlock("rekindled");
      return;
    }
    if (backend === "dropbox") {
      // Dropbox re-auth navigates away immediately, so fire before the
      // redirect; the watcher dispatches synchronously into state. The
      // gdrive popup path above is the reliable one.
      unlock("rekindled");
      // Dropbox uses URL-redirect OAuth; the existing flow handles
      // the return trip. The auto-refresh in `authedFetch` covers the
      // common case, so a Dropbox auth-error means the refresh token
      // is gone or revoked — a full redirect re-link is appropriate.
      // The promise resolves once the navigation has been kicked off
      // — the page unloads shortly after.
      await startDropboxAuth();
    }
  }, [auth, backend, reauthorizeGdrive]);

  const selectBrowser = useCallback(() => {
    if (auth.kind !== "signed-in") return;
    setBackend(auth.user.id, "browser");
    setBackendState("browser");
    unlock("shapeShifter");
  }, [auth]);

  // Mirror the active cloud backend's current bytes back into the
  // browser backend, then clear the tokens and flip state. Best-
  // effort: a stale browser copy is a few-minute regression at worst
  // because `useUserDataStorage` saves on the same debounce. Used by
  // both the Dropbox and Google Drive disconnect flows — they only
  // differ in which inner adapter to read from and which token to
  // clear after the mirror.
  const disconnectCloud = useCallback(
    async (provider: "dropbox" | "gdrive") => {
      if (auth.kind !== "signed-in") return;
      const userId = auth.user.id;
      const sourceToken = provider === "dropbox" ? dropboxToken : gdriveToken;
      // Pull the latest cloud snapshot — through the encrypting
      // wrapper when the user keeps storage encrypted, raw otherwise —
      // so the bytes that land in localStorage match what was up
      // there. Failing to fetch is tolerated: the in-memory state has
      // just been auto-saved there moments ago, so worst case the
      // user loses the few minutes between the last sync and the
      // disconnect.
      if (sourceToken) {
        try {
          const cloudInner =
            provider === "dropbox"
              ? createDropboxAdapter({
                  accessToken: sourceToken,
                  refreshToken: dropboxRefreshTokenRef.current,
                  onAccessTokenRefreshed: (next) => {
                    setDropboxToken(userId, next);
                  },
                })
              : createGdriveAdapter(sourceToken);
          const cloud = wrapForActive(cloudInner, encryption, passwordRef);
          const snap = await cloud.load();
          if (snap) {
            const localInner = createIdbAdapter({ userId });
            const local = wrapForActive(localInner, encryption, passwordRef);
            await local.save(snap.text);
          }
        } catch (err) {
          log.error(`${provider} disconnect: failed to mirror to local`, err);
        }
      }
      // Persisted-token cleanup: useDropboxAuth's markDisconnected
      // handles its own clear path; GDrive's persisted token still
      // lives behind a separate getter so the clear stays inline.
      if (provider === "gdrive") {
        clearGdriveToken(userId);
      }
      setBackend(userId, "browser");
      // Dropping the cloud connection invalidates the cached cloud
      // bytes — leaving them around would let a future reconnect
      // surface a stale conflict against the new remote.
      await clearCloudMirrorBytes(userId);
      if (provider === "dropbox") {
        markDropboxDisconnected(userId);
      } else {
        markGdriveDisconnected();
      }
      setBackendState("browser");
    },
    [
      auth,
      dropboxToken,
      dropboxRefreshTokenRef,
      gdriveToken,
      encryption,
      passwordRef,
      markDropboxDisconnected,
      markGdriveDisconnected,
    ],
  );

  const disconnectDropbox = useCallback(
    () => disconnectCloud("dropbox"),
    [disconnectCloud],
  );

  const disconnectGdrive = useCallback(
    () => disconnectCloud("gdrive"),
    [disconnectCloud],
  );

  // Flip the per-user encryption preference, re-wrapping the budget
  // JSON already in the active backend so the next load isn't reading
  // the wrong envelope. Reads through the *current* preference and
  // writes through the *new* one. Backend choice (local vs Dropbox vs
  // Google Drive) is independent — encryption is just whether the
  // adapter wraps with `withEncryption` on top. Receipts and payslips
  // are never encrypted, so the toggle doesn't touch them.
  const setEncryptionMode = useCallback(
    async (next: EncryptionMode) => {
      if (auth.kind !== "signed-in") return;
      // The default (no-password) user has no key to derive — pin to
      // plaintext and ignore any toggle attempts.
      if (auth.user.isDefault) return;
      if (next === encryption) return;
      const userId = auth.user.id;
      const buildInner = (): StorageAdapter =>
        buildInnerAdapter({
          userId,
          backend,
          dropboxToken,
          dropboxRefreshTokenRef,
          gdriveToken,
          folderHandle,
          onDropboxAccessTokenRefreshed: (nextToken) => {
            setDropboxToken(userId, nextToken);
          },
        });
      const innerForCurrent: StorageAdapter = buildInner();
      const innerForNext: StorageAdapter = buildInner();
      const current =
        encryption === "plaintext"
          ? innerForCurrent
          : withEncryption(innerForCurrent, passwordRef);
      const target =
        next === "plaintext"
          ? innerForNext
          : withEncryption(innerForNext, passwordRef);
      try {
        // Re-wrap only the budget JSON: read it through the current
        // preference and re-save through the new one (switching to
        // plaintext decrypts, switching to encrypted re-encrypts).
        // Receipts and payslips are never encrypted, so there's nothing
        // to convert for them — the toggle leaves those files alone.
        const snap = await current.load();
        if (snap) await target.save(snap.text);
      } catch (err) {
        log.error("encryption toggle: failed to re-wrap budget bytes", err);
        return;
      }
      setEncryption(userId, next);
      setEncryptionState(next);
      if (next === "encrypted") unlock("paranoidMode");
    },
    [
      auth,
      backend,
      dropboxToken,
      dropboxRefreshTokenRef,
      gdriveToken,
      folderHandle,
      encryption,
      passwordRef,
    ],
  );

  // Flip the per-user offline-mirror opt-in. Persisted to localStorage
  // and reflected in React state so the adapter `useMemo` above rebuilds
  // — turning the toggle off also drops the cached mirror bytes so the
  // user doesn't leave a stale copy behind on a shared device.
  const setCloudOfflineModePref = useCallback(
    (on: boolean) => {
      if (auth.kind !== "signed-in") return;
      const userId = auth.user.id;
      if (on) {
        log.info("cloud-offline: enabling for user");
        setCloudOfflineMode(userId, true);
      } else {
        // Write an explicit "off" rather than clearing the key — the
        // default is on, so a cleared key would re-read as enabled and
        // silently re-arm the mirror on the next load.
        log.info("cloud-offline: disabling for user — clearing mirror");
        setCloudOfflineMode(userId, false);
        // Fire-and-forget — the UI flips state immediately and the
        // IDB delete settles a moment later.
        void clearCloudMirrorBytes(userId);
      }
      setCloudOfflineModeState(on);
    },
    [auth],
  );

  // Imperative eager sync. App's auth handlers call this right before
  // `setAuth(...)` so the very first post-flip render sees both the
  // new auth AND the new per-user backend state in a single React
  // batch — the auth-effect above still catches up, but it doesn't
  // run until after the render, leaving the documented "blink" race
  // window otherwise. The sign-out path doesn't need an equivalent
  // helper because the auth-effect's `signed-out` branch handles the
  // clear before any post-flip render that consults this state.
  const applySignedInUser = useCallback(
    (user: StoredUser) => {
      setBackendState(getBackend(user.id));
      applyDropboxSignedInUser(user);
      applyGdriveSignedInUser(user);
      setEncryptionState(user.isDefault ? "plaintext" : getEncryption(user.id));
    },
    [applyDropboxSignedInUser, applyGdriveSignedInUser],
  );

  return {
    adapter,
    backend,
    dropboxConnected: dropboxToken !== null,
    gdriveConnected: gdriveToken !== null,
    folderConnected: folderHandle !== null,
    folderReconnectNeeded,
    encryption,
    cloudOfflineMode,
    pendingCloudLink,
    pendingFolderLink,
    connectDropbox,
    disconnectDropbox,
    connectGdrive,
    disconnectGdrive,
    connectFolder,
    reconnectFolder,
    disconnectFolder,
    reconnectCloud,
    selectBrowser,
    setEncryption: setEncryptionMode,
    setCloudOfflineMode: setCloudOfflineModePref,
    resolveCloudLink,
    cancelCloudLink,
    resolveFolderLink,
    cancelFolderLink,
    applySignedInUser,
  };
}
