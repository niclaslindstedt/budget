import { normaliseDescription } from "../description-normaliser";
import { findMatchingRule } from "../match-rules";
import { getStandardColumns } from "../sheet";
import type {
  CellValue,
  Column,
  Company,
  EntryType,
  HistoryEntry,
  MatchRule,
  MerchantHint,
  Row,
  Transfer,
} from "../types";

// Every transfer with `accountId` on either end, ordered by date.
// Both incoming and outgoing transfers are included — callers
// decide the sign at render time from `selfAccountId` vs the
// transfer's `fromAccountId` / `toAccountId`.
export function transfersForAccount(
  transfers: readonly Transfer[],
  accountId: string,
): Transfer[] {
  const matches = transfers.filter(
    (tx) => tx.fromAccountId === accountId || tx.toAccountId === accountId,
  );
  return matches.sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );
}

// Synthesize a Row that represents one side of a transfer so the
// existing BudgetMonthTable + BudgetRow + Cell pipeline can render it without
// special-casing. The cells are keyed by the budget's column ids so the
// row drops straight into the existing grid. Marker fields
// (`transferId`, `peerAccountId`, `peerAccountName`) flag the
// synthesized origin — `Cell` / `BudgetRow` read them to disable inline
// editing and swap the action buttons. These fields are runtime-only;
// they're never written back to storage because synthesized rows live
// outside `item.rows`. The `accountsById` map carries names so the cell
// renderer can show "→ Savings" without re-walking the accounts list
// for every cell.
export function synthesizeTransferRow(
  tx: Transfer,
  selfAccountId: string,
  columns: Column[],
  accountsById: ReadonlyMap<string, string>,
): Row {
  const outgoing = tx.fromAccountId === selfAccountId;
  const peerAccountId = outgoing ? tx.toAccountId : tx.fromAccountId;
  // Always positive on the `to` side, negative on the `from` side, so
  // running-balance math from `computeBalances` agrees with intuition.
  const signedAmount = outgoing ? -tx.amount : tx.amount;
  // Resolve the four standard columns up front instead of walking the
  // whole columns array with a switch — past the standard four (date,
  // description, amount, completed) every column is a no-op anyway, so
  // the loop was paying for `type` / `balance` columns it never wrote
  // to. `balance` is still derived at render time by `computeBalances`.
  const { dateCol, descCol, amountCol, completedCol } =
    getStandardColumns(columns);
  const cells: Record<string, CellValue> = {};
  if (dateCol) cells[dateCol.id] = tx.date;
  if (descCol) cells[descCol.id] = tx.description;
  if (amountCol) cells[amountCol.id] = signedAmount;
  if (completedCol) cells[completedCol.id] = tx.completed ?? false;
  // Reuse the transfer id as the row id so React's keyed reconciler
  // stays stable across re-syntheses and so deletion paths (which key
  // by row id today) can be wired to a transfer lookup cleanly.
  const row: Row = {
    id: `tx:${tx.id}`,
    cells,
    transferId: tx.id,
    peerAccountId,
    peerAccountName: accountsById.get(peerAccountId) ?? "Unknown account",
  };
  if (tx.typeId) row.typeId = tx.typeId;
  return row;
}

// Synthesize one or more Rows from an imported bank-statement entry
// so the budget view can interleave them alongside user-authored
// rows without special-casing. Marker field `historyEntryId` flags
// the synthesized origin — `Cell` / `BudgetRow` read it to disable
// inline editing. Like `synthesizeTransferRow`, the synthesized
// rows never reach storage.
//
// Labels stack with rules winning over hints: an explicit pattern
// rule (user-authored glob) overrides any merchant hint (auto-
// recorded from the lossy normalised description) on the same
// entry. Either source contributes a category, typeId, and user-
// typed description; the entry's bank text is preserved on storage,
// only presentation changes.
//
// When the entry carries a non-empty `splits` array, the row chain is
// bypassed: each split renders as its own row with the split's
// description + signed amount + typeId. The splits' signed amounts
// are guaranteed by the validator to sum to `entry.amount`, so the
// account's running balance stays anchored to the bank's total.
const EMPTY_COMPANIES_MAP: ReadonlyMap<string, Company> = new Map();
const EMPTY_TYPES_MAP: ReadonlyMap<string, EntryType> = new Map();

