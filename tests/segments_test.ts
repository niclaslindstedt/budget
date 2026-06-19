import { describe, expect, it } from "vitest";

import { buildSeedUserData } from "../src/data/dev/seed";
import type { UserData } from "../src/data/types";
import { serializeUserData } from "../src/storage/file";
import { freshUserData } from "../src/storage/local";
import {
  SEGMENT_FIELDS,
  SEGMENT_IDS,
  dirtySegments,
  hashSegment,
  mergeSegments,
  serializeSegment,
  splitUserData,
} from "../src/storage/segments";

describe("segment map", () => {
  it("assigns every UserData field to exactly one segment", () => {
    const seen = new Map<string, number>();
    for (const id of SEGMENT_IDS) {
      for (const key of SEGMENT_FIELDS[id]) {
        seen.set(key, (seen.get(key) ?? 0) + 1);
      }
    }
    // No field assigned twice.
    for (const [key, count] of seen) {
      expect(count, `field ${key} mapped ${count}×`).toBe(1);
    }
    // Every field of a real UserData is covered.
    const fields = Object.keys(freshUserData());
    for (const key of fields) {
      expect(seen.has(key), `field ${key} unmapped`).toBe(true);
    }
    // And the map names nothing that isn't a real field.
    expect(seen.size).toBe(fields.length);
  });
});

describe("splitUserData / mergeSegments", () => {
  it("round-trips a rich budget byte-identically to the whole-blob form", () => {
    const data = buildSeedUserData();
    const merged = mergeSegments(splitUserData(data));
    expect(serializeUserData(merged)).toBe(serializeUserData(data));
  });

  it("round-trips a fresh empty budget", () => {
    const data = freshUserData();
    const merged = mergeSegments(splitUserData(data));
    expect(serializeUserData(merged)).toBe(serializeUserData(data));
  });

  it("references the same sub-objects (no deep copy)", () => {
    const data = buildSeedUserData();
    const parts = splitUserData(data);
    // The load-bearing property behind dirty detection: split must not
    // clone, or every segment would always look changed.
    expect(parts.history.history).toBe(data.history);
    expect(parts.history.historyImports).toBe(data.historyImports);
    expect(parts.core.settings).toBe(data.settings);
    expect(parts.taxonomy.companies).toBe(data.companies);
    expect(parts.sheets.sheets).toBe(data.sheets);
    expect(parts.learned.merchantHints).toBe(data.merchantHints);
  });
});

describe("dirtySegments", () => {
  it("is empty for a shallow clone (all field refs identical)", () => {
    const data = buildSeedUserData();
    expect(dirtySegments(data, { ...data }).size).toBe(0);
  });

  it("flags only the segment whose field reference changed", () => {
    const data = buildSeedUserData();

    const historyChanged: UserData = {
      ...data,
      history: { ...data.history, newAcct: [] },
    };
    expect([...dirtySegments(data, historyChanged)]).toEqual(["history"]);

    const learnedChanged: UserData = {
      ...data,
      merchantHints: { ...data.merchantHints },
    };
    expect([...dirtySegments(data, learnedChanged)]).toEqual(["learned"]);

    const coreChanged: UserData = {
      ...data,
      settings: { ...data.settings },
    };
    expect([...dirtySegments(data, coreChanged)]).toEqual(["core"]);
  });

  it("flags multiple segments when an action touches several", () => {
    // A bank import typically rewrites history AND learns a rename/series
    // rule — both segments go dirty, nothing else.
    const data = buildSeedUserData();
    const next: UserData = {
      ...data,
      history: { ...data.history, acct: [] },
      seriesMatchRules: [...data.seriesMatchRules],
    };
    expect(dirtySegments(data, next)).toEqual(new Set(["history", "learned"]));
  });

  it("flags every segment for a wholesale replacement", () => {
    const data = buildSeedUserData();
    const other = freshUserData();
    expect(dirtySegments(data, other)).toEqual(new Set(SEGMENT_IDS));
  });
});

describe("serializeSegment / hashSegment", () => {
  it("serializes with sorted keys and a trailing newline", () => {
    const text = serializeSegment({ version: 79, activeSheetId: "x" });
    expect(text).toBe('{\n  "activeSheetId": "x",\n  "version": 79\n}\n');
  });

  it("hashes identical content identically and differing content differently", async () => {
    const a = serializeSegment({ history: {} });
    const b = serializeSegment({ history: { acct: [] } });
    expect(await hashSegment(a)).toBe(await hashSegment(a));
    expect(await hashSegment(a)).not.toBe(await hashSegment(b));
    // SHA-256 hex is 64 chars.
    expect(await hashSegment(a)).toHaveLength(64);
  });
});
