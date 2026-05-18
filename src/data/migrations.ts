// Forward-only migration chain for persisted UserData blobs.
//
// Each entry in `migrations` migrates from version `N` to `N+1`. Once a
// migration ships it must never be removed or rewritten — exports in the
// wild still depend on it to upgrade cleanly. To add a new version: bump
// `LATEST_VERSION`, update the `UserData.version` literal in `data/types.ts`,
// and add the next step here.

import {
  createSeedEntryTypes,
  DEFAULT_SETTINGS,
  DEFAULT_SHEET_COLOR,
  DEFAULT_SHEET_GLYPH,
} from "./constants";
import { newId } from "./sheet";

// Typed as a literal so consumers (like the UserData type) can pin to it.
// When bumping, change BOTH this constant and the `UserData.version` literal
// in `data/types.ts` in the same commit.
export const LATEST_VERSION = 15 as const;

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

  // v4 → v5: introduces explicit Accounts and turns each Sheet into a
  // container of typed items. Pre-v5 sheets carried their columns and
  // rows directly; in v5 those become the body of one `AccountBudget`
  // item that points at a freshly minted default Account. The shape
  // supports future SheetItem variants (graphs, notes, etc.) without
  // another migration.
  4: (v4) => {
    const defaultAccountId = newId();
    const sheets = Array.isArray(v4.sheets) ? v4.sheets : [];
    return {
      ...v4,
      version: 5,
      accounts: [{ id: defaultAccountId, name: "Default" }],
      sheets: sheets.map((raw) => {
        if (typeof raw !== "object" || raw === null) return raw;
        const sheet = raw as {
          id?: unknown;
          name?: unknown;
          columns?: unknown;
          rows?: unknown;
        };
        const columns = Array.isArray(sheet.columns) ? sheet.columns : [];
        const rows = Array.isArray(sheet.rows) ? sheet.rows : [];
        return {
          id: sheet.id,
          name: sheet.name,
          items: [
            {
              id: newId(),
              type: "accountBudget",
              accountId: defaultAccountId,
              columns,
              rows,
            },
          ],
        };
      }),
    };
  },

  // v5 → v6: `AccountBudget.accountId` widens from `string` to
  // `string | null` so a budget can exist without being tied to an
  // account, and `accounts` may now be empty. Existing string ids
  // remain valid — the migration is a bare version bump and the
  // type widening is backward-compatible on disk.
  5: (v5) => ({ ...v5, version: 6 }),

  // v6 → v7: introduces sheet metadata (`type`, `glyph`, `color`,
  // `description`) so users can run multiple named, colour-coded
  // sheets side by side and pick between them from the bottom tab
  // bar. Existing sheets get the canonical defaults so they keep
  // working unchanged until the user edits them.
  6: (v6) => {
    const sheets = Array.isArray(v6.sheets) ? v6.sheets : [];
    return {
      ...v6,
      version: 7,
      sheets: sheets.map((raw) => {
        if (typeof raw !== "object" || raw === null) return raw;
        const sheet = raw as Record<string, unknown>;
        return {
          ...sheet,
          type: typeof sheet.type === "string" ? sheet.type : "budget",
          glyph:
            typeof sheet.glyph === "string" ? sheet.glyph : DEFAULT_SHEET_GLYPH,
          color:
            typeof sheet.color === "string" && sheet.color.length > 0
              ? sheet.color
              : DEFAULT_SHEET_COLOR,
          description:
            typeof sheet.description === "string" ? sheet.description : "",
        };
      }),
    };
  },

  // v7 → v8: introduces an optional `glyph` field on rows so a
  // recurring entry can carry a custom icon shown in the description
  // cell (and replacing the mobile ellipsis trigger). No row data
  // needs rewriting; bumping the version flags that this build
  // understands the new shape so older builds know not to silently
  // drop the field.
  7: (v7) => ({ ...v7, version: 8 }),

  // v8 → v9: introduces top-level `transactions` (transfers between
  // accounts) and the "accounts" sheet flavour with its `AccountsView`
  // item variant. Accounts also gain optional bank-detail metadata
  // (description, glyph, color, bank, clearing, accountNumber, iban,
  // bic, currency). Existing data needs no rewrite: the migration is
  // a bare version bump plus an empty `transactions` array, and every
  // new field is optional so v8 records pass the v9 validator
  // unchanged.
  8: (v8) => {
    const transactions = Array.isArray(v8.transactions) ? v8.transactions : [];
    return { ...v8, version: 9, transactions };
  },

  // v9 → v10: introduces an optional `isCorrection` flag on rows so the
  // "update balance" flow on the Accounts page can mark the delta rows
  // it appends and the budget view can render them as a full-width
  // divider line instead of a normal columned row. No row data needs
  // rewriting; bumping the version flags that this build understands
  // the new shape so older builds know not to silently drop the field.
  9: (v9) => ({ ...v9, version: 10 }),

  // v10 → v11: introduces imported bank-statement history at the
  // UserData level (`history`, `historyImports`) and an optional
  // anchored `openingBalance` field on Account. Both collections
  // default to empty so v10 records pass the v11 validator unchanged
  // and the runtime balance math is undisturbed until the user
  // imports a statement.
  10: (v10) => ({
    ...v10,
    version: 11,
    history: {},
    historyImports: {},
  }),

  // v11 → v12: introduces three correlation surfaces on top of the
  // existing history data — `merchantHints` (a user's per-merchant
  // category memory), `recurringDismissals` (normalised-description
  // keys the user said "not recurring" to), and
  // `transferCollapseDismissals` (cross-account pair keys the user
  // said "never" to). HistoryEntry also gains an optional
  // `collapsedIntoTransactionId` backref so the collapse flow is
  // reversible; no row data needs rewriting because the new field is
  // optional and absent entries continue to validate. All three new
  // top-level collections default to empty so v11 records pass the
  // v12 validator unchanged.
  11: (v11) => ({
    ...v11,
    version: 12,
    merchantHints: {},
    recurringDismissals: [],
    transferCollapseDismissals: [],
  }),

  // v12 → v13: introduces the `abbreviateNumbers` display toggle. The
  // validator falls back to the default (off) for v12 records that
  // don't carry the field, so no settings data needs rewriting — the
  // version bump just flags that this build understands the new shape.
  12: (v12) => ({ ...v12, version: 13 }),

  // v13 → v14: introduces reusable `EntryType` records and a
  // `Row.typeId` reference. Types replace the per-row `glyph` field —
  // a type carries a name + colour + glyph that every row using it
  // shares, so grouping for stats works while the visual identity
  // moves with it. The migration seeds a handful of Swedish-typical
  // defaults so the picker isn't empty on first promote, and strips
  // any existing `row.glyph` (the user chose "drop, don't salvage" on
  // the migration prompt). No rows gain a `typeId` automatically.
  13: (v13) => {
    const sheets = Array.isArray(v13.sheets) ? v13.sheets : [];
    return {
      ...v13,
      version: 14,
      types: createSeedEntryTypes(),
      sheets: sheets.map((raw) => {
        if (typeof raw !== "object" || raw === null) return raw;
        const sheet = raw as { items?: unknown };
        if (!Array.isArray(sheet.items)) return sheet;
        return {
          ...sheet,
          items: sheet.items.map((rawItem) => {
            if (typeof rawItem !== "object" || rawItem === null) return rawItem;
            const item = rawItem as { type?: unknown; rows?: unknown };
            if (item.type !== "accountBudget" || !Array.isArray(item.rows)) {
              return item;
            }
            return {
              ...item,
              rows: item.rows.map((rawRow) => {
                if (typeof rawRow !== "object" || rawRow === null)
                  return rawRow;
                const row = rawRow as Record<string, unknown>;
                if (!("glyph" in row)) return row;
                const rest: Record<string, unknown> = {};
                for (const [k, v] of Object.entries(row)) {
                  if (k !== "glyph") rest[k] = v;
                }
                return rest;
              }),
            };
          }),
        };
      }),
    };
  },

  // v14 → v15: `MerchantHint` gains optional `typeId` and
  // `description` fields. The history-row promote-to-recurring flow
  // writes them so past and future synthesized history rows can
  // display the user's label and entry type instead of the raw bank
  // text. Existing hints carry neither field — they're optional and
  // readers fall through to the raw description and no-type
  // rendering, so no payload rewrite is needed.
  14: (v14) => ({ ...v14, version: 15 }),
};

export type MigrationResult = {
  data: Versioned;
  migrated: boolean;
};

export function migrate(raw: Versioned): MigrationResult {
  if (raw.version > LATEST_VERSION) {
    throw new Error(
      `Data was created by a newer version of the app (v${raw.version}); ` +
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
  return { data: current, migrated };
}