function asCompaniesById(
  companies: readonly Company[] | ReadonlyMap<string, Company>,
): ReadonlyMap<string, Company> {
  if (companies instanceof Map) return companies;
  if (Array.isArray(companies)) {
    if (companies.length === 0) return EMPTY_COMPANIES_MAP;
    const m = new Map<string, Company>();
    for (const c of companies) m.set(c.id, c);
    return m;
  }
  return EMPTY_COMPANIES_MAP;
}

function asTypesById(
  types: readonly EntryType[] | ReadonlyMap<string, EntryType>,
): ReadonlyMap<string, EntryType> {
  if (types instanceof Map) return types;
  if (Array.isArray(types)) {
    if (types.length === 0) return EMPTY_TYPES_MAP;
    const m = new Map<string, EntryType>();
    for (const t of types) m.set(t.id, t);
    return m;
  }
  return EMPTY_TYPES_MAP;
}

export function synthesizeHistoryRow(
  entry: HistoryEntry,
  columns: Column[],
  hints: Readonly<Record<string, MerchantHint>> = {},
  rules: readonly MatchRule[] = [],
  companies:
    | readonly Company[]
    | ReadonlyMap<string, Company> = EMPTY_COMPANIES_MAP,
  types:
    | readonly EntryType[]
    | ReadonlyMap<string, EntryType> = EMPTY_TYPES_MAP,
): Row[] {
  const { dateCol, descCol, amountCol, completedCol } =
    getStandardColumns(columns);

  function buildCells(
    description: string,
    amount: number,
  ): Record<string, CellValue> {
    const cells: Record<string, CellValue> = {};
    if (dateCol) cells[dateCol.id] = entry.date;
    if (descCol) cells[descCol.id] = description;
    if (amountCol) cells[amountCol.id] = amount;
    // Imported bank entries already happened, so they're implicitly
    // completed.
    if (completedCol) cells[completedCol.id] = true;
    return cells;
  }

  if (entry.splits && entry.splits.length > 0) {
    return entry.splits.map((split, i) => {
      const row: Row = {
        id: `hist:${entry.id}:${i}`,
        cells: buildCells(split.description, split.amount),
        historyEntryId: entry.id,
      };
      if (split.typeId) row.typeId = split.typeId;
      if (split.companyId) row.companyId = split.companyId;
      // Carry the entry's transfer flag onto every split row so
      // `Settings.hideTransfers` hides them uniformly — the split is
      // just a presentation re-slice, not a re-classification.
      if (entry.isTransfer) row.isTransfer = true;
      // Same for the fiscal-month shift — every split inherits it so
      // the grouping pipeline keeps the splits together.
      if (entry.fiscalMonthShift !== undefined)
        row.fiscalMonthShift = entry.fiscalMonthShift;
      return row;
    });
  }

  const { description, userDescription, typeId, companyId } =
    resolveEntryLabels(entry, hints, rules, companies, types);
  const row: Row = {
    id: `hist:${entry.id}`,
    cells: buildCells(description, entry.amount),
    historyEntryId: entry.id,
  };
  if (typeId) row.typeId = typeId;
  if (companyId) row.companyId = companyId;
  if (entry.isTransfer) row.isTransfer = true;
  if (entry.fiscalMonthShift !== undefined)
    row.fiscalMonthShift = entry.fiscalMonthShift;
  // The resolved description is a fallback (company / type / bank
  // text) rather than a real user override. Flag the row so the
  // description cell can render it in italic + glyph color and open
  // its inline editor empty + with the bank text as the placeholder.
  if (userDescription === null) row.descriptionPlaceholder = entry.description;
  // Carry the raw bank memo on the inverse path — when the resolved
  // description IS an override and differs from the bank text — so
  // the popover can surface a read-only "original from bank" line
  // alongside the editor without the user losing reference to the
  // statement memo. Skipped when there's no override (the placeholder
  // already shows it) or when the override happens to match (no
  // signal to add).
  if (userDescription !== null && entry.description !== userDescription) {
    row.bankDescription = entry.description;
  }
  return [row];
}

