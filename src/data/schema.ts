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
        "Glyph identifier from the fixed allowlist. The same set is " +
        "reused for sheet glyphs (a sheet's glyph is a CategoryIcon).",
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
        glyph: {
          $ref: "#/$defs/CategoryIcon",
          description:
            "Optional custom glyph the description cell renders in " +
            "place of the default recurring icon. Every row in the same " +
            "series carries the same value; absent rows render the " +
            "default Repeat icon when seriesId is set, or no glyph at all.",
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
    SheetItem: {
      description:
        "Discriminated union of items a sheet can hold. Today the only " +
        "variant is `AccountBudget`; future variants are tagged by their " +
        "own `type` literal.",
      oneOf: [{ $ref: "#/$defs/AccountBudget" }],
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
        "…) referenced by one or more AccountBudget items.",
      properties: {
        id: { $ref: "#/$defs/Id" },
        name: {
          type: "string",
          description: "User-facing label. May be empty.",
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
