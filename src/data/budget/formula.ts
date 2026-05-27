// Public facade for the `Row.amountFormula` expression language. The
// tokenize → parse → evaluate pipeline lives in three sibling modules
// (`formula-tokenizer.ts`, `formula-parser.ts`, `formula-evaluator.ts`)
// over the shared AST in `formula-ast.ts`; this file re-exports the
// types and entry points callers depend on, and owns the two
// concerns that sit outside the runtime pipeline: the name ↔ id
// transforms used by the editor to keep cross-sheet references stable
// across renames, and the editor's autocomplete suggestion tables.
//
// Cross-sheet references are written as
// `sheet("<sheetId>", <variable>)` and stored with the target's stable
// id so they survive a rename. The editor swaps the id for the current
// name on open (`formulaToDisplay`) and back to id on submit
// (`formulaToStored`). The legacy `sheet("<sheetId>").<prop>` dotted
// form is still accepted by the parser so existing exports keep
// resolving — the parser packs the trailing path into a trailing
// string argument so both forms share the same evaluator shape.

import type { Sheet } from "../types";

export type {
  EvalErr,
  EvalOk,
  EvalResult,
  FormulaNode,
  ParseErr,
  ParseOk,
  ParseResult,
} from "./formula-ast";
export { parseFormula } from "./formula-parser";
export {
  evaluateFormula,
  FORMULA_FUNCTION_NAMES,
  type FormulaContext,
  type MonthAggregates,
} from "./formula-evaluator";

// ---------- Name ↔ id transforms ----------

// Replace every `sheet("<id>"` token in the stored form with
// `sheet("<currentName>"` so the editor renders human-readable names.
// The regex matches the literal up to but not including the closing
// `)` or `,`, so both surface forms (`sheet("X")` and `sheet("X", Y)`)
// are handled with a single rule. Unknown ids pass through verbatim
// — the editor surfaces them so the user sees what's broken.
export function formulaToDisplay(
  stored: string,
  sheets: readonly Sheet[],
): string {
  const byId = new Map<string, string>();
  for (const s of sheets) byId.set(s.id, s.name);
  return stored.replace(
    /sheet\(\s*"([^"]*)"\s*(?=[,)])/g,
    (_match, id: string) => {
      // The lookahead leaves the original `)` or `,` in place, so the
      // replacement must NOT re-emit the closing paren — only the
      // `sheet("<name>"` prefix gets rewritten.
      const name = byId.get(id);
      return name === undefined
        ? `sheet("${id}"`
        : `sheet(${JSON.stringify(name)}`;
    },
  );
}

// Reverse direction. Resolves each `sheet("<name>")` to its id; rejects
// on unknown or ambiguous (duplicate) names with a clear error.
export function formulaToStored(
  displayed: string,
  sheets: readonly Sheet[],
): { ok: true; formula: string } | { ok: false; error: string } {
  const byName = new Map<string, string[]>();
  for (const s of sheets) {
    const list = byName.get(s.name) ?? [];
    list.push(s.id);
    byName.set(s.name, list);
  }
  const knownIds = new Set(sheets.map((s) => s.id));
  let err: string | null = null;
  // The lookahead leaves the closing `)` or `,` in place so both surface
  // forms (`sheet("X")` legacy and `sheet("X", Y)` new) round-trip
  // cleanly. We only ever rewrite the first quoted argument — the
  // optional second argument (the property / variable) is left alone.
  const out = displayed.replace(
    /sheet\(\s*"([^"]*)"\s*(?=[,)])/g,
    (_match, token: string) => {
      // The lookahead leaves the original `)` or `,` in place, so the
      // replacement must NOT re-emit the closing paren — only the
      // `sheet("<id>"` prefix gets rewritten.
      if (knownIds.has(token)) return `sheet("${token}"`;
      const matches = byName.get(token) ?? [];
      if (matches.length === 0) {
        err = `Unknown sheet "${token}"`;
        return _match;
      }
      if (matches.length > 1) {
        err = `Multiple sheets named "${token}" — rename one to disambiguate`;
        return _match;
      }
      return `sheet("${matches[0]}"`;
    },
  );
  if (err) return { ok: false, error: err };
  return { ok: true, formula: out };
}

// ---------- Editor metadata (autocomplete) ----------

export type FormulaSuggestion = {
  // Text to insert at the caret (replacing the partial word).
  insert: string;
  // Label shown in the dropdown.
  label: string;
  // One-line description.
  description: string;
};

export const FORMULA_VARIABLES: FormulaSuggestion[] = [
  {
    insert: "endOfMonthBalance",
    label: "endOfMonthBalance",
    description: "Closing balance of this row's month (excludes this row).",
  },
  {
    insert: "balanceBefore",
    label: "balanceBefore",
    description: "Running balance just before this row.",
  },
  {
    insert: "openingBalance",
    label: "openingBalance",
    description: "Balance at the start of this row's month.",
  },
  {
    insert: "income",
    label: "income",
    description: "Sum of positive amounts in this month.",
  },
  {
    insert: "expenses",
    label: "expenses",
    description: "Sum of negative amounts in this month (negative).",
  },
  { insert: "net", label: "net", description: "income + expenses." },
  {
    insert: "uncategorized",
    label: "uncategorized",
    description: "Sum of uncategorised rows this month.",
  },
  {
    insert: "prevMonth.endingBalance",
    label: "prevMonth.endingBalance",
    description: "Closing balance of the previous month.",
  },
  {
    insert: "prevMonth.income",
    label: "prevMonth.income",
    description: "Income from the previous month.",
  },
  {
    insert: "prevMonth.expenses",
    label: "prevMonth.expenses",
    description: "Expenses from the previous month.",
  },
];

export const FORMULA_FUNCTIONS: FormulaSuggestion[] = [
  {
    insert: 'categoryTotal("")',
    label: 'categoryTotal("<id>")',
    description: "Sum in this month for the given category id.",
  },
  {
    insert: 'typeTotal("")',
    label: 'typeTotal("<id>")',
    description: "Sum in this month for the given type id.",
  },
  {
    insert: 'sheet("", endOfMonthBalance)',
    label: 'sheet("<name>", <variable>)',
    description: "Read a variable from another sheet for this row's month.",
  },
  {
    insert: "min(, )",
    label: "min(a, b, …)",
    description: "Smallest of the given values.",
  },
  {
    insert: "max(, )",
    label: "max(a, b, …)",
    description: "Largest of the given values.",
  },
  {
    insert: "clamp(, , )",
    label: "clamp(x, lo, hi)",
    description: "Clamp x to the range [lo, hi].",
  },
  { insert: "abs()", label: "abs(x)", description: "Absolute value." },
  {
    insert: "round()",
    label: "round(x[, places])",
    description: "Round to the given decimal places (default 0).",
  },
];
