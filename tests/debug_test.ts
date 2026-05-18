import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { debug, isDebugEnabled } from "../src/utils/debug";

// The debug module reads `window.DEBUG` and `localStorage.DEBUG` on
// every call so flipping the flag at runtime in devtools starts
// surfacing events immediately. These tests cover both entry points
// and confirm the gate works correctly when neither is set.

// Same drop-in `localStorage` shim other storage tests use — Vitest
// runs under Node without a DOM by default, so we attach a minimal
// Storage to globalThis to exercise the localStorage branch.
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

// `window` is also absent in Node, but the logger gates on
// `typeof window === "undefined"`. We point it at `globalThis` so
// the flag lookup follows the same code path it would in a browser.
function setWindowDebug(value: unknown): void {
  const g = globalThis as { window?: unknown; DEBUG?: unknown };
  if (!g.window) g.window = g;
  g.DEBUG = value;
}

function clearWindowDebug(): void {
  const g = globalThis as { DEBUG?: unknown };
  delete g.DEBUG;
}

describe("debug logger", () => {
  const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

  beforeEach(() => {
    clearWindowDebug();
    (globalThis as unknown as { localStorage: MemoryStorage }).localStorage =
      new MemoryStorage();
    // Point window at globalThis so the logger's `typeof window` check
    // finds the DEBUG flag we set below.
    (globalThis as { window?: unknown }).window = globalThis;
    logSpy.mockClear();
    warnSpy.mockClear();
    errorSpy.mockClear();
  });

  afterEach(() => {
    clearWindowDebug();
    delete (globalThis as unknown as { localStorage?: MemoryStorage })
      .localStorage;
    delete (globalThis as { window?: unknown }).window;
  });

  it("stays silent when neither window.DEBUG nor localStorage.DEBUG is set", () => {
    expect(isDebugEnabled()).toBe(false);
    const log = debug("scope");
    log.log("anything");
    log.warn("anything");
    log.error("anything");
    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("recognises window.DEBUG = 1 (number)", () => {
    setWindowDebug(1);
    expect(isDebugEnabled()).toBe(true);
    debug("scope").log("hello");
    expect(logSpy).toHaveBeenCalledWith("[budget:scope]", "hello");
  });

  it('recognises window.DEBUG = "1" (string)', () => {
    setWindowDebug("1");
    expect(isDebugEnabled()).toBe(true);
  });

  it("recognises window.DEBUG = true (boolean)", () => {
    setWindowDebug(true);
    expect(isDebugEnabled()).toBe(true);
  });

  it("recognises localStorage.DEBUG = '1'", () => {
    localStorage.setItem("DEBUG", "1");
    expect(isDebugEnabled()).toBe(true);
    debug("scope").warn("uh");
    expect(warnSpy).toHaveBeenCalledWith("[budget:scope]", "uh");
  });

  it("prefixes every line with the scope tag", () => {
    setWindowDebug(1);
    debug("dropbox").log("load start", { rev: "abc" });
    expect(logSpy).toHaveBeenCalledWith("[budget:dropbox]", "load start", {
      rev: "abc",
    });
  });

  it("respects toggle between calls (no compile-time cache)", () => {
    const log = debug("scope");
    log.log("off");
    expect(logSpy).not.toHaveBeenCalled();
    setWindowDebug(1);
    log.log("on");
    expect(logSpy).toHaveBeenCalledTimes(1);
    clearWindowDebug();
    log.log("off again");
    expect(logSpy).toHaveBeenCalledTimes(1);
  });

  it("times async operations and reports duration on success", async () => {
    setWindowDebug(1);
    const log = debug("scope");
    const result = await log.time("op", async () => {
      await new Promise((r) => setTimeout(r, 5));
      return 42;
    });
    expect(result).toBe(42);
    // First call: "op …"; second call: "op ok (<ms>ms)".
    expect(logSpy).toHaveBeenCalledTimes(2);
    expect(logSpy.mock.calls[0][1]).toBe("op …");
    expect(logSpy.mock.calls[1][1]).toMatch(/^op ok \(\d+ms\)$/);
  });

  it("times async operations and reports duration on failure", async () => {
    setWindowDebug(1);
    const log = debug("scope");
    const boom = new Error("nope");
    await expect(
      log.time("op", async () => {
        throw boom;
      }),
    ).rejects.toThrow("nope");
    expect(logSpy).toHaveBeenCalledTimes(2);
    expect(logSpy.mock.calls[1][1]).toMatch(/^op failed \(\d+ms\)$/);
  });

  it("passes through the wrapped fn untouched when DEBUG is off", async () => {
    const log = debug("scope");
    const result = await log.time("op", async () => "ok");
    expect(result).toBe("ok");
    expect(logSpy).not.toHaveBeenCalled();
  });
});
