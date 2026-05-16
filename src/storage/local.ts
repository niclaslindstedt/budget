import { DEFAULT_SETTINGS } from "../data/constants";
import { createDefaultSheet, newId } from "../data/sheet";
import type { UserData } from "../data/types";
import { parseUserData } from "./file";

export function freshUserData(): UserData {
  const accountId = newId();
  const sheet = createDefaultSheet("Sheet 1", accountId);
  return {
    version: 5,
    sheets: [sheet],
    activeSheetId: sheet.id,
    accounts: [{ id: accountId, name: "Default" }],
    categories: [],
    settings: { ...DEFAULT_SETTINGS },
  };
}

// Pure: given the raw stored text (or null), produce a UserData. Falls
// back to a fresh value on any failure so a corrupt entry never traps
// the user. Consumed by both the local adapter and the storage hook so
// every load path shares the same parse / migrate / validate pipeline.
export function readUserDataFromText(raw: string | null): UserData {
  if (!raw) return freshUserData();
  const result = parseUserData(raw);
  return result.ok ? result.data : freshUserData();
}
