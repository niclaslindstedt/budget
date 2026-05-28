// Built-in preset entry types — concrete labels parented to a preset
// category. Pickers, renderers that resolve a `typeId`, and the admin
// UI in Settings all read through `PRESET_ENTRY_TYPES` and the helpers
// here. The legacy `createSeedEntryTypes()` seed used by the v12 → v13
// migration also lives here so the preset list and the migration seed
// stay in one file.
//
// Preset ids use the `preset-type-<slug>` prefix so they're trivially
// distinguishable from user-minted ids (`t-…`) in stored data and in
// the validator. Once shipped, an id must never be reassigned — a
// rename keeps the id; a removed preset stays in this list (the hidden
// flag is the user-facing equivalent) so existing references continue
// to resolve.

import { CATEGORY_COLORS } from "../constants/taxonomy";
import type { CategoryIcon, EntryType, EntryTypeKind } from "../types";

// Historical seed for entry types — used only by the v12 → v13
// migration. The v13 → v20 path no longer seeds the per-user `types`
// array (`PRESET_ENTRY_TYPES` below replaces it as a built-in,
// hide-only list), but exports that landed at v12 must still upgrade
// to a non-empty seed so users who migrate forward see something in
// the picker on first promote. Each call returns a fresh array with
// newly minted ids so the seed is safe to invoke without ids
// colliding. The v24 → v25 migration assigns every seeded type a
// `categoryId` after the fact (matching the type's name against the
// preset-type mapping); the legacy seed shape here intentionally
// omits the field so this function stays a faithful reproduction of
// what v12 exports actually contained.
export function createSeedEntryTypes(): Omit<EntryType, "categoryId">[] {
  const C = CATEGORY_COLORS;
  const seeds: ReadonlyArray<{
    name: string;
    color: string;
    glyph: CategoryIcon;
  }> = [
    { name: "Mortgage", color: C[0], glyph: "home" },
    { name: "Rent", color: C[1], glyph: "home" },
    { name: "Groceries", color: C[3], glyph: "shopping-cart" },
    { name: "Restaurant", color: C[2], glyph: "utensils" },
    { name: "Coffee", color: C[7], glyph: "coffee" },
    { name: "Transport", color: C[4], glyph: "car" },
    { name: "Electricity", color: C[2], glyph: "zap" },
    { name: "Insurance", color: C[7], glyph: "receipt" },
    { name: "Streaming", color: C[6], glyph: "music" },
    { name: "Healthcare", color: C[0], glyph: "stethoscope" },
    { name: "Gift", color: C[6], glyph: "gift" },
    { name: "Salary", color: C[3], glyph: "banknote" },
    { name: "Savings", color: C[5], glyph: "piggy-bank" },
    { name: "Subscription", color: C[7], glyph: "credit-card" },
  ];
  return seeds.map((s) => ({
    id: seedEntryTypeId(),
    name: s.name,
    color: s.color,
    glyph: s.glyph,
  }));
}

