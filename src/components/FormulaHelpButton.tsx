import { useCallback, useRef, useState } from "react";
import { HelpCircle } from "lucide-react";

import type { FloatingPlacement } from "../hooks";
import { FloatingPanel } from "./FloatingPanel";

// Right-anchored so the popover hugs the trigger button, which sits
// at the right edge of the formula input row. The min width keeps
// short paragraphs from breaking awkwardly on a wide modal.
const PLACEMENT: FloatingPlacement = {
  width: { kind: "min", minPx: 340 },
  anchor: "right",
  coordinateSpace: "viewport",
};

// Static reference content for the formula language. Lives next to
// the button so the wording is a single source of truth — the JSON
// Schema page at `/schema` and the suggestion table both reference
// the same primitives but at different fidelity, so we don't try to
// keep them in sync programmatically.
export function FormulaHelpButton() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Formula help"
        title="What can I write here?"
        className="field-input flex h-full cursor-pointer items-center justify-center rounded border border-line bg-surface-2 px-2 py-1.5 text-muted hover:border-accent hover:text-fg"
      >
        <HelpCircle size={14} aria-hidden focusable={false} />
      </button>
      <FloatingPanel
        open={open}
        onClose={close}
        triggerRef={rootRef}
        placement={PLACEMENT}
      >
        <div className="max-h-96 overflow-auto px-3 py-2 text-xs text-fg">
          <p className="mb-2 text-muted">
            A formula computes the row's amount at render time. Numbers,
            arithmetic (<code className="font-mono">+ - * /</code>),
            parentheses, variables, and the functions below all work.
          </p>
          <Section title="Variables">
            <p className="text-muted">
              Each variable reads from the row's own month. Pick from the{" "}
              <strong className="text-fg">Variables</strong> dropdown to insert
              one — it renders as an orange pill that backspace removes in one
              step.
            </p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 font-mono text-[11px]">
              <li>
                <span className="text-flag">endOfMonthBalance</span>
                <span className="text-muted"> — closing balance</span>
              </li>
              <li>
                <span className="text-flag">balanceBefore</span>
                <span className="text-muted">
                  {" "}
                  — running balance just before this row
                </span>
              </li>
              <li>
                <span className="text-flag">income</span>
                <span className="text-muted">, </span>
                <span className="text-flag">expenses</span>
                <span className="text-muted">, </span>
                <span className="text-flag">net</span>
              </li>
              <li>
                <span className="text-flag">prevMonth.endingBalance</span>
                <span className="text-muted">, </span>
                <span className="text-flag">prevMonth.income</span>
                <span className="text-muted">, …</span>
              </li>
            </ul>
          </Section>
          <Section title="Other sheets">
            <p className="text-muted">
              Read a variable from a different sheet:
            </p>
            <pre className="mt-1 overflow-x-auto rounded border border-line bg-surface-3 px-2 py-1 font-mono text-[11px]">
              <span className="text-pipe">sheet</span>(
              <span className="text-path">&quot;Wife&quot;</span>,{" "}
              <span className="text-flag">endOfMonthBalance</span>)
            </pre>
            <p className="mt-1 text-muted">
              The sheet name renders as a cyan pill, the variable as an orange
              pill — both are single-character deletions.
            </p>
          </Section>
          <Section title="Functions">
            <ul className="list-disc space-y-0.5 pl-4 font-mono text-[11px]">
              <li>
                <span className="text-pipe">min</span>(a, b, …),{" "}
                <span className="text-pipe">max</span>(a, b, …)
              </li>
              <li>
                <span className="text-pipe">clamp</span>(x, lo, hi)
              </li>
              <li>
                <span className="text-pipe">abs</span>(x),{" "}
                <span className="text-pipe">round</span>(x[, places])
              </li>
              <li>
                <span className="text-pipe">categoryTotal</span>
                (&quot;<em>id</em>&quot;),{" "}
                <span className="text-pipe">typeTotal</span>
                (&quot;<em>id</em>&quot;)
              </li>
            </ul>
          </Section>
          <Section title="Examples">
            <ul className="list-disc space-y-1 pl-4 font-mono text-[11px]">
              <li>
                <span className="text-flag">endOfMonthBalance</span> - 5000
              </li>
              <li>
                <span className="text-pipe">max</span>(0,{" "}
                <span className="text-flag">net</span>)
              </li>
              <li>
                <span className="text-pipe">sheet</span>(
                <span className="text-path">&quot;Joint&quot;</span>,{" "}
                <span className="text-flag">endOfMonthBalance</span>) / 2
              </li>
            </ul>
          </Section>
          <p className="mt-2 text-muted">
            Full reference: see the{" "}
            <a
              href="/schema"
              target="_blank"
              rel="noopener noreferrer"
              className="text-link underline"
            >
              data schema
            </a>
            .
          </p>
        </div>
      </FloatingPanel>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-2 border-t border-line pt-2 first:mt-0 first:border-t-0 first:pt-0">
      <h3 className="mb-1 text-[10px] tracking-wider text-muted uppercase">
        {title}
      </h3>
      {children}
    </div>
  );
}
