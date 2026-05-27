import {
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
} from "react";

import {
  FORMULA_FUNCTION_NAMES,
  FORMULA_VARIABLES,
} from "../../data/budget/formula";

// Imperative handle so the parent (ComplexEntryModal) can splice a
// token in at the caret when the user picks one from the "Variables"
// dropdown — same UX as the previous plain <input>, just routed
// through this component's caret-aware insert helper instead of
// `selectionStart` / `selectionEnd` on a native input.
export type FormulaInputHandle = {
  focus: () => void;
  insertAtCaret: (text: string) => void;
};

type Props = {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
};

// Sorted longest-first so a dotted path like `prevMonth.endingBalance`
// wins over `prevMonth` when both could match at the same position.
const VARIABLE_TOKENS = [...FORMULA_VARIABLES.map((v) => v.insert)].sort(
  (a, b) => b.length - a.length,
);

const IDENT_RE = /[A-Za-z0-9_]/;

type PillTone = "var" | "fn" | "sheet";

type Segment =
  | { kind: "text"; value: string }
  // `value` is the literal source the pill stands in for (what we
  // serialise back into the formula); `label` is the compact text
  // rendered inside the pill. For a plain variable they're the same;
  // for a sheet-name pill (`"Wife"`) the label is the unquoted name so
  // the pill doesn't carry visible quotes. `tone` drives the colour:
  // variables (orange), functions (purple), sheet names (cyan).
  | { kind: "pill"; value: string; label: string; tone: PillTone };

// Greedy match for a quoted string starting at `i`. Returns the end
// position (right after the closing quote) plus the parsed contents.
function matchStringLiteral(
  src: string,
  i: number,
): { end: number; value: string } | null {
  if (src[i] !== '"') return null;
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
  if (src[j] !== '"') return null;
  return { end: j + 1, value };
}

function tokenize(src: string): Segment[] {
  const segments: Segment[] = [];
  let buffer = "";
  const flush = () => {
    if (buffer !== "") {
      segments.push({ kind: "text", value: buffer });
      buffer = "";
    }
  };
  let i = 0;
  // `pendingSheetNameArg` flips on when we emit a `sheet` function
  // pill and back off as soon as we move past the first argument so we
  // don't accidentally pill a string that appears elsewhere inside the
  // call. The first `"..."` we see while the flag is set becomes a
  // sheet pill (cyan); any other char between the paren and that
  // string clears the flag.
  let pendingSheetNameArg = false;
  while (i < src.length) {
    const prev = i === 0 ? "" : src[i - 1];
    const atBoundary = !IDENT_RE.test(prev);

    // Sheet-name argument: the first `"..."` after `sheet(` becomes a
    // sheet pill (cyan, label = unquoted name). We only catch this
    // *immediately* — once we've seen any non-whitespace char inside
    // the parens that isn't the opening quote, the flag clears.
    if (pendingSheetNameArg && src[i] !== " " && src[i] !== "\t") {
      if (src[i] === '"') {
        const lit = matchStringLiteral(src, i);
        if (lit !== null) {
          flush();
          segments.push({
            kind: "pill",
            value: src.slice(i, lit.end),
            label: lit.value,
            tone: "sheet",
          });
          i = lit.end;
          pendingSheetNameArg = false;
          continue;
        }
      }
      pendingSheetNameArg = false;
    }

    if (atBoundary) {
      // Function call? Identifier immediately followed by `(` (with
      // optional whitespace between).
      let j = i;
      while (j < src.length && IDENT_RE.test(src[j])) j += 1;
      const ident = src.slice(i, j);
      let k = j;
      while (k < src.length && (src[k] === " " || src[k] === "\t")) k += 1;
      if (ident !== "" && FORMULA_FUNCTION_NAMES.has(ident) && src[k] === "(") {
        flush();
        segments.push({ kind: "pill", value: ident, label: ident, tone: "fn" });
        // Advance past the identifier — leave the parens/args to the
        // normal tokenizer so commas and inner pills render naturally.
        i = j;
        if (ident === "sheet") pendingSheetNameArg = true;
        continue;
      }

      // Variable name?
      let matched: string | null = null;
      for (const v of VARIABLE_TOKENS) {
        if (src.startsWith(v, i)) {
          const next = src[i + v.length] ?? "";
          if (!IDENT_RE.test(next)) {
            matched = v;
            break;
          }
        }
      }
      if (matched !== null) {
        flush();
        segments.push({
          kind: "pill",
          value: matched,
          label: matched,
          tone: "var",
        });
        i += matched.length;
        continue;
      }
    }

    // Closing paren without ever seeing a string clears the pending
    // sheet-name flag so it doesn't leak past a malformed call.
    if (src[i] === ")") pendingSheetNameArg = false;
    buffer += src[i];
    i += 1;
  }
  flush();
  return segments;
}

