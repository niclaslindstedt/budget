// Master allowlist of glyph names used anywhere in the app. The picker
// grids for sheets, accounts, categories, and types each render a
// curated subset of this union (see `*_GLYPH_NAMES` in
// `data/constants/taxonomy.ts`) so the user sees relevant choices in each
// context, but the persisted data model accepts any value from the
// full union. That keeps cross-context moves (an icon used for a
// category today, promoted to a sheet glyph tomorrow) free.
export type CategoryIcon =
  // Originals — kept first to preserve existing display order in
  // contexts that still iterate the full allowlist.
  | "tag"
  | "home"
  | "car"
  | "shopping-bag"
  | "shopping-cart"
  | "utensils"
  | "coffee"
  | "pizza"
  | "heart"
  | "gift"
  | "music"
  | "film"
  | "plane"
  | "hotel"
  | "package"
  | "hand-heart"
  | "briefcase"
  | "graduation-cap"
  | "stethoscope"
  | "pill"
  | "receipt"
  | "banknote"
  | "credit-card"
  | "piggy-bank"
  | "wallet"
  | "zap"
  | "sparkles"
  | "star"
  // Food & drink
  | "cookie"
  | "croissant"
  | "cake"
  | "ice-cream"
  | "candy"
  | "beer"
  | "wine"
  | "hand-platter"
  | "cooking-pot"
  | "milk"
  // Transport
  | "bus"
  | "train"
  | "bike"
  | "fuel"
  | "car-front"
  | "car-taxi-front"
  | "van"
  | "truck-electric"
  | "caravan"
  | "motorbike"
  | "scooter"
  | "gauge"
  | "ship"
  // Home & utilities
  | "bed"
  | "sofa"
  | "lightbulb"
  | "droplet"
  | "flame"
  | "wifi"
  | "key"
  | "wrench"
  | "hammer"
  | "drill"
  | "brush-cleaning"
  | "trash-2"
  | "sprout"
  | "flower"
  | "umbrella"
  | "paint-roller"
  | "washing-machine"
  // Tech & gadgets
  | "smartphone"
  | "laptop"
  | "headphones"
  | "camera"
  | "tv"
  | "watch"
  // Lifestyle
  | "shirt"
  | "scissors"
  | "ticket"
  | "gamepad-2"
  | "book-open"
  | "dumbbell"
  | "dog"
  | "cat"
  | "paw-print"
  | "tree-pine"
  | "baby"
  | "toy-brick"
  | "school"
  | "trophy"
  | "pencil"
  | "dice-5"
  | "book-headphones"
  | "hourglass"
  // Health
  | "heart-pulse"
  | "shield-plus"
  | "glasses"
  | "brain"
  // Money & finance
  | "coins"
  | "hand-coins"
  | "landmark"
  | "building-2"
  | "vault"
  | "gem"
  | "bitcoin"
  | "scale"
  | "trending-up"
  | "line-chart"
  | "pie-chart"
  | "calendar-days"
  | "globe"
  | "arrow-down-circle"
  | "arrow-up-circle"
  | "percent"
  | "scroll-text"
  // Print, media & arts
  | "newspaper"
  | "book-marked"
  | "clapperboard"
  | "guitar"
  | "palette"
  | "lamp"
  | "bath"
  | "compass"
  // People
  | "user"
  | "users"
  | "handshake"
  // Status & flags
  | "circle-help"
  | "repeat"
  | "banknote-arrow-down"
  | "flag"
  | "shield-alert"
  | "cloud"
  // Sectors & markets — industry sectors, commodities, and trading
  | "chart-candlestick"
  | "diamond"
  | "crown"
  | "medal"
  | "cpu"
  | "satellite"
  | "rocket"
  | "dna"
  | "microscope"
  | "sun"
  | "wind"
  | "atom"
  | "battery-charging"
  | "factory"
  | "pickaxe"
  | "wheat"
  | "truck"
  | "shield";

// Broad bucket used for cross-row analysis: Food, Housing, Transport,
// Entertainment. A category owns a set of `EntryType`s (its concrete
// children) — every type belongs to exactly one category, and a row's
// category is derived through `row.typeId → type.categoryId`. The
// category itself is never selected directly on a row; rows pick a
// type and the category follows.
export type Category = {
  id: string;
  name: string;
  color: string;
  icon: CategoryIcon;
};

// Whether an EntryType belongs on the income side, the expense side,
// or works for either direction. Drives the `TypePicker` filter so
// "Salary" disappears when the user enters a negative amount and
// "Groceries" disappears on a positive one. `any` is the implicit
// default for user-created types (and for any preset that fits both
// directions) — when `kind` is missing, the type is offered in every
// sign context.
export type EntryTypeKind = "income" | "expense" | "any";

