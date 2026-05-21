// JSON Schema for the persisted `UserData` blob.
//
// This document is exposed verbatim at
// `https://budget.niclaslindstedt.se/schema` so an LLM (or any other
// tool) handed a `budget-YYYY-MM-DD.json` export can fetch the schema
// and reason about the file's shape without reading the React source.
//
// Sources of truth are imported from `constants.ts` and `migrations.ts`
// so the schema cannot drift out of step with the validator: bumping
// `LATEST_VERSION`, adding a category icon, or widening the allowed
// date formats updates this document in place. When you add a new
// field to `UserData`, mirror it here AND in `validateUserData()` in
// the same commit — the validator is the runtime enforcer, this
// schema is the public contract.
//
// Conformance: JSON Schema Draft 2020-12. The schema is strict
// (`additionalProperties: false` everywhere) so an unknown field is a
// signal that the writer is a newer build than the schema document.

import {
  BORDER_WIDTH_PRESETS,
  CATEGORY_ICON_NAMES,
  COLOR_KEYS,
  COLOR_KEY_TO_CSS_VAR,
  DATE_FORMATS,
  DEFAULT_CUSTOM_THEME,
  DEFAULT_SETTINGS,
  DENSITY_PRESETS,
  FONT_FAMILIES,
  MAX_FONT_SCALE,
  MAX_SESSION_TIMEOUT_MINUTES,
  MIN_FONT_SCALE,
  MIN_SESSION_TIMEOUT_MINUTES,
  RADIUS_PRESETS,
  SHEET_TYPES,
  SHORT_DATE_FORMATS,
  THEMES,
} from "./constants";
import { LATEST_VERSION } from "./migrations";

export const SCHEMA_ID = "https://budget.niclaslindstedt.se/schema";

const sheetTypeIds = SHEET_TYPES.map((t) => t.id);

