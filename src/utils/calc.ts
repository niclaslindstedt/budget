// Tiny, dependency-free arithmetic evaluator for the amount calculator
// popover. Supports `+ - * /`, parentheses, and unary signs over decimal
// numbers — enough to add up a few line items off a receipt
// ("100 + 30 + 50") without reaching for `eval` (which would execute
// arbitrary JS) or a parser library. A comma is always treated as a
// decimal separator here: the popover only ever sums amounts, so there
// is no thousands-grouping to disambiguate.
//
// Returns the computed number, or `null` for an empty / malformed
// expression or a non-finite result (e.g. division by zero). Callers
// surface `null` as a quiet "can't evaluate" state rather than throwing.

type Token =
  | { kind: "num"; value: number }
  | { kind: "op"; value: "+" | "-" | "*" | "/" }
  | { kind: "lparen" }
  | { kind: "rparen" };

function tokenize(input: string): Token[] | null {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (ch === " " || ch === "\t") {
      i += 1;
      continue;
    }
    if (ch === "+" || ch === "-" || ch === "*" || ch === "/") {
      tokens.push({ kind: "op", value: ch });
      i += 1;
      continue;
    }
    if (ch === "(") {
      tokens.push({ kind: "lparen" });
      i += 1;
      continue;
    }
    if (ch === ")") {
      tokens.push({ kind: "rparen" });
      i += 1;
      continue;
    }
    if ((ch >= "0" && ch <= "9") || ch === ".") {
      let j = i;
      let dots = 0;
      while (j < input.length) {
        const c = input[j];
        if (c >= "0" && c <= "9") {
          j += 1;
        } else if (c === ".") {
          dots += 1;
          if (dots > 1) return null;
          j += 1;
        } else {
          break;
        }
      }
      const slice = input.slice(i, j);
      const value = Number(slice);
      if (!Number.isFinite(value)) return null;
      tokens.push({ kind: "num", value });
      i = j;
      continue;
    }
    // Any other character makes the whole expression invalid.
    return null;
  }
  return tokens;
}

// Recursive-descent parser over the token stream. Grammar:
//   expr   := term   (('+' | '-') term)*
//   term   := factor (('*' | '/') factor)*
//   factor := ('+' | '-') factor | '(' expr ')' | number
export function evaluateExpression(input: string): number | null {
  const expr = input.trim();
  if (expr === "") return null;
  // Comma → dot so Swedish decimal input ("12,5") parses the same as
  // dotted input.
  const tokens = tokenize(expr.replace(/,/g, "."));
  if (tokens === null || tokens.length === 0) return null;

  let pos = 0;
  const peek = (): Token | undefined => tokens[pos];

  function parseExpr(): number | null {
    let acc = parseTerm();
    if (acc === null) return null;
    for (;;) {
      const tok = peek();
      if (tok?.kind === "op" && (tok.value === "+" || tok.value === "-")) {
        pos += 1;
        const rhs = parseTerm();
        if (rhs === null) return null;
        acc = tok.value === "+" ? acc + rhs : acc - rhs;
      } else {
        return acc;
      }
    }
  }

  function parseTerm(): number | null {
    let acc = parseFactor();
    if (acc === null) return null;
    for (;;) {
      const tok = peek();
      if (tok?.kind === "op" && (tok.value === "*" || tok.value === "/")) {
        pos += 1;
        const rhs = parseFactor();
        if (rhs === null) return null;
        if (tok.value === "/" && rhs === 0) return null;
        acc = tok.value === "*" ? acc * rhs : acc / rhs;
      } else {
        return acc;
      }
    }
  }

  function parseFactor(): number | null {
    const tok = peek();
    if (tok === undefined) return null;
    if (tok.kind === "op" && (tok.value === "+" || tok.value === "-")) {
      pos += 1;
      const operand = parseFactor();
      if (operand === null) return null;
      return tok.value === "-" ? -operand : operand;
    }
    if (tok.kind === "lparen") {
      pos += 1;
      const inner = parseExpr();
      if (inner === null) return null;
      if (peek()?.kind !== "rparen") return null;
      pos += 1;
      return inner;
    }
    if (tok.kind === "num") {
      pos += 1;
      return tok.value;
    }
    return null;
  }

  const result = parseExpr();
  // Reject trailing junk ("1+2 3") so partial parses don't silently
  // resolve to a wrong number.
  if (result === null || pos !== tokens.length) return null;
  return Number.isFinite(result) ? result : null;
}
