import { AlertTriangle, Check } from "lucide-react";

import { useT } from "../../i18n";

type Props = {
  orphanCount: number;
  onTriage?: () => void;
};

// Covered-month footer indicator. When the month's bank history covers
// every day but the user has manual rows the reconciliation matcher
// would flag, render a pressable triage button; otherwise render a
// passive green "all clear" line. Uncovered months render the add-entry
// button instead — that branch stays in `BudgetMonthTable` so this
// component only owns the covered-month JSX.
export function OrphanIndicator({ orphanCount, onTriage }: Props) {
  const t = useT();
  if (orphanCount > 0 && onTriage) {
    return (
      <button
        type="button"
        onClick={onTriage}
        className="flex w-full cursor-pointer select-none items-center justify-center gap-2 py-3 text-flag hover:bg-flag/10 focus-visible:outline focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-flag"
      >
        <AlertTriangle size={22} aria-hidden focusable={false} />
        <span>
          {orphanCount === 1
            ? t("budget.triageInCoveredMonthOne")
            : t("budget.triageInCoveredMonthOther", { n: orphanCount })}
        </span>
      </button>
    );
  }
  return (
    <div className="flex w-full select-none items-center justify-center gap-2 py-3 text-success">
      <Check size={22} aria-hidden focusable={false} />
      <span>{t("budget.historyCoversMonth")}</span>
    </div>
  );
}
