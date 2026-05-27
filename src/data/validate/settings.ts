import {
  DEFAULT_DEVICE_SETTINGS_DESKTOP,
  DEFAULT_DEVICE_SETTINGS_MOBILE,
  DEFAULT_DOWNLOAD_ACCOUNTS,
  DEFAULT_DOWNLOAD_BUDGET,
  DEFAULT_SETTINGS,
} from "../constants/defaults";
import {
  MAX_FONT_SCALE,
  MAX_SESSION_TIMEOUT_MINUTES,
  MIN_FONT_SCALE,
  MIN_SESSION_TIMEOUT_MINUTES,
} from "../constants/format";
import type {
  AccountsDownloadPrefs,
  BudgetDownloadPrefs,
  CommonSettings,
  DeviceSettings,
  HeaderAction,
  PersistedSettings,
} from "../types";
import {
  DATE_FORMAT_SET,
  DECIMAL_SEPARATORS,
  FONT_FAMILY_SET,
  SHORT_DATE_FORMAT_SET,
  THEME_SET,
  THOUSANDS_SEPARATORS,
  isObject,
  validateBoolRecord,
  validateEnum,
} from "./helpers";
import { validateCustomTheme } from "./theme";

// Soft-recovering settings validator: each field falls back to its
// default when missing or invalid so a stray hand-edit can't lock the
// user out of the app. The settings are display preferences, not data
// — silently snapping back to sensible defaults is the right trade.
//
// Persisted shape: common fields sit flat at the top level;
// device-scoped fields live under `device.{mobile,desktop}` so each
// viewport can hold its own value. The validator independently
// recovers each bucket: a missing `device` block reseeds both
// scopes; a malformed individual scope reseeds just that side.
export function validateSettings(raw: unknown): PersistedSettings {
  if (!isObject(raw)) return clonePersistedDefaults();
  const common = validateCommonSettings(raw);
  const rawDevice = isObject(raw.device) ? raw.device : null;
  const mobile = validateDeviceSettings(
    rawDevice?.mobile,
    DEFAULT_DEVICE_SETTINGS_MOBILE,
  );
  const desktop = validateDeviceSettings(
    rawDevice?.desktop,
    DEFAULT_DEVICE_SETTINGS_DESKTOP,
  );
  return {
    ...common,
    device: { mobile, desktop },
  };
}

function clonePersistedDefaults(): PersistedSettings {
  return {
    startOfMonth: DEFAULT_SETTINGS.startOfMonth,
    dateFormat: DEFAULT_SETTINGS.dateFormat,
    shortDateFormat: DEFAULT_SETTINGS.shortDateFormat,
    currency: DEFAULT_SETTINGS.currency,
    currencyPosition: DEFAULT_SETTINGS.currencyPosition,
    currencySpace: DEFAULT_SETTINGS.currencySpace,
    decimalSeparator: DEFAULT_SETTINGS.decimalSeparator,
    thousandsSeparator: DEFAULT_SETTINGS.thousandsSeparator,
    sessionTimeoutMinutes: DEFAULT_SETTINGS.sessionTimeoutMinutes,
    lastSeenChangelogVersion: DEFAULT_SETTINGS.lastSeenChangelogVersion,
    language: DEFAULT_SETTINGS.language,
    hideTransfers: DEFAULT_SETTINGS.hideTransfers,
    theme: DEFAULT_SETTINGS.theme,
    fontFamily: DEFAULT_SETTINGS.fontFamily,
    customTheme: DEFAULT_SETTINGS.customTheme,
    achievements: { ...DEFAULT_SETTINGS.achievements },
    unseenAchievements: [...DEFAULT_SETTINGS.unseenAchievements],
    cloudReauthAutoOpen: DEFAULT_SETTINGS.cloudReauthAutoOpen,
    transactionSortOrder: DEFAULT_SETTINGS.transactionSortOrder,
    showFutureEntries: DEFAULT_SETTINGS.showFutureEntries,
    futureEntryMonths: DEFAULT_SETTINGS.futureEntryMonths,
    device: {
      mobile: { ...DEFAULT_DEVICE_SETTINGS_MOBILE },
      desktop: { ...DEFAULT_DEVICE_SETTINGS_DESKTOP },
    },
  };
}

