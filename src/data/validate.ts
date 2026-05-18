import {
  DATE_FORMATS,
  DEFAULT_SETTINGS,
  DEFAULT_SHEET_COLOR,
  DEFAULT_SHEET_GLYPH,
  MAX_SESSION_TIMEOUT_MINUTES,
  MIN_SESSION_TIMEOUT_MINUTES,
  SHORT_DATE_FORMATS,
} from "./constants";
import { LATEST_VERSION } from "./migrations";
import type {
  Account,
  AccountBudget,
  AccountsView,
  Category,
  CategoryIcon,
  CellValue,
  Column,
  ColumnType,
  DateFormat,
  DecimalSeparator,
  HistoryEntry,
  HistoryImport,
  Row,
  Settings,
  Sheet,
  SheetGlyph,
  SheetItem,
  SheetType,
  ShortDateFormat,
  ThousandsSeparator,
  Transaction,
  UserData,
} from "./types";

const DATE_FORMAT_SET: ReadonlySet<DateFormat> = new Set(DATE_FORMATS);
const SHORT_DATE_FORMAT_SET: ReadonlySet<ShortDateFormat> = new Set(
  SHORT_DATE_FORMATS,
);
const DECIMAL_SEPARATORS: ReadonlySet<DecimalSeparator> =
  new Set<DecimalSeparator>([".", ","]);
const THOUSANDS_SEPARATORS: ReadonlySet<ThousandsSeparator> =
  new Set<ThousandsSeparator>([" ", ".", ",", ""]);

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const COLUMN_TYPES: ReadonlySet<ColumnType> = new Set<ColumnType>([
  "date",
  "description",
  "amount",
  "balance",
  "completed",
  "category",
]);

const SHEET_TYPES: ReadonlySet<SheetType> = new Set<SheetType>([
  "budget",
  "accounts",
]);

const CATEGORY_ICONS: ReadonlySet<CategoryIcon> = new Set<CategoryIcon>([
  "tag",
  "home",
  "car",
  "shopping-bag",
  "shopping-cart",
  "utensils",
  "coffee",
  "pizza",
  "heart",
  "gift",
  "music",
  "film",
  "plane",
  "briefcase",
  "graduation-cap",
  "stethoscope",
  "pill",
  "receipt",
  "banknote",
  "credit-card",
  "piggy-bank",
  "wallet",
  "zap",
  "sparkles",
  "star",
]);

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isCellValue(v: unknown): v is CellValue {
  return (
    v === null ||
    typeof v === "string" ||
    typeof v === "number" ||
    typeof v === "boolean"
  );
}

function fail(path: string, msg: string): Result<never> {
  return { ok: false, error: `${path}: ${msg}` };
}

function validateColumn(raw: unknown, path: string): Result<Column> {
  if (!isObject(raw)) return fail(path, "expected an object");
  const { id, type, label } = raw;
  if (typeof id !== "string" || id === "")
    return fail(`${path}.id`, "expected a non-empty string");
  if (typeof type !== "string" || !COLUMN_TYPES.has(type as ColumnType))
    return fail(`${path}.type`, `unknown column type "${String(type)}"`);
  if (typeof label !== "string")
    return fail(`${path}.label`, "expected a string");
  return { ok: true, value: { id, type: type as ColumnType, label } };
}

function validateRow(
  raw: unknown,
  path: string,
  knownColumnIds: ReadonlySet<string>,
): Result<Row> {
  if (!isObject(raw)) return fail(path, "expected an object");
  const { id, cells, seriesId, glyph, isCorrection } = raw;
  if (typeof id !== "string" || id === "")
    return fail(`${path}.id`, "expected a non-empty string");
  if (!isObject(cells)) return fail(`${path}.cells`, "expected an object");
  // Drop cells whose column no longer exists so a future column removal
  // doesn't make an otherwise-valid file unimportable.
  const validated: Record<string, CellValue> = {};
  for (const [k, v] of Object.entries(cells)) {
    if (!knownColumnIds.has(k)) continue;
    if (!isCellValue(v))
      return fail(`${path}.cells.${k}`, "expected string|number|boolean|null");
    validated[k] = v;
  }
  const row: Row = { id, cells: validated };
  if (seriesId !== undefined) {
    if (typeof seriesId !== "string" || seriesId === "")
      return fail(`${path}.seriesId`, "expected a non-empty string");
    row.seriesId = seriesId;
  }
  if (glyph !== undefined) {
    if (typeof glyph !== "string" || !CATEGORY_ICONS.has(glyph as CategoryIcon))
      return fail(`${path}.glyph`, `unknown glyph "${String(glyph)}"`);
    row.glyph = glyph as CategoryIcon;
  }
  if (isCorrection !== undefined) {
    if (typeof isCorrection !== "boolean")
      return fail(`${path}.isCorrection`, "expected a boolean");
    // Only persist `true` — a stored `false` is indistinguishable from
    // "field absent" and just bloats the on-disk snapshot.
    if (isCorrection) row.isCorrection = true;
  }
  return { ok: true, value: row };
}

