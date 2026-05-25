import { describe, expect, it } from "vitest";

import { LATEST_VERSION, migrate } from "../src/data/migrations";

// The v37 → v38 step strips `Settings.columnBorders` — the field was
// added in v37 to gate the unified-table redesign, which was reverted
// before the next release. Run the chain from a v37 fixture that
// carries the field and assert it's gone after migration.
describe("migration v37 → latest (drop columnBorders)", () => {
  it("strips columnBorders from a v37 settings blob", () => {
    const v37 = {
      version: 37,
      settings: {
        startOfMonth: 25,
        columnBorders: true,
        device: { mobile: {}, desktop: {} },
      },
    };
    const result = migrate(v37);
    expect(result.migrated).toBe(true);
    const data = result.data as {
      version: number;
      settings: Record<string, unknown>;
    };
    expect(data.version).toBe(LATEST_VERSION);
    expect("columnBorders" in data.settings).toBe(false);
  });

  it("passes through cleanly when the field was never set", () => {
    const v37 = {
      version: 37,
      settings: {
        startOfMonth: 25,
        device: { mobile: {}, desktop: {} },
      },
    };
    const result = migrate(v37);
    expect(result.migrated).toBe(true);
    const data = result.data as {
      version: number;
      settings: Record<string, unknown>;
    };
    expect(data.version).toBe(LATEST_VERSION);
    expect("columnBorders" in data.settings).toBe(false);
  });
});
