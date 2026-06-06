import type { TaxLocation } from "../tax/types";
import type {
  CustomTheme,
  DateFormat,
  DecimalSeparator,
  FontFamilyId,
  ShortDateFormat,
  ThemePreset,
  ThousandsSeparator,
} from "./settings-theme";

// Per-device download-modal defaults. Persisted inside the device
// scope of `Settings` so a desktop user's XLSX habit doesn't follow
// them onto a phone where CSV is friendlier, while two phones syncing
// the same account still get the same mobile defaults. The
// `accountInfo` / `accountTransactions` / `accountSelected` maps are
// keyed by account id; missing keys default to `true` so a freshly
// minted account inherits the sensible default.
export type BudgetDownloadFormat = "csv" | "xlsx";

export type BudgetDownloadPrefs = {
  format: BudgetDownloadFormat;
  includeHistory: boolean;
};

export type AccountsDownloadPrefs = {
  accountInfo: Record<string, boolean>;
  accountTransactions: Record<string, boolean>;
  accountSelected: Record<string, boolean>;
  includeTransactions: boolean;
  includeUnconfirmed: boolean;
  includeFutureEntries: boolean;
};

// Settings whose value can differ between mobile and desktop. Held in
// `PersistedSettings.device[scope]`; `useEffectiveSettings` resolves
// the active scope from the viewport and merges the bucket into the
// flat `Settings` shape every read site already consumes.
//
// New device-scoped fields go here. Anything that helps the user
// trade screen space for precision (showCurrency, abbreviateNumbers,
// fontScale, …) belongs in this bucket; anything that's a personal
// preference about the user, not about the screen (language, theme,
// startOfMonth, …) lives in `CommonSettings`.
export type DeviceSettings = {
  // Display toggles. `formatNumbers` controls whether amounts/balances
  // render with thousands grouping; `showCurrency` controls whether the
  // currency token is appended; `showDecimals` controls whether the
  // fractional portion is rendered at all (off rounds to whole units);
  // `abbreviateNumbers` collapses values >= 10 000 to "12K" / "1.2M"
  // so cramped mobile rows fit. Editable inputs stay precise — the
  // setting only affects display.
  formatNumbers: boolean;
  showCurrency: boolean;
  showDecimals: boolean;
  abbreviateNumbers: boolean;
  // Bypass the 10 000 abbreviation threshold for the running-balance
  // column on the main sheet view, so a column reads as uniformly
  // abbreviated rather than a mix of "12K" and "9 432". Has no effect
  // unless `abbreviateNumbers` is also on, and never affects the amount
  // column — small amounts stay precise because the amount is the
  // primary value while the balance is a derived snapshot.
  alwaysAbbreviateBalance: boolean;
  // Multiplier applied to the base UI font size. 1 is the default;
  // smaller values fit more on screen, larger values help readability.
  // Stored as a plain number (not a preset id) so a future slider can
  // pick any value in range without another schema bump. The runtime
  // applies it by setting `--app-font-scale` on the document root;
  // both the html root font-size (so every `rem`-based Tailwind utility
  // scales) and the body's absolute pixel font-size (so body-inherited
  // content scales too) read through that variable so the whole UI
  // scales together. Bounded by `MIN_FONT_SCALE` / `MAX_FONT_SCALE`.
  fontScale: number;
  // What clicking the "budget" wordmark in the page header does.
  // Inspired by the iPhone Action Button: the user picks a single
  // navigation shortcut they want one tap away. Default scrolls to
  // the top of the page (the web convention for a clickable
  // wordmark). The `sheet` variant carries the target sheet id; if
  // that sheet is later deleted the click handler falls back to
  // scrolling to the top so a dangling reference stays harmless.
  headerAction: HeaderAction;
  // Per-device download-modal defaults — desktop users tend to prefer
  // XLSX with the full export; mobile users tend to prefer CSV / JSON.
  // Seeded identically in both buckets by the v34 → v35 migration so
  // upgrading users see no behaviour change until they pick something
  // different on one of the devices.
  downloadBudget: BudgetDownloadPrefs;
  downloadAccounts: AccountsDownloadPrefs;
};

