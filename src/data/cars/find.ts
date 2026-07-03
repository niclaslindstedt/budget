// Candidate finder for the Cars sheet's "Find car expenses" picker. A
// car's cost is sourced from bank charges resolving to a car-related
// preset type (fuel, parking, insurance, vehicle / congestion tax,
// leasing, service, car pool). This walk sweeps every account's
// imported history, resolves each entry's effective type the same way
// the budget tables do (`resolveEntryLabels`), and surfaces the
// outflows tagged with one of those types that aren't already
// attributed to a car — or dismissed via the persisted ignore /
// exclude-similar lists. When a car is supplied its ownership window
// bounds the scan, so a charge dated before the user bought the car or
// after they sold it is never offered.
//
// Like the repairs finder this is a plain tag filter — no recurrence
// ranking, no amount maths: which fuel receipts belong to which car is
// the user's call, not a statistical one. Pure: fed the `UserData`, it
// emits the eligible charges.

import { resolveEntryLabels, newRuleMatchCache } from "../synthesis";
import { normaliseDescription } from "../description-normaliser";
import { allTypes } from "../presets/merge";
import { CAR_EXPENSE_TYPE_IDS } from "../presets/types";
import type { Car, UserData } from "../types";
import { addMonthsIso } from "../../utils/date";
import { carExpenseKey } from "./costs";

// The ISO date span the user actually had the car — a transport charge
// outside it can't belong to this car, so the finder drops it. Both
// bounds are optional: a pool car with no dates has neither (no date
// filtering), and a still-owned car has a start but no end (open-ended
// up to today). `soldAt` closes the window for owned/shared cars; a
// leased car's window runs from `leaseStart` to the end of the lease
// term unless it was handed back early (`soldAt`).
function carOwnershipWindow(car: Car): {
  start: string | undefined;
  end: string | undefined;
} {
  const start = car.ownership === "leased" ? car.leaseStart : car.purchaseDate;
  let end = car.soldAt;
  if (
    end === undefined &&
    car.ownership === "leased" &&
    car.leaseStart !== undefined &&
    car.leaseMonths !== undefined &&
    car.leaseMonths > 0
  ) {
    end = addMonthsIso(car.leaseStart, car.leaseMonths);
  }
  return { start, end };
}

// One bank charge eligible to become a car expense.
export type CarExpenseCandidate = {
  accountId: string;
  entryId: string;
  date: string; // ISO yyyy-mm-dd
  amount: number; // the outflow magnitude (positive)
  description: string; // the entry's effective description (denormalised on add)
  typeId: string; // one of CAR_EXPENSE_TYPE_IDS
};

// Every car-typed outflow across all accounts that isn't already
// attributed to a car. The already-linked exclusion is global and spans
// every car — a charge attributed to ANY car is dropped, so the same
// tank of fuel can't be double-counted across two cars. When `car` is
// given its ownership window bounds the scan (charges outside the dates
// the user had the car are excluded). Sorted newest-first for the
// picker.
export function findCarExpenseCandidates(
  data: UserData,
  car?: Car,
): CarExpenseCandidate[] {
  const window = car ? carOwnershipWindow(car) : undefined;
  const used = new Set<string>();
  for (const car of data.cars) {
    for (const expense of car.expenses) {
      const key = carExpenseKey(expense);
      if (key !== undefined) used.add(key);
    }
  }
  const ignored = new Set(data.ignoredCarExpenseEntryIds);
  // Normalised-description keys the user excluded via "Exclude similar".
  // An empty list short-circuits the per-entry normalise call below.
  const excludedPatterns =
    data.carExpenseExclusionPatterns.length > 0
      ? new Set(data.carExpenseExclusionPatterns)
      : null;

  // Merged preset + user types so each entry's effective type resolves
  // the same way the budget tables tag it.
  const types = allTypes(data);
  const ruleCache = newRuleMatchCache();
  const candidates: CarExpenseCandidate[] = [];
  for (const [accountId, entries] of Object.entries(data.history)) {
    for (const entry of entries) {
      if (entry.hidden || entry.collapsedIntoTransferId) continue;
      if (entry.isTransfer) continue;
      if (entry.amount >= 0) continue; // outflows only
      if (ignored.has(entry.id)) continue;
      if (used.has(`${accountId}:${entry.id}`)) continue;
      if (window) {
        if (window.start !== undefined && entry.date < window.start) continue;
        if (window.end !== undefined && entry.date > window.end) continue;
      }
      const labels = resolveEntryLabels(
        entry,
        data.merchantHints,
        data.matchRules,
        data.companies,
        types,
        ruleCache,
      );
      const typeId = labels.typeId ?? "";
      if (!CAR_EXPENSE_TYPE_IDS.has(typeId)) continue;
      // Prefer the user's own label (override / rule / hint) and fall
      // back to the raw bank memo — the type name is already conveyed
      // by the row's glyph.
      const description = labels.userDescription || entry.description;
      if (excludedPatterns?.has(normaliseDescription(description))) continue;
      candidates.push({
        accountId,
        entryId: entry.id,
        date: entry.date,
        amount: Math.abs(entry.amount),
        description,
        typeId,
      });
    }
  }

  candidates.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return candidates;
}
