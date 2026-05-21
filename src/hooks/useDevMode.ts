// Hook exposing the two device-local flags that drive the Developer
// and Logs settings tabs:
//
//   - `devMode`     — whether the Developer tab is exposed at all
//   - `captureLogs` — whether the logger persists entries to
//                     localStorage so the Logs tab has something to
//                     show
//
// Both are stored outside `Settings` so they don't travel with an
// export. Turning dev mode off forcibly turns capture off too — the
// UI would otherwise let logs accumulate while the tabs are hidden,
// which is confusing and wastes the localStorage budget.

import { useCallback, useEffect, useState } from "react";

import { CAPTURE_LOGS_KEY, DEV_MODE_KEY } from "../data/constants";
import { setCaptureEnabled } from "../utils/logger";

function readBool(key: string): boolean {
  try {
    if (typeof localStorage === "undefined") return false;
    return localStorage.getItem(key) === "true";
  } catch {
    return false;
  }
}

function writeBool(key: string, value: boolean): void {
  try {
    if (typeof localStorage === "undefined") return;
    if (value) localStorage.setItem(key, "true");
    else localStorage.removeItem(key);
  } catch {
    // Best-effort; swallow quota / access errors.
  }
}

export function useDevMode(): {
  devMode: boolean;
  setDevMode: (next: boolean) => void;
  captureLogs: boolean;
  setCaptureLogs: (next: boolean) => void;
} {
  const [devMode, setDevModeState] = useState<boolean>(() =>
    readBool(DEV_MODE_KEY),
  );
  const [captureLogs, setCaptureLogsState] = useState<boolean>(() =>
    readBool(CAPTURE_LOGS_KEY),
  );

  // Pick up writes from other tabs so a toggle in one window is
  // reflected everywhere immediately.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === DEV_MODE_KEY) setDevModeState(readBool(DEV_MODE_KEY));
      if (e.key === CAPTURE_LOGS_KEY) {
        setCaptureLogsState(readBool(CAPTURE_LOGS_KEY));
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setDevMode = useCallback((next: boolean) => {
    setDevModeState(next);
    writeBool(DEV_MODE_KEY, next);
    // Force capture off whenever dev mode flips off — otherwise logs
    // would keep landing in localStorage while the Developer / Logs
    // tabs are hidden.
    if (!next) {
      setCaptureLogsState(false);
      setCaptureEnabled(false);
    }
  }, []);

  const setCaptureLogs = useCallback((next: boolean) => {
    setCaptureLogsState(next);
    // `setCaptureEnabled` handles writing CAPTURE_LOGS_KEY itself.
    setCaptureEnabled(next);
  }, []);

  return { devMode, setDevMode, captureLogs, setCaptureLogs };
}
