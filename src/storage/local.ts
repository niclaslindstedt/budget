import { DEFAULT_SETTINGS } from "../data/constants";
import { createDefaultSheet } from "../data/sheet";
import type { Budget } from "../data/types";
import { parseBudget } from "./file";

export function freshBudget(): Budget {
  const sheet = createDefaultSheet();
  return {
    version: 4,
    sheets: [sheet],
    activeSheetId: sheet.id,
    categories: [],
    settings: { ...DEFAULT_SETTINGS },
  };
}

// Pure: given the raw stored text (or null), produce a Budget. Falls back
// to a fresh budget on any failure so a corrupt entry never traps the
// user. Consumed by both the local adapter and the storage hook so every
// load path shares the same parse / migrate / validate pipeline.
export function readBudgetFromText(raw: string | null): Budget {
  if (!raw) return freshBudget();
  const result = parseBudget(raw);
  return result.ok ? result.budget : freshBudget();
}
