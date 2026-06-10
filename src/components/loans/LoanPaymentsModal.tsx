import { HandCoins, Trash2 } from "lucide-react";

import { resolveLinkedMortgages } from "../../data/loans/balance";
import { listLoanPayments } from "../../data/loans/payments";
import type { Loan, Property, Settings } from "../../data/types";
import { useAmountColumns } from "../../hooks";
import { useLang, useT } from "../../i18n";
import { formatBalance, formatDate } from "../../utils/format";
import { Button } from "../form";
import { Modal } from "../Modal";

// The recorded payments behind a loan's "Paid so far" figure. For a linked
// mortgage loan this lists (and deletes from) the linked mortgage's own
// payments — shared with the Properties sheet, never copied.
//
// `centered`: nothing here opens the soft keyboard.

type Props = {
  open: boolean;
  loan: Loan | null;
  properties: readonly Property[];
  settings: Settings;
  onClose: () => void;
  // The host routes these to `deleteLoanPayment` / `deleteAllLoanPayments`
  // (or the mortgage equivalents when the loan is linked).
  onDeletePayment: (loanId: string, paymentId: string) => void;
  onDeleteAllPayments: (loanId: string) => void;
};

export function LoanPaymentsModal({
  open,
  loan,
  properties,
  settings,
  onClose,
  onDeletePayment,
  onDeleteAllPayments,
}: Props) {
  const t = useT();
  const lang = useLang();
  const { cellClass } = useAmountColumns();

  if (!open || !loan) return null;

  const linked = resolveLinkedMortgages(loan, properties);
  // A linked loan's combined charge lists as ONE row per bank charge (see
  // `listLoanPayments`); deleting the row deletes every leg (the dialog
  // hook expands by source id).
  const payments = listLoanPayments(loan, linked?.mortgages ?? null);

  return (
    <Modal
      open
      centered
      onClose={onClose}
      labelledBy="loan-payments-title"
      size="max-w-sm"
    >
      <Modal.Header
        icon={<HandCoins size={14} aria-hidden focusable={false} />}
        title={t("loansSheet.paymentsTitle")}
        onClose={onClose}
      />
      <Modal.Body>
        <div className="flex flex-col gap-3">
          <p className="m-0 text-sm font-bold text-fg-bright">{loan.name}</p>

          {linked && (
            <p className="m-0 rounded border border-line bg-surface-2 px-3 py-2 text-xs text-muted">
              {t("loansSheet.linkedPaymentsHint")}
            </p>
          )}

          {payments.length === 0 ? (
            <p className="m-0 text-xs text-muted">
              {t("loansSheet.noPaymentsList")}
            </p>
          ) : (
            <ul className="m-0 flex max-h-80 list-none flex-col gap-1 overflow-y-auto p-0">
              {payments.map((payment) => (
                <li
                  key={payment.id}
                  className="flex items-center gap-2 rounded border border-line bg-surface-2 px-2 py-1.5 text-sm"
                >
                  <span className="shrink-0 text-muted">
                    {formatDate(payment.date, settings.dateFormat, lang)}
                  </span>
                  <span
                    className={`flex-1 tabular-nums text-fg-bright ${cellClass}`}
                  >
                    {formatBalance(payment.amount, settings, {
                      neverAbbreviate: true,
                    })}
                  </span>
                  <button
                    type="button"
                    onClick={() => onDeletePayment(loan.id, payment.id)}
                    aria-label={t("loansSheet.deletePaymentAria")}
                    className="shrink-0 cursor-pointer rounded border-0 bg-transparent px-1 text-xs text-muted hover:text-danger"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Modal.Body>
      <Modal.Footer className="justify-between">
        <div>
          {payments.length > 0 && (
            <Button
              variant="danger"
              withIcon
              onClick={() => onDeleteAllPayments(loan.id)}
            >
              <Trash2 size={14} aria-hidden focusable={false} />
              {t("loansSheet.deleteAllPayments")}
            </Button>
          )}
        </div>
        <Button variant="secondary" onClick={onClose}>
          {t("common.done")}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
