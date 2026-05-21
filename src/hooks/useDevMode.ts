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
//
// State is owned at module scope with a pub/sub layer so multiple
// instances of the hook in the same tab stay in sync — flipping the
// toggle in the General tab needs to update SettingsModal's tab list
// in the same render, not on the next reload. (The browser only fires
// the `storage` event in *other* tabs, so cross-component same-tab
// sync would otherwise be silently broken.)

import { useEffect, useState } from "react";

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

let devModeState = readBool(DEV_MODE_KEY);
let captureLogsState = readBool(CAPTURE_LOGS_KEY);
const subscribers = new Set<() => void>();

function notify(): void {
  for (const cb of subscribers) {
    try {
      cb();
    } catch {
      // Subscriber errors must not break the dispatch loop.
    }
  }
}

function setDevModeGlobal(next: boolean): void {
  if (devModeState !== next) {
    devModeState = next;
    writeBool(DEV_MODE_KEY, next);
  }
  // Force capture off whenever dev mode flips off — otherwise logs
  // would keep landing in localStorage while the Developer / Logs
  // tabs are hidden.
  if (!next && captureLogsState) {
    captureLogsState = false;
    setCaptureEnabled(false);
  }
  notify();
}

function setCaptureLogsGlobal(next: boolean): void {
  if (captureLogsState === next) return;
  captureLogsState = next;
  // `setCaptureEnabled` handles writing CAPTURE_LOGS_KEY itself.
  setCaptureEnabled(next);
  notify();
}

// Pick up writes from other tabs once, at module load, so a toggle in
// one window propagates to every open tab. Per-hook subscriptions
// then fan the change out to React.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === DEV_MODE_KEY) {
      const next = readBool(DEV_MODE_KEY);
      if (next !== devModeState) {
        devModeState = next;
        if (!next && captureLogsState) {
          captureLogsState = false;
          setCaptureEnabled(false);
        }
        notify();
      }
    }
    if (e.key === CAPTURE_LOGS_KEY) {
      const next = readBool(CAPTURE_LOGS_KEY);
      if (next !== captureLogsState) {
        captureLogsState = next;
        notify();
      }
    }
  });
}

export function useDevMode(): {
  devMode: boolean;
  setDevMode: (next: boolean) => void;
  captureLogs: boolean;
  setCaptureLogs: (next: boolean) => void;
} {
  const [, force] = useState(0);

  useEffect(() => {
    const cb = () => force((v) => v + 1);
    subscribers.add(cb);
    return () => {
      subscribers.delete(cb);
    };
  }, []);

  return {
    devMode: devModeState,
    setDevMode: setDevModeGlobal,
    captureLogs: captureLogsState,
    setCaptureLogs: setCaptureLogsGlobal,
  };
}