// Resolve the effective description, typeId, and companyId for a
// non-split history entry by walking the same per-field priority
// chain shared by `synthesizeHistoryRow` and the history-view modal:
//   1. per-entry override on the HistoryEntry itself
//      (`userDescription` / `userTypeId` / `userCompanyId`)
//   2. matching MatchRule
//   3. matching MerchantHint (skipped when `entry.hintIgnored`)
//   4. raw bank text / no type / no company
// `null` on a rule field is distinct from "absent" in the validator
// but the renderer reads null the same way as undefined here — both
// mean "no override".
//
// The description chain extends with company and type fallbacks so the
// synthesized cell never shows raw bank text when the user has tagged
// either side: descriptionOverride → companyName → typeName → bank
// text. `companies` and `types` are looked up by id; missing lookups
// fall through to the next step in the chain. Both default to empty
// arrays so legacy call sites that don't know about companies / types
// keep the previous "description override or bank text" behaviour.
export function resolveEntryLabels(
  entry: HistoryEntry,
  hints: Readonly<Record<string, MerchantHint>> = {},
  rules: readonly MatchRule[] = [],
  companies:
    | readonly Company[]
    | ReadonlyMap<string, Company> = EMPTY_COMPANIES_MAP,
  types:
    | readonly EntryType[]
    | ReadonlyMap<string, EntryType> = EMPTY_TYPES_MAP,
): {
  description: string;
  // The description before the company/type/bank-text fallbacks kick
  // in — i.e. only the user override, the matching rule, or the
  // merchant hint. Editors that pre-fill a description input read
  // this so an entry with only a type set doesn't seed the input
  // with the type's name (the type-name fallback is a render-time
  // convenience for the budget tables, not a real user description).
  userDescription: string | null;
  typeId: string | null;
  companyId: string | null;
} {
  const rule = findMatchingRule(rules, entry);
  const hint = entry.hintIgnored
    ? undefined
    : hints[normaliseDescription(entry.description)];
  const typeId =
    entry.userTypeId ??
    (rule && rule.typeId !== undefined && rule.typeId !== null
      ? rule.typeId
      : null) ??
    hint?.typeId ??
    null;
  const companyId =
    entry.userCompanyId ??
    (rule && rule.companyId !== undefined && rule.companyId !== null
      ? rule.companyId
      : null) ??
    hint?.companyId ??
    null;
  const userDescription =
    (entry.userDescription && entry.userDescription.trim() !== ""
      ? entry.userDescription
      : null) ??
    (rule?.description && rule.description.trim() !== ""
      ? rule.description
      : null) ??
    hint?.description ??
    null;
  let description = userDescription;
  if (description === null && companyId) {
    const company = asCompaniesById(companies).get(companyId);
    if (company && company.name.trim() !== "") description = company.name;
  }
  if (description === null && typeId) {
    const type = asTypesById(types).get(typeId);
    if (type && type.name.trim() !== "") description = type.name;
  }
  if (description === null) description = entry.description;
  return { description, userDescription, typeId, companyId };
}

// True when this row should be treated as an inter-account transfer
// for the `Settings.hideTransfers` filter. Three signals qualify a row:
//   1. a synthesized Transfer row carries `peerAccountId`
//   2. a synthesized history row whose underlying entry was flagged
//      `isTransfer` (propagated by `synthesizeHistoryRow`)
//   3. a budget row flagged `isTransfer` via the per-row eye action
// Centralised here so callers (display filter, balance-icon detector,
// expand toggle) never drift on what counts as a transfer.
export function isTransferRow(row: Row): boolean {
  return row.peerAccountId !== undefined || row.isTransfer === true;
}

// Walk `rows` and, when `hideTransfers` is on, group every run of
// hidden transfer rows under the next visible anchor row's id. The
// returned map powers BudgetMonthTable's expand-toggle icon: a non-empty
// run on an anchor means at least one hidden transfer contributed to
// its running-balance step. With `hideTransfers` off (or no transfers
// to hide), the map is empty so the anchor renders normally.
//
// Correction rows render as full-width dividers and never count as
// transfers — they break a hidden run so it doesn't leak past the
// divider into the next concrete row. Hidden rows trailing the last
// visible anchor are dropped: there's no balance row in this month to
// attach the icon to. The amounts still feed the running balance via
// `computeBalances`; they just don't surface an expand affordance.
export function collectHiddenTransfersByAnchor(
  rows: readonly Row[],
  hideTransfers: boolean,
): Map<string, Row[]> {
  const map = new Map<string, Row[]>();
  if (!hideTransfers) return map;
  let buffer: Row[] = [];
  for (const r of rows) {
    if (!r.isCorrection && isTransferRow(r)) {
      buffer.push(r);
    } else if (buffer.length > 0) {
      map.set(r.id, buffer);
      buffer = [];
    }
  }
  return map;
}