// Walk the rendered DOM back to a source string. Pills contribute
// their original token via `data-pill-token`; text nodes contribute
// their `nodeValue` verbatim. Stray `<br>` or `<div>` injections (some
// browsers like to create these on Enter, even though we preventDefault
// it) are skipped so accidental newlines never leak into the formula.
function serializeDOM(root: HTMLElement): string {
  let out = "";
  const walk = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.nodeValue ?? "";
      return;
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      const token = el.dataset.pillToken;
      if (token !== undefined) {
        out += token;
        return;
      }
      if (el.tagName === "BR") {
        return;
      }
    }
    node.childNodes.forEach(walk);
  };
  root.childNodes.forEach(walk);
  return out;
}

function renderSegments(root: HTMLElement, src: string): void {
  while (root.firstChild !== null) root.removeChild(root.firstChild);
  const segments = tokenize(src);
  for (const seg of segments) {
    if (seg.kind === "text") {
      root.appendChild(document.createTextNode(seg.value));
    } else {
      const span = document.createElement("span");
      span.contentEditable = "false";
      span.dataset.pillToken = seg.value;
      span.className = `formula-pill formula-pill-${seg.tone}`;
      span.textContent = seg.label;
      root.appendChild(span);
    }
  }
  // If the tail is a pill, append an empty text node so the caret has
  // a valid landing spot after it (some browsers won't place the caret
  // past a trailing contenteditable=false node otherwise).
  const last = root.lastChild;
  if (
    last !== null &&
    last.nodeType === Node.ELEMENT_NODE &&
    (last as HTMLElement).dataset.pillToken !== undefined
  ) {
    root.appendChild(document.createTextNode(""));
  }
}

function nodeTextLength(node: Node): number {
  if (node.nodeType === Node.TEXT_NODE) return (node.nodeValue ?? "").length;
  if (node.nodeType === Node.ELEMENT_NODE) {
    const el = node as HTMLElement;
    const token = el.dataset.pillToken;
    if (token !== undefined) return token.length;
    if (el.tagName === "BR") return 0;
  }
  let total = 0;
  node.childNodes.forEach((c) => {
    total += nodeTextLength(c);
  });
  return total;
}

// Translate a DOM Range endpoint into the equivalent character offset
// in the serialized source string. Used to snapshot the caret before a
// re-render and restore it after.
function getCaretOffset(root: HTMLElement): number | null {
  const sel = window.getSelection();
  if (sel === null || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.endContainer)) return null;
  let offset = 0;
  let found = false;
  const walk = (node: Node): void => {
    if (found) return;
    if (node === range.endContainer) {
      if (node.nodeType === Node.TEXT_NODE) {
        offset += range.endOffset;
      } else {
        for (let k = 0; k < range.endOffset; k++) {
          offset += nodeTextLength(node.childNodes[k]);
        }
      }
      found = true;
      return;
    }
    if (node.nodeType === Node.TEXT_NODE) {
      offset += (node.nodeValue ?? "").length;
      return;
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      if (el.dataset.pillToken !== undefined) {
        offset += el.dataset.pillToken.length;
        return;
      }
      if (el.tagName === "BR") return;
    }
    node.childNodes.forEach(walk);
  };
  root.childNodes.forEach(walk);
  return found ? offset : null;
}

function setCaretAtOffset(root: HTMLElement, target: number): void {
  const sel = window.getSelection();
  if (sel === null) return;
  let remaining = target;
  const place = (node: Node, offset: number): boolean => {
    const range = document.createRange();
    range.setStart(node, offset);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    return true;
  };
  const children = Array.from(root.childNodes);
  for (let idx = 0; idx < children.length; idx++) {
    const node = children[idx];
    if (node.nodeType === Node.TEXT_NODE) {
      const len = (node.nodeValue ?? "").length;
      if (remaining <= len) {
        place(node, remaining);
        return;
      }
      remaining -= len;
      continue;
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      const token = el.dataset.pillToken;
      if (token !== undefined) {
        const len = token.length;
        if (remaining <= 0) {
          place(root, idx);
          return;
        }
        if (remaining <= len) {
          // Either inside the pill (impossible to caret into, since
          // it's contentEditable=false) or right at its end — both
          // resolve to the caret position immediately after the pill.
          place(root, idx + 1);
          return;
        }
        remaining -= len;
        continue;
      }
    }
  }
  // Past the end — drop the caret at the end of the container.
  place(root, children.length);
}

