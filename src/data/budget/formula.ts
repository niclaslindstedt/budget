// Tiny expression language for `Row.amountFormula` — the dynamic-amount
// feature on the ComplexEntryModal. The whole pipeline lives here:
// tokenize → parse → evaluate, plus the name ↔ id transforms used to
// keep cross-sheet references stable across renames.
//
// Grammar (informal):
//   expr      := term (("+" | "-") term)*
//   term      := factor (("*" | "/") factor)*
//   factor    := unary | "(" expr ")" | NUMBER | call | ident-path
//   unary     := "-" factor
//   call      := IDENT "(" (arg ("," arg)*)? ")"
//   arg       := expr | STRING
//   ident-path := IDENT ("." IDENT)*
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

// ---------- AST ----------

export type FormulaNode =
  | { kind: "number"; value: number }
  | { kind: "string"; value: string }
  | { kind: "var"; path: string[] }
  | { kind: "call"; name: string; args: FormulaNode[] }
  | {
      kind: "binop";
      op: "+" | "-" | "*" | "/";
      left: FormulaNode;
      right: FormulaNode;
    }
  | { kind: "unary"; op: "-"; operand: FormulaNode };

export type ParseOk = { ok: true; ast: FormulaNode };
export type ParseErr = { ok: false; error: string };
export type ParseResult = ParseOk | ParseErr;

export type EvalOk = { ok: true; value: number };
export type EvalErr = { ok: false; error: string };
export type EvalResult = EvalOk | EvalErr;

// ---------- Tokenizer ----------

// Uniform-shape token so the parser's `value` access type-checks
// without per-variant narrowing. `eof` carries an empty-string value
// which the parser never reads — it branches on `type` first. The op
// variant keeps a literal union for its `value` so subsequent
// comparisons (`t.value === "+"`) narrow to the operator literal,
// which lets the AST builder assign without a cast.
type OpToken = "+" | "-" | "*" | "/" | "(" | ")" | "," | ".";
type Token =
  | { type: "num"; value: number }
  | { type: "str"; value: string }
  | { type: "ident"; value: string }
  | { type: "op"; value: OpToken }
  | { type: "eof"; value: "" };

function tokenize(src: string): Token[] | { error: string } {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      i += 1;
      continue;
    }
    if (c === '"') {
      let j = i + 1;
      let value = "";
      while (j < src.length && src[j] !== '"') {
        if (src[j] === "\\" && j + 1 < src.length) {
          value += src[j + 1];
          j += 2;
          continue;
        }
        value += src[j];
        j += 1;
      }
      if (j >= src.length) return { error: "Unterminated string" };
      tokens.push({ type: "str", value });
      i = j + 1;
      continue;
    }
    if ((c >= "0" && c <= "9") || c === ".") {
      let j = i;
      let sawDot = false;
      while (j < src.length) {
        const ch = src[j];
        if (ch >= "0" && ch <= "9") {
          j += 1;
        } else if (ch === "." && !sawDot && i !== j) {
          // A leading dot is the property accessor, not a number.
          sawDot = true;
          j += 1;
        } else {
          break;
        }
      }
      if (j === i) {
        // Bare "." — property accessor.
        tokens.push({ type: "op", value: "." });
        i += 1;
        continue;
      }
      const chunk = src.slice(i, j);
      const value = Number(chunk);
      if (!Number.isFinite(value)) return { error: `Bad number "${chunk}"` };
      tokens.push({ type: "num", value });
      i = j;
      continue;
    }
    if ((c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "_") {
      let j = i + 1;
      while (j < src.length) {
        const ch = src[j];
        if (
          (ch >= "a" && ch <= "z") ||
          (ch >= "A" && ch <= "Z") ||
          (ch >= "0" && ch <= "9") ||
          ch === "_"
        ) {
          j += 1;
        } else break;
      }
      tokens.push({ type: "ident", value: src.slice(i, j) });
      i = j;
      continue;
    }
    if (
      c === "+" ||
      c === "-" ||
      c === "*" ||
      c === "/" ||
      c === "(" ||
      c === ")" ||
      c === "," ||
      c === "."
    ) {
      tokens.push({ type: "op", value: c as OpToken });
      i += 1;
      continue;
    }
    return { error: `Unexpected character "${c}" at position ${i}` };
  }
  tokens.push({ type: "eof", value: "" });
  return tokens;
}

