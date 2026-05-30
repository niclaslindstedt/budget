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
// The shape is intentionally minimal today but is the seed for the future
// Item sheet: per-item depreciation rules, opening value, current value, and
// net-worth roll-up land here as additional optional fields, so readers must
// tolerate (and writers preserve) fields they don't recognise.
export type Item = {
  id: string;
  name: string;
  subtypeId?: string;
  // Optional ISO date the user acquired the item. Unused today; reserved so
  // a future depreciation curve has an anchor without a migration.
  acquiredAt?: string;
  note?: string;
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