function validateAccountBudget(
  raw: unknown,
  path: string,
  knownAccountIds: ReadonlySet<string>,
): Result<AccountBudget> {
  if (!isObject(raw)) return fail(path, "expected an object");
  const { id, type, accountId, columns, rows } = raw;
  if (typeof id !== "string" || id === "")
    return fail(`${path}.id`, "expected a non-empty string");
  if (type !== "accountBudget")
    return fail(`${path}.type`, `expected "accountBudget"`);
  // `accountId` is nullable so a budget can exist without being tied to
  // an account. When it is a string, keep the "non-empty + must reference
  // a known account" check so a typo or stale id is still caught.
  if (accountId !== null) {
    if (typeof accountId !== "string" || accountId === "")
      return fail(`${path}.accountId`, "expected a non-empty string or null");
    if (!knownAccountIds.has(accountId))
      return fail(
        `${path}.accountId`,
        `references unknown account "${accountId}"`,
      );
  }
  if (!Array.isArray(columns))
    return fail(`${path}.columns`, "expected an array");
  if (!Array.isArray(rows)) return fail(`${path}.rows`, "expected an array");

  const validatedColumns: Column[] = [];
  const seenColumnIds = new Set<string>();
  for (let i = 0; i < columns.length; i++) {
    const r = validateColumn(columns[i], `${path}.columns[${i}]`);
    if (!r.ok) return r;
    if (seenColumnIds.has(r.value.id))
      return fail(`${path}.columns[${i}].id`, `duplicate id "${r.value.id}"`);
    seenColumnIds.add(r.value.id);
    validatedColumns.push(r.value);
  }

  const validatedRows: Row[] = [];
  const seenRowIds = new Set<string>();
  for (let i = 0; i < rows.length; i++) {
    const r = validateRow(rows[i], `${path}.rows[${i}]`, seenColumnIds);
    if (!r.ok) return r;
    if (seenRowIds.has(r.value.id))
      return fail(`${path}.rows[${i}].id`, `duplicate id "${r.value.id}"`);
    seenRowIds.add(r.value.id);
    validatedRows.push(r.value);
  }

  return {
    ok: true,
    value: {
      id,
      type: "accountBudget",
      accountId: accountId as string | null,
      columns: validatedColumns,
      rows: validatedRows,
    },
  };
}

function validateAccountsView(
  raw: unknown,
  path: string,
): Result<AccountsView> {
  if (!isObject(raw)) return fail(path, "expected an object");
  const { id, type } = raw;
  if (typeof id !== "string" || id === "")
    return fail(`${path}.id`, "expected a non-empty string");
  if (type !== "accountsView")
    return fail(`${path}.type`, `expected "accountsView"`);
  return { ok: true, value: { id, type: "accountsView" } };
}

function validateSheetItem(
  raw: unknown,
  path: string,
  knownAccountIds: ReadonlySet<string>,
): Result<SheetItem> {
  if (!isObject(raw)) return fail(path, "expected an object");
  const type = (raw as { type?: unknown }).type;
  if (type === "accountBudget") {
    return validateAccountBudget(raw, path, knownAccountIds);
  }
  if (type === "accountsView") {
    return validateAccountsView(raw, path);
  }
  return fail(`${path}.type`, `unknown sheet item type "${String(type)}"`);
}

