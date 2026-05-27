// In-app logger replacing the legacy `debug.ts` module. Every call
// pushes an entry into a bounded in-memory ring buffer; when "Capture
// logs" is enabled in the Developer settings tab, the buffer is also
// mirrored to localStorage so a reload preserves the history. The
// Logs settings tab reads from the same buffer and subscribes to
// updates so entries appear live.
//
// Deliberately writes to NO console sink — the local-first app runs in
// a browser tab where the user can't always reach devtools (notably on
// mobile). All diagnostics flow through the in-app surface instead.
//
// Usage:
//
//   import { createLogger } from "../utils/logger";
//   const log = createLogger("dropbox");
//   log.info("load start");
//   log.warn("token expiring");
//   log.error("save failed", err);
//   await log.time("load", () => fetch(...));
//
// `time(label, fn)` emits a start + end pair (with millisecond
// duration) at info level, or info + error on a thrown rejection. The
// wrapped fn always runs.

import { CAPTURE_LOGS_KEY, LOGS_KEY, MAX_LOG_ENTRIES } from "../data/constants";
import { IS_PREVIEW } from "./build-env";
import { safeJsonParse } from "./json";

export type LogLevel = "info" | "warn" | "error";

export type LogEntry = {
  ts: number;
  level: LogLevel;
  scope: string;
  message: string;
};

export type Logger = {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  time: <T>(label: string, fn: () => Promise<T>) => Promise<T>;
};

// In-memory ring buffer. Always written to, regardless of capture
// state — the cost is one push + a possible shift, bounded at
// MAX_LOG_ENTRIES, so the memory footprint is predictable. The
// localStorage mirror is the part gated by the capture flag.
const buffer: LogEntry[] = [];
const subscribers = new Set<() => void>();
let captureEnabled = readCaptureFlag();
let saveTimer: ReturnType<typeof setTimeout> | null = null;

// Debounce localStorage writes so a burst of logs doesn't thrash the
// disk. A quarter-second is short enough that a Logs-tab user
// observing live updates won't notice the lag.
const SAVE_DEBOUNCE_MS = 250;

function safeReadLocal(key: string): string | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeWriteLocal(key: string, value: string): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(key, value);
  } catch {
    // Quota or access errors shouldn't break the app; the logger is a
    // best-effort sink.
  }
}

function safeRemoveLocal(key: string): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.removeItem(key);
  } catch {
    // Same as above.
  }
}

function readCaptureFlag(): boolean {
  // Capture is preview-only — the Developer surface that toggles it
  // is hidden in production. A stale "true" from an older build must
  // not keep the production logger persisting silently.
  if (!IS_PREVIEW) return false;
  return safeReadLocal(CAPTURE_LOGS_KEY) === "true";
}

function isLogEntry(v: unknown): v is LogEntry {
  if (typeof v !== "object" || v === null) return false;
  const e = v as Record<string, unknown>;
  return (
    typeof e.ts === "number" &&
    (e.level === "info" || e.level === "warn" || e.level === "error") &&
    typeof e.scope === "string" &&
    typeof e.message === "string"
  );
}

// Render an Error for the log buffer. Always leads with
// `name: message` and appends the stack when one's available —
// Safari / iOS Safari format `err.stack` as bare frames (no
// leading `Error: <message>` line), so naively falling back to
// `err.stack` swallows the message and leaves only a file:line
// location. That made the GIS-popup network failure look like
// `oauth(gdrive): popup failed @.../index.js:751:2079` with no
// hint about the cause.
function describeError(err: Error): string {
  const head = err.message ? `${err.name}: ${err.message}` : err.name;
  if (!err.stack) return head;
  return err.stack.startsWith(err.name) ? err.stack : `${head}\n${err.stack}`;
}

