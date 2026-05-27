import { useEffect, useState } from "react";

import type { SaveStatus } from "../../../storage/useUserDataStorage";

type Params = {
  status: SaveStatus;
  cloudReauthAutoOpen: boolean;
};

type Result = {
  syncDetailsOpen: boolean;
  setSyncDetailsOpen: (open: boolean) => void;
  reconnectCloudOpen: boolean;
  setReconnectCloudOpen: (open: boolean) => void;
};

// Auto-open behaviours tied to the storage hook's status:
//
//   - Surface the sync-details modal for states the user can't ignore
//     (paused shrink save, parse failure). Both block autosave, so the
//     user must see the explanation to act.
//   - Surface the reconnect modal the moment a cloud auth-error
//     transitions in, gated on the synced `cloudReauthAutoOpen`
//     preference. Auto-closes when the status moves back out of
//     `auth-error` so the modal doesn't sit on top of the sheet after
//     the user solved it elsewhere.
export function useSyncAutoOpens({
  status,
  cloudReauthAutoOpen,
}: Params): Result {
  const [syncDetailsOpen, setSyncDetailsOpen] = useState(false);
  const [reconnectCloudOpen, setReconnectCloudOpen] = useState(false);

  useEffect(() => {
    if (status.kind === "shrink-warning" || status.kind === "parse-error") {
      setSyncDetailsOpen(true);
    }
  }, [status.kind]);

  // Auto-open the dedicated reconnect modal the moment a cloud
  // auth-error surfaces, so the user can reconnect without hunting
  // for the status pill. The `cloudReauthAutoOpen` synced preference
  // flips this off for users who'd rather notice on their own.
  // Anchored on `status.kind` so it fires exactly once per error
  // transition — re-opens on every new auth-error, not on every
  // render while one sits there.
  useEffect(() => {
    if (status.kind !== "auth-error") return;
    if (!cloudReauthAutoOpen) return;
    setReconnectCloudOpen(true);
  }, [status.kind, cloudReauthAutoOpen]);
  useEffect(() => {
    if (status.kind !== "auth-error" && reconnectCloudOpen) {
      setReconnectCloudOpen(false);
    }
  }, [status.kind, reconnectCloudOpen]);

  return {
    syncDetailsOpen,
    setSyncDetailsOpen,
    reconnectCloudOpen,
    setReconnectCloudOpen,
  };
}