function validateSheet(
  raw: unknown,
  path: string,
  knownAccountIds: ReadonlySet<string>,
): Result<Sheet> {
  if (!isObject(raw)) return fail(path, "expected an object");
  const { id, name, items } = raw;
  if (typeof id !== "string" || id === "")
    return fail(`${path}.id`, "expected a non-empty string");
  if (typeof name !== "string")
    return fail(`${path}.name`, "expected a string");
  if (!Array.isArray(items)) return fail(`${path}.items`, "expected an array");

  const validatedItems: SheetItem[] = [];
  const seenItemIds = new Set<string>();
  for (let i = 0; i < items.length; i++) {
    const r = validateSheetItem(
      items[i],
      `${path}.items[${i}]`,
      knownAccountIds,
    );
    if (!r.ok) return r;
    if (seenItemIds.has(r.value.id))
      return fail(`${path}.items[${i}].id`, `duplicate id "${r.value.id}"`);
    seenItemIds.add(r.value.id);
    validatedItems.push(r.value);
  }

  // Display metadata. Soft-recovers each field to a sane default if
  // missing or bogus — these are cosmetic, so a typo'd glyph name
  // shouldn't lock the user out of an otherwise-valid sheet.
  const type: SheetType =
    typeof raw.type === "string" && SHEET_TYPES.has(raw.type as SheetType)
      ? (raw.type as SheetType)
      : "budget";
  const glyph: SheetGlyph =
    typeof raw.glyph === "string" && CATEGORY_ICONS.has(raw.glyph as SheetGlyph)
      ? (raw.glyph as SheetGlyph)
      : DEFAULT_SHEET_GLYPH;
  const color =
    typeof raw.color === "string" && raw.color.length > 0
      ? raw.color
      : DEFAULT_SHEET_COLOR;
  const description =
    typeof raw.description === "string" ? raw.description : "";

  return {
    ok: true,
    value: {
      id,
      name,
      type,
      glyph,
      color,
      description,
      items: validatedItems,
    },
  };
}

function validateAccount(raw: unknown, path: string): Result<Account> {
  if (!isObject(raw)) return fail(path, "expected an object");
  const { id, name } = raw;
  if (typeof id !== "string" || id === "")
    return fail(`${path}.id`, "expected a non-empty string");
  if (typeof name !== "string")
    return fail(`${path}.name`, "expected a string");
  const account: Account = { id, name };
  // Every extra field is optional and free-form; we accept strings
  // straight through, and validate `glyph` against the same allowlist
  // categories use. Unknown fields are simply dropped.
  if (typeof raw.description === "string")
    account.description = raw.description;
  if (
    typeof raw.glyph === "string" &&
    CATEGORY_ICONS.has(raw.glyph as CategoryIcon)
  ) {
    account.glyph = raw.glyph as CategoryIcon;
  }
  if (typeof raw.color === "string" && raw.color.length > 0)
    account.color = raw.color;
  if (typeof raw.bank === "string") account.bank = raw.bank;
  if (typeof raw.clearing === "string") account.clearing = raw.clearing;
  if (typeof raw.accountNumber === "string")
    account.accountNumber = raw.accountNumber;
  if (typeof raw.iban === "string") account.iban = raw.iban;
  if (typeof raw.bic === "string") account.bic = raw.bic;
  if (typeof raw.currency === "string" && raw.currency.length > 0)
    account.currency = raw.currency;
  if (
    typeof raw.openingBalance === "number" &&
    Number.isFinite(raw.openingBalance)
  )
    account.openingBalance = raw.openingBalance;
  return { ok: true, value: account };
}

function validateHistoryEntry(
  raw: unknown,
  path: string,
): Result<HistoryEntry> {
  if (!isObject(raw)) return fail(path, "expected an object");
  const { id, date, description, amount, balance, importedAt } = raw;
  if (typeof id !== "string" || id === "")
    return fail(`${path}.id`, "expected a non-empty string");
  if (typeof date !== "string" || date === "")
    return fail(`${path}.date`, "expected an ISO date string");
  if (typeof description !== "string")
    return fail(`${path}.description`, "expected a string");
  if (typeof amount !== "number" || !Number.isFinite(amount))
    return fail(`${path}.amount`, "expected a finite number");
  if (typeof balance !== "number" || !Number.isFinite(balance))
    return fail(`${path}.balance`, "expected a finite number");
  if (typeof importedAt !== "number" || !Number.isFinite(importedAt))
    return fail(`${path}.importedAt`, "expected a finite number");
  const entry: HistoryEntry = {
    id,
    date,
    description,
    amount,
    balance,
    importedAt,
  };
  if (raw.hidden !== undefined) {
    if (typeof raw.hidden !== "boolean")
      return fail(`${path}.hidden`, "expected a boolean");
    if (raw.hidden) entry.hidden = true;
  }
  return { ok: true, value: entry };
}

