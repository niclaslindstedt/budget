import { DATE_FORMATS, DEFAULT_SETTINGS } from "./constants";
import { LATEST_VERSION } from "./migrations";
import type {
  Budget,
  Category,
  CategoryIcon,
  CellValue,
  Column,
  ColumnType,
  DateFormat,
  DecimalSeparator,
  Row,
  Settings,
  Sheet,
  ThousandsSeparator,
} from "./types";

const DATE_FORMAT_SET: ReadonlySet<DateFormat> = new Set(DATE_FORMATS);
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
  const { id, cells, seriesId } = raw;
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
  return { ok: true, value: row };
}

function validateSheet(raw: unknown, path: string): Result<Sheet> {
  if (!isObject(raw)) return fail(path, "expected an object");
  const { id, name, columns, rows } = raw;
  if (typeof id !== "string" || id === "")
    return fail(`${path}.id`, "expected a non-empty string");
  if (typeof name !== "string")
    return fail(`${path}.name`, "expected a string");
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
      name,
      columns: validatedColumns,
      rows: validatedRows,
    },
  };
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
  const currency =
    typeof raw.currency === "string" && raw.currency.length > 0
      ? raw.currency
      : DEFAULT_SETTINGS.currency;
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
  return {
    startOfMonth,
    dateFormat,
    currency,
    decimalSeparator,
    thousandsSeparator,
    formatNumbers,
    showCurrency,
  };
}

export function validateBudget(raw: unknown): Result<Budget> {
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

  const sheets: Sheet[] = [];
  const seenSheetIds = new Set<string>();
  for (let i = 0; i < raw.sheets.length; i++) {
    const r = validateSheet(raw.sheets[i], `sheets[${i}]`);
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

  const settings = validateSettings(raw.settings);

  return {
    ok: true,
    value: {
      version: LATEST_VERSION,
      sheets,
      activeSheetId,
      categories,
      settings,
    },
  };
}
