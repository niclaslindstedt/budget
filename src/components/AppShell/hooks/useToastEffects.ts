import { useEffect, useRef } from "react";

import type { SaveStatus } from "../../../storage/useUserDataStorage";
import { useT } from "../../../i18n";
import type { useToast } from "../../../hooks";

type Params = {
  dropboxConnected: boolean;
  gdriveConnected: boolean;
  folderConnected: boolean;
  status: SaveStatus;
  toast: ReturnType<typeof useToast>;
};

// Surface cross-cutting state transitions as toasts:
//
//   - cloud (Dropbox, Google Drive) and folder connect / disconnect
//     edges, seeded so an already-connected user doesn't get a
//     misleading "Connected to ..." pop on refresh,
//   - save-error transitions on the storage hook's status (the
//     conflict and shrink-warning kinds already drive their own modals,
//     but plain `error` has nowhere else to surface).
export function useToastEffects({
  dropboxConnected,
  gdriveConnected,
  folderConnected,
  status,
  toast,
}: Params): void {
  const t = useT();

  const prevCloudConnected = useRef({
    dropbox: dropboxConnected,
    gdrive: gdriveConnected,
    folder: folderConnected,
  });
  useEffect(() => {
    const prev = prevCloudConnected.current;
    if (prev.dropbox !== dropboxConnected) {
      toast.push({
        kind: dropboxConnected ? "success" : "warning",
        message: t(
          dropboxConnected ? "toast.cloudConnected" : "toast.cloudDisconnected",
          { provider: "Dropbox" },
        ),
      });
    }
    if (prev.gdrive !== gdriveConnected) {
      toast.push({
        kind: gdriveConnected ? "success" : "warning",
        message: t(
          gdriveConnected ? "toast.cloudConnected" : "toast.cloudDisconnected",
          { provider: "Google Drive" },
        ),
      });
    }
    if (prev.folder !== folderConnected) {
      toast.push({
        kind: folderConnected ? "success" : "warning",
        message: t(
          folderConnected
            ? "toast.folderConnected"
            : "toast.folderDisconnected",
        ),
      });
    }
    prevCloudConnected.current = {
      dropbox: dropboxConnected,
      gdrive: gdriveConnected,
      folder: folderConnected,
    };
  }, [dropboxConnected, gdriveConnected, folderConnected, toast, t]);

  useEffect(() => {
    if (status.kind === "error") {
      toast.push({
        kind: "error",
        message: t("toast.saveError", { reason: status.message }),
      });
    }
    // The intent is "fire on transition into `error`"; relying on
    // `status.kind` alone is enough since the message changes only
    // when the kind cycles back through a non-error state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status.kind]);
}