// Serializer for log payloads. Handles Errors (full stack + message),
// cycles, bigints, and functions — anything JSON can't round-trip on
// its own.
function safeStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  try {
    const out = JSON.stringify(value, (_key, v: unknown) => {
      if (v instanceof Error) {
        return describeError(v);
      }
      if (typeof v === "object" && v !== null) {
        if (seen.has(v as object)) return "[Circular]";
        seen.add(v as object);
      }
      if (typeof v === "bigint") return v.toString();
      if (typeof v === "function") {
        return `[function ${(v as { name?: string }).name || "anonymous"}]`;
      }
      if (typeof v === "undefined") return "undefined";
      return v;
    });
    return out ?? "undefined";
  } catch {
    return String(value);
  }
}

function formatMessage(args: unknown[]): string {
  return args
    .map((a) => {
      if (typeof a === "string") return a;
      if (a instanceof Error) return describeError(a);
      return safeStringify(a);
    })
    .join(" ");
}

function scheduleSave(): void {
  if (!captureEnabled) return;
  if (saveTimer !== null) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    flushToStorage();
  }, SAVE_DEBOUNCE_MS);
}

function flushToStorage(): void {
  if (!captureEnabled) return;
  safeWriteLocal(LOGS_KEY, JSON.stringify(buffer));
}

function notify(): void {
  for (const cb of subscribers) {
    try {
      cb();
    } catch {
      // Subscriber errors must not break the logger.
    }
  }
}

function push(level: LogLevel, scope: string, args: unknown[]): void {
  const entry: LogEntry = {
    ts: Date.now(),
    level,
    scope,
    message: formatMessage(args),
  };
  buffer.push(entry);
  if (buffer.length > MAX_LOG_ENTRIES) {
    buffer.splice(0, buffer.length - MAX_LOG_ENTRIES);
  }
  scheduleSave();
  notify();
}

export function createLogger(scope: string): Logger {
  return {
    info(...args) {
      push("info", scope, args);
    },
    warn(...args) {
      push("warn", scope, args);
    },
    error(...args) {
      push("error", scope, args);
    },
    async time(label, fn) {
      const start = performance.now();
      push("info", scope, [`${label} …`]);
      try {
        const result = await fn();
        const ms = (performance.now() - start).toFixed(0);
        push("info", scope, [`${label} ok (${ms}ms)`]);
        return result;
      } catch (err) {
        const ms = (performance.now() - start).toFixed(0);
        push("error", scope, [`${label} failed (${ms}ms)`, err]);
        throw err;
      }
    },
  };
}

export function setCaptureEnabled(enabled: boolean): void {
  if (captureEnabled === enabled) return;
  captureEnabled = enabled;
  if (enabled) {
    safeWriteLocal(CAPTURE_LOGS_KEY, "true");
    // Persist whatever's currently in the buffer so the user gets the
    // recent ring-buffer history (typically empty on first enable, but
    // a no-op if it is).
    flushToStorage();
  } else {
    safeRemoveLocal(CAPTURE_LOGS_KEY);
    // Cancel any pending debounced write so we don't re-persist after
    // the flag flips off.
    if (saveTimer !== null) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    // Leave LOGS_KEY in place. Re-enabling capture should restore the
    // previous list; use clearLogs() to wipe explicitly.
  }
}

export function isCaptureEnabled(): boolean {
  return captureEnabled;
}

export function getLogs(): LogEntry[] {
  return buffer.slice();
}

export function clearLogs(): void {
  buffer.length = 0;
  safeRemoveLocal(LOGS_KEY);
  if (saveTimer !== null) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  notify();
}

export function subscribeToLogs(cb: () => void): () => void {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}

// Side-effect on first import: rehydrate the ring buffer from
// localStorage. Best-effort — a corrupt entry is dropped rather than
// failing the whole load. Runs once because module bodies are
// cached.
(function rehydrate(): void {
  const parsed = safeJsonParse(safeReadLocal(LOGS_KEY));
  if (!Array.isArray(parsed)) return;
  for (const item of parsed) {
    if (isLogEntry(item)) buffer.push(item);
  }
  if (buffer.length > MAX_LOG_ENTRIES) {
    buffer.splice(0, buffer.length - MAX_LOG_ENTRIES);
  }
})();
