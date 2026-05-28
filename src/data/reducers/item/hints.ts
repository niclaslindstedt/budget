import type { AccountBudget, MatchRule, Row } from "../../types";
import type { EditPatch } from "../../action-payloads";
import { findColumnByType } from "../../sheet";
import { findMatchingRuleForCandidate } from "../../match-rules";
import { candidateFromRow, resolveCandidateColumns } from "../../row-candidate";
import { type HintRecording } from "../../merchant-hints";
import { addDaysIso } from "../../../utils/date";

// Walk an AccountBudget's before/after rows and collect the
// description+typeId pairs that need to be folded into the merchant-
// hint store. Anything that newly carries a string typeId (or whose
// typeId changed) counts; rows whose typeId was cleared emit a
// recording with `typeId: null` so `recordMerchantHints` can drop
// the stale hint.
export function hintRecordingsFromBudget(
  prev: AccountBudget,
  next: AccountBudget,
): HintRecording[] {
  const descId = findColumnByType(next.columns, "description")?.id;
  if (!descId) return [];
  const prevById = new Map<string, Row>();
  for (const r of prev.rows) prevById.set(r.id, r);
  const out: HintRecording[] = [];
  for (const row of next.rows) {
    const before = prevById.get(row.id);
    const afterType = row.typeId ?? null;
    const beforeType = before?.typeId ?? null;
    const afterCompany = row.companyId ?? null;
    const beforeCompany = before?.companyId ?? null;
    const typeChanged = afterType !== beforeType;
    const companyChanged = afterCompany !== beforeCompany;
    if (!typeChanged && !companyChanged) continue;
    const desc = row.cells[descId];
    if (typeof desc !== "string" || desc.trim() === "") continue;
    if (afterType !== null) {
      out.push({
        description: desc,
        typeId: afterType,
        companyId: companyChanged ? afterCompany : undefined,
      });
    } else if (beforeType !== null) {
      // Type was cleared — drop the hint.
      out.push({ description: desc, typeId: null });
    } else if (companyChanged && afterCompany !== null) {
      // Type didn't change but company did. Skip — merchant hints are
      // keyed off the (type, key) pair and we only stamp company onto
      // an existing hint via the type-bearing recording. A later type
      // assignment will fold the company into the hint.
      continue;
    }
  }
  return out;
}

export function applyPatch<R extends Row>(
  row: R,
  patch: EditPatch,
  cols: {
    descId?: string;
    amountId?: string;
    dateId?: string;
  },
): R {
  const next: R = { ...row, cells: { ...row.cells } };
  if (cols.descId) next.cells[cols.descId] = patch.description;
  if (cols.amountId && patch.amount !== null) {
    next.cells[cols.amountId] = patch.amount;
    // The edit modals don't speak formula yet (v1 limitation); when
    // the user retypes a literal amount on a row that previously
    // carried `amountFormula`, treat that as "replace the formula
    // with this literal" so the visible value matches what the user
    // just typed. Re-editing the formula itself goes through the
    // BudgetComplexEntryModal (delete + re-add for v1).
    if (next.amountFormula !== undefined) delete next.amountFormula;
  }
  // `undefined` means "don't touch"; explicit `null` clears the type
  // and the row falls back to its description as the primary label.
  if (patch.typeId !== undefined) {
    if (patch.typeId === null) {
      delete next.typeId;
      delete next.typeIdLocked;
    } else {
      next.typeId = patch.typeId;
      // The edit modal is an explicit user choice — lock the row out
      // of pattern-driven re-labelling, same as the inline type cell.
      next.typeIdLocked = true;
    }
  }
  // Same tri-state contract as typeId: undefined = don't touch,
  // null = clear, string = set.
  if (patch.companyId !== undefined) {
    if (patch.companyId === null) {
      delete next.companyId;
    } else {
      next.companyId = patch.companyId;
    }
  }
  // Only persist `true` — absent means "not a transfer". `false`
  // explicitly clears the flag.
  if (patch.isTransfer !== undefined) {
    if (patch.isTransfer) next.isTransfer = true;
    else delete next.isTransfer;
  }
  if (cols.dateId && patch.dateShiftDays && patch.dateShiftDays !== 0) {
    const cur = next.cells[cols.dateId];
    if (typeof cur === "string" && cur !== "") {
      next.cells[cols.dateId] = addDaysIso(cur, patch.dateShiftDays);
    }
  }
  return next;
}

// Walk the diff between prev and next; for any row whose description
// or amount changed and that isn't locked to a manual type, look up
// the first rule that matches the new shape and write the rule's
// typeId onto the row. Additive only — see the header note in
// `pattern-apply.ts`: when no rule wins, the row's existing typeId
// is preserved. Returns next unchanged when no row moves
// (referentially identical so the outer reducer can short-circuit).
//
// Hot path: this runs on every cell edit. Two perf moves keep its
// per-keystroke cost bounded by the rows that actually changed
// instead of the budget's size. (1) A reference-identity check skips
// every row whose object reference is the same as the previous
// snapshot — the cell-update reducer only re-allocates the one row
// it edits, so for a typical budget with R rows we look at 1 instead
// of R. (2) We materialise a new rows array lazily, only when a rule
// actually wants to overlay a label — the previous `.map(...)` paid
// the O(R) allocation on every keystroke even when nothing fired.
export function applyPatternsAfterCellEdit(
  prev: AccountBudget,
  next: AccountBudget,
  rules: readonly MatchRule[],
): AccountBudget {
  if (rules.length === 0) return next;
  if (prev.rows === next.rows) return next;
  const cols = resolveCandidateColumns(next.columns);
  if (cols.descId === undefined && cols.amountId === undefined) return next;
  const prevById = new Map<string, Row>();
  for (const r of prev.rows) prevById.set(r.id, r);
  let nextRows: Row[] | null = null;
  for (let i = 0; i < next.rows.length; i += 1) {
    const row = next.rows[i];
    if (row.typeIdLocked) continue;
    const before = prevById.get(row.id);
    // Reference-identity short-circuit: the cell-update reducer
    // returns the same row object when nothing on it changed, so a
    // single keystroke only ever flips one row's reference. Every
    // other row can skip the candidate construction and the cell
    // comparisons below.
    if (before === row) continue;
    const candidate = candidateFromRow(row, cols);
    if (!candidate) continue;
    const descChanged =
      cols.descId !== undefined &&
      (!before || before.cells[cols.descId] !== row.cells[cols.descId]);
    const amountChanged =
      cols.amountId !== undefined &&
      (!before || before.cells[cols.amountId] !== row.cells[cols.amountId]);
    if (!descChanged && !amountChanged) continue;
    const rule = findMatchingRuleForCandidate(rules, candidate);
    if (!rule || !rule.typeId) continue;
    const ruleCompanyId =
      rule.companyId !== undefined && rule.companyId !== null
        ? rule.companyId
        : undefined;
    const typeNeedsUpdate = rule.typeId !== row.typeId;
    const companyNeedsUpdate =
      ruleCompanyId !== undefined && ruleCompanyId !== row.companyId;
    if (!typeNeedsUpdate && !companyNeedsUpdate) continue;
    if (nextRows === null) nextRows = next.rows.slice();
    const nextRow: Row = { ...row, typeId: rule.typeId };
    if (ruleCompanyId !== undefined) nextRow.companyId = ruleCompanyId;
    nextRows[i] = nextRow;
  }
  if (nextRows === null) return next;
  return { ...next, rows: nextRows };
}
