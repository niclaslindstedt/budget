import { describe, expect, it } from "vitest";

import { LATEST_VERSION, migrate } from "../src/data/migrations";

// The v61 → v62 step introduces `UserData.properties`, the homes /
// apartments rendered by the new Properties sheet. It's a bare additive
// bump: an old export simply lacks the field and the migration seeds it
// empty.
describe("migration v61 → latest (adds the properties collection)", () => {
  it("seeds an empty properties array and bumps the version", () => {
    const result = migrate({
      version: 61,
      sheets: [{ id: "sh1", items: [], type: "budget" }],
      activeSheetId: "sh1",
      accounts: [],
    });
    expect(result.migrated).toBe(true);
    const data = result.data as { version: number; properties?: unknown[] };
    expect(data.version).toBe(LATEST_VERSION);
    expect(data.properties).toEqual([]);
  });
});