function validateHistoryImport(
  raw: unknown,
  path: string,
): Result<HistoryImport> {
  if (!isObject(raw)) return fail(path, "expected an object");
  const {
    id,
    importedAt,
    filename,
    bankParserId,
    rangeStart,
    rangeEnd,
    addedCount,
    duplicateCount,
  } = raw;
  if (typeof id !== "string" || id === "")
    return fail(`${path}.id`, "expected a non-empty string");
  if (typeof importedAt !== "number" || !Number.isFinite(importedAt))
    return fail(`${path}.importedAt`, "expected a finite number");
  if (typeof filename !== "string")
    return fail(`${path}.filename`, "expected a string");
  if (typeof bankParserId !== "string")
    return fail(`${path}.bankParserId`, "expected a string");
  if (typeof rangeStart !== "string")
    return fail(`${path}.rangeStart`, "expected a string");
  if (typeof rangeEnd !== "string")
    return fail(`${path}.rangeEnd`, "expected a string");
  if (typeof addedCount !== "number" || !Number.isFinite(addedCount))
    return fail(`${path}.addedCount`, "expected a finite number");
  if (typeof duplicateCount !== "number" || !Number.isFinite(duplicateCount))
    return fail(`${path}.duplicateCount`, "expected a finite number");
  return {
    ok: true,
    value: {
      id,
      importedAt,
      filename,
      bankParserId,
      rangeStart,
      rangeEnd,
      addedCount,
      duplicateCount,
    },
  };
}

function validateTransaction(
  raw: unknown,
  path: string,
  knownAccountIds: ReadonlySet<string>,
  knownCategoryIds: ReadonlySet<string>,
): Result<Transaction> {
  if (!isObject(raw)) return fail(path, "expected an object");
  const { id, date, description, amount, fromAccountId, toAccountId } = raw;
  if (typeof id !== "string" || id === "")
    return fail(`${path}.id`, "expected a non-empty string");
  if (typeof date !== "string")
    return fail(`${path}.date`, "expected an ISO date string");
  if (typeof description !== "string")
    return fail(`${path}.description`, "expected a string");
  if (typeof amount !== "number" || !Number.isFinite(amount))
    return fail(`${path}.amount`, "expected a finite number");
  if (typeof fromAccountId !== "string" || fromAccountId === "")
    return fail(`${path}.fromAccountId`, "expected a non-empty string");
  if (typeof toAccountId !== "string" || toAccountId === "")
    return fail(`${path}.toAccountId`, "expected a non-empty string");
  if (!knownAccountIds.has(fromAccountId))
    return fail(
      `${path}.fromAccountId`,
      `references unknown account "${fromAccountId}"`,
    );
  if (!knownAccountIds.has(toAccountId))
    return fail(
      `${path}.toAccountId`,
      `references unknown account "${toAccountId}"`,
    );
  const tx: Transaction = {
    id,
    date,
    description,
    amount,
    fromAccountId,
    toAccountId,
  };
  if (raw.categoryId !== undefined) {
    if (raw.categoryId === null) {
      tx.categoryId = null;
    } else if (typeof raw.categoryId === "string" && raw.categoryId !== "") {
      // Drop dangling category references silently so a deleted
      // category can't trap the transaction; the cell renderer treats
      // an unknown id as "no category".
      tx.categoryId = knownCategoryIds.has(raw.categoryId)
        ? raw.categoryId
        : null;
    } else {
      return fail(`${path}.categoryId`, "expected a string or null");
    }
  }
  if (raw.completed !== undefined) {
    if (typeof raw.completed !== "boolean")
      return fail(`${path}.completed`, "expected a boolean");
    tx.completed = raw.completed;
  }
  return { ok: true, value: tx };
}

function validateCategory(raw: unknown, path: string): Result<Category> {
  if (!isObject(raw)) return fail(path, "expected an object");
  const { id, name, color, icon } = raw;
  if (typeof id !== "string" || id === "")
    return fail(`${path}.id`, "expected a non-empty string");
  if (typeof name !== "string")
    return fail(`${path}.name`, "expected a string");
  if (typeof color !== "string" || color === "")
    return fail(`${path}.color`, "expected a non-empty string");
  if (typeof icon !== "string" || !CATEGORY_ICONS.has(icon as CategoryIcon))
    return fail(`${path}.icon`, `unknown category icon "${String(icon)}"`);
  return {
    ok: true,
    value: { id, name, color, icon: icon as CategoryIcon },
  };
}

