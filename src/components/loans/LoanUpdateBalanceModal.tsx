import { useRef, useState } from "react";
import { Scale } from "lucide-react";

import type { ImportedPoint } from "../../data/import/value-import";
import { newId } from "../../data/sheet";
import type { Loan, LoanBalancePoint, Settings } from "../../data/types";
import { useAmountColumns, useResetOnOpen } from "../../hooks";
import { useLang, useT } from "../../i18n";
import { todayIso } from "../../utils/date";
import { formatBalance, formatDate, parseAmount } from "../../utils/format";
import { BatchValueImportModal } from "../BatchValueImportModal";
import { Button, ClearableInput, DATE_INPUT_CLASS } from "../form";
import { Modal } from "../Modal";

// Record the loan's outstanding balance as of a date — appends one point to
// its `balanceHistory`. The remaining balance at any date anchors on the
// nearest snapshot and walks the recorded payments from there (see
// `loanRemainingBalance`). Lists the recorded history so the user can see
// and delete past snapshots. Mirrors the savings "Update balance" modal.
//
// The inline "Add" button (and Enter in either field) appends a point without
// closing the modal — every add persists immediately, so the user can record a
// run of snapshots back-to-back. The footer just dismisses.
//
// Not `centered`: the balance field opens the soft keyboard.

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
  const [value, setValue] = useState("");
  const [date, setDate] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const valueInputRef = useRef<HTMLInputElement | null>(null);

  useResetOnOpen(open, loan?.id, () => {
    setValue("");
    setDate(todayIso());
  });

  if (!open || !loan) return null;

  const parsed = parseAmount(value);
  const canSubmit = parsed !== null && parsed >= 0 && date !== "";

  // Append the snapshot but keep the modal open so the user can record a run
  // of values. Clear the amount (the date stays) and refocus for the next.
  function handleAdd() {
    if (parsed === null || parsed < 0 || date === "" || !loan) return;
    onAddBalance(loan.id, { id: newId(), date, value: parsed });
    setValue("");
    valueInputRef.current?.focus();
  }

  // Newest snapshot first.
  const history = loan.balanceHistory
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  const amountInputClass =
    "field-input w-full min-w-0 rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-fg";

  return (
    <>
      <Modal
        open
        onClose={onClose}
        labelledBy="update-loan-balance-title"
        size="max-w-sm"
      >
        <Modal.Header
          icon={<Scale size={14} aria-hidden focusable={false} />}
          title={t("loansSheet.updateBalanceTitle")}
          onClose={onClose}
        />
        <Modal.Body>
          <div className="flex flex-col gap-3">
            <p className="m-0 text-sm font-bold text-fg-bright">{loan.name}</p>

            <p className="m-0 text-xs text-muted">
              {t("loansSheet.updateBalanceHint")}
            </p>

            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                handleAdd();
              }}
            >
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted">
                  {t("loansSheet.balanceLabel")}
                </span>
                <ClearableInput
                  ref={valueInputRef}
                  value={value}
                  onValueChange={setValue}
                  inputMode="decimal"
                  placeholder={t("loansSheet.balancePlaceholder")}
                  className={amountInputClass}
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted">
                  {t("loansSheet.asOfLabel")}
                </span>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className={DATE_INPUT_CLASS}
                />
              </label>

              <Button type="submit" variant="primary" disabled={!canSubmit}>
                {t("common.add")}
              </Button>
            </form>

            <Button
              type="button"
              variant="secondary"
              onClick={() => setImportOpen(true)}
            >
              {t("valueImport.trigger")}
            </Button>

            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-bold tracking-wider uppercase text-muted">
                {t("loansSheet.balanceHistory")}
              </span>
              {history.length === 0 ? (
                <p className="m-0 text-xs text-muted">
                  {t("loansSheet.noBalanceHistory")}
                </p>
              ) : (
                <ul className="m-0 flex list-none flex-col gap-1 p-0">
                  {history.map((point) => (
                    <li
                      key={point.id}
                      className="flex items-center gap-2 rounded border border-line bg-surface-2 px-2 py-1.5 text-sm"
                    >
                      <span className="shrink-0 text-muted">
                        {formatDate(point.date, settings.dateFormat, lang)}
                      </span>
                      <span
                        className={`flex-1 tabular-nums text-fg-bright ${cellClass}`}
                      >
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
                  ))}
                </ul>
              )}
            </div>
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={onClose}>
            {t("common.done")}
          </Button>
        </Modal.Footer>
      </Modal>
      <BatchValueImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        subject={loan.name}
        valueLabel={t("loansSheet.balanceLabel")}
        settings={settings}
        onImport={(points) => onImportBalances(loan.id, points)}
      />
    </>
  );
}
