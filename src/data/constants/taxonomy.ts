import type { CategoryIcon, SheetGlyph } from "../types";

// Palette for new categories. The set is tuned to read well over both
// One Dark and One Light surfaces; users pick from these or override.
// Colorless swatches (black / white / gray) are deliberately excluded —
// categories and types should always carry a hue so they stay
// distinguishable in chips and pickers.
//
// Index stability: the first eight entries are the original Atom One
// Dark accents and are referenced by index from `PRESET_CATEGORIES`,
// `PRESET_ENTRY_TYPES`, and `createSeedEntryTypes()`. Never reorder
// 0..7; append-only beyond that.
export const CATEGORY_COLORS: readonly string[] = [
  "#e06c75",
  "#d19a66",
  "#e5c07b",
  "#98c379",
  "#56b6c2",
  "#61afef",
  "#c678dd",
  "#be5046",
  "#e88eb0",
  "#d97757",
  "#e8aa6c",
  "#a3d775",
  "#5cb39e",
  "#7b8cd4",
  "#b48ead",
  "#a07555",
];

// Sheets reuse the category palette. Keeping them aligned means a
// user's existing colour intuition carries over, and the visual style
// of the sheet tabs matches the chips inside the sheet.
export const SHEET_COLORS: readonly string[] = CATEGORY_COLORS;

// Realistic car body colours for the Cars sheet's per-car swatch. This
// is the one place the "always a hue" rule the shared CATEGORY_COLORS
// follow is deliberately broken: the swatch names the car's actual paint
// (white / silver / grey / gunmetal / black are the most common real
// colours), not a chip accent that has to stay distinguishable. The
// neutrals lead; the hues that follow are muted toward automotive paint
// rather than the vivid syntax accents. Values are nudged off pure
// #fff / #000 so they stay visible on both One Dark and One Light
// surfaces — the car picker also draws a faint border (ColorPalette's
// `bordered`) so a near-white or near-black swatch never vanishes.
export const CAR_COLORS: readonly string[] = [
  "#e9ebee", // white / pearl
  "#c2c7cd", // silver
  "#9aa0a6", // grey
  "#5c626a", // gunmetal
  "#2c2f34", // black
  "#c0523f", // red
  "#8f3d34", // burgundy
  "#c98a3e", // bronze / champagne
  "#d8c9a0", // beige
  "#3f74b0", // blue
  "#2f4a6b", // navy
  "#4f8f6a", // green
  "#2f5f57", // racing green
] as const;

// Default paint for a freshly-created car — a mid blue, saturated enough
// that its chip tint reads on both themes (unlike the near-white first
// swatch).
export const DEFAULT_CAR_COLOR: string = CAR_COLORS[9];

// Defaults applied to migrated sheets and the very first sheet a
// fresh budget seeds. `wallet` is a generic money glyph that reads
// well even at the tiny size used in the bottom tab bar.
export const DEFAULT_SHEET_GLYPH: SheetGlyph = "wallet";
export const DEFAULT_SHEET_COLOR: string = SHEET_COLORS[5];