export const FormulaInput = forwardRef<FormulaInputHandle, Props>(
  function FormulaInput(
    { value, onChange, placeholder, className, ariaLabel },
    ref,
  ) {
    const elRef = useRef<HTMLDivElement>(null);
    const focusedRef = useRef(false);

    useImperativeHandle(
      ref,
      () => ({
        focus: () => {
          elRef.current?.focus();
        },
        insertAtCaret: (text: string) => {
          const el = elRef.current;
          if (el === null) return;
          el.focus();
          const offset = getCaretOffset(el) ?? value.length;
          const next = value.slice(0, offset) + text + value.slice(offset);

          // Drop the caret into the first "hole" of the inserted
          // snippet so the user can keep typing without manually
          // navigating. The patterns, in priority order:
          //   `("",` — first arg is an empty quoted string (sheet
          //     template `sheet("", endOfMonthBalance)` wants the
          //     caret between the quotes)
          //   `("")` — single empty quoted arg (categoryTotal/typeTotal
          //     templates)
          //   `(,`   — first arg is an empty bare slot (math templates
          //     like `min(, )` and `clamp(, , )` want the caret right
          //     after the open paren)
          //   `()`   — empty parens (`abs()`, `round()`)
          // Pre-filled inserts (per-sheet variable picks) match none
          // and fall through to "caret at end".
          let caretInInsert = text.length;
          const emptyFirstQuote = text.indexOf('("",');
          const emptyOnlyQuote = text.indexOf('("")');
          const emptyBareArg = text.indexOf("(,");
          const emptyParens = text.indexOf("()");
          if (emptyFirstQuote >= 0) caretInInsert = emptyFirstQuote + 2;
          else if (emptyOnlyQuote >= 0) caretInInsert = emptyOnlyQuote + 2;
          else if (emptyBareArg >= 0) caretInInsert = emptyBareArg + 1;
          else if (emptyParens >= 0) caretInInsert = emptyParens + 1;

          onChange(next);
          requestAnimationFrame(() => {
            const elNow = elRef.current;
            if (elNow === null) return;
            elNow.focus();
            setCaretAtOffset(elNow, offset + caretInInsert);
          });
        },
      }),
      [value, onChange],
    );

    // Reconcile the DOM with `value` on every render. Skipping when the
    // serialized text already matches AND the pill structure is up to
    // date keeps caret position stable while the user is just typing —
    // we only blow away the DOM (which moves the caret) when a token
    // boundary just completed (or a pill needs to be removed).
    useLayoutEffect(() => {
      const el = elRef.current;
      if (el === null) return;
      const current = serializeDOM(el);
      if (current === value) {
        const expected = tokenize(value);
        const expectedPills = expected.filter((s) => s.kind === "pill").length;
        const currentPills = el.querySelectorAll("[data-pill-token]").length;
        if (expectedPills === currentPills) return;
      }
      const caret = focusedRef.current ? getCaretOffset(el) : null;
      renderSegments(el, value);
      if (caret !== null) setCaretAtOffset(el, caret);
    }, [value]);

    const handleInput = () => {
      const el = elRef.current;
      if (el === null) return;
      const text = serializeDOM(el);
      if (text !== value) onChange(text);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
      // Single-line input — swallow Enter so the contentEditable host
      // doesn't grow a `<br>` or wrap into a second line.
      if (e.key === "Enter") {
        e.preventDefault();
      }
    };

    const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
      // Force plain-text paste so styled clipboard content (rich text
      // from a browser, a code editor's monospace HTML, anything with
      // background colours) doesn't leak into the contentEditable host.
      e.preventDefault();
      const text = e.clipboardData.getData("text/plain");
      if (text === "") return;
      const sel = window.getSelection();
      if (sel === null || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      range.deleteContents();
      range.insertNode(document.createTextNode(text));
      // Collapse to end of inserted text and let `handleInput` fire
      // naturally so the parent value updates.
      sel.collapseToEnd();
      const el = elRef.current;
      if (el !== null) {
        const next = serializeDOM(el);
        if (next !== value) onChange(next);
      }
    };

    return (
      <div
        ref={elRef}
        contentEditable
        suppressContentEditableWarning
        // `contentEditable` is implicitly focusable in every browser,
        // but jsx-a11y can't see that — declare the tabbability
        // explicitly so the `role="textbox"` contract is satisfied
        // for the linter and is plain to readers.
        tabIndex={0}
        role="textbox"
        aria-label={ariaLabel}
        aria-multiline="false"
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onFocus={() => {
          focusedRef.current = true;
        }}
        onBlur={() => {
          focusedRef.current = false;
        }}
        data-placeholder={value === "" ? placeholder : undefined}
        className={className}
      />
    );
  },
);