// Reusable label assigned to a row to describe what kind of entry it
// is — "Mortgage", "Groceries", "Restaurant", "Salary". Sits between
// the free-text description (which is specific to the row) and the
// category (which groups across rows for statistical analysis). Every
// type belongs to exactly one `Category` via `categoryId`; the
// category is derived through that link rather than stored on the row.
// The type's glyph and color replace the per-row `glyph` field that
// used to live on `Row`: now every row that shares a type also shares
// a visual identity, so the picker is the single source of truth for
// what a row looks like.
//
// `kind` narrows the picker so income-only entries (Salary, Bonus,
// Barnbidrag) never surface on a negative-amount row and expense-only
// entries never surface on a positive one. Absent on a type means
// "fits either direction". For preset types the default `kind` is
// hard-coded; the per-user override lives in
// `UserData.presetTypeKindOverrides`.
export type EntryType = {
  id: string;
  name: string;
  color: string;
  glyph: CategoryIcon;
  categoryId: string;
  kind?: EntryTypeKind;
};

// The third tier of the taxonomy, one level below `EntryType`:
// category → type → subtype. "Consumption" → "Electronics" → "Laptop".
// Every subtype belongs to exactly one `EntryType` via `typeId`, the way
// every type belongs to exactly one `Category` via `categoryId`; the type
// and category derive through that chain rather than being stored on the
// subtype.
//
// Subtypes are entirely user-curated — no presets ship — and are never
// rendered on the sheet. The only place they surface is the item creator,
// where an `Item` is tagged with a `subtypeId`. The model is name-only
// (mirroring `Company`) because there is no cell that needs a colour or
// glyph for it yet.
export type Subtype = {
  id: string;
  name: string;
  typeId: string;
};

// A merchant / organisation a row's money flows to (or from). Sits in
// `UserData.companies`; rows reference it through `Row.companyId`. The
// model is intentionally minimal — name only — so the Companies tab in
// Settings is a flat rename-list and analysis grows on top later. No
// presets ship: companies are entirely user-curated and grown through
// the inline create rows on `CompanyPicker`.
//
// The display fallback chain in the budget cell reads
// description → company name → type name → bank text, so a row paying
// H&M for sunglasses shows "Sunglasses" (description), a row paying
// H&M with no description shows "H&M" (company), and a row paying H&M
// with neither shows "Accessories" (type).
export type Company = {
  id: string;
  name: string;
  // Manually-curated type associations, in user-controlled priority
  // order (the Companies settings tab lets the user drag to reorder).
  // These seed the company → type hints: a company resolving to exactly
  // one type instant-fills it on pick, and a company with several
  // surfaces them as a "Suggested" section atop the type picker. Manual
  // ids rank ahead of types merely learned from past usage. Absent ⇒
  // none pinned; dangling ids (type later deleted) are swept on the
  // `deleteType` cascade and on load.
  typeIds?: readonly string[];
  // The merchant's category — "Grocery stores", "Pharmacies", "Fuel" —
  // used to analyse where the household shops. Optional; absent ⇒
  // unclassified. A dangling id (the company category was deleted, or a
  // preset removed in a newer build) is swept on load and on the
  // `deleteCompanyCategory` cascade, mirroring how `Row.companyId`
  // resolves. Single per company.
  companyCategoryId?: string;
};

// A classification for companies / merchants — "Grocery stores",
// "Pharmacies", "Fuel & charging". Sits one axis away from the budget
// `Category` (which groups *rows* through their type): a company
// category groups *merchants*, so the user can ask "how much do I spend
// at grocery stores across every type?". Mirrors `Category` shape
// (colour + glyph) so the picker and chips render identically.
//
// Like budget categories, a built-in list of Swedish-perspective
// presets (`PRESET_COMPANY_CATEGORIES` in
// `data/presets/company-categories.ts`) is layered on top of the
// user's own at runtime; preset ids use the `preset-company-cat-<slug>`
// prefix and the user can hide individual presets via
// `UserData.hiddenPresetCompanyCategoryIds`.
export type CompanyCategory = {
  id: string;
  name: string;
  color: string;
  icon: CategoryIcon;
};

// A user-defined label assigned to budget rows to group entries that
// cut across categories and types — "Vacation 2026", "Work expenses",
// "Reimbursable". Sits in `UserData.tags`; rows reference it through
// `Row.tagIds` (a row can carry several). Unlike `Company`, a tag is
// many-per-row and carries a `color` so the picker / search can render
// it as a coloured chip. No presets ship — tags are entirely
// user-curated through the inline create row on the `TagsPicker` and
// the Tags tab in Settings.
//
// Tags are intentionally invisible on the sheet itself: they never
// render in the row table or any cell. They surface only while editing
// an entry (the full-edit and bulk-edit modals) and in the search
// modal, where a tag name match makes an otherwise-unmatched row
// findable.
export type Tag = {
  id: string;
  name: string;
  color: string;
};