// Master allowlist of glyph names. Used by the validator (rejects
// values outside this set) and as the source of truth that mirrors
// the `CategoryIcon` union in `types.ts`. Adding a glyph means
// touching this array, the union, and the `CATEGORY_ICONS` map in
// `components/icons.tsx`.
//
// The picker grids do NOT iterate this directly — each context picks
// from a curated subset (`SHEET_GLYPH_NAMES`, `ACCOUNT_GLYPH_NAMES`,
// `CATEGORY_GLYPH_NAMES`, `TYPE_GLYPH_NAMES`) so the user sees
// relevant choices for what they're labelling. Cross-context values
// still validate (a category tagged `wallet` is fine; the picker just
// won't offer it in the category grid).
export const CATEGORY_ICON_NAMES = [
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
  "hotel",
  "package",
  "hand-heart",
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
  "cookie",
  "croissant",
  "cake",
  "ice-cream",
  "candy",
  "beer",
  "wine",
  "hand-platter",
  "cooking-pot",
  "milk",
  "bus",
  "train",
  "bike",
  "fuel",
  "car-front",
  "car-taxi-front",
  "van",
  "truck-electric",
  "caravan",
  "motorbike",
  "scooter",
  "gauge",
  "ship",
  "bed",
  "sofa",
  "lightbulb",
  "droplet",
  "flame",
  "wifi",
  "key",
  "wrench",
  "hammer",
  "drill",
  "brush-cleaning",
  "trash-2",
  "sprout",
  "umbrella",
  "paint-roller",
  "washing-machine",
  "smartphone",
  "laptop",
  "headphones",
  "camera",
  "tv",
  "watch",
  "shirt",
  "scissors",
  "ticket",
  "gamepad-2",
  "book-open",
  "dumbbell",
  "dog",
  "cat",
  "paw-print",
  "tree-pine",
  "baby",
  "toy-brick",
  "school",
  "trophy",
  "pencil",
  "dice-5",
  "book-headphones",
  "hourglass",
  "heart-pulse",
  "shield-plus",
  "glasses",
  "brain",
  "coins",
  "hand-coins",
  "landmark",
  "building-2",
  "vault",
  "gem",
  "bitcoin",
  "scale",
  "trending-up",
  "line-chart",
  "pie-chart",
  "calendar-days",
  "globe",
  "arrow-down-circle",
  "arrow-up-circle",
  "percent",
  "scroll-text",
  "newspaper",
  "book-marked",
  "clapperboard",
  "guitar",
  "palette",
  "lamp",
  "bath",
  "compass",
  "user",
  "users",
  "handshake",
  "circle-help",
  "repeat",
  "banknote-arrow-down",
  "flag",
  "shield-alert",
  "cloud",
  "chart-candlestick",
  "diamond",
  "crown",
  "medal",
  "cpu",
  "satellite",
  "rocket",
  "dna",
  "microscope",
  "sun",
  "wind",
  "atom",
  "battery-charging",
  "factory",
  "pickaxe",
  "wheat",
  "truck",
  "shield",
] as const;

// Sheets are workspace containers and planners — what's being tracked.
// The palette leans toward money, planning, and high-level financial
// concepts; fine-grained entries (gasoline, restaurant visits) belong
// on EntryTypes, not on the sheet tab.
export const SHEET_GLYPH_NAMES: readonly CategoryIcon[] = [
  "wallet",
  "piggy-bank",
  "banknote",
  "credit-card",
  "coins",
  "landmark",
  "vault",
  "calendar-days",
  "pie-chart",
  "line-chart",
  "trending-up",
  "scale",
  "home",
  "car",
  "utensils",
  "plane",
  "briefcase",
  "graduation-cap",
  "baby",
  "heart-pulse",
  "gift",
  "receipt",
  "star",
] as const;

// Items sheets catalogue physical possessions and assets — what you
// own and what it's worth. Unlike the planner-leaning SHEET_GLYPH_NAMES,
// this palette is concrete (electronics, furniture, vehicles, valuables)
// because the sheet tab stands in for a thing, not a financial concept.
// The SheetModal picks this set when the selected sheet type is "items"
// via the descriptor's `glyphNames`.
export const ITEMS_GLYPH_NAMES: readonly CategoryIcon[] = [
  "package",
  "home",
  "building-2",
  "car",
  "car-front",
  "bike",
  "plane",
  "ship",
  "sofa",
  "bed",
  "lamp",
  "tv",
  "laptop",
  "smartphone",
  "headphones",
  "camera",
  "gamepad-2",
  "washing-machine",
  "watch",
  "gem",
  "guitar",
  "shirt",
  "glasses",
  "dumbbell",
  "book-open",
  "palette",
  "wrench",
  "key",
  "bitcoin",
  "coins",
  "trending-up",
  "star",
] as const;

// Properties sheets stand for real estate — homes, apartments, cabins,
// land — so the palette leans toward buildings and the keys / landmarks
// that read as "a place you own". The SheetModal picks this set when the
// selected sheet type is "properties" via the descriptor's `glyphNames`.
export const PROPERTIES_GLYPH_NAMES: readonly CategoryIcon[] = [
  "home",
  "building-2",
  "key",
  "landmark",
  "vault",
  "car",
  "plane",
  "ship",
  "trending-up",
  "coins",
  "scale",
  "star",
] as const;

