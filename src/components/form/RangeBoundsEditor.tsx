import { useEffect, useRef, useState } from "react";

import type { Settings } from "../../data/types";
import { isoToMonthNum, monthNumToKey } from "../../utils/date";
import { formatAmountForInput, parseAmount } from "../../utils/format";

function clamp(n: number, lo: number, hi: number): number {
  return n < lo ? lo : n > hi ? hi : n;
}

type Bound = "min" | "max";

// How a range bound is typed and read back: which input element to
// render, how to seed it from the current numeric value, and how to
// parse the typed text back into the slider's numeric domain. The amount
// and date sliders share the editor below but differ only in this trio,
// so the call site picks one of the builders at the bottom of this file.
export type RangeEditIO = {
  kind: "text" | "month";
  inputMode?: "decimal";
  // Text to seed the input with when editing the given bound value.
  seed: (value: number) => string;
  // Parse the typed text back into the domain, or null when it's empty /
  // malformed so the editor leaves the bound untouched.
  parse: (text: string) => number | null;
};

type Props = {
  value: [number, number];
  min: number;
  max: number;
  onChange: (next: [number, number]) => void;
  // Read display of a bound — the same formatter the slider's
  // `aria-valuetext` uses, so the readout and the thumbs agree.
  format: (value: number) => string;
  io: RangeEditIO;
  ariaLabelMin: string;
  ariaLabelMax: string;
};

// Click-to-edit readout for a `RangeSlider`'s `from – to` pair. Each
// bound renders as a button that swaps to an input on click, so the user
// can type an exact amount / month instead of dragging a thumb to it —
// pinning down a precise value the lever can't reliably hit. Commit on
// Enter / blur (and on selection for the month picker), cancel on Escape;
// the typed value is clamped to the domain and kept from crossing the
// other thumb, mirroring the slider's own guard.
export function RangeBoundsEditor({
  value,
  min,
  max,
  onChange,
  format,
  io,
  ariaLabelMin,
  ariaLabelMax,
}: Props) {
  const [editing, setEditing] = useState<Bound | null>(null);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing === null) return;
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    if (io.kind === "text") input.select();
  }, [editing, io.kind]);

  const start = (bound: Bound) => {
    setDraft(io.seed(value[bound === "min" ? 0 : 1]));
    setEditing(bound);
  };

  const commit = (bound: Bound, text: string) => {
    const parsed = io.parse(text);
    if (parsed !== null) {
      const [lo, hi] = value;
      if (bound === "min") {
        const next = clamp(parsed, min, hi);
        if (next !== lo) onChange([next, hi]);
      } else {
        const next = clamp(parsed, lo, max);
        if (next !== hi) onChange([lo, next]);
      }
    }
    setEditing(null);
  };

  const renderBound = (bound: Bound) => {
    const idx = bound === "min" ? 0 : 1;
    const label = bound === "min" ? ariaLabelMin : ariaLabelMax;
    if (editing === bound) {
      const common =
        "field-input rounded border border-line bg-surface px-1 py-0.5 font-mono text-xs text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg";
      return (
        <input
          ref={inputRef}
          type={io.kind === "month" ? "month" : "text"}
          inputMode={io.kind === "text" ? io.inputMode : undefined}
          value={draft}
          aria-label={label}
          min={io.kind === "month" ? io.seed(min) : undefined}
          max={io.kind === "month" ? io.seed(max) : undefined}
          onChange={(e) => {
            setDraft(e.target.value);
            // The native month picker emits a complete value per pick, so
            // apply it straight away; a free-text amount waits for commit.
            if (io.kind === "month") commit(bound, e.target.value);
          }}
          onKeyDown={(e) => {
            // Keep Enter / Escape from bubbling to the surrounding
            // FloatingPanel, which closes the whole filter dropdown on
            // Escape — here they only commit / cancel the inline edit.
            if (e.key === "Enter") {
              e.preventDefault();
              e.stopPropagation();
              commit(bound, draft);
            } else if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              setEditing(null);
            }
          }}
          onBlur={() => commit(bound, draft)}
          className={io.kind === "month" ? common : `${common} w-20 text-right`}
        />
      );
    }
    return (
      <button
        type="button"
        onClick={() => start(bound)}
        aria-label={label}
        className="-mx-1 cursor-pointer rounded px-1 py-0.5 hover:bg-surface-3 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg"
      >
        {format(value[idx])}
      </button>
    );
  };

  return (
    <span className="inline-flex items-center gap-1 font-mono text-muted">
      {renderBound("min")}
      <span aria-hidden>–</span>
      {renderBound("max")}
    </span>
  );
}

// Edit config for an absolute-amount bound: a decimal text field seeded
// with the unformatted figure and parsed back with the shared amount
// parser, so either decimal separator and grouped input both work.
export function amountRangeIO(settings: Settings): RangeEditIO {
  return {
    kind: "text",
    inputMode: "decimal",
    seed: (value) => formatAmountForInput(value, settings),
    parse: (text) => parseAmount(text),
  };
}

// Edit config for a month-number bound: a native `<input type="month">`
// whose `YYYY-MM` value maps one-to-one onto the slider's month-number
// domain via the shared date helpers.
export function monthRangeIO(): RangeEditIO {
  return {
    kind: "month",
    seed: (value) => monthNumToKey(value),
    parse: (text) => {
      const trimmed = text.trim();
      return /^\d{4}-\d{2}$/.test(trimmed) ? isoToMonthNum(trimmed) : null;
    },
  };
}
