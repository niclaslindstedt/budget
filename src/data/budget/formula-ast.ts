// AST node shape and result types for the `Row.amountFormula`
// expression language. Split out from `formula.ts` so the tokenizer,
// parser, and evaluator each consume the shapes from one place
// without inheriting each other's implementation details.

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