// Cars sheets stand for the vehicles the user owns, leases, shares, or
// reaches through a car pool — so the palette leans toward vehicles,
// the running costs that ride with them (fuel, service), and the
// alternatives the cost view compares against (bus, train, bike). The
// SheetModal picks this set when the selected sheet type is "cars" via
// the descriptor's `glyphNames`, and the per-car glyph picker in
// `CarEditorModal` offers the same set.
export const CARS_GLYPH_NAMES: readonly CategoryIcon[] = [
  // Body types — the "what kind of car" axis the user picks from first.
  // Lucide has no literal "sedan" / "SUV" / "sports car", so the set
  // leans on the closest silhouettes: `gauge` (a speedometer) reads as a
  // sports / performance car, `car-front` as a taller SUV / crossover,
  // `car` as a sedan / hatchback, `van` as an MPV / van, `truck` as a
  // pickup, `caravan` as a camper / motorhome.
  "gauge",
  "car",
  "car-front",
  "van",
  "truck",
  "truck-electric",
  "caravan",
  "car-taxi-front",
  "bus",
  "motorbike",
  "scooter",
  "bike",
  // Running-cost / alternative glyphs the cost view compares against.
  "battery-charging",
  "fuel",
  "wrench",
  "key",
  "star",
] as const;

// Loans sheets stand for borrowed money — mortgages, student loans, car
// loans, money owed to a person — so the palette leans toward lenders,
// the people money is borrowed from (personal loans), and the things
// loans and payment plans buy (vehicles, electronics, furniture,
// jewelry). The SheetModal picks this set when the selected sheet type
// is "loans" via the descriptor's `glyphNames`, and the per-loan glyph
// picker in `LoanModal` offers the same set.
export const LOANS_GLYPH_NAMES: readonly CategoryIcon[] = [
  "hand-coins",
  "landmark",
  "banknote",
  "credit-card",
  "vault",
  "coins",
  "wallet",
  "handshake",
  "user",
  "users",
  "home",
  "building-2",
  "car",
  "ship",
  "bike",
  "plane",
  "graduation-cap",
  "smartphone",
  "laptop",
  "tv",
  "headphones",
  "camera",
  "gamepad-2",
  "watch",
  "gem",
  "sofa",
  "bed",
  "washing-machine",
  "guitar",
  "receipt",
] as const;

// Insights sheets stand for analysis across everything the user tracks
// — net worth today, more modes later — so the palette leans toward
// charts, measurement, and discovery rather than any one money store.
// The SheetModal picks this set when the selected sheet type is
// "insights" via the descriptor's `glyphNames`.
export const INSIGHTS_GLYPH_NAMES: readonly CategoryIcon[] = [
  "line-chart",
  "pie-chart",
  "trending-up",
  "scale",
  "lightbulb",
  "sparkles",
  "compass",
  "glasses",
  "landmark",
  "wallet",
  "coins",
  "gem",
] as const;

// Scenarios sheets stand for what-if exploration — alternate futures
// played out against a real budget — so the palette leans toward
// navigation, chance, and foresight rather than any one money store.
// The SheetModal picks this set when the selected sheet type is
// "scenarios" via the descriptor's `glyphNames`.
export const SCENARIOS_GLYPH_NAMES: readonly CategoryIcon[] = [
  "compass",
  "dice-5",
  "line-chart",
  "trending-up",
  "lightbulb",
  "sparkles",
  "umbrella",
  "shield",
  "scale",
  "calendar-days",
  "wallet",
  "star",
] as const;

// Savings sheets stand for money set aside toward a goal, so beyond the
// money-store glyphs the palette covers the things people save for —
// vacations, clothing, kids' toys, a home, a car, electronics, pets,
// celebrations. The SheetModal picks this set when the selected sheet
// type is "savings" via the descriptor's `glyphNames`, and the
// per-saving glyph picker in `SavingsModal` offers the same set.
export const SAVINGS_GLYPH_NAMES: readonly CategoryIcon[] = [
  "piggy-bank",
  "coins",
  "banknote",
  "wallet",
  "landmark",
  "vault",
  "trending-up",
  "line-chart",
  "bitcoin",
  "plane",
  "hotel",
  "umbrella",
  "ship",
  "globe",
  "home",
  "car",
  "bike",
  "shirt",
  "gem",
  "baby",
  "toy-brick",
  "gamepad-2",
  "gift",
  "cake",
  "graduation-cap",
  "smartphone",
  "laptop",
  "tv",
  "sofa",
  "paw-print",
  "dumbbell",
  "guitar",
  "star",
] as const;

