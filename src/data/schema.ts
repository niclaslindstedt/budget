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
  CATEGORY_ICON_NAMES,
  DATE_FORMATS,
  DEFAULT_SETTINGS,
  MAX_SESSION_TIMEOUT_MINUTES,
  MIN_SESSION_TIMEOUT_MINUTES,
  SHEET_TYPES,
  SHORT_DATE_FORMATS,
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
    "transactions",
    "history",
    "historyImports",
    "merchantHints",
    "recurringDismissals",
    "transferCollapseDismissals",
    "matchRules",
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
        "Categories that rows can be tagged with. A row stores the " +
        'category\'s id in the cell whose column has `type: "category"`. ' +
        "Renaming a category updates every tagged row automatically.",
      items: { $ref: "#/$defs/Category" },
    },
    types: {
      type: "array",
      description:
        "Reusable entry types describing what kind of row this is — " +
        "'Mortgage', 'Groceries', 'Restaurant', 'Salary'. A row references " +
        "one via `Row.typeId`; the type carries the row's primary visual " +
        "identity (glyph + colour + display name), so every row sharing a " +
        "type renders identically. Sits between the row's free-text " +
        "description (specific) and its category (groups across many rows " +
        "for stats). Seeded with Swedish-typical defaults on first launch " +
        "and on the v12 → v13 migration; users add their own through the " +
        "type picker.",
      items: { $ref: "#/$defs/EntryType" },
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
        "Per-merchant category memory. Keys are normalised descriptions " +
        "(lowercased, with dates / currency / long digit sequences " +
        "stripped, whitespace collapsed) so 'SPOTIFY *123' and 'spotify' " +
        "share a single hint. The recurring-candidate promote flow reads " +
        "this to suggest a category; the suggestion is always shown to " +
        "the user, never silently applied. Hints whose `categoryId` no " +
        "longer references a known category are dropped on load.",
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
      enum: [
        "date",
        "description",
        "amount",
        "balance",
        "completed",
        "category",
      ],
      description:
        "Semantic role of a column. The UI picks the cell editor and the " +
        "display formatter from this. `balance` is derived (a running " +
        "total computed from `date` + `amount`) and never has a stored " +
        "cell value; `category` cells hold the id of an entry in the " +
        "top-level `categories` array.",
    },
    CellValue: {
      description:
        "Per-cell value. Concretely: `date` cells hold an ISO YYYY-MM-DD " +
        "string; `description` holds free text; `amount` holds a number " +
        "(negative for outgoing); `completed` holds a boolean; `category` " +
        "holds a category id string or null. The validator only checks " +
        "the primitive type — semantic typing is enforced by the column.",
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
        "rule matches an entry its `description` / `categoryId` / `typeId` " +
        "overlay the entry's synthesized row at render time; the stored " +
        "`HistoryEntry` is never rewritten so removing a rule reverts " +
        "presentation cleanly. `amountSign` and `transferFilter` narrow " +
        "the match: a rule for 'BAUHAUS' can fire only on outgoing " +
        "purchases (negative amounts) and ignore transfers between the " +
        "user's own accounts.",
      properties: {
        id: { $ref: "#/$defs/Id" },
        pattern: {
          type: "string",
          minLength: 1,
          description:
            "Wildcard pattern. `*` matches any run of characters including " +
            "empty; every other character matches itself literally and " +
            "case-insensitively. Anchored implicitly — wrap with `*…*` " +
            "for substring matching.",
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
        categoryId: {
          oneOf: [{ $ref: "#/$defs/Id" }, { type: "null" }],
          description:
            "Optional category id assigned to every matching row. Must " +
            "reference `categories`; dangling refs are dropped on load.",
        },
        typeId: {
          oneOf: [{ $ref: "#/$defs/Id" }, { type: "null" }],
          description:
            "Optional `EntryType` id assigned alongside the category. " +
            "Dangling refs are dropped on load.",
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
      },
    },
    MerchantHint: {
      type: "object",
      additionalProperties: false,
      required: ["categoryId", "hitCount", "lastUsedAt"],
      description:
        "One entry in `merchantHints`. Records the category the user " +
        "has most recently assigned to a normalised-description key, " +
        "plus how often they've reinforced that choice and when they " +
        "last did so. The history-row promote-to-recurring flow may " +
        "also stamp a `typeId` and a user-typed `description` here so " +
        "synthesized history rows display under the user's label " +
        "instead of the raw bank text.",
      properties: {
        categoryId: {
          $ref: "#/$defs/Id",
          description:
            "Suggested category for any future row whose description " +
            "normalises to this key. Must reference an entry in " +
            "`categories`; dangling refs are dropped on load.",
        },
        hitCount: {
          type: "integer",
          minimum: 1,
          description:
            "Number of distinct category-assignment actions that have " +
            "reinforced this hint. Resets to 1 when the user assigns a " +
            "different category to the same merchant.",
        },
        lastUsedAt: {
          type: "number",
          description:
            "Unix milliseconds of the most recent assignment. Used by " +
            "the 'Merchant memory' settings section to render a 'last " +
            "used …' label and as a tiebreaker between competing hints.",
        },
        typeId: {
          $ref: "#/$defs/Id",
          description:
            "Optional `EntryType` id assigned alongside the category. " +
            "Synthesized history rows pick it up so the type chip and " +
            "colour render in place of the raw bank text. Dangling " +
            "refs are dropped on load.",
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
        categoryId: {
          oneOf: [{ $ref: "#/$defs/Id" }, { type: "null" }],
          description:
            "Optional category tag, referencing `categories`. Null means " +
            "'uncategorised'.",
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
      required: ["id", "name", "color", "glyph"],
      description:
        "Reusable label assigned to a row. A row references this by id " +
        "via `Row.typeId`; the type carries the visual identity (glyph + " +
        "colour) the description cell renders. Renaming or recolouring a " +
        "type updates every row that references it.",
      properties: {
        id: { $ref: "#/$defs/Id" },
        name: { type: "string" },
        color: { $ref: "#/$defs/HexColor" },
        glyph: { $ref: "#/$defs/CategoryIcon" },
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
        "sessionTimeoutMinutes",
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
      },
    },
  },
};
