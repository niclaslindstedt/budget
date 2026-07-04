import { resolveEntryLabels } from "../../data/synthesis";
import type {
  Company,
  EntryType,
  HistoryEntry,
  MatchRule,
  MerchantHint,
} from "../../data/types";

// "Needs metadata" — the predicate the metadata-mode walk
// (`BudgetMetadataModal`) filters its queue on. An entry qualifies when
// `resolveEntryLabels` (the same resolver the synthesized history row
// reads) leaves it without a type, without a company, or with a
// display description that is still the raw bank text and nothing said
// about it — i.e. no override, match rule, or merchant hint has
// annotated it. Entries the budget UI already hides (`hidden`,
// `collapsedIntoTransferId`, `isTransfer`) are excluded, as are entries
// with `splits` because the single-row picker doesn't apply.
export function entryNeedsMetadata(
  entry: HistoryEntry,
  hints: Readonly<Record<string, MerchantHint>>,
  rules: readonly MatchRule[],
  companies: ReadonlyMap<string, Company>,
  types: ReadonlyMap<string, EntryType>,
): boolean {
  if (entry.hidden) return false;
  if (entry.collapsedIntoTransferId) return false;
  if (entry.isTransfer) return false;
  if (entry.splits && entry.splits.length > 0) return false;
  const resolved = resolveEntryLabels(entry, hints, rules, companies, types);
  // The entry still wants a closer look when any of the three first-
  // class fields is missing: no type pinned, no company tagged, OR the
  // display description is still the raw bank text with nothing said
  // about it. `entry.noCompany` exempts the entry from the company
  // check — set from the "No company needed" toggle in the modal for
  // entries where tagging a merchant doesn't apply (e.g. salary,
  // internal transfers).
  //
  // The description check is guarded on `userDescription === null`: an
  // override / match rule / merchant hint that sets a description IS
  // "something said," even when that text happens to coincide with the
  // bank's. Without the guard such an entry — already carrying a type
  // and a company — would be flagged for a description it doesn't owe,
  // yet `stillMissingField` would report nothing missing, leaving Save
  // silently gated with no way to complete the walk (only Skip).
  return (
    resolved.typeId === null ||
    (resolved.companyId === null && !entry.noCompany) ||
    (resolved.userDescription === null &&
      resolved.description === entry.description)
  );
}
