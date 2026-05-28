import { useCallback, useEffect, useState } from "react";

import { unlock } from "../data/achievements";
import type { PendingCloudLink } from "./cloud-link-types";
import {
  type BackendId,
  getBackend,
  getGdriveToken,
  setBackend,
  setGdriveToken,
} from "./backend-preference";
import { createGdriveAdapter, startGdriveAuth } from "./gdrive-adapter";
import type { StoredUser } from "../data/types";
import type { AuthState } from "./useStorageBackend";
import { createLogger } from "../utils/logger";

const log = createLogger("storage-gdrive");

// Inputs the GDrive hook shares with the outer storage hook. The
// hook owns the GIS popup-based OAuth flow, the access token state,
// the commit-on-link step, and the per-user auth-sync. GDrive uses
// short-lived GIS tokens — there is no refresh-token side channel
// (unlike Dropbox); the outer hook's `reconnectCloud` flow re-prompts
// on auth-error rather than refreshing in the background.
//
// Cross-cutting concerns — `pendingCloudLink` state, the shared
// `disconnectCloud` / `reconnectCloud` orchestration, `loadSourceText`
// — stay in the outer hook. The hook exposes provider-specific
// callbacks (`commitGdriveLink`, `connectGdrive`, `markDisconnected`,
// `applySignedInUser`) for the orchestrator to call into.
type Params = {
  auth: AuthState;
  // Read the source backend's current bytes (plaintext UserData JSON)
  // so the OAuth probe can decide whether the dialog should ask the
  // user to keep the cloud copy or push the source bytes up.
  loadSourceText: (
    userId: string,
    fromBackend: BackendId,
  ) => Promise<string | null>;
  // The outer hook's parked-link state setter. The GDrive connect
  // flow populates this when a dialog needs to ask the user whether
  // to keep the cloud copy or push the source bytes.
  setPendingCloudLink: (pending: PendingCloudLink | null) => void;
  // Flip the per-user-persisted backend choice. GDrive commit
  // updates this so the outer hook's `backend` state rebuilds the
  // adapter useMemo against the new cloud provider.
  setBackendState: (next: BackendId) => void;
};

export type GdriveAuth = {
  // The current GDrive access token (or null if not connected). The
  // outer adapter useMemo reads this; GIS tokens expire after one
  // hour and the outer `reconnectCloud` flow re-prompts the user
  // when an auth-error surfaces, replacing the token in this state.
  gdriveToken: string | null;
  // Launch the GIS popup, probe both sides, and either commit
  // silently or park `pendingCloudLink` for the user-confirmation
  // dialog. Returns the promise that resolves when the GIS popup
  // closes (success or user dismissal) so Settings can surface
  // popup-blocked errors inline.
  connectGdrive: () => Promise<void>;
  // Persist the GIS token and flip the active backend. Consumed by
  // the outer hook's `resolveCloudLink` when the user confirms the
  // dialog.
  commitGdriveLink: (userId: string, token: string) => void;
  // Re-issue OAuth for an auth-error situation. Called from the
  // outer `reconnectCloud` when the active backend is gdrive.
  reauthorizeGdrive: (userId: string) => Promise<void>;
  // Drop the in-memory token state + clear the persisted token.
  // Called by the outer `disconnectCloud` after the shared
  // mirror-to-browser step runs.
  markDisconnected: () => void;
  // Eager per-user sync. Called by the outer hook's
  // `applySignedInUser` so the very first post-flip render sees the
  // new per-user GDrive state in a single React batch.
  applySignedInUser: (user: StoredUser) => void;
};

