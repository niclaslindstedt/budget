// Recursive-descent parser for the `Row.amountFormula` expression
// language. Builds the AST in `formula-ast.ts` from the token stream
// emitted by `formula-tokenizer.ts`.
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
// The legacy method-chain form `sheet("X").endOfMonthBalance` is still
// accepted — the parser packs the trailing dot-path into a trailing
// string argument so both surface forms reach the evaluator with the
// same shape.

import type { FormulaNode, ParseResult } from "./formula-ast";
import { tokenize, type Token } from "./formula-tokenizer";

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

// Cache parsed ASTs by raw source string. `resolveEffectiveAmounts`
// runs `parseFormula` once per formula row on every render, but a
// formula's source only changes when the user edits the row — so the
// repeat work is pure waste. `walk` reads the AST without mutating
// it, so sharing the same node graph across renders is safe. Bounded
// so a long-lived session with many edited formulas can't grow the
// cache without limit; eviction is FIFO via Map insertion order.
const PARSE_CACHE_LIMIT = 256;
const parseCache = new Map<string, ParseResult>();

export function parseFormula(src: string): ParseResult {
  const cached = parseCache.get(src);
  if (cached !== undefined) return cached;
  const result = parseFormulaUncached(src);
  if (parseCache.size >= PARSE_CACHE_LIMIT) {
    const oldest = parseCache.keys().next().value;
    if (oldest !== undefined) parseCache.delete(oldest);
  }
  parseCache.set(src, result);
  return result;
}

function parseFormulaUncached(src: string): ParseResult {
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
