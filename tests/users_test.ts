import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { USERS_KEY } from "../src/data/constants";
import {
  clearUsersFile,
  createUser,
  findUserByUsername,
  loadUsersFile,
  normalizeUsername,
  parseUsersFile,
  saveUsersFile,
  verifyPassword,
} from "../src/storage/users";

// Same minimal localStorage shim the adapter tests use. Vitest runs
// under Node, which has no DOM by default — so the registry's `typeof
// localStorage === "undefined"` branch would otherwise be the only
// one exercised.
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

describe("createUser / verifyPassword", () => {
  it("produces a hash that verifies with the original password", async () => {
    const user = await createUser("Alice", "correct horse battery staple");
    expect(await verifyPassword(user, "correct horse battery staple")).toBe(
      true,
    );
  }, 30_000);

  it("rejects the wrong password", async () => {
    const user = await createUser("Bob", "right-password");
    expect(await verifyPassword(user, "wrong-password")).toBe(false);
  }, 30_000);

  it("uses a fresh salt for each user so identical passwords hash differently", async () => {
    const a = await createUser("a", "same-password");
    const b = await createUser("b", "same-password");
    expect(a.passwordSalt).not.toBe(b.passwordSalt);
    expect(a.passwordHash).not.toBe(b.passwordHash);
  }, 30_000);

  it("rejects empty username", async () => {
    await expect(createUser("   ", "password123")).rejects.toThrow(/Username/);
  });

  it("rejects empty password", async () => {
    await expect(createUser("alice", "")).rejects.toThrow(/Password/);
  });
});

describe("normalizeUsername / findUserByUsername", () => {
  it("matches case- and whitespace-insensitively", async () => {
    const user = await createUser("Alice", "pw-12345");
    expect(findUserByUsername([user], "ALICE")).toBe(user);
    expect(findUserByUsername([user], "  alice  ")).toBe(user);
    expect(normalizeUsername("  Alice  ")).toBe("alice");
  });

  it("returns undefined when no user matches", async () => {
    const user = await createUser("alice", "pw-12345");
    expect(findUserByUsername([user], "bob")).toBeUndefined();
  });
});

describe("parseUsersFile", () => {
  it("returns an empty registry for null", () => {
    expect(parseUsersFile(null)).toEqual({
      version: 1,
      users: [],
      activeUserId: null,
    });
  });

  it("returns an empty registry for malformed JSON", () => {
    expect(parseUsersFile("{not json")).toEqual({
      version: 1,
      users: [],
      activeUserId: null,
    });
  });

  it("drops users that don't look like StoredUser records", () => {
    const raw = JSON.stringify({
      users: [
        { id: "a", username: "x" }, // missing fields
        {
          id: "b",
          username: "y",
          passwordHash: "h",
          passwordSalt: "s",
          iterations: 1,
          hash: "SHA-256",
          createdAt: 0,
        },
      ],
      activeUserId: "b",
    });
    const file = parseUsersFile(raw);
    expect(file.users).toHaveLength(1);
    expect(file.users[0].id).toBe("b");
    expect(file.activeUserId).toBe("b");
  });

  it("nulls activeUserId when it does not match a known user", () => {
    const raw = JSON.stringify({
      users: [
        {
          id: "a",
          username: "x",
          passwordHash: "h",
          passwordSalt: "s",
          iterations: 1,
          hash: "SHA-256",
          createdAt: 0,
        },
      ],
      activeUserId: "missing",
    });
    expect(parseUsersFile(raw).activeUserId).toBeNull();
  });
});

describe("loadUsersFile / saveUsersFile / clearUsersFile", () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
    (globalThis as unknown as { localStorage: MemoryStorage }).localStorage =
      storage;
  });

  afterEach(() => {
    delete (globalThis as unknown as { localStorage?: MemoryStorage })
      .localStorage;
  });

  it("round-trips a registry through save + load", async () => {
    const user = await createUser("alice", "pw-12345");
    saveUsersFile({ version: 1, users: [user], activeUserId: user.id });
    expect(storage.getItem(USERS_KEY)).not.toBeNull();
    const loaded = loadUsersFile();
    expect(loaded.users).toHaveLength(1);
    expect(loaded.users[0]).toEqual(user);
    expect(loaded.activeUserId).toBe(user.id);
  }, 30_000);

  it("clearUsersFile removes the registry key", async () => {
    saveUsersFile({
      version: 1,
      users: [
        {
          id: "x",
          username: "x",
          passwordHash: "h",
          passwordSalt: "s",
          iterations: 1,
          hash: "SHA-256",
          createdAt: 0,
        },
      ],
      activeUserId: "x",
    });
    expect(storage.getItem(USERS_KEY)).not.toBeNull();
    clearUsersFile();
    expect(storage.getItem(USERS_KEY)).toBeNull();
  });

  it("loadUsersFile tolerates missing localStorage", () => {
    delete (globalThis as unknown as { localStorage?: MemoryStorage })
      .localStorage;
    expect(loadUsersFile()).toEqual({
      version: 1,
      users: [],
      activeUserId: null,
    });
  });
});
