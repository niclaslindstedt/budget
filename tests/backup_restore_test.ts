import { describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS } from "../src/data/constants";
import { LATEST_VERSION } from "../src/data/migrations";
import { createDefaultSheet } from "../src/data/sheet";
import type { UserData } from "../src/data/types";
import type { BackupMetadata, BackupOps } from "../src/storage/adapter";
import { parseUserData, serializeUserData } from "../src/storage/file";

// In-memory stand-in for any `BackupOps` implementation. The cloud and
// folder adapters each ship their own integration tests; this one only
// needs a faithful enough `read()` to feed bytes back into the restore
// pipeline.
function inMemoryBackupOps(): BackupOps {
  const store = new Map<string, { text: string; meta: BackupMetadata }>();
  return {
    async list() {
      return [...store.values()].map((v) => v.meta);
    },
    async create(text, metadata) {
      store.set(metadata.filename, { text, meta: metadata });
    },
    async read(filename) {
      const entry = store.get(filename);
      if (!entry) throw new Error(`Unknown backup: ${filename}`);
      return entry.text;
    },
    async remove(filename) {
      store.delete(filename);
    },
  };
}

// Mirrors what `CloudBackupModal.handleRestore` does once a user picks a
// backup: hand the raw bytes back through `parseUserData`, which is the
// single entry point for migration + validation. The test guards
// against future regressions where the restore path might bypass it.
describe("backup restore — migration pipeline", () => {
  it("migrates an old-version backup payload up to LATEST_VERSION", async () => {
    const ops = inMemoryBackupOps();
    // Bytes-as-stored: a budget written when the app was still on v1.
    // Same shape as the v1 fixture used by the migration tests in
    // storage_test.ts so we exercise the real v1 → latest chain.
    const v1Backup = JSON.stringify({
      version: 1,
      activeSheetId: "s1",
      sheets: [
        {
          id: "s1",
          name: "Legacy",
          openingBalance: 0,
          rows: [],
          columns: [
            { id: "c1", type: "date", label: "Date" },
            { id: "c2", type: "description", label: "Description" },
            { id: "c3", type: "amount", label: "Amount" },
            { id: "c4", type: "balance", label: "Balance" },
            { id: "c5", type: "completed", label: "Done" },
          ],
        },
      ],
    });
    await ops.create(v1Backup, {
      filename: "legacy.json",
      createdAt: 1,
      accountCount: 0,
      entryCount: 0,
    });

    const text = await ops.read("legacy.json");
    const parsed = parseUserData(text);

    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.migrated).toBe(true);
      expect(parsed.data.version).toBe(LATEST_VERSION);
    }
  });

  it("flags a same-version backup as not migrated", async () => {
    const ops = inMemoryBackupOps();
    // A current-version export shouldn't trip the migrated flag —
    // the restore UI only shows the migrated suffix when the backup
    // genuinely came from an older build.
    const accountId = "acct-1";
    const sheet = createDefaultSheet("Tests", accountId);
    const userData: UserData = {
      version: LATEST_VERSION,
      activeSheetId: sheet.id,
      sheets: [sheet],
      accounts: [{ id: accountId, name: "Default" }],
      companies: [],
      categories: [],
      types: [],
      hiddenPresetTypeIds: [],
      hiddenPresetCategoryIds: [],
      transfers: [],
      history: {},
      historyImports: {},
      merchantHints: {},
      recurringDismissals: [],
      transferCollapseDismissals: [],
      matchRules: [],
      seriesMatchRules: [],
      renamePatterns: {},
      seriesMetadata: {},
      settings: { ...DEFAULT_SETTINGS },
    };
    const current = serializeUserData(userData);
    await ops.create(current, {
      filename: "current.json",
      createdAt: 2,
      accountCount: 0,
      entryCount: 0,
    });

    const text = await ops.read("current.json");
    const parsed = parseUserData(text);

    if (!parsed.ok) throw new Error(`Parse failed: ${parsed.error}`);
    expect(parsed.migrated).toBe(false);
    expect(parsed.data.version).toBe(LATEST_VERSION);
  });

  it("rejects a backup from a newer-than-supported version", async () => {
    const ops = inMemoryBackupOps();
    const future = JSON.stringify({
      version: LATEST_VERSION + 1,
      sheets: [],
    });
    await ops.create(future, {
      filename: "future.json",
      createdAt: 3,
      accountCount: 0,
      entryCount: 0,
    });

    const text = await ops.read("future.json");
    const parsed = parseUserData(text);

    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error).toMatch(/newer version/);
    }
  });
});
