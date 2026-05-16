import { STORAGE_KEY } from "../data/constants";
import { createDefaultSheet } from "../data/sheet";
import type { Budget } from "../data/types";

function freshBudget(): Budget {
  const sheet = createDefaultSheet();
  return { version: 1, sheets: [sheet], activeSheetId: sheet.id };
}

export function loadBudget(): Budget {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return freshBudget();
    const parsed = JSON.parse(raw) as Budget;
    if (
      parsed &&
      parsed.version === 1 &&
      Array.isArray(parsed.sheets) &&
      parsed.sheets.length > 0 &&
      typeof parsed.activeSheetId === "string"
    ) {
      return parsed;
    }
  } catch {
    // fall through
  }
  return freshBudget();
}

export function saveBudget(budget: Budget): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(budget));
  } catch {
    // quota / disabled storage — ignore for now
  }
}
