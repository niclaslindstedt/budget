// Forward-only migration chain for persisted budgets.
//
// Each entry in `migrations` migrates from version `N` to `N+1`. Once a
// migration ships it must never be removed or rewritten — exports in the
// wild still depend on it to upgrade cleanly. To add a new version: bump
// `LATEST_VERSION`, update the `Budget.version` literal in `data/types.ts`,
// and add the next step here.

import { DEFAULT_SETTINGS } from "./constants";
import { newId } from "./sheet";

// Typed as a literal so consumers (like the Budget type) can pin to it.
// When bumping, change BOTH this constant and the `Budget.version` literal
// in `data/types.ts` in the same commit.
export const LATEST_VERSION = 4 as const;

export type Versioned = { version: number; [key: string]: unknown };

const migrations: Record<number, (b: Versioned) => Versioned> = {
  // v1 → v2: introduce categories at the budget level and ensure every
  // sheet has a `category` column, inserted just after the description
  // column so existing rows can be tagged without re-arranging.
  1: (v1) => {
    const sheets = Array.isArray(v1.sheets) ? v1.sheets : [];
    return {
      ...v1,
      version: 2,
      categories: [],
      sheets: sheets.map((raw) => {
        if (typeof raw !== "object" || raw === null) return raw;
        const sheet = raw as { columns?: unknown };
        if (!Array.isArray(sheet.columns)) return sheet;
        const hasCategory = sheet.columns.some(
          (c) =>
            typeof c === "object" &&
            c !== null &&
            (c as { type?: unknown }).type === "category",
        );
        if (hasCategory) return sheet;
        const descIdx = sheet.columns.findIndex(
          (c) =>
            typeof c === "object" &&
            c !== null &&
            (c as { type?: unknown }).type === "description",
        );
        const insertAt = descIdx >= 0 ? descIdx + 1 : sheet.columns.length;
        const newColumn = {
          id: newId(),
          type: "category",
          label: "Category",
        };
        const nextColumns = [...sheet.columns];
        nextColumns.splice(insertAt, 0, newColumn);
        return { ...sheet, columns: nextColumns };
      }),
    };
  },

  // v2 → v3: introduces an optional `seriesId` field on rows so the app
  // can scope "edit / delete future" operations across rows generated
  // from the same recurrence. No row data needs rewriting; bumping the
  // version flags that this build understands the new shape so older
  // builds know not to silently drop unknown fields.
  2: (v2) => ({ ...v2, version: 3 }),

  // v3 → v4: introduces budget-level `settings` covering fiscal-month
  // start, date format, currency, number format, and display toggles.
  // Existing budgets get the canonical defaults so behaviour matches
  // pre-settings builds until the user changes them.
  3: (v3) => ({
    ...v3,
    version: 4,
    settings: { ...DEFAULT_SETTINGS },
  }),
};

export type MigrationResult = {
  budget: Versioned;
  migrated: boolean;
};

export function migrate(raw: Versioned): MigrationResult {
  if (raw.version > LATEST_VERSION) {
    throw new Error(
      `Budget was created by a newer version of the app (v${raw.version}); ` +
        `this build supports up to v${LATEST_VERSION}.`,
    );
  }
  let current = raw;
  let migrated = false;
  while (current.version < LATEST_VERSION) {
    const step = migrations[current.version];
    if (!step) {
      throw new Error(
        `No migration registered from v${current.version} to v${current.version + 1}.`,
      );
    }
    current = step(current);
    migrated = true;
  }
  return { budget: current, migrated };
}
