// Receipt helpers for property repairs. A `PropertyRepair` owns a list of
// dated receipt documents (`receipts`) — a job can produce several invoices
// over time, each with its own date. These helpers normalise the optional
// field so callers don't repeat the `?? []` / length dance, and centralise the
// "has a receipt?" check the missing-receipt flag reads.

import type { PropertyRepair, RepairReceipt } from "../types";

// The repair's receipts as a plain list (empty when none are attached).
export function repairReceipts(repair: PropertyRepair): RepairReceipt[] {
  return repair.receipts ?? [];
}

// How many receipts a repair has attached.
export function repairReceiptCount(repair: PropertyRepair): number {
  return repairReceipts(repair).length;
}

// Whether the repair has at least one receipt — the inverse of the
// "missing receipt" tax-deductibility flag.
export function hasReceipt(repair: PropertyRepair): boolean {
  return repairReceiptCount(repair) > 0;
}