// Settings that hold a single value applied everywhere — locale,
// appearance, security, sync-error UX. A change on any device reaches
// every other device through the normal UserData cloud sync.
export type CommonSettings = {
  // Day-of-month the fiscal month rolls over on. Defaults to 25 because
  // the typical Swedish payday is the 25th, so the budget month aligns
  // with when salary lands. Bounded 1..28 so every calendar month has
  // the chosen day.
  startOfMonth: number;
  dateFormat: DateFormat;
  shortDateFormat: ShortDateFormat;
  // Free-form currency token shown next to amounts when `showCurrency`
  // is on. Defaults to "kr" (SEK). Not validated against a list — users
  // are free to type "$", "€", "USD", etc.
  currency: string;
  // Whether the currency symbol renders before ("$10") or after ("10 kr")
  // the amount. Independent of `currencySpace` so all four combinations
  // are reachable.
  currencyPosition: "before" | "after";
  // Whether a single space separates the symbol from the amount. Off
  // renders "$10" / "10kr"; on renders "$ 10" / "10 kr".
  currencySpace: boolean;
  decimalSeparator: DecimalSeparator;
  thousandsSeparator: ThousandsSeparator;
  // Minutes the decrypted password may sit in the tab's sessionStorage
  // before the user is auto-signed-out. The clock resets on every user
  // input, so this is an idle timeout, not a hard ceiling. Bounded
  // 1..1440 (one minute to 24 hours).
  sessionTimeoutMinutes: number;
  // Version string of the changelog the user last acknowledged. Null on
  // a fresh install — the app records the current version silently on
  // first run so an existing user never sees a popup the moment they
  // upgrade. When the running APP_VERSION compares greater than this,
  // the "What's new" modal opens and writes the current version here
  // on dismissal.
  lastSeenChangelogVersion: string | null;
  // UI language. "en" leaves the app in English (the default for
  // existing installs after the migration); "sv" translates every
  // user-facing string to Swedish. Date and number formatting are
  // controlled by their own settings and are not coupled to this
  // field — a Swedish-speaking user may still want, say, currency
  // before the amount.
  language: "en" | "sv";
  // Suppress rows flagged as inter-account transfers from the budget
  // tables. The running balance still accounts for their amounts —
  // they're hidden, not removed. Triggered by: a synthesized
  // Transfer row's `peerAccountId`, a `HistoryEntry.isTransfer`
  // flagged in the entry-edit modal, or a budget row's `isTransfer`
  // flagged by the per-row eye action. Each visible row whose
  // computed balance step crossed at least one hidden transfer has
  // its balance rendered in italic with a dotted underline; clicking
  // the balance inline-expands the hidden rows underneath. Default
  // false so the out-of-the-box view matches existing builds.
  hideTransfers: boolean;
  // Active theme preset. Defaults to `"system"` so a fresh install
  // tracks the OS colour scheme — matching the legacy behaviour
  // before the picker existed. Switching to `"custom"` activates
  // the colour / shape / motion overrides held under `customTheme`.
  theme: ThemePreset;
  // Active bundled webfont. Defaults to `"mono"` so existing users
  // keep the monospaced One Dark aesthetic. Applies across every
  // theme preset; the runtime writes the chosen stack to
  // `--app-font-family`.
  fontFamily: FontFamilyId;
  // Custom theme overrides. Always present in the persisted shape so
  // a "Reset to defaults" lands on a sensible baseline (clone of the
  // Dark palette) and flipping `theme` between `"custom"` and a
  // preset is a no-op for the colour bytes.
  customTheme: CustomTheme;
  // Map of achievement id → unix-ms unlock timestamp. Each id is a
  // stable string from the achievement catalog (see
  // `src/data/achievements/catalog.ts`). Writes go through
  // `recordAchievementUnlock`; the reducer guards against re-unlocking
  // an id that's already present so timestamps stay stable. Synced to
  // the cloud backend along with the rest of UserData so the trophy
  // room follows the user across devices.
  achievements: Record<string, number>;
  // Achievement ids the user has unlocked but not yet seen the modal
  // for. Drains to `[]` when the user dismisses the unlock modal via
  // `clearUnseenAchievements`. The HeaderStar shows a filled yellow
  // star whenever this array is non-empty; clicking opens the modal.
  unseenAchievements: string[];
  // When on (the default), a cloud auth-error auto-opens the dedicated
  // reconnect modal so the user can fix it without hunting for the
  // sync-status pill. Off if the user finds the prompt intrusive (e.g.
  // Google Drive's hourly token expiry); the underlying detection still
  // surfaces in the status pill regardless. Moved from device-local
  // localStorage into the synced bucket in v35 so the choice follows
  // the user across devices.
  cloudReauthAutoOpen: boolean;
  // Reading direction for transaction lists across the app: the
  // editable sheet, the read-only sheet viewer, the account transfer
  // log, and the account history modal. `"newestFirst"` puts today at
  // the top and walks backwards; `"oldestFirst"` walks forward from
  // the start of the ledger. Default is `"newestFirst"` since three of
  // the four surfaces already shipped with that direction baked in;
  // the editable sheet flips on first run for fresh installs. Affects
  // display only — `computeBalances()` always accumulates
  // chronologically so the running balance is independent of this
  // choice.
  transactionSortOrder: TransactionSortOrder;
  // When true, the editable budget sheet exposes `futureEntryMonths`
  // worth of upcoming fiscal months by default; when false, every
  // future-dated entry is tucked behind a "Show 3 future months"
  // toggle inside the sheet that steps the cutoff three months
  // forward per click. Default false — keeps the sheet anchored on
  // today's month so a planner with rows scheduled months out
  // doesn't push the current row off-screen.
  showFutureEntries: boolean;
  // Number of fiscal months past the current one to render by default
  // when `showFutureEntries` is true. Bounded 1..24 so a typo can't
  // force the sheet to render decades of empty placeholders. Anything
  // beyond this cutoff remains hidden behind the in-sheet toggle.
  futureEntryMonths: number;
  // How the transaction search modal ranks hits. Exposed end-to-end in
  // the Search settings tab so the user can re-weight what "relevant"
  // means for their own ledger. See `SearchRankingSettings`.
  searchRanking: SearchRankingSettings;
  // Amount floor (in the user's currency units) for the Items sheet's
  // "Find items" scan: a bank transaction whose `|amount|` clears this is
  // offered as a likely item purchase. Seeded per-currency on first run
  // (2000 kr / 200 € / 200 $) by `freshUserData`. Bounded `>= 0` by the
  // validator. Edited in the Items settings tab.
  itemFindThreshold: number;
  // Optional restriction for the "Find items" scan to specific entry
  // types (`EntryType.id`s). Empty means "all types" — the scan is then
  // gated by `itemFindThreshold` alone. Edited in the Items settings tab.
  itemFindTypeIds: string[];
  // Which preset names an item's uploaded receipt file. Picked in the
  // Items settings tab; consumed by `buildReceiptPath` when a receipt
  // is uploaded from the item editor. Defaults to `"name-date"`. See
  // `src/data/items/receipt-name.ts` for what each preset produces.
  receiptNamePattern: ReceiptNamePattern;
  // Label rendered next to a property's living area on the Properties
  // page. Both options describe the same square-metre quantity stored
  // on `Property.size` — `"kvm"` is the Swedish "kvadratmeter"
  // abbreviation, `"sqm"` the English one. A display preference only;
  // it never changes the stored number. Edited in the Property settings
  // tab. Defaults to `"kvm"`.
  propertySizeUnit: PropertySizeUnit;
  // The jurisdiction whose tax rules apply to estimates that aren't
  // bound to a per-sheet tax profile — today the property-sale
  // capital-gains calc on the Properties page. A `TaxLocation` literal
  // ("SE" today). Defaults to `"SE"`, matching the app's Sweden-leaning
  // defaults. Also seeds the default country when creating a new salary
  // tax profile. Edited in the Location section of the General settings
  // tab.
  location: TaxLocation;
};

