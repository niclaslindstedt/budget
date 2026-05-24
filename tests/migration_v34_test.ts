import { describe, expect, it } from "vitest";

import { migrate } from "../src/data/migrations";

describe("migration v33 → v34", () => {
  it("seeds the headerAction default", () => {
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
      settings: { headerAction: unknown };
    };
    expect(data.version).toBe(34);
    expect(data.settings.headerAction).toEqual({ kind: "top" });
  });

  it("preserves existing settings fields", () => {
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