function validateCommonSettings(raw: Record<string, unknown>): CommonSettings {
  const startOfMonth =
    typeof raw.startOfMonth === "number" &&
    Number.isInteger(raw.startOfMonth) &&
    raw.startOfMonth >= 1 &&
    raw.startOfMonth <= 28
      ? raw.startOfMonth
      : DEFAULT_SETTINGS.startOfMonth;
  const dateFormat = validateEnum(
    raw.dateFormat,
    DATE_FORMAT_SET,
    DEFAULT_SETTINGS.dateFormat,
  );
  const shortDateFormat = validateEnum(
    raw.shortDateFormat,
    SHORT_DATE_FORMAT_SET,
    DEFAULT_SETTINGS.shortDateFormat,
  );
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
  const decimalSeparator = validateEnum(
    raw.decimalSeparator,
    DECIMAL_SEPARATORS,
    DEFAULT_SETTINGS.decimalSeparator,
  );
  let thousandsSeparator = validateEnum(
    raw.thousandsSeparator,
    THOUSANDS_SEPARATORS,
    DEFAULT_SETTINGS.thousandsSeparator,
  );
  // Thousands and decimal can never be the same character; fall back
  // to "no thousands separator" if they collide so display logic isn't
  // fighting ambiguous input.
  if (thousandsSeparator === decimalSeparator) thousandsSeparator = "";
  const sessionTimeoutMinutes =
    typeof raw.sessionTimeoutMinutes === "number" &&
    Number.isFinite(raw.sessionTimeoutMinutes) &&
    raw.sessionTimeoutMinutes >= MIN_SESSION_TIMEOUT_MINUTES &&
    raw.sessionTimeoutMinutes <= MAX_SESSION_TIMEOUT_MINUTES
      ? Math.round(raw.sessionTimeoutMinutes)
      : DEFAULT_SETTINGS.sessionTimeoutMinutes;
  const lastSeenChangelogVersion =
    typeof raw.lastSeenChangelogVersion === "string"
      ? raw.lastSeenChangelogVersion
      : null;
  const language: "en" | "sv" =
    raw.language === "sv" || raw.language === "en"
      ? raw.language
      : DEFAULT_SETTINGS.language;
  const hideTransfers =
    typeof raw.hideTransfers === "boolean"
      ? raw.hideTransfers
      : DEFAULT_SETTINGS.hideTransfers;
  const theme = validateEnum(raw.theme, THEME_SET, DEFAULT_SETTINGS.theme);
  const fontFamily = validateEnum(
    raw.fontFamily,
    FONT_FAMILY_SET,
    DEFAULT_SETTINGS.fontFamily,
  );
  const customTheme = validateCustomTheme(raw.customTheme);
  const achievements: Record<string, number> = {};
  if (isObject(raw.achievements)) {
    for (const [id, ts] of Object.entries(raw.achievements)) {
      if (
        typeof id === "string" &&
        id.length > 0 &&
        typeof ts === "number" &&
        Number.isFinite(ts) &&
        ts > 0
      ) {
        achievements[id] = ts;
      }
    }
  }
  const unseenAchievements: string[] = [];
  if (Array.isArray(raw.unseenAchievements)) {
    const seen = new Set<string>();
    for (const id of raw.unseenAchievements) {
      if (typeof id === "string" && id.length > 0 && !seen.has(id)) {
        seen.add(id);
        unseenAchievements.push(id);
      }
    }
  }
  const cloudReauthAutoOpen =
    typeof raw.cloudReauthAutoOpen === "boolean"
      ? raw.cloudReauthAutoOpen
      : DEFAULT_SETTINGS.cloudReauthAutoOpen;
  const transactionSortOrder =
    raw.transactionSortOrder === "newestFirst" ||
    raw.transactionSortOrder === "oldestFirst"
      ? raw.transactionSortOrder
      : DEFAULT_SETTINGS.transactionSortOrder;
  const showFutureEntries =
    typeof raw.showFutureEntries === "boolean"
      ? raw.showFutureEntries
      : DEFAULT_SETTINGS.showFutureEntries;
  const futureEntryMonths =
    typeof raw.futureEntryMonths === "number" &&
    Number.isInteger(raw.futureEntryMonths) &&
    raw.futureEntryMonths >= 1 &&
    raw.futureEntryMonths <= 24
      ? raw.futureEntryMonths
      : DEFAULT_SETTINGS.futureEntryMonths;
  return {
    startOfMonth,
    dateFormat,
    shortDateFormat,
    currency,
    currencyPosition,
    currencySpace,
    decimalSeparator,
    thousandsSeparator,
    sessionTimeoutMinutes,
    lastSeenChangelogVersion,
    language,
    hideTransfers,
    theme,
    fontFamily,
    customTheme,
    achievements,
    unseenAchievements,
    cloudReauthAutoOpen,
    transactionSortOrder,
    showFutureEntries,
    futureEntryMonths,
  };
}