// Display label for a property's living area. Both mean square metres;
// the choice is purely how the unit is written next to the number.
export type PropertySizeUnit = "kvm" | "sqm";

// Preset filename schemes for uploaded item receipts. `type-name-date`
// files the receipt under a per-type subdirectory inside `receipts/`;
// the other three are flat. The extension comes from the uploaded file.
export type ReceiptNamePattern =
  | "name"
  | "name-date"
  | "date-name"
  | "type-name-date";

export type TransactionSortOrder = "newestFirst" | "oldestFirst";

// Per-field importance weights for the search ranker. Higher = ranks
// earlier. The keys mirror the searchable text fields the index
// projects (see `src/data/search.ts`); a hit in a higher-weighted
// field outranks a hit in a lower-weighted one once match quality
// (whole-word vs mid-word) is equal. Bounded 0..10 by the validator.
export type SearchFieldWeights = {
  description: number;
  tag: number;
  company: number;
  type: number;
  category: number;
  bankDescription: number;
};

// User-tunable knobs for the transaction-search ranker, all editable
// from the Search settings tab. Defaults live in `DEFAULT_SEARCH_RANKING`
// and encode the out-of-the-box behaviour: match quality dominates,
// description > tag > company > type > category > bank text, recency
// breaks ties, amounts match within ±20%.
export type SearchRankingSettings = {
  // Which axis dominates the sort. `"quality"` puts a clean whole-word
  // match ahead of a mid-word substring even when the substring sits in
  // a higher-weighted field; `"field"` keeps field priority on top and
  // uses match quality only to break ties within a field.
  priority: "quality" | "field";
  // How recency influences the order. `"tiebreak"` only separates rows
  // that are otherwise equal (newest first); `"boost"` lets a recent
  // row edge out a slightly stronger older one within the same
  // field + quality tier; `"off"` ignores dates entirely.
  recency: "off" | "tiebreak" | "boost";
  fieldWeights: SearchFieldWeights;
  // Half-width of the amount-match band as a percentage of the queried
  // value: a query of 100 at 20% matches rows with |amount| in 80..120.
  // Bounded 0..100.
  amountTolerancePct: number;
  // Cap on rendered results. The hit counter still reports the full
  // pre-cap total. One of a small set of allowed values.
  maxResults: number;
};

// Persisted shape of `UserData.settings`. Common fields stay flat at
// the top level so the rest of the codebase (which reads
// `settings.currency`, `settings.startOfMonth`, …) keeps working; the
// device-scoped fields move into `device.{mobile,desktop}` so each
// viewport can hold its own value. Consumers should not read this
// type directly — go through `useEffectiveSettings()` (in
// `src/hooks/useEffectiveSettings.ts`) which returns the flat
// `Settings` shape with the active scope already merged in.
export type PersistedSettings = CommonSettings & {
  device: {
    mobile: DeviceSettings;
    desktop: DeviceSettings;
  };
};

// Effective, flat shape every read site already consumes. Produced by
// `resolveEffectiveSettings(persisted, isMobile)` — the common fields
// come from the top level, the device-scoped fields come from
// whichever bucket the active viewport selects.
export type Settings = CommonSettings & DeviceSettings;

// Discriminated union — `kind` selects the action and the only
// parameterised variant (`sheet`) carries its target id. Scales to
// future kinds that need parameters without another schema bump.
export type HeaderAction =
  | { kind: "top" }
  | { kind: "currentMonth" }
  | { kind: "refresh" }
  | { kind: "sheet"; sheetId: string };
