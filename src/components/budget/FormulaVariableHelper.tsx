import { useCallback, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

import { FORMULA_FUNCTIONS, FORMULA_VARIABLES } from "../../data/formula";
import type { FloatingPlacement } from "../../hooks";
import type { Sheet } from "../../data/types";
import { useT } from "../../i18n";
import { FloatingPanel } from "../FloatingPanel";

// Right-anchored so the panel hugs the trigger button, which sits at
// the right edge of the formula input row. Wide enough to fit the
// longest function signature plus a one-line description.
const PLACEMENT: FloatingPlacement = {
  width: { kind: "min", minPx: 320 },
  anchor: "right",
  coordinateSpace: "viewport",
};

// Subset of variables that make sense in the cross-sheet shape
// `sheet("X", <prop>)`. The full FORMULA_VARIABLES list includes
// row-local values (`balanceBefore`, `uncategorized`, the bare
// `endingBalance`-style aliases) that the resolver only exposes for
// the row's own sheet — keep the per-sheet picker scoped to what the
// `sheet(…)` lookup table actually supports so the user doesn't pick
// a token that fails validation on submit.
const SHEET_PROPS: ReadonlyArray<{
  prop: string;
  label: string;
  description: string;
}> = [
  {
    prop: "endOfMonthBalance",
    label: "endOfMonthBalance",
    description: "Closing balance of that sheet for this row's month.",
  },
  {
    prop: "openingBalance",
    label: "openingBalance",
    description: "Balance at the start of that sheet's month.",
  },
  {
    prop: "income",
    label: "income",
    description: "Sum of positive amounts in that sheet for this month.",
  },
  {
    prop: "expenses",
    label: "expenses",
    description: "Sum of negative amounts in that sheet for this month.",
  },
  {
    prop: "net",
    label: "net",
    description: "income + expenses for that sheet this month.",
  },
];

type Props = {
  // Receives the literal token to splice into the formula. The parent
  // (ComplexEntryModal) handles caret placement and focus restoration.
  onInsert: (text: string) => void;
  // Every sheet in the workspace. The dropdown surfaces a per-sheet
  // section so the user can pick `sheet("Wife", endOfMonthBalance)`
  // directly instead of typing the sheet name (and risking a typo
  // that fails the name → id resolution on submit).
  sheets: readonly Sheet[];
  // The sheet the new entry is being added to. Hidden from the
  // per-sheet section since the bare variable forms
  // (`endOfMonthBalance`, …) already reference it directly.
  currentSheetId: string | null;
};

export function FormulaVariableHelper({
  onInsert,
  sheets,
  currentSheetId,
}: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);

  const otherSheets = useMemo(
    () =>
      sheets.filter((s) => s.id !== currentSheetId && s.type !== "accounts"),
    [sheets, currentSheetId],
  );

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
        aria-label={t("formula.insertVariableAria")}
        title={t("formula.insertVariableTitle")}
        className="field-input flex h-full cursor-pointer items-center gap-1 rounded border border-line bg-surface-2 px-2 py-1.5 text-xs whitespace-nowrap text-muted hover:border-accent hover:text-fg"
      >
        <span>{t("formula.variablesButtonLabel")}</span>
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
            {t("formula.thisSheet")}
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
          {otherSheets.map((sheet) => (
            <SheetSection key={sheet.id} sheet={sheet} onPick={handlePick} />
          ))}
          <li
            aria-hidden
            className="mt-1 border-t border-line px-3 pt-2 pb-1 text-[10px] tracking-wider text-muted uppercase"
          >
            {t("formula.functionsSection")}
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

function SheetSection({
  sheet,
  onPick,
}: {
  sheet: Sheet;
  onPick: (text: string) => void;
}) {
  const t = useT();
  return (
    <>
      <li
        aria-hidden
        className="mt-1 border-t border-line px-3 pt-2 pb-1 text-[10px] tracking-wider text-muted uppercase"
      >
        {t("formula.sheetSectionPrefix")} {sheet.name}
      </li>
      {SHEET_PROPS.map((p) => {
        // Display-form formula (sheet name, not id). ComplexEntryModal
        // rewrites this to the stable id on submit via
        // `formulaToStored` — same path as a hand-typed reference, so
        // a rename of the target sheet stays safe.
        const insert = `sheet(${JSON.stringify(sheet.name)}, ${p.prop})`;
        return (
          <li key={p.prop}>
            <button
              type="button"
              role="option"
              aria-selected={false}
              onClick={() => onPick(insert)}
              className="flex w-full cursor-pointer flex-col items-start gap-0.5 border-0 bg-transparent px-3 py-1.5 text-left hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
            >
              <span className="font-mono text-xs text-fg">
                {sheet.name}.{p.label}
              </span>
              <span className="text-[11px] text-muted">{p.description}</span>
            </button>
          </li>
        );
      })}
    </>
  );
}
