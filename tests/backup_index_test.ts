import { describe, expect, it } from "vitest";

import {
  parseBackupIndex,
  serializeBackupIndex,
} from "../src/storage/backup-index";

describe("backup index parser", () => {
  it("treats missing / blank input as an empty list", () => {
    expect(parseBackupIndex(null)).toEqual([]);
    expect(parseBackupIndex("")).toEqual([]);
    expect(parseBackupIndex("   ")).toEqual([]);
  });

  it("tolerates malformed JSON without throwing", () => {
    expect(parseBackupIndex("{not json")).toEqual([]);
  });

  it("drops entries that miss required fields", () => {
    const raw = JSON.stringify({
      version: 1,
      entries: [
        {
          filename: "ok.json",
          createdAt: 1700000000000,
          accountCount: 2,
          entryCount: 5,
        },
        { filename: "missing-counts.json", createdAt: 1700000000000 },
        "not an object",
      ],
    });
    const list = parseBackupIndex(raw);
    expect(list).toHaveLength(1);
    expect(list[0].filename).toBe("ok.json");
  });

  it("sorts entries by createdAt descending regardless of input order", () => {
    const raw = JSON.stringify({
      version: 1,
      entries: [
        {
          filename: "old.json",
          createdAt: 1000,
          accountCount: 1,
          entryCount: 1,
        },
        {
          filename: "newest.json",
          createdAt: 3000,
          accountCount: 1,
          entryCount: 1,
        },
        {
          filename: "middle.json",
          createdAt: 2000,
          accountCount: 1,
          entryCount: 1,
        },
      ],
    });
    expect(parseBackupIndex(raw).map((e) => e.filename)).toEqual([
      "newest.json",
      "middle.json",
      "old.json",
    ]);
  });

  it("round-trips through serialize → parse", () => {
    const entries = [
      {
        filename: "a.json",
        createdAt: 1000,
        accountCount: 2,
        entryCount: 10,
        encrypted: true,
      },
      {
        filename: "b.json",
        createdAt: 2000,
        accountCount: 3,
        entryCount: 20,
        autoCreated: true,
      },
    ];
    const text = serializeBackupIndex(entries);
    const parsed = parseBackupIndex(text);
    expect(parsed).toEqual([
      {
        filename: "b.json",
        createdAt: 2000,
        accountCount: 3,
        entryCount: 20,
        autoCreated: true,
      },
      {
        filename: "a.json",
        createdAt: 1000,
        accountCount: 2,
        entryCount: 10,
        encrypted: true,
      },
    ]);
  });
});
