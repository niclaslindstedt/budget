import { describe, expect, it } from "vitest";

import { LATEST_VERSION, migrate } from "../src/data/migrations";

// The v65 → v66 step adds the optional `Sheet.favorite` flag. It is
// purely additive — absent ⇒ not favorited — so sheets pass through
// untouched and only the version bumps.
describe("migration v65 → v66 (optional Sheet.favorite)", () => {
  it("bumps the version and leaves sheets untouched", () => {
    const result = migrate({
      version: 65,
      sheets: [
        {
          id: "s1",
          name: "Budget",
          type: "budget",
          glyph: "wallet",
          color: "#abb2bf",
          description: "",
          items: [],
        },
      ],
      activeSheetId: "s1",
      accounts: [],
    });

    expect(result.data.version).toBe(LATEST_VERSION);
    const sheets = result.data.sheets as Array<Record<string, unknown>>;
    expect("favorite" in sheets[0]).toBe(false);
    expect(sheets[0].name).toBe("Budget");
  });
});
