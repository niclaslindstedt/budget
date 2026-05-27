// Evaluator for the `Row.amountFormula` AST. Walks the node tree
// produced by `formula-parser.ts` against a `FormulaContext` the
// caller assembles from the row's month aggregates and the
// cross-sheet lookup.

import type { EvalResult, FormulaNode } from "./formula-ast";

// Aggregates for a single fiscal month, all expressed in the row's own
// currency / sign convention (positive = inflow, negative = outflow).
// The evaluator builds this for the row's own month and `prevMonth`.
export type MonthAggregates = {
  // Running balance at the start of this month (carry from prior
  // months + opening balance + any history).
  openingBalance: number;
  // Sum of positive amounts in the month.
  income: number;
  // Sum of negative amounts in the month (negative number).
  expenses: number;
  // income + expenses.
  net: number;
  // Sum of rows with no category in the month.
  uncategorized: number;
  // Per-category and per-type sums for the month, keyed by id.
  byCategory: ReadonlyMap<string, number>;
  byType: ReadonlyMap<string, number>;
};

export type FormulaContext = {
  // The row's month aggregates with the row itself excluded.
  thisMonth: MonthAggregates;
  // The prior fiscal month, including all rows (the row isn't in it).
  prevMonth: MonthAggregates;
  // Running balance just before this row.
  balanceBefore: number;
  // End-of-month balance for the row's month, excluding the row itself.
  endOfMonthBalance: number;
  // Cross-sheet lookup. Returns the named property on the named sheet
  // for the row's fiscal month, or `null` when the sheet is unknown.
  lookupSheet: (sheetId: string, prop: string) => number | null;
};

export function evaluateFormula(
  ast: FormulaNode,
  ctx: FormulaContext,
): EvalResult {
  try {
    return { ok: true, value: walk(ast, ctx) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function walk(node: FormulaNode, ctx: FormulaContext): number {
  switch (node.kind) {
    case "number":
      return node.value;
    case "unary": {
      const v = walk(node.operand, ctx);
      return -v;
    }
    case "binop": {
      const l = walk(node.left, ctx);
      const r = walk(node.right, ctx);
      if (node.op === "+") return l + r;
      if (node.op === "-") return l - r;
      if (node.op === "*") return l * r;
      if (r === 0) throw new Error("Division by zero");
      return l / r;
    }
    case "var":
      return resolveVar(node.path, ctx);
    case "call":
      return resolveCall(node.name, node.args, ctx);
    case "string":
      throw new Error("String used outside a function call");
  }
}

function resolveVar(path: string[], ctx: FormulaContext): number {
  const head = path[0];
  if (path.length === 1) {
    switch (head) {
      case "endOfMonthBalance":
        return ctx.endOfMonthBalance;
      case "balanceBefore":
        return ctx.balanceBefore;
      case "openingBalance":
        return ctx.thisMonth.openingBalance;
      case "income":
        return ctx.thisMonth.income;
      case "expenses":
        return ctx.thisMonth.expenses;
      case "net":
        return ctx.thisMonth.net;
      case "uncategorized":
        return ctx.thisMonth.uncategorized;
      default:
        throw new Error(`Unknown variable "${head}"`);
    }
  }
  if (head === "prevMonth" && path.length === 2) {
    const tail = path[1];
    switch (tail) {
      case "endingBalance":
        return ctx.prevMonth.openingBalance + ctx.prevMonth.net;
      case "openingBalance":
        return ctx.prevMonth.openingBalance;
      case "income":
        return ctx.prevMonth.income;
      case "expenses":
        return ctx.prevMonth.expenses;
      case "net":
        return ctx.prevMonth.net;
      default:
        throw new Error(`Unknown prevMonth property "${tail}"`);
    }
  }
  throw new Error(`Unknown variable "${path.join(".")}"`);
}

function resolveCall(
  name: string,
  args: FormulaNode[],
  ctx: FormulaContext,
): number {
  // Built-in math helpers.
  if (name === "min" || name === "max") {
    if (args.length === 0) throw new Error(`${name}() needs at least one arg`);
    const values = args.map((a) => walk(a, ctx));
    return name === "min" ? Math.min(...values) : Math.max(...values);
  }
  if (name === "clamp") {
    if (args.length !== 3) throw new Error("clamp(x, lo, hi) needs 3 args");
    const x = walk(args[0], ctx);
    const lo = walk(args[1], ctx);
    const hi = walk(args[2], ctx);
    return Math.min(Math.max(x, lo), hi);
  }
  if (name === "abs") {
    if (args.length !== 1) throw new Error("abs(x) needs 1 arg");
    return Math.abs(walk(args[0], ctx));
  }
  if (name === "round") {
    if (args.length !== 1 && args.length !== 2)
      throw new Error("round(x[, places]) needs 1 or 2 args");
    const x = walk(args[0], ctx);
    const places = args.length === 2 ? walk(args[1], ctx) : 0;
    const m = Math.pow(10, Math.round(places));
    return Math.round(x * m) / m;
  }
  // Id-arg lookups: categoryTotal, typeTotal.
  if (name === "categoryTotal" || name === "typeTotal") {
    if (args.length !== 1 || args[0].kind !== "string")
      throw new Error(`${name}("<id>") expects one string argument`);
    const id = args[0].value;
    const map =
      name === "categoryTotal"
        ? ctx.thisMonth.byCategory
        : ctx.thisMonth.byType;
    return map.get(id) ?? 0;
  }
  // Two surface forms map to the same shape here:
  //   `sheet("<id>", <variable>)`  — new, the variable is an identifier
  //   `sheet("<id>", "<prop>")`    — same idea but the prop is a string
  //   `sheet("<id>").<prop>`       — legacy; the parser packs the
  //                                  trailing dot-path into a string
  // arg, so it reaches us looking like the second form. All three end
  // up as (string id, prop-name) before we hit `lookupSheet`.
  if (name === "sheet") {
    if (args.length !== 2 || args[0].kind !== "string")
      throw new Error(
        'sheet("<name>", <variable>) — expected a sheet name and a variable',
      );
    const sheetId = args[0].value;
    const second = args[1];
    let prop: string;
    if (second.kind === "string") {
      prop = second.value;
    } else if (second.kind === "var" && second.path.length >= 1) {
      // A bare identifier (the new pill-friendly form) or a dotted path
      // like `prevMonth.income`. lookupSheet receives the full path
      // joined with `.` so the cross-sheet resolver can decide how to
      // split it (it already understands `prevMonth.*` on the local
      // side, the implementation just needs to plumb it through).
      prop = second.path.join(".");
    } else {
      throw new Error(
        "sheet(…) second argument must be a variable name (e.g. endOfMonthBalance)",
      );
    }
    const v = ctx.lookupSheet(sheetId, prop);
    if (v === null) throw new Error(`Unknown sheet "${sheetId}"`);
    return v;
  }
  throw new Error(`Unknown function "${name}"`);
}

// Names every formula author may invoke. Exported so the editor can
// highlight function-call sites distinctly from plain variables and
// from numeric literals, without re-deriving the list from the
// suggestion table.
export const FORMULA_FUNCTION_NAMES: ReadonlySet<string> = new Set([
  "min",
  "max",
  "clamp",
  "abs",
  "round",
  "categoryTotal",
  "typeTotal",
  "sheet",
]);
