import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The logger module captures entries into an in-memory ring buffer
// and mirrors them to localStorage when "Capture logs" is on. These
// tests cover the buffer mechanics, the capture toggle, the ring-
// buffer cap, the subscriber notifications, and the time() wrapper.
// Importantly, the module must never write to console — the whole
// reason for the rewrite was to surface logs in-app instead.

// Minimal localStorage shim — Vitest runs under Node without a DOM
// by default. The logger gates on `typeof localStorage === "undefined"`
// so we attach a Storage-like object to globalThis.
class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) as string) : null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
}

// Dynamic import inside a helper so each test gets a fresh module
// instance (with empty buffer and freshly-read capture flag) via
// `vi.resetModules`.
async function loadLogger(): Promise<typeof import("../src/utils/logger")> {
  return await import("../src/utils/logger");
}

describe("logger", () => {
  const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

  beforeEach(() => {
    (globalThis as unknown as { localStorage: MemoryStorage }).localStorage =
      new MemoryStorage();
    logSpy.mockClear();
    warnSpy.mockClear();
    errorSpy.mockClear();
    vi.resetModules();
  });

  afterEach(() => {
    delete (globalThis as unknown as { localStorage?: MemoryStorage })
      .localStorage;
  });

  it("captures entries to the in-memory buffer regardless of capture flag", async () => {
    const { createLogger, getLogs } = await loadLogger();
    const log = createLogger("scope");
    log.info("hello");
    log.warn("careful");
    log.error("broken");
    const entries = getLogs();
    expect(entries.map((e) => e.level)).toEqual(["info", "warn", "error"]);
    expect(entries.map((e) => e.scope)).toEqual(["scope", "scope", "scope"]);
    expect(entries.map((e) => e.message)).toEqual([
      "hello",
      "careful",
      "broken",
    ]);
  });

  it("never writes to console", async () => {
    const { createLogger } = await loadLogger();
    const log = createLogger("scope");
    log.info("hello", { obj: 1 });
    log.warn("warn");
    log.error("err", new Error("boom"));
    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("does not persist to localStorage when capture is off", async () => {
    const { createLogger } = await loadLogger();
    createLogger("scope").info("hello");
    // Wait past the debounce so any pending write would have fired.
    await new Promise((r) => setTimeout(r, 350));
    expect(localStorage.getItem("budget.logs")).toBeNull();
  });

  it("persists to localStorage when capture is enabled", async () => {
    const { createLogger, setCaptureEnabled } = await loadLogger();
    setCaptureEnabled(true);
    createLogger("scope").info("hello");
    // Wait past the 250ms save debounce.
    await new Promise((r) => setTimeout(r, 350));
    const raw = localStorage.getItem("budget.logs");
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw as string);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].message).toBe("hello");
    expect(localStorage.getItem("budget.captureLogs")).toBe("true");
  });

  it("stops persisting when capture is turned off, leaving prior logs in storage", async () => {
    const { createLogger, setCaptureEnabled } = await loadLogger();
    setCaptureEnabled(true);
    const log = createLogger("scope");
    log.info("first");
    await new Promise((r) => setTimeout(r, 350));
    expect(
      JSON.parse(localStorage.getItem("budget.logs") as string),
    ).toHaveLength(1);
    setCaptureEnabled(false);
    // CAPTURE_LOGS_KEY cleared; LOGS_KEY left in place.
    expect(localStorage.getItem("budget.captureLogs")).toBeNull();
    expect(localStorage.getItem("budget.logs")).not.toBeNull();
    log.info("second");
    await new Promise((r) => setTimeout(r, 350));
    // No new write happened.
    const parsed = JSON.parse(localStorage.getItem("budget.logs") as string);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].message).toBe("first");
  });

  it("clearLogs empties the buffer and removes the localStorage entry", async () => {
    const { createLogger, clearLogs, getLogs, setCaptureEnabled } =
      await loadLogger();
    setCaptureEnabled(true);
    createLogger("scope").info("hi");
    await new Promise((r) => setTimeout(r, 350));
    expect(localStorage.getItem("budget.logs")).not.toBeNull();
    clearLogs();
    expect(getLogs()).toEqual([]);
    expect(localStorage.getItem("budget.logs")).toBeNull();
  });

  it("caps the buffer at the ring-buffer limit", async () => {
    const { createLogger, getLogs } = await loadLogger();
    const { MAX_LOG_ENTRIES } = await import("../src/data/constants");
    const log = createLogger("scope");
    // Push more than the cap; the oldest entries should fall off.
    for (let i = 0; i < MAX_LOG_ENTRIES + 50; i += 1) {
      log.info(`entry-${i}`);
    }
    const entries = getLogs();
    expect(entries).toHaveLength(MAX_LOG_ENTRIES);
    // First retained entry is the (50+1)-th original push (0-indexed
    // entry-50).
    expect(entries[0].message).toBe("entry-50");
    expect(entries[entries.length - 1].message).toBe(
      `entry-${MAX_LOG_ENTRIES + 49}`,
    );
  });

  it("rehydrates the buffer from localStorage on first import", async () => {
    // Pre-populate localStorage so the side-effect rehydrate picks
    // entries up on the first import inside this test.
    const preloaded = [
      { ts: 1, level: "info", scope: "x", message: "pre-1" },
      { ts: 2, level: "warn", scope: "x", message: "pre-2" },
    ];
    localStorage.setItem("budget.logs", JSON.stringify(preloaded));
    const { getLogs } = await loadLogger();
    const entries = getLogs();
    expect(entries.map((e) => e.message)).toEqual(["pre-1", "pre-2"]);
  });

  it("notifies subscribers on push and clear", async () => {
    const { createLogger, clearLogs, subscribeToLogs } = await loadLogger();
    const cb = vi.fn();
    const off = subscribeToLogs(cb);
    createLogger("scope").info("hi");
    expect(cb).toHaveBeenCalledTimes(1);
    clearLogs();
    expect(cb).toHaveBeenCalledTimes(2);
    off();
    createLogger("scope").info("ignored");
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("serializes Errors with their stack", async () => {
    const { createLogger, getLogs } = await loadLogger();
    const log = createLogger("scope");
    const err = new Error("boom");
    log.error("failure", err);
    const entries = getLogs();
    expect(entries[0].message).toContain("failure");
    expect(entries[0].message).toContain("Error: boom");
  });

  it("times async operations and emits start + ok entries on success", async () => {
    const { createLogger, getLogs } = await loadLogger();
    const log = createLogger("scope");
    const result = await log.time("op", async () => {
      await new Promise((r) => setTimeout(r, 5));
      return 42;
    });
    expect(result).toBe(42);
    const entries = getLogs();
    expect(entries).toHaveLength(2);
    expect(entries[0].message).toBe("op …");
    expect(entries[1].message).toMatch(/^op ok \(\d+ms\)$/);
    expect(entries[0].level).toBe("info");
    expect(entries[1].level).toBe("info");
  });

  it("times async operations and emits start + failed entries on rejection", async () => {
    const { createLogger, getLogs } = await loadLogger();
    const log = createLogger("scope");
    const boom = new Error("nope");
    await expect(
      log.time("op", async () => {
        throw boom;
      }),
    ).rejects.toThrow("nope");
    const entries = getLogs();
    expect(entries).toHaveLength(2);
    expect(entries[1].level).toBe("error");
    expect(entries[1].message).toMatch(/^op failed \(\d+ms\)/);
  });
});
