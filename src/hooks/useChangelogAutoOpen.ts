import { useCallback, useEffect, useRef, useState } from "react";

import type { Action } from "../data/reducer";
import type { Settings } from "../data/types";
import { APP_VERSION } from "../utils/build-env";
import { cmpSemver } from "../utils/semver";

type UseChangelogAutoOpenInput = {
  // Full settings object so the `updateSettings` dispatch payload
  // mirrors today's state — the reducer treats the action as a full
  // replacement of the settings slice.
  settings: Settings;
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
// writes the running version back through the same `updateSettings`
// action the rest of Settings uses, so the next mount won't re-open.
export function useChangelogAutoOpen({
  settings,
  lastSeenChangelogVersion,
  dispatch,
}: UseChangelogAutoOpenInput): UseChangelogAutoOpenResult {
  const [isOpen, setIsOpen] = useState(false);
  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);
  useEffect(() => {
    if (lastSeenChangelogVersion === null) {
      dispatch({
        type: "updateSettings",
        settings: {
          ...settingsRef.current,
          lastSeenChangelogVersion: APP_VERSION,
        },
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
      type: "updateSettings",
      settings: {
        ...settingsRef.current,
        lastSeenChangelogVersion: APP_VERSION,
      },
    });
  }, [dispatch]);

  return { isOpen, onClose };
}