// Shaped as a plain JSON value so `JSON.stringify(USER_DATA_SCHEMA)`
// emits a spec-conformant Draft 2020-12 document. Avoid TypeScript
// utility tricks here — the constant has to round-trip through
// `JSON.stringify` losslessly.
export const USER_DATA_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: SCHEMA_ID,
  title: "budget UserData",
  description:
    "The JSON document the budget app at budget.niclaslindstedt.se persists " +
    "to a user's localStorage and writes when they press Export. The app " +
    "has no backend: this file is the complete portable representation of " +
    "a user's data (sheets, accounts, categories, display settings). It " +
    "does NOT carry account credentials — those stay in the device-wide " +
    "user registry, separate from this blob. An exported file is plain " +
    "JSON; when stored locally the same bytes may be wrapped in an " +
    "AES-GCM envelope, but the decrypted payload matches this schema.",
  type: "object",
  additionalProperties: false,
  required: [
    "version",
    "sheets",
    "activeSheetId",
    "accounts",
    "categories",
    "types",
    "hiddenPresetTypeIds",
    "presetTypeKindOverrides",
    "hiddenPresetCategoryIds",
    "transactions",
    "history",
    "historyImports",
    "merchantHints",
    "recurringDismissals",
    "transferCollapseDismissals",
    "matchRules",
    "seriesMatchRules",
    "settings",
  ],
  properties: {
    version: {
      type: "integer",
      const: LATEST_VERSION,
      description:
        "Schema version this document conforms to. A forward-only chain " +
        "of migrations in `src/data/migrations.ts` upgrades older exports " +
        "in place; a higher value than this constant means the file was " +
        "written by a newer build than the reader supports and must be " +
        "rejected. Always bumped together with this schema.",
    },
    sheets: {
      type: "array",
      minItems: 1,
      description:
        "Named tabs in the workspace. The bottom tab bar renders one " +
        "entry per sheet. Sheet ids are unique across the document.",
      items: { $ref: "#/$defs/Sheet" },
    },
    activeSheetId: {
      type: "string",
      description:
        "Id of the sheet that should open on launch. If the id no longer " +
        "matches a sheet in `sheets`, the loader falls back to the first " +
        "sheet instead of erroring.",
    },
    accounts: {
      type: "array",
      description:
        "User-defined real-world accounts (a bank account, credit card, " +
        "cash envelope, …) referenced by `AccountBudget.accountId`. May be " +
        "empty — a budget can exist without being tied to an account.",
      items: { $ref: "#/$defs/Account" },
    },
    categories: {
      type: "array",
      description:
        "User-added categories (broad analysis buckets — Food, Housing, " +
        "Transport). A row's category is derived through its type: " +
        "`row.typeId → EntryType.categoryId`. Renaming a category " +
        "updates every type pointing at it automatically. On top of " +
        "this list the app exposes a fixed set of built-in 'preset' " +
        "categories (ids prefixed with `preset-cat-`) that live in app " +
        "code, not in this document. A `categoryId` may reference " +
        "either a user-added id from this array or a preset id; the " +
        "reader resolves both. User ids must not collide with the " +
        "preset prefix. Each `EntryType` in `types` points at exactly " +
        "one category through its `categoryId`.",
      items: { $ref: "#/$defs/Category" },
    },
    types: {
      type: "array",
      description:
        "User-added entry types describing what kind of row this is " +
        "(specific labels like 'Babysitter', 'Padel', 'Co-working " +
        "fee'). A row references one via `Row.typeId`; the type " +
        "carries the row's primary visual identity (glyph + colour + " +
        "display name), so every row sharing a type renders " +
        "identically. Sits between the row's free-text description " +
        "(specific) and its category (groups across many rows for " +
        "stats). On top of this list the app exposes a fixed set of " +
        "built-in 'preset' types (Swedish-household staples like " +
        "Hyra, Bolån, El, Apoteket, A-kassa — ids prefixed with " +
        "`preset-type-`) that live in app code, not in this " +
        "document. A `typeId` may reference either a user-added id " +
        "from this array or a preset id; the reader resolves both. " +
        "User ids must not collide with the preset prefix.",
      items: { $ref: "#/$defs/EntryType" },
    },
    hiddenPresetTypeIds: {
      type: "array",
      description:
        "Preset entry type ids the user has hidden from the type " +
        "picker and the Types admin list. Only ids matching an " +
        "active preset count; unknown ids are silently dropped on " +
        "load. Hiding does NOT affect referential integrity — rows " +
        "and rules that point at a hidden preset still resolve.",
      items: { type: "string", minLength: 1 },
    },
    presetTypeKindOverrides: {
      type: "object",
      description:
        "Per-user overrides for the income/expense `kind` of a preset " +
        "entry type. Keys are preset type ids (`preset-type-<slug>`); " +
        "values pick one of `income`, `expense`, or `any`. Lets a user " +
        "re-classify a built-in preset (e.g. promote a savings type " +
        "to income-only) without changing the app version. Unknown " +
        "ids and unknown values are silently dropped on load. " +
        "User-added types carry `kind` on the type record itself; " +
        "this map only covers presets.",
      additionalProperties: {
        type: "string",
        enum: ["income", "expense", "any"],
      },
    },
    hiddenPresetCategoryIds: {
      type: "array",
      description:
        "Preset category ids the user has hidden from the category " +
        "picker and the Categories admin list. Same contract as " +
        "`hiddenPresetTypeIds`.",
      items: { type: "string", minLength: 1 },
    },
    transactions: {
      type: "array",
      description:
        "Transfers between two accounts. Each transaction is rendered " +
        "as a read-only synthesized row on every AccountBudget that " +
        "tracks one of its endpoints (sign depends on which side the " +
        "budget's account is on) AND in the global log on the singleton " +
        "Accounts sheet. The synthesized rows are NOT persisted — " +
        "transactions live only here. When summing an account's " +
        "balance, add `amount` to the `toAccountId` side and subtract " +
        "from the `fromAccountId` side; never double-count by also " +
        "reading the synthesized rows.",
      items: { $ref: "#/$defs/Transaction" },
    },
    history: {
      type: "object",
      description:
        "Imported bank-statement entries keyed by account id. Each " +
        "value is the chronologically-sorted (ascending date) list of " +
        "entries pulled from one or more statements for that account. " +
        "Stored independently of budget rows so the user can curate the " +
        "ledger without losing the bank's ground truth. When summing an " +
        "account's balance, seed the running total with the account's " +
        "`openingBalance` (what the account held the day before the " +
        "earliest entry) then add every entry's `amount` in date order " +
        "— or simply read the `balance` field of the latest dated entry. " +
        "Keys reference Account.id; entries for an unknown account are " +
        "dropped on load.",
      additionalProperties: {
        type: "array",
        items: { $ref: "#/$defs/HistoryEntry" },
      },
    },
    historyImports: {
      type: "object",
      description:
        "Audit trail of file imports keyed by account id. One record " +
        "per `Import` button-press, used by the History modal to show " +
        "'imported statement.xlsx on 2026-05-17 covering 2025-05 to " +
        "2026-05'. Not authoritative — `history` is the data, this is " +
        "just the log of how it got there.",
      additionalProperties: {
        type: "array",
        items: { $ref: "#/$defs/HistoryImport" },
      },
    },
    merchantHints: {
      type: "object",
      description:
        "Per-merchant type memory. Keys are normalised descriptions " +
        "(lowercased, with dates / currency / long digit sequences " +
        "stripped, whitespace collapsed) so 'SPOTIFY *123' and 'spotify' " +
        "share a single hint. The recurring-candidate promote flow reads " +
        "this to suggest a type; the suggestion is always shown to the " +
        "user, never silently applied. The hint's category is derived " +
        "through `typeId → EntryType.categoryId`. Hints whose `typeId` " +
        "no longer references a known type are dropped on load.",
      additionalProperties: { $ref: "#/$defs/MerchantHint" },
    },
    recurringDismissals: {
      type: "array",
      description:
        "Normalised-description keys the user has dismissed with 'Not " +
        "recurring' on the recurring-candidate panel. The detector " +
        "skips matching buckets so the same noise doesn't keep coming " +
        "back on every import. Settings has a clear-all so a misclick " +
        "is recoverable.",
      items: { type: "string", minLength: 1 },
    },
    transferCollapseDismissals: {
      type: "array",
      description:
        "Pair keys the user has dismissed with 'Never' on the cross-" +
        "account transfer-collapse modal. Each key is the two paired " +
        "HistoryEntry ids joined by `|` in sorted order so dismissals " +
        "stick to the specific pair, not to either entry on its own. " +
        "Settings has a clear-all so a misclick is recoverable.",
      items: { type: "string", minLength: 1 },
    },
    matchRules: {
      type: "array",
      description:
        "User-authored wildcard rules that relabel synthesized history " +
        "rows by matching against their raw description. Distinct from " +
        "`merchantHints` (which keys off the lossy normalised description " +
        "and is auto-recorded by promote flows) — a `MatchRule` is " +
        "explicit memory the user owns and can sharpen with sign / " +
        "transfer filters. Rules apply in array order; the first match " +
        "wins. Order is significant for layering specific rules on top " +
        "of broader catch-alls.",
      items: { $ref: "#/$defs/MatchRule" },
    },
    seriesMatchRules: {
      type: "array",
      description:
        "Auto-reconciliation rules learned from 'Apply to whole series' " +
        "in the bank-history reconciliation modal. Each rule binds a " +
        "recurring series id to the bank-description glob, amount " +
        "tolerance, and date-lag observed on the confirmed match. " +
        "Future imports that fit the rule collapse silently — the " +
        "predicted row is deleted and the history entry takes its " +
        "place, no modal required.",
      items: { $ref: "#/$defs/SeriesMatchRule" },
    },
    settings: {
      $ref: "#/$defs/Settings",
      description:
        "Display and entry preferences. Travels with the data so a " +
        "re-import on a different device restores the user's chosen " +
        "formats.",
    },
  },
  $defs: {
    Id: {
      type: "string",
      minLength: 1,
      description:
        "Opaque non-empty string. New ids are minted with " +
        "`crypto.randomUUID()`; older installs may carry shorter " +
        "fallbacks. Compare by equality only, do not parse.",
    },
    HexColor: {
      type: "string",
      minLength: 1,
      description:
        'Free-form colour string. The UI emits CSS hex (e.g. "#61afef") ' +
        "but the validator accepts any non-empty string so user-pasted " +
        "values pass through.",
    },
    CategoryIcon: {
      type: "string",
      enum: [...CATEGORY_ICON_NAMES],
      description:
        "Glyph identifier from the fixed allowlist. The same union is " +
        "used for category icons, entry-type glyphs, account glyphs, " +
        "and sheet glyphs — the picker UI shows a curated subset per " +
        "context, but any value from this enum validates anywhere a " +
        "CategoryIcon is accepted.",
    },
    SheetType: {
      type: "string",
      enum: sheetTypeIds,
      description:
        "Sheet flavour. Future planners (loan tracking, savings forecast, " +
        "parental-leave planner, …) join this enum as their UIs land.",
    },
    ColumnType: {
      type: "string",
      enum: ["date", "description", "type", "amount", "balance", "completed"],
      description:
        "Semantic role of a column. The UI picks the cell editor and the " +
        "display formatter from this. `balance` is derived (a running " +
        "total computed from `date` + `amount`) and never has a stored " +
        "cell value. The `type` column renders the row's EntryType chip — " +
        "it reads from / writes to `row.typeId`, not the row's `cells` " +
        "map, so a row's stored cell value for the column id is always " +
        "absent. A row's category is derived through " +
        "`row.typeId → type.categoryId`, not stored as a cell either.",
    },
    CellValue: {
      description:
        "Per-cell value. Concretely: `date` cells hold an ISO YYYY-MM-DD " +
        "string; `description` holds free text; `amount` holds a number " +
        "(negative for outgoing); `completed` holds a boolean. The " +
        "validator only checks the primitive type — semantic typing is " +
        "enforced by the column.",
      oneOf: [
        { type: "string" },
        { type: "number" },
        { type: "boolean" },
        { type: "null" },
      ],
    },
    Column: {
      type: "object",
      additionalProperties: false,
      required: ["id", "type", "label"],
      properties: {
        id: { $ref: "#/$defs/Id" },
        type: { $ref: "#/$defs/ColumnType" },
        label: {
          type: "string",
          description:
            "User-visible header text. Independent of `type` so the user " +
            "can rename a column without changing its role.",
        },
      },
    },
    Row: {
      type: "object",
      additionalProperties: false,
      required: ["id", "cells"],
      properties: {
        id: { $ref: "#/$defs/Id" },
        cells: {
          type: "object",
          additionalProperties: { $ref: "#/$defs/CellValue" },
          description:
            "Cell values keyed by column id (NOT column type). A missing " +
            "key means an empty cell. Keys referencing columns no longer " +
            "in the AccountBudget are dropped on load.",
        },
        seriesId: {
          type: "string",
          minLength: 1,
          description:
            "Shared id linking every row generated from the same " +
            'recurring entry. Used to scope "edit / delete all future" ' +
            "operations. Absent on one-off rows.",
        },
        typeId: {
          $ref: "#/$defs/Id",
          description:
            "Optional reference to an entry in the top-level `types` " +
            "array. When set, the description cell renders the type's " +
            "glyph + colour and uses the type's name as the row's " +
            "primary label, demoting the description text to a secondary " +
            "line revealed by tapping the chip. Dangling references are " +
            "dropped on load (the row falls back to its description).",
        },
        isCorrection: {
          type: "boolean",
          description:
            'True when this row was minted by the "update balance" flow ' +
            "on the Accounts page: its `amount` cell holds the delta " +
            "needed to bring the account's running balance to a user-" +
            "asserted value. Rendered in the budget view as a full-width " +
            'divider line ("——— balance correction ±X ———") rather than ' +
            "a normal columned row, and excluded from bulk-edit selection. " +
            "The running balance reads `amount` like any other row, so " +
            "the correction shifts the total without further special " +
            "casing. Absent on non-correction rows; only `true` is ever " +
            "persisted (a stored `false` is indistinguishable from absent " +
            "and is dropped on save).",
        },
        isTransfer: {
          type: "boolean",
          description:
            "True when the user has flagged this row as an inter-account " +
            "transfer. The `Settings.hideTransfers` toggle suppresses such " +
            "rows from the budget table while their amounts continue to " +
            "feed the running balance (i.e. they're hidden, not removed). " +
            "Only `true` is persisted — absent means 'not a transfer'. " +
            "Synthesized transaction rows (those carrying `peerAccountId`) " +
            "are implicitly transfers and don't need this flag.",
        },
        amountFormula: {
          type: "string",
          minLength: 1,
          description:
            "Optional dynamic-amount expression. When present, the row's " +
            "effective amount comes from evaluating this formula against " +
            "the sheet's state at render time, overriding any literal in " +
            "`cells[amountColumnId]` (which is still written as a best-" +
            "effort preview cache, so older builds without formula " +
            "support see a reasonable static number). " +
            "Available variables (resolved against the row's fiscal " +
            "month): `endOfMonthBalance`, `balanceBefore`, " +
            "`openingBalance`, `income`, `expenses`, `net`, " +
            "`uncategorized`, `prevMonth.endingBalance`, " +
            "`prevMonth.income`, `prevMonth.expenses`. " +
            'Functions: `categoryTotal("<categoryId>")`, ' +
            '`typeTotal("<typeId>")`, `min`, `max`, `clamp`, `abs`, ' +
            '`round`, and `sheet("<sheetId>", <variable>)` for cross-' +
            "sheet references — the second argument can be a bare " +
            "identifier (`endOfMonthBalance`, `openingBalance`, " +
            "`income`, `expenses`, `net`) or a quoted string. The " +
            'legacy `sheet("<sheetId>").<variable>` dotted form is ' +
            "still accepted on read so older exports keep working. " +
            "Sheet references are stored as the target's stable sheet " +
            "**id**, not its mutable display name, so renames don't " +
            "break formulas — the editor renders the current name. " +
            'Eval order is "literal rows first, then formula rows in ' +
            "the order they appear in `item.rows`\"; a formula row's " +
            "own contribution is excluded from its own variables to " +
            "avoid self-reference. Cross-sheet references only see the " +
            "referenced sheet's literal rows (cycle avoidance).",
        },
      },
    },
    AccountBudget: {
      type: "object",
      additionalProperties: false,
      required: ["id", "type", "accountId", "columns", "rows"],
      description:
        "Spreadsheet block that budgets a single account. Today every " +
        "sheet holds exactly one of these; the shape supports stacking " +
        "more SheetItem variants (graphs, notes, …) without another " +
        "migration.",
      properties: {
        id: { $ref: "#/$defs/Id" },
        type: { type: "string", const: "accountBudget" },
        accountId: {
          description:
            "Id of the Account this budget tracks, or null while the " +
            "user hasn't decided. Non-null ids MUST reference an entry " +
            "in the top-level `accounts` array — dangling references " +
            "are rejected.",
          oneOf: [{ $ref: "#/$defs/Id" }, { type: "null" }],
        },
        columns: {
          type: "array",
          description:
            "Ordered list of columns. The order is the display order; " +
            "drag-and-drop reorders this array. Column ids are unique " +
            "within the budget.",
          items: { $ref: "#/$defs/Column" },
        },
        rows: {
          type: "array",
          description:
            "Flat list of rows. Month grouping is derived in the view " +
            "from the `date` cell, so rows are not pre-bucketed. Row ids " +
            "are unique within the budget.",
          items: { $ref: "#/$defs/Row" },
        },
      },
    },
    AccountsView: {
      type: "object",
      additionalProperties: false,
      required: ["id", "type"],
      description:
        "Marker item used by the singleton Accounts sheet flavour. " +
        "Carries no data of its own: the dashboard renders the global " +
        "`accounts` and `transactions` arrays directly. Future per-sheet " +
        "config (account filter, sort order, …) lands here without " +
        "another migration.",
      properties: {
        id: { $ref: "#/$defs/Id" },
        type: { type: "string", const: "accountsView" },
      },
    },
    SheetItem: {
      description:
        "Discriminated union of items a sheet can hold. `AccountBudget` " +
        "is the per-account ledger that powers the budget sheet flavour; " +
        "`AccountsView` is the dashboard rendered by the singleton " +
        "Accounts flavour. Future variants are tagged by their own " +
        "`type` literal.",
      oneOf: [
        { $ref: "#/$defs/AccountBudget" },
        { $ref: "#/$defs/AccountsView" },
      ],
    },
    Sheet: {
      type: "object",
      additionalProperties: false,
      required: [
        "id",
        "name",
        "type",
        "glyph",
        "color",
        "description",
        "items",
      ],
      properties: {
        id: { $ref: "#/$defs/Id" },
        name: {
          type: "string",
          description: "User-visible sheet name; the tab label.",
        },
        type: { $ref: "#/$defs/SheetType" },
        glyph: { $ref: "#/$defs/CategoryIcon" },
        color: { $ref: "#/$defs/HexColor" },
        description: {
          type: "string",
          description:
            "Free-form note about the sheet shown in the editor modal. " +
            "Empty string when the user hasn't added one.",
        },
        items: {
          type: "array",
          description:
            "Typed blocks rendered inside the sheet. Today exactly one " +
            "AccountBudget; the shape allows more.",
          items: { $ref: "#/$defs/SheetItem" },
        },
      },
    },
    Account: {
      type: "object",
      additionalProperties: false,
      required: ["id", "name"],
      description:
        "A real-world account (bank account, credit card, cash envelope, " +
        "…) referenced by one or more AccountBudget items and by every " +
        "Transaction. All fields beyond `id` and `name` are optional " +
        "display / bank-detail metadata; readers should treat absent " +
        "fields as 'unspecified' rather than 'empty'.",
      properties: {
        id: { $ref: "#/$defs/Id" },
        name: {
          type: "string",
          description: "User-facing label. May be empty.",
        },
        description: {
          type: "string",
          description: "Free-form note shown on the Accounts dashboard.",
        },
        glyph: {
          $ref: "#/$defs/CategoryIcon",
          description: "Icon shown next to the account on the dashboard.",
        },
        color: {
          $ref: "#/$defs/HexColor",
          description: "Accent colour for this account on the dashboard.",
        },
        bank: { type: "string", description: "Free-form bank name." },
        clearing: {
          type: "string",
          description:
            "Swedish clearingnummer (typically 4–5 digits identifying " +
            "the bank's branch). Free-form so non-Swedish equivalents " +
            "fit; readers must not parse it.",
        },
        accountNumber: {
          type: "string",
          description: "Local account number (no clearing prefix). Free-form.",
        },
        iban: {
          type: "string",
          description: "International Bank Account Number. Free-form.",
        },
        bic: {
          type: "string",
          description: "BIC / SWIFT code. Free-form.",
        },
        currency: {
          type: "string",
          minLength: 1,
          description:
            "Free-form per-account currency token that overrides " +
            "`settings.currency` when rendering this account's balance. " +
            "Absent or empty means 'use the global setting'.",
        },
        openingBalance: {
          type: "number",
          description:
            "Anchored opening balance derived from imported history. " +
            "Equal to the earliest entry's `balance - amount` — i.e. " +
            "what the account held the day before the first imported " +
            "row. Lets the running-balance math reconstruct the bank's " +
            "numbers exactly. Absent on accounts that have never been " +
            "seeded from a statement.",
        },
      },
    },
    HistoryEntry: {
      type: "object",
      additionalProperties: false,
      required: ["id", "date", "description", "amount", "importedAt"],
      description:
        "One row from an imported bank statement. `amount` is signed " +
        "(negative for outgoing) and `balance` (when present) is the " +
        "bank's reported running balance immediately after this row's " +
        "effect. Credit-card exports (e.g. Bank Norwegian) omit " +
        "`balance` because the file carries no per-row running total. " +
        "`id` is a content hash so re-importing an overlapping " +
        "statement dedups to the same key.",
      properties: {
        id: { $ref: "#/$defs/Id" },
        date: {
          type: "string",
          description:
            "ISO YYYY-MM-DD date the bank booked the row on (`Bokf. datum`).",
        },
        description: {
          type: "string",
          description: "Bank-provided description as imported.",
        },
        amount: {
          type: "number",
          description:
            "Signed amount of this row's effect on the account. Negative " +
            "for money out, positive for money in.",
        },
        balance: {
          type: "number",
          description:
            "Bank-reported balance immediately after applying `amount`. " +
            "Omitted for credit-card statements that carry only a signed " +
            "amount per row.",
        },
        importedAt: {
          type: "number",
          description:
            "Unix milliseconds the entry was first imported. Stable " +
            "across re-imports of the same row (existing wins on dedup).",
        },
        hidden: {
          type: "boolean",
          description:
            "User-shelved noise (interest accruals, fee lines, …). True " +
            "filters the entry out of the budget projection but keeps it " +
            "in the data; absent means visible.",
        },
        collapsedIntoTransactionId: {
          $ref: "#/$defs/Id",
          description:
            "Set by the cross-account transfer auto-collapse flow when " +
            "this entry and its mirror on the peer account were merged " +
            "into a single `Transaction`. Both sides are flipped to " +
            "`hidden: true` at the same time. Deleting the transaction " +
            "must clear this field on both sides to restore the entry; " +
            "the detector skips entries that carry this backref so the " +
            "operation is idempotent.",
        },
        userDescription: {
          type: "string",
          minLength: 1,
          description:
            "Per-entry user override for the synthesized row's " +
            "description. Higher priority than any matching `MatchRule` " +
            "or `MerchantHint` — the row is relabelled without dragging " +
            "every other entry that normalises to the same merchant key. " +
            "Absent means 'fall through to rules / hints / raw bank " +
            "text'. Empty / whitespace-only is normalised to absent on " +
            "load so a cleared field doesn't leave the row labelless. " +
            "The raw `description` is preserved untouched so the " +
            "original statement text remains visible alongside the " +
            "override in the edit modal.",
        },
        userTypeId: {
          $ref: "#/$defs/Id",
          description:
            "Per-entry user override for the synthesized row's type. " +
            "Higher priority than any matching `MatchRule` or " +
            "`MerchantHint`. Absent means 'fall through to rules / " +
            "hints / no type'. Dangling references to deleted types " +
            "are dropped on load.",
        },
        isTransfer: {
          type: "boolean",
          description:
            "True when the user has flagged this bank row as an inter-" +
            "account transfer (set via the history-entry edit modal). " +
            "Mirrored onto the synthesized row so the `Settings." +
            "hideTransfers` toggle suppresses it from the budget table " +
            "while the amount still contributes to the running balance. " +
            "Independent of `collapsedIntoTransactionId`, which dedups a " +
            "matched pair into a single Transaction; this flag stands in " +
            "when no peer side is available yet.",
        },
        splits: {
          type: "array",
          items: { $ref: "#/$defs/HistoryEntrySplit" },
          description:
            "User-defined split of this bank entry into multiple " +
            "categorised parts. When present and non-empty, the " +
            "synthesized budget view emits one row per split in place " +
            "of this entry's single row. The splits' signed amounts " +
            "MUST sum to `amount` so the account's running balance " +
            "stays anchored to the bank's authoritative total; loaders " +
            "drop the field when the sum doesn't match. Absent means " +
            "the entry renders as a single row with the usual override " +
            "/ rule / hint chain.",
        },
      },
    },
    HistoryEntrySplit: {
      type: "object",
      additionalProperties: false,
      required: ["description", "amount"],
      description:
        "One slice of a split `HistoryEntry`. Renders as its own row " +
        "in the synthesized budget view; the parent entry's `splits` " +
        "array must sum to the entry's `amount`.",
      properties: {
        description: {
          type: "string",
          description:
            "User-typed label for this slice (e.g. 'Groceries', " +
            "'Interest'). Overrides the bank's description for this " +
            "row only.",
        },
        amount: {
          type: "number",
          description:
            "Signed amount of this slice. Same sign convention as " +
            "`HistoryEntry.amount` — negative for money out, positive " +
            "for money in. Mixed-sign splits are allowed (a refund " +
            "embedded in a payment) as long as the total still sums " +
            "to the parent entry's amount.",
        },
        typeId: {
          $ref: "#/$defs/Id",
          description:
            "Optional category type for this slice. Dropped on load " +
            "when it points at a deleted type.",
        },
      },
    },
    MatchRule: {
      type: "object",
      additionalProperties: false,
      required: ["id", "pattern"],
      description:
        "One entry in `matchRules`. Labels synthesized history rows whose " +
        "raw bank description matches `pattern` (simple glob: `*` matches " +
        "any run of characters, everything else matches literally, case- " +
        "insensitively, and the pattern is implicitly anchored). When a " +
        "rule matches an entry its `description` and `typeId` overlay the " +
        "entry's synthesized row at render time; the stored `HistoryEntry` " +
        "is never rewritten so removing a rule reverts presentation " +
        "cleanly. `amountSign` and `transferFilter` narrow the match: a " +
        "rule for 'BAUHAUS' can fire only on outgoing purchases (negative " +
        "amounts) and ignore transfers between the user's own accounts.",
      properties: {
        id: { $ref: "#/$defs/Id" },
        pattern: {
          type: "string",
          minLength: 1,
          description:
            "Wildcard pattern. `*` matches any run of characters including " +
            "empty; `?` matches exactly one character; every other " +
            "character matches itself literally and case-insensitively. " +
            "Anchored implicitly — wrap with `*…*` for substring matching.",
        },
        description: {
          type: "string",
          minLength: 1,
          description:
            "Optional user-typed label that overrides the bank's text on " +
            "every matching synthesized history row. The raw text is " +
            "preserved on the underlying `HistoryEntry`; only presentation " +
            "changes.",
        },
        typeId: {
          oneOf: [{ $ref: "#/$defs/Id" }, { type: "null" }],
          description:
            "Optional `EntryType` id assigned to every matching row. " +
            "Must reference `types` (or a preset); dangling refs are " +
            "dropped on load. The row's category is derived through " +
            "`type.categoryId`.",
        },
        amountSign: {
          type: "string",
          enum: ["any", "positive", "negative"],
          description:
            "Filter by transaction direction. `any` (default) matches " +
            "both signs; `negative` matches outgoing money; `positive` " +
            "matches incoming. Useful when one description token can " +
            "appear on both a purchase and its refund.",
        },
        transferFilter: {
          type: "string",
          enum: ["any", "exclude", "only"],
          description:
            "Filter by whether the entry is part of a cross-account " +
            "transfer (carries `collapsedIntoTransactionId`). `any` " +
            "(default) ignores the distinction; `exclude` skips entries " +
            "that were collapsed into a Transaction; `only` matches " +
            "exclusively those.",
        },
        amountMin: {
          type: "number",
          description:
            "Optional signed lower bound on `HistoryEntry.amount`. " +
            "Entries below this value are skipped. Applied on top of " +
            "`amountSign`. Use together with `amountMax` to scope a " +
            "rule to a specific price band.",
        },
        amountMax: {
          type: "number",
          description:
            "Optional signed upper bound on `HistoryEntry.amount`. " +
            "Entries above this value are skipped. Applied on top of " +
            "`amountSign`. Loaders drop the pair when `amountMin > " +
            "amountMax` since such a rule could never fire.",
        },
      },
    },
    SeriesMatchRule: {
      type: "object",
      additionalProperties: false,
      required: [
        "id",
        "seriesId",
        "pattern",
        "amountTolerancePct",
        "dateLagDays",
      ],
      description:
        "One entry in `seriesMatchRules`. Binds a recurring series to " +
        "the bank-description pattern, amount-tolerance band, and date- " +
        "lag the user accepted when they confirmed 'Apply to whole " +
        "series' in the reconciliation modal. On future imports, any " +
        "predicted row from `seriesId` whose date is within `dateLagDays` " +
        "before a history entry matching `pattern` (within " +
        "`amountTolerancePct` of the predicted amount) is reconciled " +
        "silently — the predicted row is deleted, the history entry " +
        "stands. Tolerances are frozen at confirmation so a one-off " +
        "coincidence doesn't widen all future matches.",
      properties: {
        id: { $ref: "#/$defs/Id" },
        seriesId: {
          $ref: "#/$defs/Id",
          description:
            "Recurring series the rule applies to. Matches the " +
            "`seriesId` field shared by every row generated from the " +
            "same recurrence.",
        },
        pattern: {
          type: "string",
          minLength: 1,
          description:
            "Wildcard pattern (same syntax as `MatchRule.pattern`). " +
            "Implicitly anchored; wrap with `*…*` for substring " +
            "matching.",
        },
        amountTolerancePct: {
          type: "number",
          minimum: 0,
          maximum: 1,
          description:
            "Maximum relative amount delta between the history entry " +
            "and the predicted row, as a fraction (e.g. 0.01 = 1%).",
        },
        dateLagDays: {
          type: "integer",
          minimum: 0,
          maximum: 31,
          description:
            "Maximum `history.date - row.date` in calendar days. The " +
            "history posting can be on or after the predicted date by " +
            "up to this many days; never before.",
        },
      },
    },
    MerchantHint: {
      type: "object",
      additionalProperties: false,
      required: ["typeId", "hitCount", "lastUsedAt"],
      description:
        "One entry in `merchantHints`. Records the type the user has " +
        "most recently assigned to a normalised-description key, plus " +
        "how often they've reinforced that choice and when they last " +
        "did so. The hint's category is derived through " +
        "`typeId → EntryType.categoryId`. The history-row promote-to-" +
        "recurring flow may also stamp a user-typed `description` so " +
        "synthesized history rows display under the user's label " +
        "instead of the raw bank text.",
      properties: {
        typeId: {
          $ref: "#/$defs/Id",
          description:
            "Suggested type for any future row whose description " +
            "normalises to this key. Must reference an entry in " +
            "`types` (or a preset); dangling refs cause the whole " +
            "hint to be dropped on load.",
        },
        hitCount: {
          type: "integer",
          minimum: 1,
          description:
            "Number of distinct type-assignment actions that have " +
            "reinforced this hint. Resets to 1 when the user assigns a " +
            "different type to the same merchant.",
        },
        lastUsedAt: {
          type: "number",
          description:
            "Unix milliseconds of the most recent assignment. Used by " +
            "the 'Merchant memory' settings section to render a 'last " +
            "used …' label and as a tiebreaker between competing hints.",
        },
        description: {
          type: "string",
          minLength: 1,
          description:
            "Optional user-typed label that overrides the bank's " +
            "description wherever this merchant appears. Set by the " +
            "history-row promote flow so 'ICA SUPERMARKET 12345' can " +
            "display as 'Groceries'. The raw bank text is preserved " +
            "on each `HistoryEntry` and the normalised key still " +
            "drives lookups; this field only changes presentation.",
        },
      },
    },
    HistoryImport: {
      type: "object",
      additionalProperties: false,
      required: [
        "id",
        "importedAt",
        "filename",
        "bankParserId",
        "rangeStart",
        "rangeEnd",
        "addedCount",
        "duplicateCount",
      ],
      description:
        "Audit record for one file-import action. Not authoritative " +
        "for the data — only for the 'what was imported when' log.",
      properties: {
        id: { $ref: "#/$defs/Id" },
        importedAt: {
          type: "number",
          description: "Unix milliseconds the import was committed.",
        },
        filename: {
          type: "string",
          description: "Original filename as the user picked it.",
        },
        bankParserId: {
          type: "string",
          description:
            "Stable identifier of the parser that decoded the file " +
            "(e.g. `skandia-xlsx`). Used by future re-parse paths.",
        },
        rangeStart: {
          type: "string",
          description: "ISO date of the earliest entry in the file.",
        },
        rangeEnd: {
          type: "string",
          description: "ISO date of the latest entry in the file.",
        },
        addedCount: {
          type: "integer",
          description: "Entries that were new at import time.",
        },
        duplicateCount: {
          type: "integer",
          description:
            "Entries dropped by the content-hash dedup at import time.",
        },
      },
    },
    Transaction: {
      type: "object",
      additionalProperties: false,
      required: [
        "id",
        "date",
        "description",
        "amount",
        "fromAccountId",
        "toAccountId",
      ],
      description:
        "One transfer between two accounts. `amount` is ALWAYS POSITIVE — " +
        "the sign comes from the direction (`fromAccountId → " +
        "toAccountId`). The same transaction appears on both endpoints' " +
        "budgets as a synthesized read-only row (negative on the from " +
        "side, positive on the to side); to avoid double-counting, sum " +
        "balances from `accounts[i].amount` data + transactions directly, " +
        "not from synthesized budget rows.",
      properties: {
        id: { $ref: "#/$defs/Id" },
        date: {
          type: "string",
          description: "ISO YYYY-MM-DD date the transfer occurred on.",
        },
        description: {
          type: "string",
          description: "Free-form label, shown on both budgets and the log.",
        },
        amount: {
          type: "number",
          description:
            "Magnitude of the transfer. ALWAYS positive — the direction " +
            "is `fromAccountId → toAccountId`. Readers that want a " +
            "signed amount for a specific account should negate when " +
            "the account is on the `from` side.",
        },
        fromAccountId: {
          $ref: "#/$defs/Id",
          description:
            "Id of the account money flows OUT of. MUST reference an " +
            "entry in `accounts`.",
        },
        toAccountId: {
          $ref: "#/$defs/Id",
          description:
            "Id of the account money flows INTO. MUST reference an " +
            "entry in `accounts`. May equal `fromAccountId` in pathological " +
            "user input but the UI does not generate such transactions.",
        },
        typeId: {
          oneOf: [{ $ref: "#/$defs/Id" }, { type: "null" }],
          description:
            "Optional `EntryType` reference (from `types` or a preset). " +
            "Null means 'untyped'. The transaction's category is " +
            "derived through `type.categoryId`; the transaction itself " +
            "carries no categoryId.",
        },
        completed: {
          type: "boolean",
          description:
            "Optional done flag mirroring the budget's `completed` column.",
        },
      },
    },
    Category: {
      type: "object",
      additionalProperties: false,
      required: ["id", "name", "color", "icon"],
      properties: {
        id: { $ref: "#/$defs/Id" },
        name: { type: "string" },
        color: { $ref: "#/$defs/HexColor" },
        icon: { $ref: "#/$defs/CategoryIcon" },
      },
    },
    EntryType: {
      type: "object",
      additionalProperties: false,
      required: ["id", "name", "color", "glyph", "categoryId"],
      description:
        "Reusable label assigned to a row. A row references this by id " +
        "via `Row.typeId`; the type carries the visual identity (glyph + " +
        "colour) the description cell renders. Every type belongs to " +
        "exactly one category via `categoryId` — that's how rows get a " +
        "category (they reference a type, the type points at a " +
        "category). Renaming or recolouring a type updates every row " +
        "that references it.",
      properties: {
        id: { $ref: "#/$defs/Id" },
        name: { type: "string" },
        color: { $ref: "#/$defs/HexColor" },
        glyph: { $ref: "#/$defs/CategoryIcon" },
        categoryId: {
          $ref: "#/$defs/Id",
          description:
            "Parent category id. Must reference an entry in `categories` " +
            "(or a preset). When the parent category is deleted, the " +
            "type is reassigned to the catch-all 'Other' preset rather " +
            "than orphaned.",
        },
        kind: {
          type: "string",
          enum: ["income", "expense"],
          description:
            "Optional income/expense filter. When set to `income`, " +
            "the type is offered only on positive-amount rows; when " +
            "set to `expense`, only on negative-amount rows. Absent " +
            "means the type works for either direction (the picker's " +
            "default). Preset types ship with their built-in kind " +
            "baked into the app code; per-user overrides for presets " +
            "live in the top-level `presetTypeKindOverrides` map.",
        },
      },
    },
    Settings: {
      type: "object",
      additionalProperties: false,
      required: [
        "startOfMonth",
        "dateFormat",
        "shortDateFormat",
        "currency",
        "currencyPosition",
        "currencySpace",
        "decimalSeparator",
        "thousandsSeparator",
        "formatNumbers",
        "showCurrency",
        "showDecimals",
        "abbreviateNumbers",
        "alwaysAbbreviateBalance",
        "fontScale",
        "sessionTimeoutMinutes",
        "lastSeenChangelogVersion",
        "language",
        "hideTransfers",
        "theme",
        "fontFamily",
        "customTheme",
      ],
      description:
        "Display and entry preferences. The validator is lenient: bad " +
        "values silently fall back to defaults rather than rejecting the " +
        "document, because settings are cosmetic.",
      properties: {
        startOfMonth: {
          type: "integer",
          minimum: 1,
          maximum: 28,
          default: DEFAULT_SETTINGS.startOfMonth,
          description:
            "Day-of-month the fiscal month rolls over on. Capped at 28 so " +
            "every calendar month has the chosen day. Default 25 aligns " +
            "with a typical Swedish payday.",
        },
        dateFormat: {
          type: "string",
          enum: [...DATE_FORMATS],
          default: DEFAULT_SETTINGS.dateFormat,
          description: "Long-form date format used outside sheet cells.",
        },
        shortDateFormat: {
          type: "string",
          enum: [...SHORT_DATE_FORMATS],
          default: DEFAULT_SETTINGS.shortDateFormat,
          description:
            "Year-less format used inside month tables. Leading zeros " +
            "are stripped at render time.",
        },
        currency: {
          type: "string",
          minLength: 1,
          default: DEFAULT_SETTINGS.currency,
          description:
            "Free-form currency token. Not validated against a list — " +
            'users may type "$", "€", "kr", "USD", etc.',
        },
        currencyPosition: {
          type: "string",
          enum: ["before", "after"],
          default: DEFAULT_SETTINGS.currencyPosition,
          description: "Whether the symbol renders before or after the amount.",
        },
        currencySpace: {
          type: "boolean",
          default: DEFAULT_SETTINGS.currencySpace,
          description:
            "Whether a single space separates the symbol from the amount.",
        },
        decimalSeparator: {
          type: "string",
          enum: [".", ","],
          default: DEFAULT_SETTINGS.decimalSeparator,
        },
        thousandsSeparator: {
          type: "string",
          enum: [" ", ".", ",", ""],
          default: DEFAULT_SETTINGS.thousandsSeparator,
          description:
            "Character grouping thousands. Empty string means no " +
            "grouping. MUST differ from `decimalSeparator`; conflicting " +
            "values fall back to no grouping.",
        },
        formatNumbers: {
          type: "boolean",
          default: DEFAULT_SETTINGS.formatNumbers,
          description: "Group thousands when rendering amounts and balances.",
        },
        showCurrency: {
          type: "boolean",
          default: DEFAULT_SETTINGS.showCurrency,
          description:
            "Append the currency token next to amounts and balances.",
        },
        showDecimals: {
          type: "boolean",
          default: DEFAULT_SETTINGS.showDecimals,
          description: "Render the fractional part. Off rounds to whole units.",
        },
        abbreviateNumbers: {
          type: "boolean",
          default: DEFAULT_SETTINGS.abbreviateNumbers,
          description:
            "Collapse displayed amounts >= 10 000 to a compact form " +
            '("12K", "1.2M") so cramped rows fit on narrow viewports. ' +
            "Affects display only — editable inputs always show the " +
            "full value.",
        },
        alwaysAbbreviateBalance: {
          type: "boolean",
          default: DEFAULT_SETTINGS.alwaysAbbreviateBalance,
          description:
            "Bypass the 10 000 abbreviation threshold for the running-" +
            "balance column on the main sheet view so it reads as a " +
            "uniform stack of compact figures instead of a mix of " +
            'precise ("9 432") and abbreviated ("12K") values. No effect ' +
            "unless `abbreviateNumbers` is also on; the amount column is " +
            "always left at the threshold rule so small amounts stay " +
            "precise.",
        },
        fontScale: {
          type: "number",
          minimum: MIN_FONT_SCALE,
          maximum: MAX_FONT_SCALE,
          default: DEFAULT_SETTINGS.fontScale,
          description:
            "Multiplier applied to the base UI font size. 1 keeps the " +
            "default, values below 1 fit more on screen, values above 1 " +
            "make the UI easier to read. The runtime exposes it as the " +
            "`--app-font-scale` CSS custom property on the document root; " +
            "both the html root font-size (so every `rem`-based Tailwind " +
            "utility scales) and the body's absolute pixel font-size (for " +
            "body-inherited content) read through it so the whole UI " +
            "(sheet cells, modals, headers) scales together.",
        },
        sessionTimeoutMinutes: {
          type: "integer",
          minimum: MIN_SESSION_TIMEOUT_MINUTES,
          maximum: MAX_SESSION_TIMEOUT_MINUTES,
          default: DEFAULT_SETTINGS.sessionTimeoutMinutes,
          description:
            "Idle minutes before the active password is dropped from " +
            "sessionStorage and the user is signed out. Clock resets on " +
            "input.",
        },
        lastSeenChangelogVersion: {
          type: ["string", "null"],
          default: DEFAULT_SETTINGS.lastSeenChangelogVersion,
          description:
            "Version of the changelog the user last acknowledged on the " +
            '"What\'s new" popup. Null on a fresh install; the app stamps ' +
            "the current version silently on first run. When the running " +
            "app's version compares greater than this string, the popup " +
            "opens showing only the entries strictly newer than this " +
            "version, and writes the running version back on dismissal.",
        },
        language: {
          type: "string",
          enum: ["en", "sv"],
          default: DEFAULT_SETTINGS.language,
          description:
            'UI language. "en" leaves the app in English; "sv" ' +
            "translates every user-facing string to Swedish. Date and " +
            "number formatting are controlled by the other Settings " +
            "fields and are independent of this choice. Existing buckets " +
            'default to "en" through the v26 → v27 migration so the UI ' +
            "doesn't suddenly flip language on upgrade; fresh installs " +
            "auto-detect from the browser's preferred language.",
        },
        hideTransfers: {
          type: "boolean",
          default: DEFAULT_SETTINGS.hideTransfers,
          description:
            "Suppress rows flagged as inter-account transfers from the " +
            "budget table. The running balance still incorporates their " +
            "amounts — they're hidden, not removed. A row counts as a " +
            "transfer when any of three signals applies: a synthesized " +
            "Transaction row's `peerAccountId` is set, a `HistoryEntry." +
            "isTransfer` is true (and propagated by `synthesizeHistoryRow`), " +
            "or a budget row's `Row.isTransfer` is true. Each visible row " +
            "whose computed balance step crossed at least one hidden " +
            "transfer surfaces a small ↔ icon on its balance cell that " +
            "inline-expands the hidden rows underneath when clicked. " +
            "Default false so the out-of-the-box view matches existing " +
            "builds.",
        },
        theme: {
          type: "string",
          enum: [...THEMES],
          default: DEFAULT_SETTINGS.theme,
          description:
            "UI theme preset. `dark` / `light` lock to the One Dark / " +
            "One Light palettes; `system` follows the operating system's " +
            "`prefers-color-scheme`; `custom` applies the colour and " +
            "shape overrides held under `customTheme`. The runtime " +
            "projects the active value to `data-theme` on `<html>`.",
        },
        fontFamily: {
          type: "string",
          enum: FONT_FAMILIES.map((f) => f.id),
          default: DEFAULT_SETTINGS.fontFamily,
          description:
            "Bundled webfont family applied across every theme preset. " +
            "`mono` is the default JetBrains-Mono stack; `sans` is " +
            "Inter; `serif` is Source Serif 4. All three are " +
            "self-hosted via `@fontsource/*` — no network fetches at " +
            "runtime. Written to the `--app-font-family` CSS custom " +
            "property on the document root.",
        },
        customTheme: {
          type: "object",
          additionalProperties: false,
          required: [
            "colors",
            "radius",
            "density",
            "borderWidth",
            "reduceMotion",
          ],
          description:
            'Active overrides when `theme === "custom"`. Cloned from the ' +
            "Dark palette on first selection — the user customises from " +
            "there. Ignored when `theme` is `dark` / `light` / `system`, " +
            'but kept on disk so flipping back to `"custom"` restores ' +
            "the previous tweaks.",
          properties: {
            colors: {
              type: "object",
              additionalProperties: false,
              required: [...COLOR_KEYS],
              description:
                "Per-slot hex colour overrides. Each key maps to a CSS " +
                "custom property the chrome reads (e.g. `accent` → " +
                "`--accent`). Missing or malformed hex values fall back " +
                "to the Dark default for that slot rather than rejecting " +
                "the whole document.",
              properties: Object.fromEntries(
                COLOR_KEYS.map((k) => [
                  k,
                  {
                    type: "string",
                    pattern:
                      "^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$",
                    default: DEFAULT_CUSTOM_THEME.colors[k],
                    description: `CSS hex colour written to --${COLOR_KEY_TO_CSS_VAR[k]}.`,
                  },
                ]),
              ),
            },
            radius: {
              type: "string",
              enum: [...RADIUS_PRESETS],
              default: DEFAULT_CUSTOM_THEME.radius,
              description:
                "Corner-radius preset consumed by `.field-input` and " +
                "`.formula-pill`. `none` flattens corners; `lg` rounds " +
                "them noticeably.",
            },
            density: {
              type: "string",
              enum: [...DENSITY_PRESETS],
              default: DEFAULT_CUSTOM_THEME.density,
              description:
                "UI density preset. Scales the row padding exposed via " +
                "the `--density-row-py` / `--density-row-px` CSS vars.",
            },
            borderWidth: {
              type: "string",
              enum: [...BORDER_WIDTH_PRESETS],
              default: DEFAULT_CUSTOM_THEME.borderWidth,
              description:
                "Border thickness preset. Written to `--border-width`; " +
                "`thin` is sub-pixel on hi-DPI screens, `bold` is 2px.",
            },
            reduceMotion: {
              type: "boolean",
              default: DEFAULT_CUSTOM_THEME.reduceMotion,
              description:
                'When true, the runtime sets `data-reduce-motion="true"` ' +
                "on `<html>`, which short-circuits every `transition-` " +
                "and `animation-duration` to 0ms.",
            },
          },
        },
      },
    },
  },
};