// ---------- Parser ----------

class Parser {
  private pos = 0;
  constructor(private tokens: Token[]) {}

  private peek(): Token {
    return this.tokens[this.pos];
  }
  private eat(): Token {
    return this.tokens[this.pos++];
  }
  private match(type: Token["type"], value?: string): boolean {
    const t = this.peek();
    if (t.type !== type) return false;
    if (value !== undefined && t.value !== value) return false;
    this.pos += 1;
    return true;
  }
  private expect(type: Token["type"], value?: string): Token {
    const t = this.peek();
    if (t.type !== type || (value !== undefined && t.value !== value)) {
      throw new Error(
        `Expected ${value ?? type} but got ${
          t.type === "eof" ? "end of formula" : `"${t.value}"`
        }`,
      );
    }
    return this.eat();
  }

  parseExpr(): FormulaNode {
    let left = this.parseTerm();
    while (true) {
      const t = this.peek();
      if (t.type === "op" && (t.value === "+" || t.value === "-")) {
        this.eat();
        const right = this.parseTerm();
        left = { kind: "binop", op: t.value, left, right };
      } else break;
    }
    return left;
  }

  private parseTerm(): FormulaNode {
    let left = this.parseFactor();
    while (true) {
      const t = this.peek();
      if (t.type === "op" && (t.value === "*" || t.value === "/")) {
        this.eat();
        const right = this.parseFactor();
        left = { kind: "binop", op: t.value, left, right };
      } else break;
    }
    return left;
  }

  private parseFactor(): FormulaNode {
    const t = this.peek();
    if (t.type === "op" && t.value === "-") {
      this.eat();
      return { kind: "unary", op: "-", operand: this.parseFactor() };
    }
    if (t.type === "op" && t.value === "(") {
      this.eat();
      const inner = this.parseExpr();
      this.expect("op", ")");
      return inner;
    }
    if (t.type === "num") {
      this.eat();
      return { kind: "number", value: t.value };
    }
    if (t.type === "ident") {
      this.eat();
      // call?
      if (this.match("op", "(")) {
        const args: FormulaNode[] = [];
        if (!this.match("op", ")")) {
          args.push(this.parseArg());
          while (this.match("op", ",")) args.push(this.parseArg());
          this.expect("op", ")");
        }
        // Legacy method-chain form: `sheet("…").endOfMonthBalance`.
        // Kept so older exports continue to parse — new entries use
        // the comma form `sheet("…", endOfMonthBalance)` instead.
        if (this.match("op", ".")) {
          const path: string[] = [];
          path.push(String(this.expect("ident").value));
          while (this.match("op", ".")) {
            path.push(String(this.expect("ident").value));
          }
          return {
            kind: "call",
            name: String(t.value),
            args: [
              ...args,
              // Trailing ident-path goes in as a string arg so the
              // legacy and comma-arg forms reach the evaluator with
              // the same shape.
              { kind: "string", value: path.join(".") },
            ],
          };
        }
        return { kind: "call", name: String(t.value), args };
      }
      // ident path: prevMonth.endingBalance
      const path = [String(t.value)];
      while (this.match("op", ".")) {
        path.push(String(this.expect("ident").value));
      }
      return { kind: "var", path };
    }
    if (t.type === "str") {
      this.eat();
      return { kind: "string", value: String(t.value) };
    }
    throw new Error(
      t.type === "eof"
        ? "Unexpected end of formula"
        : `Unexpected token "${t.value}"`,
    );
  }

  private parseArg(): FormulaNode {
    return this.parseExpr();
  }

  done(): boolean {
    return this.peek().type === "eof";
  }
}

export function parseFormula(src: string): ParseResult {
  const trimmed = src.trim();
  if (trimmed === "") return { ok: false, error: "Empty formula" };
  const tokens = tokenize(trimmed);
  if ("error" in tokens) return { ok: false, error: tokens.error };
  const p = new Parser(tokens);
  try {
    const ast = p.parseExpr();
    if (!p.done()) return { ok: false, error: "Trailing input" };
    return { ok: true, ast };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

// ---------- Context + evaluator ----------

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
