import { STORAGE_KEY } from "../data/constants";
import { createDefaultSheet } from "../data/sheet";
import type { Budget } from "../data/types";
import { parseBudget } from "./file";

export function freshBudget(): Budget {
  const sheet = createDefaultSheet();
  return {
    version: 2,
    sheets: [sheet],
    activeSheetId: sheet.id,
    categories: [],
  };
}

// Pure: given the raw stored text (or null), produce a Budget. Falls back
// to a fresh budget on any failure so a corrupt entry never traps the
// user. Extracted from `loadBudget` so it is testable without a DOM.
export function readBudgetFromText(raw: string | null): Budget {
  if (!raw) return freshBudget();
  const result = parseBudget(raw);
  return result.ok ? result.budget : freshBudget();
}

export function loadBudget(): Budget {
  let raw: string | null = null;
  try {
    raw =
      typeof localStorage === "undefined"
        ? null
        : localStorage.getItem(STORAGE_KEY);
  } catch {
    // disabled / blocked storage
  }
  return readBudgetFromText(raw);
}

export function saveBudget(budget: Budget): void {
  try {
    if (typeof localStorage === "undefined") return;
    // Compact JSON for the localStorage entry — these strings aren't
    // human-read. File export uses the pretty + stable form from file.ts.
    localStorage.setItem(STORAGE_KEY, JSON.stringify(budget));
  } catch {
    // quota / disabled — silent fail; a future surface could notify the user
  }
}