// Investment sheets stand for assets the user expects to grow — shares,
// funds, gold, crypto, bonds — so beyond the markets-and-stores-of-value
// glyphs the palette covers the industry sectors a holding can track
// (healthcare, technology, energy, industrials, real estate, …) and the
// commodities people hold directly (precious metals, crypto). The
// SheetModal picks this set when the selected sheet type is "investment"
// via the descriptor's `glyphNames`, and the per-holding / per-position
// glyph pickers offer the same set.
export const INVESTMENT_GLYPH_NAMES: readonly CategoryIcon[] = [
  // Markets & money
  "trending-up",
  "line-chart",
  "pie-chart",
  "chart-candlestick",
  "percent",
  "globe",
  "coins",
  "banknote",
  "landmark",
  "vault",
  "wallet",
  "piggy-bank",
  "credit-card",
  "scale",
  // Crypto
  "bitcoin",
  // Precious metals & valuables
  "gem",
  "diamond",
  "crown",
  "medal",
  // Technology
  "cpu",
  "laptop",
  "smartphone",
  "satellite",
  "rocket",
  "gamepad-2",
  // Healthcare & biotech
  "stethoscope",
  "pill",
  "dna",
  "microscope",
  "heart-pulse",
  // Energy & utilities
  "zap",
  "sun",
  "wind",
  "atom",
  "battery-charging",
  "fuel",
  "droplet",
  // Industry & transport
  "factory",
  "pickaxe",
  "truck",
  "ship",
  "plane",
  "car-front",
  // Real estate
  "home",
  "building-2",
  // Agriculture & consumer
  "wheat",
  "sprout",
  "tree-pine",
  "shopping-cart",
  // Misc
  "shield",
  "briefcase",
  "sparkles",
  "star",
] as const;

// Accounts are real-world money stores — bank accounts, cards, cash,
// brokerage, crypto, loans. The palette covers the spectrum so users
// can express checking vs. mortgage vs. mobile-pay app at a glance.
export const ACCOUNT_GLYPH_NAMES: readonly CategoryIcon[] = [
  "wallet",
  "coins",
  "banknote",
  "credit-card",
  "landmark",
  "building-2",
  "vault",
  "piggy-bank",
  "gift",
  "baby",
  "trending-up",
  "line-chart",
  "gem",
  "bitcoin",
  "scale",
  "home",
  "car",
  "graduation-cap",
  "smartphone",
  "globe",
  "briefcase",
] as const;

// Employers are workplaces — the glyph stands in for the industry the
// user works within, so the palette spans the common sectors (office,
// tech, healthcare, education, trades, retail, hospitality, transport,
// media, …) rather than the money-leaning sheet/account sets. An
// employer is a place of work, not a money store, so the default glyph
// is a briefcase rather than a wallet.
export const EMPLOYER_GLYPH_NAMES: readonly CategoryIcon[] = [
  "briefcase",
  "building-2",
  "landmark",
  "laptop",
  "smartphone",
  "stethoscope",
  "heart-pulse",
  "pill",
  "graduation-cap",
  "school",
  "book-open",
  "scale",
  "utensils",
  "coffee",
  "shopping-bag",
  "shopping-cart",
  "shirt",
  "scissors",
  "wrench",
  "hammer",
  "paint-roller",
  "car-front",
  "fuel",
  "plane",
  "ship",
  "bus",
  "sprout",
  "tree-pine",
  "camera",
  "clapperboard",
  "music",
  "palette",
  "newspaper",
  "globe",
  "dumbbell",
  "zap",
] as const;

// Default glyph for a freshly-created employer. A briefcase reads as
// "workplace" — distinct from the money glyphs used for sheets and
// accounts.
export const DEFAULT_EMPLOYER_GLYPH: SheetGlyph = "briefcase";

// Categories are broad buckets used for cross-row analysis: Home,
// Food, Car, Travel, Health, Bills. The palette stays high-level so
// fine-grained icons (gasoline vs. bus vs. train) don't pollute what
// is meant to be a summary axis.
export const CATEGORY_GLYPH_NAMES: readonly CategoryIcon[] = [
  "home",
  "utensils",
  "shopping-bag",
  "shopping-cart",
  "shirt",
  "car",
  "plane",
  "heart-pulse",
  "pill",
  "receipt",
  "banknote",
  "piggy-bank",
  "credit-card",
  "graduation-cap",
  "book-open",
  "baby",
  "heart",
  "gift",
  "zap",
  "wifi",
  "film",
  "music",
  "gamepad-2",
  "dumbbell",
  "paw-print",
  "tree-pine",
  "briefcase",
  "wrench",
  "landmark",
  "palette",
  "sparkles",
  "star",
  "tag",
  "circle-help",
  "repeat",
  "cloud",
] as const;