// Local id generator for seed types. Mirrors `newId()` in
// `src/data/sheet.ts` but the constants module shouldn't import from
// `data/sheet` (which itself imports from constants). Twelve random
// base-36 chars is plenty of entropy for a per-user array of a few
// dozen entries.
function seedEntryTypeId(): string {
  return `t-${Math.random().toString(36).slice(2, 10)}${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

// Built-in entry types aimed at a typical Swedish household — bolån,
// hyra, el, SL/kollektivtrafik, A-kassa, Systembolaget, CSN. Presets
// live in code rather than in `UserData.types` so they survive an
// export/import cycle and stay consistent across devices. The user
// can hide individual presets via `UserData.hiddenPresetTypeIds`
// (managed from Settings → Types), but cannot edit or delete them —
// custom labels go through "Add type" instead, which writes a normal
// `EntryType` into `UserData.types`.
export const PRESET_ENTRY_TYPES: ReadonlyArray<EntryType> = (() => {
  const C = CATEGORY_COLORS;
  // Every preset type belongs to exactly one preset category. The
  // `category` field is a preset-category slug (without the `preset-cat-`
  // prefix) — the `id` minted below is `preset-cat-<slug>` so a type's
  // resolved `categoryId` matches a real `PRESET_CATEGORIES[].id`.
  const seeds: ReadonlyArray<{
    slug: string;
    name: string;
    color: string;
    glyph: CategoryIcon;
    category: string;
    // Income / expense filter direction. `undefined` (the default)
    // means the preset works for either direction; readers translate
    // that to `kind: "any"` when projecting.
    kind?: "income" | "expense";
  }> = [
    // Housing
    {
      slug: "rent",
      name: "Rent / Fee",
      color: C[1],
      glyph: "home",
      category: "housing",
      kind: "expense",
    },
    {
      slug: "mortgage",
      name: "Mortgage principal",
      color: C[0],
      glyph: "landmark",
      category: "housing",
      kind: "expense",
    },
    {
      slug: "mortgage-interest",
      name: "Mortgage interest",
      color: C[7],
      glyph: "percent",
      category: "housing",
      kind: "expense",
    },
    {
      slug: "home-insurance",
      name: "Home insurance",
      color: C[7],
      glyph: "umbrella",
      category: "housing",
      kind: "expense",
    },
    {
      slug: "cleaning",
      name: "Cleaning",
      color: C[5],
      glyph: "brush-cleaning",
      category: "housing",
      kind: "expense",
    },
    {
      slug: "gas",
      name: "Gas",
      color: C[1],
      glyph: "cooking-pot",
      category: "housing",
      kind: "expense",
    },
    {
      slug: "electricity",
      name: "Electricity",
      color: C[2],
      glyph: "zap",
      category: "housing",
      kind: "expense",
    },
    {
      slug: "heating",
      name: "Heating",
      color: C[1],
      glyph: "flame",
      category: "housing",
      kind: "expense",
    },
    {
      slug: "water",
      name: "Water",
      color: C[5],
      glyph: "droplet",
      category: "housing",
      kind: "expense",
    },
    {
      slug: "internet",
      name: "Internet",
      color: C[5],
      glyph: "wifi",
      category: "housing",
      kind: "expense",
    },
    {
      slug: "waste",
      name: "Garbage",
      color: C[1],
      glyph: "trash-2",
      category: "housing",
      kind: "expense",
    },
    {
      slug: "maintenance",
      name: "Home maintenance",
      color: C[1],
      glyph: "hammer",
      category: "housing",
      kind: "expense",
    },
    {
      slug: "renovations",
      name: "Renovations",
      color: C[1],
      glyph: "paint-roller",
      category: "housing",
      kind: "expense",
    },
    {
      slug: "phone",
      name: "Phone",
      color: C[4],
      glyph: "smartphone",
      category: "bills",
      kind: "expense",
    },
    // Food
    {
      slug: "groceries",
      name: "Groceries",
      color: C[3],
      glyph: "shopping-cart",
      category: "food",
      kind: "expense",
    },
    {
      slug: "restaurant",
      name: "Restaurant",
      color: C[2],
      glyph: "utensils",
      category: "food",
      kind: "expense",
    },
    {
      slug: "lunch",
      name: "Lunch",
      color: C[2],
      glyph: "utensils",
      category: "food",
      kind: "expense",
    },
    {
      slug: "cafe",
      name: "Cafe",
      color: C[7],
      glyph: "coffee",
      category: "food",
      kind: "expense",
    },
    {
      slug: "systembolaget",
      name: "Alcohol",
      color: C[6],
      glyph: "wine",
      category: "food",
      kind: "expense",
    },
    {
      slug: "takeaway",
      name: "Takeaway",
      color: C[2],
      glyph: "hand-platter",
      category: "food",
      kind: "expense",
    },
    {
      slug: "snacks",
      name: "Snacks",
      color: C[1],
      glyph: "cookie",
      category: "food",
      kind: "expense",
    },
    {
      slug: "bakery",
      name: "Bakery",
      color: C[2],
      glyph: "croissant",
      category: "food",
      kind: "expense",
    },
    // Transport
    {
      slug: "fuel",
      name: "Fuel",
      color: C[1],
      glyph: "fuel",
      category: "transport",
      kind: "expense",
    },
    {
      slug: "public-transport",
      name: "Public transport",
      color: C[4],
      glyph: "bus",
      category: "transport",
      kind: "expense",
    },
    {
      slug: "parking",
      name: "Parking",
      color: C[7],
      glyph: "car",
      category: "transport",
      kind: "expense",
    },
    {
      slug: "car-insurance",
      name: "Car insurance",
      color: C[7],
      glyph: "car",
      category: "transport",
      kind: "expense",
    },
    {
      slug: "vehicle-tax",
      name: "Vehicle tax",
      color: C[7],
      glyph: "car",
      category: "transport",
      kind: "expense",
    },
    {
      slug: "congestion-tax",
      name: "Congestion tax",
      color: C[7],
      glyph: "car",
      category: "transport",
      kind: "expense",
    },
    {
      slug: "leasing",
      name: "Leasing",
      color: C[4],
      glyph: "car",
      category: "transport",
      kind: "expense",
    },
    {
      slug: "car-service",
      name: "Car service",
      color: C[4],
      glyph: "wrench",
      category: "transport",
      kind: "expense",
    },
    {
      slug: "taxi",
      name: "Taxi",
      color: C[4],
      glyph: "car-front",
      category: "transport",
      kind: "expense",
    },
    // Health & personal
    {
      slug: "pharmacy",
      name: "Apoteket",
      color: C[0],
      glyph: "pill",
      category: "health",
      kind: "expense",
    },
    {
      slug: "healthcare",
      name: "Healthcare",
      color: C[0],
      glyph: "stethoscope",
      category: "health",
      kind: "expense",
    },
    {
      slug: "health-insurance",
      name: "Health insurance",
      color: C[7],
      glyph: "shield-plus",
      category: "health",
      kind: "expense",
    },
    {
      slug: "dentist",
      name: "Dentist",
      color: C[0],
      glyph: "heart-pulse",
      category: "health",
      kind: "expense",
    },
    {
      slug: "gym",
      name: "Gym",
      color: C[3],
      glyph: "dumbbell",
      category: "health",
      kind: "expense",
    },
    {
      slug: "optician",
      name: "Optician",
      color: C[0],
      glyph: "glasses",
      category: "health",
      kind: "expense",
    },
    {
      slug: "therapy",
      name: "Therapy",
      color: C[0],
      glyph: "brain",
      category: "health",
      kind: "expense",
    },
    {
      slug: "haircut",
      name: "Haircut",
      color: C[6],
      glyph: "scissors",
      category: "personal",
      kind: "expense",
    },
    // Family
    {
      slug: "childcare",
      name: "Förskola",
      color: C[6],
      glyph: "baby",
      category: "family",
      kind: "expense",
    },
    {
      slug: "allowance",
      name: "Veckopeng",
      color: C[6],
      glyph: "hand-coins",
      category: "family",
      kind: "expense",
    },
    {
      slug: "toys",
      name: "Toys",
      color: C[6],
      glyph: "toy-brick",
      category: "family",
      kind: "expense",
    },
    {
      slug: "kids-clothing",
      name: "Kids' clothing",
      color: C[6],
      glyph: "shirt",
      category: "family",
      kind: "expense",
    },
    {
      slug: "school",
      name: "School",
      color: C[3],
      glyph: "school",
      category: "family",
      kind: "expense",
    },
    {
      slug: "kids-activities",
      name: "Kids' activities",
      color: C[2],
      glyph: "trophy",
      category: "family",
      kind: "expense",
    },
    // Entertainment
    {
      slug: "books",
      name: "Books",
      color: C[3],
      glyph: "book-open",
      category: "entertainment",
      kind: "expense",
    },
    {
      slug: "media",
      name: "Media",
      color: C[6],
      glyph: "book-marked",
      category: "entertainment",
      kind: "expense",
    },
    {
      slug: "museum-visit",
      name: "Museum visit",
      color: C[6],
      glyph: "landmark",
      category: "entertainment",
      kind: "expense",
    },
    {
      slug: "games",
      name: "Games",
      color: C[5],
      glyph: "gamepad-2",
      category: "entertainment",
      kind: "expense",
    },
    {
      slug: "cinema",
      name: "Cinema",
      color: C[0],
      glyph: "clapperboard",
      category: "entertainment",
      kind: "expense",
    },
    {
      slug: "events",
      name: "Events",
      color: C[2],
      glyph: "ticket",
      category: "entertainment",
      kind: "expense",
    },
    {
      slug: "gambling",
      name: "Gambling",
      color: C[0],
      glyph: "dice-5",
      category: "entertainment",
      kind: "expense",
    },
    // Bills
    {
      slug: "housing-queue",
      name: "Housing queue",
      color: C[5],
      glyph: "hourglass",
      category: "bills",
      kind: "expense",
    },
    {
      slug: "union-fee",
      name: "Fackavgift",
      color: C[7],
      glyph: "briefcase",
      category: "bills",
      kind: "expense",
    },
    {
      slug: "a-kassa",
      name: "A-kassa",
      color: C[7],
      glyph: "briefcase",
      category: "bills",
      kind: "expense",
    },
    {
      slug: "csn",
      name: "Student loan",
      color: C[6],
      glyph: "graduation-cap",
      category: "bills",
      kind: "expense",
    },
    // Subscriptions
    {
      slug: "music-streaming",
      name: "Music streaming",
      color: C[3],
      glyph: "music",
      category: "subscriptions",
      kind: "expense",
    },
    {
      slug: "tv-streaming",
      name: "TV streaming",
      color: C[0],
      glyph: "tv",
      category: "subscriptions",
      kind: "expense",
    },
    {
      slug: "audiobooks",
      name: "Audiobooks",
      color: C[3],
      glyph: "book-headphones",
      category: "subscriptions",
      kind: "expense",
    },
    {
      slug: "magazines",
      name: "Magazines",
      color: C[6],
      glyph: "book-marked",
      category: "subscriptions",
      kind: "expense",
    },
    {
      slug: "newspaper",
      name: "Newspapers",
      color: C[2],
      glyph: "newspaper",
      category: "subscriptions",
      kind: "expense",
    },
    {
      slug: "subscription",
      name: "Subscriptions",
      color: C[7],
      glyph: "credit-card",
      category: "subscriptions",
      kind: "expense",
    },
    // Income
    {
      slug: "salary",
      name: "Salary",
      color: C[3],
      glyph: "banknote",
      category: "income",
      kind: "income",
    },
    {
      slug: "bonus",
      name: "Bonuses",
      color: C[3],
      glyph: "hand-coins",
      category: "income",
      kind: "income",
    },
    {
      slug: "tax-refund",
      name: "Tax refund",
      color: C[3],
      glyph: "landmark",
      category: "income",
      kind: "income",
    },
    {
      slug: "parental-leave",
      name: "Parental leave",
      color: C[3],
      glyph: "baby",
      category: "income",
      kind: "income",
    },
    {
      slug: "child-allowance",
      name: "Child benefit",
      color: C[3],
      glyph: "baby",
      category: "income",
      kind: "income",
    },
    {
      slug: "sick-pay",
      name: "Sick pay",
      color: C[3],
      glyph: "heart-pulse",
      category: "income",
      kind: "income",
    },
    {
      slug: "dividends",
      name: "Dividends",
      color: C[3],
      glyph: "trending-up",
      category: "income",
      kind: "income",
    },
    {
      slug: "side-income",
      name: "Side income",
      color: C[3],
      glyph: "briefcase",
      category: "income",
      kind: "income",
    },
    // Savings — left as "any" because some households model savings
    // both ways (a deposit out of checking on one sheet, the matching
    // arrival on the savings sheet).
    {
      slug: "savings",
      name: "Savings",
      color: C[5],
      glyph: "piggy-bank",
      category: "savings",
    },
    {
      slug: "child-savings",
      name: "Child savings",
      color: C[5],
      glyph: "baby",
      category: "savings",
    },
    {
      slug: "isk",
      name: "ISK",
      color: C[5],
      glyph: "trending-up",
      category: "savings",
    },
    {
      slug: "pension",
      name: "Pension",
      color: C[5],
      glyph: "vault",
      category: "savings",
    },
    {
      slug: "investment",
      name: "Investments",
      color: C[5],
      glyph: "line-chart",
      category: "savings",
    },
    // Personal / misc
    {
      slug: "clothing",
      name: "Clothing",
      color: C[6],
      glyph: "shirt",
      category: "personal",
      kind: "expense",
    },
    {
      slug: "gift",
      name: "Gifts",
      color: C[6],
      glyph: "gift",
      category: "personal",
      kind: "expense",
    },
    {
      slug: "donation",
      name: "Charity",
      color: C[7],
      glyph: "hand-heart",
      category: "personal",
      kind: "expense",
    },
    {
      slug: "hobby",
      name: "Hobbies",
      color: C[2],
      glyph: "sparkles",
      category: "personal",
      kind: "expense",
    },
    {
      slug: "accessories",
      name: "Accessories",
      color: C[6],
      glyph: "gem",
      category: "personal",
      kind: "expense",
    },
    {
      slug: "personal-care",
      name: "Personal care",
      color: C[2],
      glyph: "bath",
      category: "personal",
      kind: "expense",
    },
    {
      slug: "flights",
      name: "Flights",
      color: C[4],
      glyph: "plane",
      category: "travel",
      kind: "expense",
    },
    {
      slug: "train",
      name: "Train",
      color: C[4],
      glyph: "train",
      category: "travel",
      kind: "expense",
    },
    {
      slug: "rental-car",
      name: "Rental car",
      color: C[4],
      glyph: "car-front",
      category: "travel",
      kind: "expense",
    },
    {
      slug: "hotel",
      name: "Hotel",
      color: C[4],
      glyph: "hotel",
      category: "travel",
      kind: "expense",
    },
    {
      slug: "experiences",
      name: "Experiences",
      color: C[4],
      glyph: "compass",
      category: "travel",
      kind: "expense",
    },
    // Consumption — material goods, durables, and discretionary household
    // purchases. Sibling to Personal but distinct: "Consumption" is
    // long-lived stuff you bring home, "Personal" is clothes / haircuts /
    // accessories that stay close to the body.
    {
      slug: "electronics",
      name: "Electronics",
      color: C[5],
      glyph: "laptop",
      category: "consumption",
      kind: "expense",
    },
    {
      slug: "furniture",
      name: "Furniture",
      color: C[15],
      glyph: "sofa",
      category: "consumption",
      kind: "expense",
    },
    {
      slug: "art",
      name: "Art",
      color: C[6],
      glyph: "palette",
      category: "consumption",
      kind: "expense",
    },
    {
      slug: "decor",
      name: "Decor",
      color: C[10],
      glyph: "lamp",
      category: "consumption",
      kind: "expense",
    },
    {
      slug: "plants",
      name: "Plants",
      color: C[3],
      glyph: "sprout",
      category: "consumption",
      kind: "expense",
    },
    {
      slug: "tools",
      name: "Tools",
      color: C[15],
      glyph: "wrench",
      category: "consumption",
      kind: "expense",
    },
    {
      slug: "stationery",
      name: "Stationery",
      color: C[15],
      glyph: "pencil",
      category: "consumption",
      kind: "expense",
    },
    {
      slug: "appliances",
      name: "Appliances",
      color: C[15],
      glyph: "washing-machine",
      category: "consumption",
      kind: "expense",
    },
    {
      slug: "kitchenware",
      name: "Kitchenware",
      color: C[15],
      glyph: "utensils",
      category: "consumption",
      kind: "expense",
    },
    {
      slug: "digital-services",
      name: "Digital services",
      color: C[5],
      glyph: "cloud",
      category: "consumption",
      kind: "expense",
    },
    // Unknown
    {
      slug: "unknown",
      name: "Unknown",
      color: C[8],
      glyph: "circle-help",
      category: "unknown",
    },
    {
      slug: "forgotten",
      name: "Forgotten",
      color: C[8],
      glyph: "hourglass",
      category: "unknown",
    },
    {
      slug: "unidentified-recurring",
      name: "Unidentified recurring",
      color: C[8],
      glyph: "repeat",
      category: "unknown",
    },
    {
      slug: "cash",
      name: "Cash",
      color: C[8],
      glyph: "banknote-arrow-down",
      category: "unknown",
    },
    {
      slug: "needs-review",
      name: "Needs review",
      color: C[8],
      glyph: "flag",
      category: "unknown",
    },
    {
      slug: "suspicious",
      name: "Suspicious",
      color: C[8],
      glyph: "shield-alert",
      category: "unknown",
    },
  ];
  return seeds.map((s) => ({
    id: `preset-type-${s.slug}`,
    name: s.name,
    color: s.color,
    glyph: s.glyph,
    categoryId: `preset-cat-${s.category}`,
    ...(s.kind === undefined ? {} : { kind: s.kind }),
  }));
})();

// Lookup for the validator (cheap membership test against the preset
// id list). Built once at module load — `PRESET_ENTRY_TYPES` is a
// frozen literal so the set never needs to be rebuilt.
export const PRESET_ENTRY_TYPE_IDS: ReadonlySet<string> = new Set(
  PRESET_ENTRY_TYPES.map((t) => t.id),
);

export function isPresetTypeId(id: string): boolean {
  return PRESET_ENTRY_TYPE_IDS.has(id);
}

export function visiblePresetTypes(
  hiddenIds: readonly string[],
  kindOverrides: Readonly<Record<string, EntryTypeKind>> = {},
): EntryType[] {
  const hidden = hiddenIds.length === 0 ? null : new Set(hiddenIds);
  const out: EntryType[] = [];
  for (const t of PRESET_ENTRY_TYPES) {
    if (hidden?.has(t.id)) continue;
    out.push(applyKindOverride(t, kindOverrides));
  }
  return out;
}

// Effective `kind` for a preset given the per-user override map.
// `"any"` is the runtime default — both for "no override and no built-
// in kind" and for an explicit override that re-widens an income-only
// preset back to any-direction.
export function effectivePresetKind(
  type: EntryType,
  kindOverrides: Readonly<Record<string, EntryTypeKind>>,
): EntryTypeKind {
  const override = kindOverrides[type.id];
  if (override !== undefined) return override;
  return type.kind ?? "any";
}

// Resolve a type's effective kind regardless of whether it's a preset
// or user-added. User-added types carry `kind` directly; presets are
// looked up against the override map.
export function effectiveTypeKind(
  type: EntryType,
  kindOverrides: Readonly<Record<string, EntryTypeKind>>,
): EntryTypeKind {
  if (isPresetTypeId(type.id)) return effectivePresetKind(type, kindOverrides);
  return type.kind ?? "any";
}

function applyKindOverride(
  type: EntryType,
  kindOverrides: Readonly<Record<string, EntryTypeKind>>,
): EntryType {
  const override = kindOverrides[type.id];
  if (override === undefined) return type;
  if (override === "any") {
    if (type.kind === undefined) return type;
    const { kind: _drop, ...rest } = type;
    void _drop;
    return rest;
  }
  if (type.kind === override) return type;
  return { ...type, kind: override };
}
