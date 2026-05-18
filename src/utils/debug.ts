// Gated console logger for low-level diagnostics. Off by default —
// the app is local-first and a permanent console stream would be
// noisy in the browser. Turn it on from devtools:
//
//   window.DEBUG = 1            // current tab only
//   localStorage.DEBUG = "1"    // survives reloads, all tabs
//
// Either form is recognised on every log call, so flipping the flag
// at any point starts surfacing events immediately without a reload.
// `localStorage.removeItem("DEBUG")` (or `delete window.DEBUG`) turns
// it back off.
//
// Usage in modules:
//
//   import { debug } from "../utils/debug";
//   const log = debug("dropbox");
//   log.log("load start");
//   await log.time("load", () => fetch(...));
//
// Every line is prefixed with `[budget:<scope>]` so logs from
// different subsystems are easy to grep.

function readWindowFlag(): boolean {
  if (typeof window === "undefined") return false;
  const value = (window as Window & { DEBUG?: unknown }).DEBUG;
  return (
    value === 1 ||
    value === "1" ||
    value === true ||
    value === "true" ||
    value === "on"
  );
}

function readStorageFlag(): boolean {
  try {
    if (typeof localStorage === "undefined") return false;
    const value = localStorage.getItem("DEBUG");
    return value === "1" || value === "true" || value === "on";
  } catch {
    return false;
  }
}

export function isDebugEnabled(): boolean {
  return readWindowFlag() || readStorageFlag();
}

export type DebugLogger = {
  log: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  enabled: () => boolean;
  // Wrap an async operation with start/end logs and a millisecond
  // duration. The wrapped fn still runs when DEBUG is off — the
  // timing wrapper just collapses to a passthrough.
  time: <T>(label: string, fn: () => Promise<T>) => Promise<T>;
};

export function debug(scope: string): DebugLogger {
  const prefix = `[budget:${scope}]`;
  return {
    enabled: isDebugEnabled,
    log(...args) {
      if (isDebugEnabled()) console.log(prefix, ...args);
    },
    warn(...args) {
      if (isDebugEnabled()) console.warn(prefix, ...args);
    },
    error(...args) {
      if (isDebugEnabled()) console.error(prefix, ...args);
    },
    async time(label, fn) {
      if (!isDebugEnabled()) return fn();
      const start = performance.now();
      console.log(prefix, `${label} …`);
      try {
        const result = await fn();
        const ms = (performance.now() - start).toFixed(0);
        console.log(prefix, `${label} ok (${ms}ms)`);
        return result;
      } catch (err) {
        const ms = (performance.now() - start).toFixed(0);
        console.log(prefix, `${label} failed (${ms}ms)`, err);
        throw err;
      }
    },
  };
}

// Announce the DEBUG entry point exactly once at boot so a user
// reaching for the console after something misbehaves sees the hint
// without us spamming the log on every render. Idempotent — safe to
// call from `main.tsx` regardless of how many roots exist.
let announced = false;
export function announceDebugHint(): void {
  if (announced) return;
  announced = true;
  if (typeof window === "undefined") return;
  if (isDebugEnabled()) {
    console.log(
      "[budget] DEBUG enabled — verbose storage / cloud logging is on. " +
        "Disable with `delete window.DEBUG; localStorage.removeItem('DEBUG')` then reload.",
    );
    return;
  }
  console.log(
    "[budget] Tip: set `window.DEBUG = 1` (this tab) or " +
      "`localStorage.DEBUG = '1'` (persisted) and reload to surface " +
      "verbose storage / cloud logs.",
  );
}
