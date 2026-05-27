import { useCallback, useRef, useState } from "react";
import { HelpCircle } from "lucide-react";

import type { FloatingPlacement } from "../../hooks";
import { useT } from "../../i18n";
import { FloatingPanel } from "../FloatingPanel";

// Right-anchored so the popover hugs the trigger button, which sits
// at the right edge of the formula input row. The min width keeps
// short paragraphs from breaking awkwardly on a wide modal.
const PLACEMENT: FloatingPlacement = {
  width: { kind: "min", minPx: 340 },
  anchor: "right",
  coordinateSpace: "viewport",
};

// Static reference content for the formula language.
export function BudgetFormulaHelpButton() {
  const t = useT();
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
        aria-label={t("formula.helpAria")}
        title={t("formula.helpButtonTitle")}
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
          <p className="mb-2 text-muted">{t("formula.summary")}</p>
          <Section title={t("formula.variables")}>
            <p className="text-muted">
              {t("formula.variablesIntro")}{" "}
              <strong className="text-fg">
                {t("formula.variablesDropdown")}
              </strong>{" "}
              {t("formula.variablesIntroEnd")}
            </p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 font-mono text-[11px]">
              <li>
                <span className="text-flag">endOfMonthBalance</span>
                <span className="text-muted">
                  {" "}
                  {t("formula.endOfMonthBalanceHint")}
                </span>
              </li>
              <li>
                <span className="text-flag">balanceBefore</span>
                <span className="text-muted">
                  {" "}
                  {t("formula.balanceBeforeHint")}
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
          <Section title={t("formula.otherSheets")}>
            <p className="text-muted">{t("formula.otherSheetsIntro")}</p>
            <pre className="mt-1 overflow-x-auto rounded border border-line bg-surface-3 px-2 py-1 font-mono text-[11px]">
              <span className="text-pipe">sheet</span>(
              <span className="text-path">&quot;Wife&quot;</span>,{" "}
              <span className="text-flag">endOfMonthBalance</span>)
            </pre>
            <p className="mt-1 text-muted">{t("formula.otherSheetsAfter")}</p>
          </Section>
          <Section title={t("formula.functions")}>
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
          <Section title={t("formula.examples")}>
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
