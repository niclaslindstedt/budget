import { useCallback, useEffect, useState } from "react";

import type { Action } from "../data/reducer";
import { APP_VERSION } from "../utils/build-env";
import { cmpSemver } from "../utils/semver";

type UseChangelogAutoOpenInput = {
  lastSeenChangelogVersion: string | null;
  dispatch: React.Dispatch<Action>;
};

type UseChangelogAutoOpenResult = {
  isOpen: boolean;
  onClose: () => void;
};

// "What's new" popup gate. On the very first mount of the budget
// view (per browser profile per user), the user's
// `lastSeenChangelogVersion` is null — silently stamp the running
// version so an existing user never sees release notes for software
// they just installed. On subsequent mounts, open the modal only
// when the persisted version is strictly older than APP_VERSION.
// Effect intentionally runs once per mount; the closing handler
// writes the running version back through `updateCommonSettings` so
// the next mount won't re-open. The targeted patch action avoids
// round-tripping the whole settings draft for a one-field write.
export function useChangelogAutoOpen({
  lastSeenChangelogVersion,
  dispatch,
}: UseChangelogAutoOpenInput): UseChangelogAutoOpenResult {
  const [isOpen, setIsOpen] = useState(false);
  useEffect(() => {
    if (lastSeenChangelogVersion === null) {
      dispatch({
        type: "updateCommonSettings",
        patch: { lastSeenChangelogVersion: APP_VERSION },
      });
      return;
    }
    if (cmpSemver(lastSeenChangelogVersion, APP_VERSION) < 0) {
      setIsOpen(true);
    }
    // Effect intentionally fires once per mount of the budget view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onClose = useCallback(() => {
    setIsOpen(false);
    dispatch({
      type: "updateCommonSettings",
      patch: { lastSeenChangelogVersion: APP_VERSION },
    });
  }, [dispatch]);

  return { isOpen, onClose };
}
