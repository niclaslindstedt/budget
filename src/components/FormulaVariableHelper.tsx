import { useCallback, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

import { FORMULA_FUNCTIONS, FORMULA_VARIABLES } from "../data/formula";
import type { FloatingPlacement } from "../hooks";
import { FloatingPanel } from "./FloatingPanel";

// Right-anchored so the panel hugs the trigger button, which sits at
// the right edge of the formula input row. Wide enough to fit the
// longest function signature plus a one-line description.
const PLACEMENT: FloatingPlacement = {
  width: { kind: "min", minPx: 320 },
  anchor: "right",
  coordinateSpace: "viewport",
};

type Props = {
  // Receives the literal token to splice into the formula. The parent
  // (ComplexEntryModal) handles caret placement and focus restoration.
  onInsert: (text: string) => void;
};

export function FormulaVariableHelper({ onInsert }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);

  const handlePick = (text: string) => {
    onInsert(text);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Insert formula variable or function"
        title="Insert a formula variable or function"
        className="field-input flex h-full cursor-pointer items-center gap-1 rounded border border-line bg-surface-2 px-2 py-1.5 text-xs whitespace-nowrap text-muted hover:border-accent hover:text-fg"
      >
        <span>Variables</span>
        <ChevronDown size={12} aria-hidden focusable={false} />
      </button>
      <FloatingPanel
        open={open}
        onClose={close}
        triggerRef={rootRef}
        placement={PLACEMENT}
      >
        <ul role="listbox" className="max-h-80 overflow-auto py-1">
          <li
            aria-hidden
            className="px-3 pt-2 pb-1 text-[10px] tracking-wider text-muted uppercase"
          >
            Variables
          </li>
          {FORMULA_VARIABLES.map((v) => (
            <li key={v.insert}>
              <button
                type="button"
                role="option"
                aria-selected={false}
                onClick={() => handlePick(v.insert)}
                className="flex w-full cursor-pointer flex-col items-start gap-0.5 border-0 bg-transparent px-3 py-1.5 text-left hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
              >
                <span className="font-mono text-xs text-fg">{v.label}</span>
                <span className="text-[11px] text-muted">{v.description}</span>
              </button>
            </li>
          ))}
          <li
            aria-hidden
            className="mt-1 border-t border-line px-3 pt-2 pb-1 text-[10px] tracking-wider text-muted uppercase"
          >
            Functions
          </li>
          {FORMULA_FUNCTIONS.map((f) => (
            <li key={f.insert}>
              <button
                type="button"
                role="option"
                aria-selected={false}
                onClick={() => handlePick(f.insert)}
                className="flex w-full cursor-pointer flex-col items-start gap-0.5 border-0 bg-transparent px-3 py-1.5 text-left hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
              >
                <span className="font-mono text-xs text-fg">{f.label}</span>
                <span className="text-[11px] text-muted">{f.description}</span>
              </button>
            </li>
          ))}
        </ul>
      </FloatingPanel>
    </div>
  );
}
