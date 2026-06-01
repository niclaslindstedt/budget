// A physical thing the user owns or has purchased — "iPhone 15 Pro", a
// specific couch, a particular bicycle. Each `Item` is one concrete object:
// two physical iPhones are two `Item` records, not one record with a
// quantity. Sits in `UserData.items`; line items reference it through
// `LineItemLink.itemId`. Items are a top-level catalog, created manually
// "after the fact" (never inside the add / edit entry flow) and tied to the
// purchases that paid for them via the line-item modal on the entry "…" menu.
//
// `subtypeId` is the item's optional taxonomy anchor: it points at a
// `Subtype` (the third tier below category → type), from which the type and
// category derive through `subtype.typeId → type.categoryId`. Absent means
// the item is unclassified.
//
// Per-item depreciation rule. A discriminated union on `method` so future
// curves (straight-line / useful-life, sum-of-years-digits, …) slot in as
// new arms without a migration — only the declining-balance
// `percentPerYear` arm exists today. Absent on the item means "does not
// depreciate" (the resale value is whatever `resaleValue` / purchase price
// says, with no time decay).
export type ItemDepreciation = {
  method: "percentPerYear";
  // Fraction of the *remaining* value shed each year, as a percentage:
  // 20 → the item loses 20 % of its current value annually (declining
  // balance). Finite and non-negative.
  ratePerYear: number;
  // Optional residual-value floor: depreciation never takes the computed
  // value below this. Absent means it can decay toward zero.
  floor?: number;
};

// The shape grows as the seed for the future Item sheet: it now carries the
// inputs that sheet needs to compute tied-up capital and recoverable value
// — what the item cost, how it depreciates, what it would resell for, and
// whether it has been disposed of. Every field beyond `id` / `name` is
// optional; readers must tolerate (and writers preserve) fields they don't
// recognise so later additions land without a migration.
export type Item = {
  id: string;
  name: string;
  subtypeId?: string;
  // Optional ISO date the user acquired the item — the "bought at" date and
  // the anchor a depreciation curve measures elapsed time from.
  acquiredAt?: string;
  note?: string;
  // What the item cost ("bought for") — the depreciation base and the
  // capital considered tied up in it. A finite number in the user's
  // currency units (same convention as `LineItemLink.amount`).
  purchasePrice?: number;
  // How the item loses value over time. Absent means it doesn't depreciate.
  depreciation?: ItemDepreciation;
  // Manual override of the current resale value. When set it wins over a
  // computed depreciation figure — the user's own estimate of what they
  // could get for it today.
  resaleValue?: number;
  // ISO date the item was sold or given away. Once set, the item is no
  // longer "owned" capital; the future Item sheet stops counting it as
  // tied up.
  disposedAt?: string;
  // Proceeds actually received at disposal. A finite number; may be 0 for a
  // give-away.
  soldFor?: number;
};

// Links part of one entry's amount to an owned `Item`. Stored inline on the
// entry — `Row.lineItems` for user rows, `HistoryEntry.lineItems` for
// imported transactions — exactly like `splits`, so a deleted entry takes its
// links with it.
//
// Unlike `splits`, line items do NOT have to sum to the entry's amount: a
// 20 000 purchase can carry a single 15 000 line item for the iPhone, leaving
// a 5 000 "remainder" that is computed at render time and never stored. The
// amount is a finite signed number in the same units as the row's amount.
export type LineItemLink = {
  id: string;
  itemId: string;
  amount: number;
  note?: string;
};