// Soft-recovering settings validator: each field falls back to its
// default when missing or invalid so a stray hand-edit can't lock the
// user out of the app. The settings are display preferences, not data
// — silently snapping back to sensible defaults is the right trade.
function validateSettings(raw: unknown): Settings {
  if (!isObject(raw)) return { ...DEFAULT_SETTINGS };
  const startOfMonth =
    typeof raw.startOfMonth === "number" &&
    Number.isInteger(raw.startOfMonth) &&
    raw.startOfMonth >= 1 &&
    raw.startOfMonth <= 28
      ? raw.startOfMonth
      : DEFAULT_SETTINGS.startOfMonth;
  const dateFormat =
    typeof raw.dateFormat === "string" &&
    DATE_FORMAT_SET.has(raw.dateFormat as DateFormat)
      ? (raw.dateFormat as DateFormat)
      : DEFAULT_SETTINGS.dateFormat;
  const shortDateFormat =
    typeof raw.shortDateFormat === "string" &&
    SHORT_DATE_FORMAT_SET.has(raw.shortDateFormat as ShortDateFormat)
      ? (raw.shortDateFormat as ShortDateFormat)
      : DEFAULT_SETTINGS.shortDateFormat;
  const currency =
    typeof raw.currency === "string" && raw.currency.length > 0
      ? raw.currency
      : DEFAULT_SETTINGS.currency;
  const currencyPosition =
    raw.currencyPosition === "before" || raw.currencyPosition === "after"
      ? raw.currencyPosition
      : DEFAULT_SETTINGS.currencyPosition;
  const currencySpace =
    typeof raw.currencySpace === "boolean"
      ? raw.currencySpace
      : DEFAULT_SETTINGS.currencySpace;
  const decimalSeparator =
    typeof raw.decimalSeparator === "string" &&
    DECIMAL_SEPARATORS.has(raw.decimalSeparator as DecimalSeparator)
      ? (raw.decimalSeparator as DecimalSeparator)
      : DEFAULT_SETTINGS.decimalSeparator;
  let thousandsSeparator: ThousandsSeparator =
    typeof raw.thousandsSeparator === "string" &&
    THOUSANDS_SEPARATORS.has(raw.thousandsSeparator as ThousandsSeparator)
      ? (raw.thousandsSeparator as ThousandsSeparator)
      : DEFAULT_SETTINGS.thousandsSeparator;
  // Thousands and decimal can never be the same character; fall back
  // to "no thousands separator" if they collide so display logic isn't
  // fighting ambiguous input.
  if (thousandsSeparator === decimalSeparator) thousandsSeparator = "";
  const formatNumbers =
    typeof raw.formatNumbers === "boolean"
      ? raw.formatNumbers
      : DEFAULT_SETTINGS.formatNumbers;
  const showCurrency =
    typeof raw.showCurrency === "boolean"
      ? raw.showCurrency
      : DEFAULT_SETTINGS.showCurrency;
  const showDecimals =
    typeof raw.showDecimals === "boolean"
      ? raw.showDecimals
      : DEFAULT_SETTINGS.showDecimals;
  const sessionTimeoutMinutes =
    typeof raw.sessionTimeoutMinutes === "number" &&
    Number.isFinite(raw.sessionTimeoutMinutes) &&
    raw.sessionTimeoutMinutes >= MIN_SESSION_TIMEOUT_MINUTES &&
    raw.sessionTimeoutMinutes <= MAX_SESSION_TIMEOUT_MINUTES
      ? Math.round(raw.sessionTimeoutMinutes)
      : DEFAULT_SETTINGS.sessionTimeoutMinutes;
  return {
    startOfMonth,
    dateFormat,
    shortDateFormat,
    currency,
    currencyPosition,
    currencySpace,
    decimalSeparator,
    thousandsSeparator,
    formatNumbers,
    showCurrency,
    showDecimals,
    sessionTimeoutMinutes,
  };
}

