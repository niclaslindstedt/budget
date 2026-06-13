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
// new arms without a migration. Absent on the item means "does not
// depreciate" (the resale value is whatever `resaleValue` / purchase price
// says, with no time decay).
export type ItemDepreciation =
  | {
      // Steady declining balance: the same share of the remaining value
      // is shed every year.
      method: "percentPerYear";
      // Fraction of the *remaining* value shed each year, as a percentage:
      // 20 → the item loses 20 % of its current value annually (declining
      // balance). Finite and non-negative.
      ratePerYear: number;
      // Optional residual-value floor: depreciation never takes the computed
      // value below this. Absent means it can decay toward zero.
      floor?: number;
    }
  | {
      // Accelerated (front-loaded) decline: an instant drop the moment the
      // item is no longer new (a car driven off the lot, tech out of the
      // box), a steeper first year, then a flatter declining balance. All
      // three rates are percentages; finite and non-negative.
      method: "accelerated";
      // Share of the purchase price lost immediately at `acquiredAt`:
      // 20 → the item is worth 80 % of the purchase price from day one.
      initialDrop: number;
      // Share of the remaining value shed across the first year of
      // ownership (on top of the initial drop).
      firstYearRate: number;
      // Share of the remaining value shed per year after the first —
      // declining balance, same semantics as the `percentPerYear` arm.
      ratePerYear: number;
      // Optional residual-value floor, same contract as `percentPerYear`.
      floor?: number;
    };

// One manually-recorded value snapshot for an item — "this painting was
// appraised at 45 000 on 2025-03-01". Each carries its own `id` (rather
// than being keyed by `date`) so two snapshots taken on the same day can
// be edited / deleted independently. Mirrors `PropertyValuePoint` /
// `InvestmentValuePoint`.
export type ItemValuePoint = {
  id: string;
  date: string; // ISO yyyy-mm-dd the value was recorded for
  value: number; // the value at that date, in the user's currency
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
  // capital considered tied up in it. A finite, non-negative number in the
  // user's currency units. Set either from the Items sheet editor or from
  // the amount typed when a line item links a transaction to this item.
  purchasePrice?: number;
  // How the item loses value over time. Absent means it doesn't depreciate.
  depreciation?: ItemDepreciation;
  // Expected useful life in years (may be fractional — 0.5 = six months).
  // Drives the spending dashboard's "spread item costs" mode, which
  // replaces the purchase-month spike with `purchasePrice` spread evenly
  // across this many years (straight-line, like Swedish "avskrivning").
  // Independent of `depreciation`, which models resale value, not cost
  // allocation. Finite and positive; absent means the cost is never spread.
  lifetimeYears?: number;
  // Manual override of the current resale value. When set it wins over a
  // computed depreciation figure — the user's own estimate of what they
  // could get for it today.
  resaleValue?: number;
  // Dated value snapshots recorded over time via the "Update value" modal.
  // Lets an item that appreciates (art, collectibles, antiques) track a
  // rising value across the net-worth series instead of sitting flat at
  // its purchase price. The latest point on or before a date is the item's
  // value at that date (see `computeItemCurrentValue`); it wins over both a
  // static `resaleValue` and a `depreciation` curve. Absent / empty means
  // the item has never had a value recorded this way. The item's purchase
  // (`purchasePrice` at `acquiredAt`) is folded in as a read-only first
  // point at display time, so it isn't stored here.
  valueHistory?: ItemValuePoint[];
  // ISO date the item was sold or given away. Once set, the item is no
  // longer "owned" capital; the future Item sheet stops counting it as
  // tied up.
  disposedAt?: string;
  // Proceeds actually received at disposal. A finite number; may be 0 for a
  // give-away.
  soldFor?: number;
};

// Links one entry to an owned `Item`. Stored inline on the entry —
// `Row.lineItems` for user rows, `HistoryEntry.lineItems` for imported
// transactions — exactly like `splits`, so a deleted entry takes its links
// with it.
//
// The link carries NO price of its own: it is purely a connection between a
// transaction and the thing it bought. What the item cost lives on the
// `Item` itself (`Item.purchasePrice`) — the amount the user types when
// adding the line item is written there. Display (the line-item pill /
// popover) and the allocation "remainder" both read the price back off the
// linked item, signed by the transaction's direction. Unlike `splits`, line
// items do NOT have to sum to the entry's amount: a 20 000 purchase can carry
// a single 15 000 item for the iPhone, leaving a 5 000 "remainder" that is
// computed at render time and never stored.
export type LineItemLink = {
  id: string;
  itemId: string;
  note?: string;
};
