import { useCallback, useState } from "react";

import type { Action } from "../../../data/reducer";
import { useChangelogAutoOpen } from "../../../hooks";

type Params = {
  lastSeenChangelogVersion: string | null;
  dispatch: (action: Action) => void;
};

type Result = {
  // Combined open state. The auto-open path filters by
  // `lastSeenChangelogVersion`; the manual path (header menu) opens
  // in "full history" mode by passing `since=null`.
  changelogOpen: boolean;
  // `null` flags the modal as "show me everything" — manual opens
  // bypass the per-version filter so the user can scroll back through
  // all releases.
  changelogSince: string | null;
  // Flipping the header-menu manual path to open.
  setChangelogManualOpen: (open: boolean) => void;
  onCloseChangelog: () => void;
};

export function useChangelogState({
  lastSeenChangelogVersion,
  dispatch,
}: Params): Result {
  const { isOpen: autoOpen, onClose: onCloseAuto } = useChangelogAutoOpen({
    lastSeenChangelogVersion,
    dispatch,
  });
  const [manualOpen, setChangelogManualOpen] = useState(false);
  const changelogOpen = autoOpen || manualOpen;
  const changelogSince = manualOpen ? null : lastSeenChangelogVersion;
  const onCloseChangelog = useCallback(() => {
    if (autoOpen) onCloseAuto();
    setChangelogManualOpen(false);
  }, [autoOpen, onCloseAuto]);
  return {
    changelogOpen,
    changelogSince,
    setChangelogManualOpen,
    onCloseChangelog,
  };
}
