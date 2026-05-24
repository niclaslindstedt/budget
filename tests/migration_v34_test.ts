import { describe, expect, it } from "vitest";

import { LATEST_VERSION, migrate } from "../src/data/migrations";

// The v33 → v34 step is the one that introduced `headerAction`. After
// v35 the field lives inside the device buckets — the v33 fixture
// here still validates the original migration's intent by running
// the chain to its current end (LATEST_VERSION) and asserting
// `headerAction` arrived in both device scopes with the default
// shape.
describe("migration v33 → latest (headerAction)", () => {
  it("seeds the headerAction default into both device buckets", () => {
    const v33 = {
      version: 33,
      settings: {
        startOfMonth: 25,
        theme: "system",
      },
    };
    const result = migrate(v33);
    expect(result.migrated).toBe(true);
    const data = result.data as {
      version: number;
      settings: {
        device: {
          mobile: { headerAction: unknown };
          desktop: { headerAction: unknown };
        };
      };
    };
    expect(data.version).toBe(LATEST_VERSION);
    expect(data.settings.device.mobile.headerAction).toEqual({ kind: "top" });
    expect(data.settings.device.desktop.headerAction).toEqual({ kind: "top" });
  });

  it("preserves existing common-scope settings fields", () => {
    const v33 = {
      version: 33,
      settings: {
        startOfMonth: 1,
        theme: "dracula",
        language: "sv",
        achievements: { foo: 12345 },
        unseenAchievements: ["foo"],
      },
    };
    const result = migrate(v33);
    const data = result.data as { settings: Record<string, unknown> };
    expect(data.settings.startOfMonth).toBe(1);
    expect(data.settings.theme).toBe("dracula");
    expect(data.settings.language).toBe("sv");
    expect(data.settings.achievements).toEqual({ foo: 12345 });
    expect(data.settings.unseenAchievements).toEqual(["foo"]);
  });
});
