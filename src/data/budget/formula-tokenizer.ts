// Lexer for the `Row.amountFormula` expression language. Produces a
// flat token stream that the parser walks; emits a single error
// string on lexical failure (unterminated string, stray character).

// Uniform-shape token so the parser's `value` access type-checks
// without per-variant narrowing. `eof` carries an empty-string value
// which the parser never reads — it branches on `type` first. The op
// variant keeps a literal union for its `value` so subsequent
// comparisons (`t.value === "+"`) narrow to the operator literal,
// which lets the AST builder assign without a cast.
export type OpToken = "+" | "-" | "*" | "/" | "(" | ")" | "," | ".";
export type Token =
  | { type: "num"; value: number }
  | { type: "str"; value: string }
  | { type: "ident"; value: string }
  | { type: "op"; value: OpToken }
  | { type: "eof"; value: "" };

export function tokenize(src: string): Token[] | { error: string } {
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