export function validateUserData(raw: unknown): Result<UserData> {
  if (!isObject(raw)) return fail("root", "expected an object");
  if (raw.version !== LATEST_VERSION)
    return fail(
      "version",
      `expected ${LATEST_VERSION}, got ${String(raw.version)}`,
    );
  if (!Array.isArray(raw.sheets) || raw.sheets.length === 0)
    return fail("sheets", "expected a non-empty array");
  if (typeof raw.activeSheetId !== "string")
    return fail("activeSheetId", "expected a string");

  const rawAccounts = Array.isArray(raw.accounts) ? raw.accounts : [];
  const accounts: Account[] = [];
  const seenAccountIds = new Set<string>();
  for (let i = 0; i < rawAccounts.length; i++) {
    const r = validateAccount(rawAccounts[i], `accounts[${i}]`);
    if (!r.ok) return r;
    if (seenAccountIds.has(r.value.id))
      return fail(`accounts[${i}].id`, `duplicate id "${r.value.id}"`);
    seenAccountIds.add(r.value.id);
    accounts.push(r.value);
  }

  const rawCategories = Array.isArray(raw.categories) ? raw.categories : [];
  const categories: Category[] = [];
  const seenCategoryIds = new Set<string>();
  for (let i = 0; i < rawCategories.length; i++) {
    const r = validateCategory(rawCategories[i], `categories[${i}]`);
    if (!r.ok) return r;
    if (seenCategoryIds.has(r.value.id))
      return fail(`categories[${i}].id`, `duplicate id "${r.value.id}"`);
    seenCategoryIds.add(r.value.id);
    categories.push(r.value);
  }

  const rawTransactions = Array.isArray(raw.transactions)
    ? raw.transactions
    : [];
  const transactions: Transaction[] = [];
  const seenTransactionIds = new Set<string>();
  for (let i = 0; i < rawTransactions.length; i++) {
    const r = validateTransaction(
      rawTransactions[i],
      `transactions[${i}]`,
      seenAccountIds,
      seenCategoryIds,
    );
    if (!r.ok) return r;
    if (seenTransactionIds.has(r.value.id))
      return fail(`transactions[${i}].id`, `duplicate id "${r.value.id}"`);
    seenTransactionIds.add(r.value.id);
    transactions.push(r.value);
  }

  const sheets: Sheet[] = [];
  const seenSheetIds = new Set<string>();
  for (let i = 0; i < raw.sheets.length; i++) {
    const r = validateSheet(raw.sheets[i], `sheets[${i}]`, seenAccountIds);
    if (!r.ok) return r;
    if (seenSheetIds.has(r.value.id))
      return fail(`sheets[${i}].id`, `duplicate id "${r.value.id}"`);
    seenSheetIds.add(r.value.id);
    sheets.push(r.value);
  }

  // Recover gracefully if activeSheetId points at a missing sheet.
  const activeSheetId = seenSheetIds.has(raw.activeSheetId)
    ? raw.activeSheetId
    : sheets[0].id;

  // `history` and `historyImports` are per-account maps. Entries
  // belonging to a deleted account are silently dropped so removing
  // an account can't make the workspace unloadable, and duplicate
  // entry ids within an account collapse to one (the parser is
  // expected to dedup, but a hand-edited file shouldn't crash).
  const rawHistory = isObject(raw.history) ? raw.history : {};
  const history: Record<string, HistoryEntry[]> = {};
  for (const [accountId, rawEntries] of Object.entries(rawHistory)) {
    if (!seenAccountIds.has(accountId)) continue;
    if (!Array.isArray(rawEntries)) continue;
    const entries: HistoryEntry[] = [];
    const seenIds = new Set<string>();
    for (let i = 0; i < rawEntries.length; i++) {
      const r = validateHistoryEntry(
        rawEntries[i],
        `history.${accountId}[${i}]`,
      );
      if (!r.ok) return r;
      if (seenIds.has(r.value.id)) continue;
      seenIds.add(r.value.id);
      entries.push(r.value);
    }
    if (entries.length > 0) history[accountId] = entries;
  }

  const rawHistoryImports = isObject(raw.historyImports)
    ? raw.historyImports
    : {};
  const historyImports: Record<string, HistoryImport[]> = {};
  for (const [accountId, rawImports] of Object.entries(rawHistoryImports)) {
    if (!seenAccountIds.has(accountId)) continue;
    if (!Array.isArray(rawImports)) continue;
    const imports: HistoryImport[] = [];
    for (let i = 0; i < rawImports.length; i++) {
      const r = validateHistoryImport(
        rawImports[i],
        `historyImports.${accountId}[${i}]`,
      );
      if (!r.ok) return r;
      imports.push(r.value);
    }
    if (imports.length > 0) historyImports[accountId] = imports;
  }

  const settings = validateSettings(raw.settings);

  return {
    ok: true,
    value: {
      version: LATEST_VERSION,
      sheets,
      activeSheetId,
      accounts,
      categories,
      transactions,
      history,
      historyImports,
      settings,
    },
  };
}