// Company categories classify merchants — Grocery stores, Pharmacies,
// Fuel, Electronics. The palette leans toward shop / storefront glyphs
// so the user picking a category for a new company finds a relevant
// icon. Seeds in `PRESET_COMPANY_CATEGORIES` may reach outside this
// list (the persisted model accepts any `CategoryIcon`); this subset
// only governs what the in-app creator offers.
export const COMPANY_CATEGORY_GLYPH_NAMES: readonly CategoryIcon[] = [
  "shopping-cart",
  "shopping-bag",
  "utensils",
  "coffee",
  "pizza",
  "beer",
  "wine",
  "milk",
  "shirt",
  "scissors",
  "smartphone",
  "laptop",
  "tv",
  "headphones",
  "camera",
  "gamepad-2",
  "sofa",
  "home",
  "lightbulb",
  "wrench",
  "hammer",
  "fuel",
  "car",
  "car-front",
  "bus",
  "train",
  "bike",
  "plane",
  "hotel",
  "pill",
  "stethoscope",
  "heart-pulse",
  "dumbbell",
  "ticket",
  "film",
  "clapperboard",
  "music",
  "book-open",
  "newspaper",
  "paw-print",
  "dog",
  "briefcase",
  "landmark",
  "building-2",
  "credit-card",
  "banknote",
  "gift",
  "palette",
  "package",
  "key",
  "receipt",
  "tag",
  "circle-help",
] as const;

// EntryTypes are concrete, frequently-repeating entries: Rent,
// Gasoline, Restaurant visit, Coffee, Streaming, Salary. The palette
// is the widest of the four so users have a glyph for almost any
// real-world line item they want to label.
export const TYPE_GLYPH_NAMES: readonly CategoryIcon[] = [
  // Food & drink
  "utensils",
  "coffee",
  "pizza",
  "cookie",
  "croissant",
  "cake",
  "ice-cream",
  "candy",
  "beer",
  "wine",
  "hand-platter",
  "cooking-pot",
  "milk",
  "shopping-cart",
  // Transport
  "car",
  "car-front",
  "fuel",
  "bus",
  "train",
  "bike",
  "plane",
  "hotel",
  "package",
  // Home & utilities
  "home",
  "key",
  "bed",
  "sofa",
  "lightbulb",
  "droplet",
  "flame",
  "zap",
  "wifi",
  "wrench",
  "hammer",
  "drill",
  "brush-cleaning",
  "trash-2",
  "sprout",
  "umbrella",
  "paint-roller",
  "washing-machine",
  "lamp",
  "bath",
  // Tech & gadgets
  "smartphone",
  "laptop",
  "headphones",
  "camera",
  "tv",
  // Lifestyle
  "shopping-bag",
  "shirt",
  "scissors",
  "ticket",
  "film",
  "clapperboard",
  "music",
  "gamepad-2",
  "book-open",
  "book-marked",
  "newspaper",
  "palette",
  "dumbbell",
  "dog",
  "cat",
  "paw-print",
  "tree-pine",
  "baby",
  "toy-brick",
  "school",
  "trophy",
  "pencil",
  "dice-5",
  "book-headphones",
  "gift",
  "heart",
  "hand-heart",
  "hourglass",
  // Health
  "stethoscope",
  "pill",
  "heart-pulse",
  "shield-plus",
  "glasses",
  "brain",
  // Work & education
  "briefcase",
  "graduation-cap",
  // Money
  "banknote",
  "coins",
  "credit-card",
  "wallet",
  "piggy-bank",
  "hand-coins",
  "receipt",
  "arrow-down-circle",
  "arrow-up-circle",
  "trending-up",
  "scale",
  "landmark",
  "bitcoin",
  "percent",
  "scroll-text",
  // Misc
  "calendar-days",
  "compass",
  "sparkles",
  "star",
  "tag",
  // Status & flags
  "circle-help",
  "repeat",
  "banknote-arrow-down",
  "flag",
  "shield-alert",
  "cloud",
] as const;
