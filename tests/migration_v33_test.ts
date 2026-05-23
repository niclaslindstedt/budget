import { describe, expect, it } from "vitest";

import { migrate } from "../src/data/migrations";

describe("migration v32 → v33", () => {
  it("initializes empty achievements and unseenAchievements", () => {
    const v32 = {
      version: 32,
      settings: {
        startOfMonth: 25,
        theme: "system",
      },
    };
    const result = migrate(v32);
    expect(result.migrated).toBe(true);
    const data = result.data as {
      version: number;
      settings: { achievements: unknown; unseenAchievements: unknown };
    };
    expect(data.version).toBe(33);
    expect(data.settings.achievements).toEqual({});
    expect(data.settings.unseenAchievements).toEqual([]);
  });

  it("preserves existing settings fields", () => {
    const v32 = {
      version: 32,
      settings: {
        startOfMonth: 1,
        theme: "dracula",
        language: "sv",
      },
    };
    const result = migrate(v32);
    const data = result.data as { settings: Record<string, unknown> };
    expect(data.settings.startOfMonth).toBe(1);
    expect(data.settings.theme).toBe("dracula");
    expect(data.settings.language).toBe("sv");
  });
});
