import { Scale } from "lucide-react";

import type { ImportedPoint } from "../../data/import/value-import";
import type { Loan, LoanBalancePoint, Settings } from "../../data/types";
import { useAmountColumns } from "../../hooks";
import { useLang, useT } from "../../i18n";
import { formatBalance, formatDate } from "../../utils/format";
import { ValueSnapshotModal } from "../ValueSnapshotModal";

// Record the loan's outstanding balance as of a date — appends one point to
// its `balanceHistory`. The remaining balance at any date anchors on the
// nearest snapshot and walks the recorded payments from there (see
// `loanRemainingBalance`). Lists the recorded history so the user can see
// and delete past snapshots. Mirrors the savings "Update balance" modal.
//
// Loans reject a negative balance (`validateAmount`); the history row aligns
// the amount on the shared amount column. See `ValueSnapshotModal` for the
// shared shell.

type Props = {
  open: boolean;
  loan: Loan | null;
  settings: Settings;
  onClose: () => void;
  onAddBalance: (loanId: string, point: LoanBalancePoint) => void;
  onImportBalances: (loanId: string, points: ImportedPoint[]) => void;
  onDeleteBalance: (loanId: string, pointId: string) => void;
};

export function LoanUpdateBalanceModal({
  open,
  loan,
  settings,
  onClose,
  onAddBalance,
  onImportBalances,
  onDeleteBalance,
}: Props) {
  const t = useT();
  const lang = useLang();
  const { cellClass } = useAmountColumns();

  if (!open || !loan) return null;

  // Newest snapshot first.
  const history = loan.balanceHistory
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  return (
    <ValueSnapshotModal
      open
      resetKey={loan.id}
      icon={<Scale size={14} aria-hidden focusable={false} />}
      title={t("loansSheet.updateBalanceTitle")}
      labelledBy="update-loan-balance-title"
      subject={loan.name}
      settings={settings}
      hint={t("loansSheet.updateBalanceHint")}
      valueLabel={t("loansSheet.balanceLabel")}
      valuePlaceholder={t("loansSheet.balancePlaceholder")}
      asOfLabel={t("loansSheet.asOfLabel")}
      historyHeading={t("loansSheet.balanceHistory")}
      emptyHistoryText={t("loansSheet.noBalanceHistory")}
      importValueLabel={t("loansSheet.balanceLabel")}
      validateAmount={(parsed) => parsed >= 0}
      history={history}
      onClose={onClose}
      onAdd={(point) => onAddBalance(loan.id, point)}
      onImport={(points) => onImportBalances(loan.id, points)}
      renderHistoryRow={(point) => (
        <li
          key={point.id}
          className="flex items-center gap-2 rounded border border-line bg-surface-2 px-2 py-1.5 text-sm"
        >
          <span className="shrink-0 text-muted">
            {formatDate(point.date, settings.dateFormat, lang)}
          </span>
          <span className={`flex-1 tabular-nums text-fg-bright ${cellClass}`}>
            {formatBalance(point.value, settings, {
              neverAbbreviate: true,
            })}
          </span>
          <button
            type="button"
            onClick={() => onDeleteBalance(loan.id, point.id)}
            aria-label={t("loansSheet.deleteBalanceAria")}
            className="shrink-0 cursor-pointer rounded border-0 bg-transparent px-1 text-xs text-muted hover:text-danger"
          >
            ✕
          </button>
        </li>
      )}
    />
  );
}
