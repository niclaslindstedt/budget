import { describe, expect, it } from "vitest";

import type { Logger } from "../src/utils/logger";
import type { BackupMetadata } from "../src/storage/adapter";
import { createBackupOps, type BackupStore } from "../src/storage/backup-ops";
import {
  BACKUP_INDEX_FILENAME,
  parseBackupIndex,
} from "../src/storage/backup-index";

const noopLogger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  time: async (_label, fn) => fn(),
};

function meta(
  filename: string,
  createdAt: number,
  extra: Partial<BackupMetadata> = {},
): BackupMetadata {
  return { filename, createdAt, accountCount: 1, entryCount: 1, ...extra };
}

// A fake bare-name store (the gdrive / folder convention: keys are the
// filenames themselves, no folder prefix). Records every primitive call
// so the tests can assert the lifecycle drives the right keys.
function fakeStore(prefix = "") {
  const files = new Map<string, string>();
  const calls: string[] = [];
  const store: BackupStore = {
    async readFile(key) {
      calls.push(`read ${key}`);
      return files.get(key) ?? null;
    },
    async writeFile(key, text) {
      calls.push(`write ${key}`);
      files.set(key, text);
    },
    async deleteFile(key) {
      calls.push(`delete ${key}`);
      files.delete(key);
    },
    backupKey: (filename) => `${prefix}${filename}`,
    indexKey: `${prefix}${BACKUP_INDEX_FILENAME}`,
    log: noopLogger,
  };
  return { store, files, calls };
}

describe("createBackupOps", () => {
  it("returns an empty list when no manifest exists", async () => {
    const { store } = fakeStore();
    const ops = createBackupOps(store);
    expect(await ops.list()).toEqual([]);
  });

  it("writes the body then records the entry in the manifest on create", async () => {
    const { store, files } = fakeStore();
    const ops = createBackupOps(store);

    await ops.create("body-bytes", meta("backup-1.json", 1000));

    expect(files.get("backup-1.json")).toBe("body-bytes");
    const index = parseBackupIndex(files.get(BACKUP_INDEX_FILENAME) ?? null);
    expect(index).toEqual([meta("backup-1.json", 1000)]);
  });

  it("prepends new entries and dedupes a re-created filename", async () => {
    const { store } = fakeStore();
    const ops = createBackupOps(store);

    await ops.create("a", meta("a.json", 1000));
    await ops.create("b", meta("b.json", 2000));
    // Re-create a.json with newer bytes + timestamp; the manifest keeps
    // one entry, the latest wins, and list() is newest-first.
    await ops.create("a2", meta("a.json", 3000));

    const list = await ops.list();
    expect(list.map((m) => [m.filename, m.createdAt])).toEqual([
      ["a.json", 3000],
      ["b.json", 2000],
    ]);
  });

  it("reads back the stored body", async () => {
    const { store } = fakeStore();
    const ops = createBackupOps(store);
    await ops.create("the-bytes", meta("x.json", 1000));
    expect(await ops.read("x.json")).toBe("the-bytes");
  });

  it("throws when reading a missing backup", async () => {
    const { store } = fakeStore();
    const ops = createBackupOps(store);
    await expect(ops.read("gone.json")).rejects.toThrow("Backup not found");
  });

  it("removes the body and drops the manifest entry", async () => {
    const { store, files } = fakeStore();
    const ops = createBackupOps(store);
    await ops.create("a", meta("a.json", 1000));
    await ops.create("b", meta("b.json", 2000));

    await ops.remove("a.json");

    expect(files.has("a.json")).toBe(false);
    expect((await ops.list()).map((m) => m.filename)).toEqual(["b.json"]);
  });

  it("still prunes the manifest when the body is already gone", async () => {
    const { store } = fakeStore();
    const ops = createBackupOps(store);
    await ops.create("a", meta("a.json", 1000));
    // deleteFile is a no-op for a missing key; the manifest must still
    // lose the entry.
    await ops.remove("a.json");
    expect(await ops.list()).toEqual([]);
  });

  it("routes every operation through backupKey / indexKey", async () => {
    const { store, calls, files } = fakeStore("backups/");
    const ops = createBackupOps(store);

    await ops.create("body", meta("snap.json", 1000));
    await ops.read("snap.json");
    await ops.remove("snap.json");

    expect(calls).toEqual([
      "write backups/snap.json",
      "read backups/index.json",
      "write backups/index.json",
      "read backups/snap.json",
      "delete backups/snap.json",
      "read backups/index.json",
      "write backups/index.json",
    ]);
    expect(files.size).toBe(1);
    expect([...files.keys()]).toEqual(["backups/index.json"]);
  });
});