function validateDeviceSettings(
  raw: unknown,
  fallback: DeviceSettings,
): DeviceSettings {
  if (!isObject(raw)) return { ...fallback };
  const formatNumbers =
    typeof raw.formatNumbers === "boolean"
      ? raw.formatNumbers
      : fallback.formatNumbers;
  const showCurrency =
    typeof raw.showCurrency === "boolean"
      ? raw.showCurrency
      : fallback.showCurrency;
  const showDecimals =
    typeof raw.showDecimals === "boolean"
      ? raw.showDecimals
      : fallback.showDecimals;
  const abbreviateNumbers =
    typeof raw.abbreviateNumbers === "boolean"
      ? raw.abbreviateNumbers
      : fallback.abbreviateNumbers;
  const alwaysAbbreviateBalance =
    typeof raw.alwaysAbbreviateBalance === "boolean"
      ? raw.alwaysAbbreviateBalance
      : fallback.alwaysAbbreviateBalance;
  const fontScale =
    typeof raw.fontScale === "number" &&
    Number.isFinite(raw.fontScale) &&
    raw.fontScale >= MIN_FONT_SCALE &&
    raw.fontScale <= MAX_FONT_SCALE
      ? raw.fontScale
      : fallback.fontScale;
  const headerAction = validateHeaderAction(
    raw.headerAction,
    fallback.headerAction,
  );
  const downloadBudget = validateBudgetDownloadPrefs(raw.downloadBudget);
  const downloadAccounts = validateAccountsDownloadPrefs(raw.downloadAccounts);
  return {
    formatNumbers,
    showCurrency,
    showDecimals,
    abbreviateNumbers,
    alwaysAbbreviateBalance,
    fontScale,
    headerAction,
    downloadBudget,
    downloadAccounts,
  };
}

function validateBudgetDownloadPrefs(raw: unknown): BudgetDownloadPrefs {
  if (!isObject(raw)) return { ...DEFAULT_DOWNLOAD_BUDGET };
  return {
    format: raw.format === "xlsx" ? "xlsx" : "csv",
    includeHistory:
      typeof raw.includeHistory === "boolean"
        ? raw.includeHistory
        : DEFAULT_DOWNLOAD_BUDGET.includeHistory,
  };
}

function validateAccountsDownloadPrefs(raw: unknown): AccountsDownloadPrefs {
  if (!isObject(raw)) {
    return {
      accountInfo: { ...DEFAULT_DOWNLOAD_ACCOUNTS.accountInfo },
      accountTransactions: {
        ...DEFAULT_DOWNLOAD_ACCOUNTS.accountTransactions,
      },
      accountSelected: { ...DEFAULT_DOWNLOAD_ACCOUNTS.accountSelected },
      includeTransactions: DEFAULT_DOWNLOAD_ACCOUNTS.includeTransactions,
      includeUnconfirmed: DEFAULT_DOWNLOAD_ACCOUNTS.includeUnconfirmed,
      includeFutureEntries: DEFAULT_DOWNLOAD_ACCOUNTS.includeFutureEntries,
    };
  }
  return {
    accountInfo: validateBoolRecord(raw.accountInfo),
    accountTransactions: validateBoolRecord(raw.accountTransactions),
    accountSelected: validateBoolRecord(raw.accountSelected),
    includeTransactions:
      typeof raw.includeTransactions === "boolean"
        ? raw.includeTransactions
        : DEFAULT_DOWNLOAD_ACCOUNTS.includeTransactions,
    includeUnconfirmed:
      typeof raw.includeUnconfirmed === "boolean"
        ? raw.includeUnconfirmed
        : DEFAULT_DOWNLOAD_ACCOUNTS.includeUnconfirmed,
    includeFutureEntries:
      typeof raw.includeFutureEntries === "boolean"
        ? raw.includeFutureEntries
        : DEFAULT_DOWNLOAD_ACCOUNTS.includeFutureEntries,
  };
}

// Coerce any malformed / unknown shape back to the default. The
// `sheet` variant keeps whatever id the user picked even when the
// sheet has since been deleted — the click handler in AppShell
// falls back to "go to top" at runtime, which keeps re-creating the
// same sheet id from a restore harmless.
function validateHeaderAction(
  raw: unknown,
  fallback: HeaderAction = DEFAULT_SETTINGS.headerAction,
): HeaderAction {
  if (!isObject(raw)) return fallback;
  const kind = raw.kind;
  if (kind === "top" || kind === "currentMonth" || kind === "refresh") {
    return { kind };
  }
  if (kind === "sheet" && typeof raw.sheetId === "string" && raw.sheetId) {
    return { kind: "sheet", sheetId: raw.sheetId };
  }
  return fallback;
}
