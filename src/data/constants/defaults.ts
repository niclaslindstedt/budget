import { DEFAULT_CUSTOM_THEME } from "../themes";
import type {
  AccountsDownloadPrefs,
  BudgetDownloadPrefs,
  DeviceSettings,
  PersistedSettings,
  Settings,
} from "../types";

// Default download-modal preferences. Lifted from the legacy
// `src/storage/download-preferences.ts` (deleted in v35) so the
// migration and the validator can seed them without re-importing
// from a place they no longer live.
export const DEFAULT_DOWNLOAD_BUDGET: BudgetDownloadPrefs = {
  format: "csv",
  includeHistory: true,
};

export const DEFAULT_DOWNLOAD_ACCOUNTS: AccountsDownloadPrefs = {
  accountInfo: {},
  accountTransactions: {},
  accountSelected: {},
  includeTransactions: true,
  includeUnconfirmed: false,
  includeFutureEntries: false,
};

// Effective-shape baseline used by tests, the SettingsModal "Reset to
// defaults" handler, and the validator's soft-recovery fallbacks. The
// shape is flat so existing reads (`DEFAULT_SETTINGS.fontScale`,
// `DEFAULT_SETTINGS.currency`) keep working — `DEFAULT_PERSISTED_SETTINGS`
// below splits this into the common + device buckets the runtime stores.
//
// Defaults are Sweden-leaning: salary on the 25th drives the fiscal
// month, "kr" is SEK, and the number format is the Swedish convention
// (space as thousands separator, comma as decimal).
export const DEFAULT_SETTINGS: Settings = {
  startOfMonth: 25,
  dateFormat: "YYYY-MM-DD",
  shortDateFormat: "DD/MM",
  currency: "kr",
  currencyPosition: "after",
  currencySpace: true,
  decimalSeparator: ",",
  thousandsSeparator: " ",
  formatNumbers: true,
  showCurrency: true,
  showDecimals: false,
  abbreviateNumbers: false,
  alwaysAbbreviateBalance: true,
  fontScale: 1,
  sessionTimeoutMinutes: 15,
  lastSeenChangelogVersion: null,
  // Fresh installs override this with `detectInitialLanguage()` so a
  // Swedish browser gets Swedish on first run. Existing buckets keep
  // whatever the v26 → v27 migration assigned (always "en") so a
  // returning user's UI doesn't suddenly flip language.
  language: "en",
  hideTransfers: false,
  // Default tracks the OS colour-scheme — matches the pre-picker
  // behaviour so existing users notice nothing until they open the
  // Appearance tab. Monospaced font keeps the One Dark aesthetic.
  theme: "system",
  fontFamily: "mono",
  customTheme: DEFAULT_CUSTOM_THEME,
  achievements: {},
  unseenAchievements: [],
  headerAction: { kind: "top" },
  downloadBudget: DEFAULT_DOWNLOAD_BUDGET,
  downloadAccounts: DEFAULT_DOWNLOAD_ACCOUNTS,
  cloudReauthAutoOpen: true,
  transactionSortOrder: "newestFirst",
  showFutureEntries: false,
  futureEntryMonths: 1,
  companyTypeAutoFillMinOccurrences: 11,
};

// Default values for the device-scoped slice of settings. Today mobile
// and desktop share the same defaults so a fresh install on either
// viewport behaves like pre-v35; the structure is here so future
// per-viewport defaults (e.g. mobile-friendly `headerAction`) can land
// without another migration.
export const DEFAULT_DEVICE_SETTINGS_MOBILE: DeviceSettings = {
  formatNumbers: DEFAULT_SETTINGS.formatNumbers,
  showCurrency: DEFAULT_SETTINGS.showCurrency,
  showDecimals: DEFAULT_SETTINGS.showDecimals,
  abbreviateNumbers: DEFAULT_SETTINGS.abbreviateNumbers,
  alwaysAbbreviateBalance: DEFAULT_SETTINGS.alwaysAbbreviateBalance,
  fontScale: DEFAULT_SETTINGS.fontScale,
  headerAction: DEFAULT_SETTINGS.headerAction,
  downloadBudget: { ...DEFAULT_DOWNLOAD_BUDGET },
  downloadAccounts: cloneAccountsDownloadPrefs(DEFAULT_DOWNLOAD_ACCOUNTS),
};

export const DEFAULT_DEVICE_SETTINGS_DESKTOP: DeviceSettings = {
  formatNumbers: DEFAULT_SETTINGS.formatNumbers,
  showCurrency: DEFAULT_SETTINGS.showCurrency,
  showDecimals: DEFAULT_SETTINGS.showDecimals,
  abbreviateNumbers: DEFAULT_SETTINGS.abbreviateNumbers,
  alwaysAbbreviateBalance: DEFAULT_SETTINGS.alwaysAbbreviateBalance,
  fontScale: DEFAULT_SETTINGS.fontScale,
  headerAction: DEFAULT_SETTINGS.headerAction,
  downloadBudget: { ...DEFAULT_DOWNLOAD_BUDGET },
  downloadAccounts: cloneAccountsDownloadPrefs(DEFAULT_DOWNLOAD_ACCOUNTS),
};

// Persisted-shape baseline. The runtime stores this; reads go through
// `useEffectiveSettings()` which resolves the active scope.
export const DEFAULT_PERSISTED_SETTINGS: PersistedSettings = {
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
  achievements: DEFAULT_SETTINGS.achievements,
  unseenAchievements: DEFAULT_SETTINGS.unseenAchievements,
  cloudReauthAutoOpen: DEFAULT_SETTINGS.cloudReauthAutoOpen,
  transactionSortOrder: DEFAULT_SETTINGS.transactionSortOrder,
  showFutureEntries: DEFAULT_SETTINGS.showFutureEntries,
  futureEntryMonths: DEFAULT_SETTINGS.futureEntryMonths,
  companyTypeAutoFillMinOccurrences:
    DEFAULT_SETTINGS.companyTypeAutoFillMinOccurrences,
  device: {
    mobile: DEFAULT_DEVICE_SETTINGS_MOBILE,
    desktop: DEFAULT_DEVICE_SETTINGS_DESKTOP,
  },
};

function cloneAccountsDownloadPrefs(
  p: AccountsDownloadPrefs,
): AccountsDownloadPrefs {
  return {
    accountInfo: { ...p.accountInfo },
    accountTransactions: { ...p.accountTransactions },
    accountSelected: { ...p.accountSelected },
    includeTransactions: p.includeTransactions,
    includeUnconfirmed: p.includeUnconfirmed,
    includeFutureEntries: p.includeFutureEntries,
  };
}

// Horizon used when a recurring entry has no explicit end date. Twelve
// months is enough to populate the next year's planning view without
// flooding storage; users can re-run the modal to extend further.
export const DEFAULT_RECURRENCE_MONTHS = 12;
