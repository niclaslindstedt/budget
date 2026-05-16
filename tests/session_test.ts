import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearSession,
  loadSession,
  parseSession,
  saveSession,
  SESSION_TTL_MS,
} from "../src/storage/session";

const SESSION_KEY = "budget.session.v1";

// Minimal sessionStorage shim, mirroring the localStorage shim used in
// users_test / storage_test. Vitest runs under Node, so neither global
// exists by default.
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

describe("parseSession", () => {
  it("returns null for null and empty input", () => {
    expect(parseSession(null)).toBeNull();
    expect(parseSession("")).toBeNull();
  });

  it("returns null for malformed JSON", () => {
    expect(parseSession("{not json")).toBeNull();
  });

  it("returns null for shapes that aren't sessions", () => {
    expect(parseSession(JSON.stringify({ userId: 1 }))).toBeNull();
    expect(
      parseSession(JSON.stringify({ userId: "a", password: "b" })),
    ).toBeNull();
  });

  it("returns null when the session has already expired", () => {
    const raw = JSON.stringify({
      userId: "u",
      password: "pw",
      expiresAt: Date.now() - 1,
    });
    expect(parseSession(raw)).toBeNull();
  });

  it("returns the parsed session when it is still valid", () => {
    const session = {
      userId: "u",
      password: "pw",
      expiresAt: Date.now() + 60_000,
    };
    expect(parseSession(JSON.stringify(session))).toEqual(session);
  });
});

describe("saveSession / loadSession / clearSession", () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
    (
      globalThis as unknown as { sessionStorage: MemoryStorage }
    ).sessionStorage = storage;
  });

  afterEach(() => {
    delete (globalThis as unknown as { sessionStorage?: MemoryStorage })
      .sessionStorage;
    vi.useRealTimers();
  });

  it("round-trips a session and stamps a TTL into the future", () => {
    const before = Date.now();
    const session = saveSession("user-1", "hunter2");
    expect(session.userId).toBe("user-1");
    expect(session.password).toBe("hunter2");
    expect(session.expiresAt).toBeGreaterThanOrEqual(before + SESSION_TTL_MS);
    expect(loadSession()).toEqual(session);
  });

  it("loadSession sweeps an expired payload", () => {
    storage.setItem(
      SESSION_KEY,
      JSON.stringify({
        userId: "u",
        password: "pw",
        expiresAt: Date.now() - 1,
      }),
    );
    expect(loadSession()).toBeNull();
    expect(storage.getItem(SESSION_KEY)).toBeNull();
  });

  it("loadSession sweeps malformed payloads", () => {
    storage.setItem(SESSION_KEY, "not-json");
    expect(loadSession()).toBeNull();
    expect(storage.getItem(SESSION_KEY)).toBeNull();
  });

  it("clearSession removes the key", () => {
    saveSession("user-1", "pw");
    expect(storage.getItem(SESSION_KEY)).not.toBeNull();
    clearSession();
    expect(storage.getItem(SESSION_KEY)).toBeNull();
  });

  it("loadSession returns null after the TTL elapses", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    saveSession("user-1", "pw");
    expect(loadSession()).not.toBeNull();
    vi.setSystemTime(new Date(Date.now() + SESSION_TTL_MS + 1));
    expect(loadSession()).toBeNull();
  });

  it("loadSession tolerates missing sessionStorage", () => {
    delete (globalThis as unknown as { sessionStorage?: MemoryStorage })
      .sessionStorage;
    expect(loadSession()).toBeNull();
  });
});