// Owns the GDrive backend's auth lifecycle: GIS token state, the
// popup-based OAuth flow, the commit-on-link step, the
// reauthorize-after-expiry path, and the per-user auth-sync. The
// shared cloud orchestration lives in the outer `useStorageBackend`
// hook; this hook exposes the callbacks the orchestrator needs.
export function useGdriveAuth(params: Params): GdriveAuth {
  const { auth, loadSourceText, setPendingCloudLink, setBackendState } = params;

  const [gdriveToken, setGdriveTokenState] = useState<string | null>(() =>
    auth.kind === "signed-in" ? getGdriveToken(auth.user.id) : null,
  );

  // Sync GDrive state with the active user every time auth flips.
  // The outer hook handles its own per-user state in a parallel
  // effect; this one stays focused on the GDrive token so adding /
  // removing a cloud backend doesn't bloat the outer effect.
  useEffect(() => {
    if (auth.kind !== "signed-in") {
      setGdriveTokenState(null);
      return;
    }
    setGdriveTokenState(getGdriveToken(auth.user.id));
  }, [auth]);

  // Persist the OAuth token and flip the active backend in one batch.
  // Split out from `connectGdrive` because both the "no remote file"
  // branch and the conflict-resolution dialog need the same commit
  // step.
  const commitGdriveLink = useCallback(
    (userId: string, token: string) => {
      log.info("commitGdriveLink: persisting token");
      setGdriveToken(userId, token);
      setBackend(userId, "gdrive");
      setGdriveTokenState(token);
      setBackendState("gdrive");
      unlock("cloudWalker");
    },
    [setBackendState],
  );

  // Launch the GIS popup, exchange for a token, probe both sides for
  // an existing budget, and either commit silently or park
  // `pendingCloudLink` for the user-confirmation dialog. Rethrows
  // popup failures (network drop, popup blocked, user dismissed) so
  // the caller can surface the error inline — silently returning
  // here meant the picker option flipped to Google Drive but nothing
  // visible happened, leaving the user wondering whether the app got
  // the click.
  const connectGdrive = useCallback(async () => {
    if (auth.kind !== "signed-in") return;
    const userId = auth.user.id;
    const fromBackend = getBackend(userId);
    let token: string;
    try {
      log.info("oauth(gdrive): launching GIS popup");
      token = await startGdriveAuth();
    } catch (err) {
      log.error("oauth(gdrive): popup failed", err);
      throw err;
    }
    if (auth.kind !== "signed-in") {
      log.info("oauth(gdrive): aborted after token (signed out)");
      return;
    }
    log.info("oauth(gdrive): probing remote + source in parallel");
    const probe = createGdriveAdapter(token);
    const [remote, sourceText] = await Promise.all([
      probe.load().catch((err: unknown) => {
        log.error("oauth(gdrive): probe failed", err);
        return null;
      }),
      loadSourceText(userId, fromBackend),
    ]);
    if (auth.kind !== "signed-in") {
      log.info("oauth(gdrive): aborted after probe (signed out)");
      return;
    }
    log.info(
      `oauth(gdrive): probe done remoteHasBytes=${Boolean(remote)} sourceHasBytes=${Boolean(sourceText)} — opening confirmation`,
    );
    setPendingCloudLink({
      provider: "gdrive",
      accessToken: token,
      fromBackend,
      remoteSnapshot: remote,
      sourceText,
    });
  }, [auth, loadSourceText, setPendingCloudLink]);

  // Re-issue the GIS popup after an auth-error so the outer
  // `reconnectCloud` can resume the active backend without forcing
  // the user through Settings. The fresh token writes to both
  // localStorage and the in-memory state so the adapter useMemo
  // rebuilds against the live access token.
  const reauthorizeGdrive = useCallback(async (userId: string) => {
    log.info("reconnect(gdrive): launching GIS popup");
    const token = await startGdriveAuth();
    setGdriveToken(userId, token);
    setGdriveTokenState(token);
  }, []);

  const markDisconnected = useCallback(() => {
    setGdriveTokenState(null);
  }, []);

  const applySignedInUser = useCallback((user: StoredUser) => {
    setGdriveTokenState(getGdriveToken(user.id));
  }, []);

  return {
    gdriveToken,
    connectGdrive,
    commitGdriveLink,
    reauthorizeGdrive,
    markDisconnected,
    applySignedInUser,
  };
}
