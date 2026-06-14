import { Link2, Pencil } from "lucide-react";

import {
  linkedMortgageFigures,
  linkedMortgageRowFigures,
  loanMonthlyPayment,
  loanPaidSoFar,
  loanRemainingBalance,
  resolveLinkedMortgages,
} from "../../data/loans/balance";
import { propertyInitialLoanTotal } from "../../data/finance/amortization";
import { listLoanPayments } from "../../data/loans/payments";
import type { Company, Loan, Property, Settings } from "../../data/types";
import { useAmountColumns } from "../../hooks";
import { useLang, useT } from "../../i18n";
import { todayIso } from "../../utils/date";
import { formatBalance, formatDate, formatRate } from "../../utils/format";
import { Button } from "../form";
import { Modal } from "../Modal";
import { CategoryIconGlyph } from "../icons";
import { LOAN_KIND_GLYPH, LOAN_KIND_LABEL_KEY } from "./loan-kind";

// Read-only loan details — opened by tapping a loan row. Shows the
// loan's terms, the derived figures the table also shows (monthly
// payment, rate, paid so far, remaining) and the recorded payments.
// Management lives elsewhere: the footer's Edit shortcut opens the edit
// modal, and the row's "…" menu keeps the payment / balance flows.
//
// `centered`: nothing here opens the soft keyboard.

type Props = {
  open: boolean;
  loan: Loan | null;
  properties: readonly Property[];
  companies: readonly Company[];
  settings: Settings;
  onClose: () => void;
  onEdit: (loanId: string) => void;
};

export function LoanViewModal({
  open,
  loan,
  properties,
  companies,
  settings,
  onClose,
  onEdit,
}: Props) {
  const t = useT();
  const lang = useLang();
  const { cellClass } = useAmountColumns();

  if (!open || !loan) return null;

  const today = todayIso();
  const linked = resolveLinkedMortgages(loan, properties);
  // A percent amortisation is taken against the property's combined initial
  // loan, resolved from the whole property (not just the linked subset).
  const linkedPercentBasis = linked
    ? propertyInitialLoanTotal(linked.property.mortgages)
    : undefined;
  // Same derivations the loan row shows, so the two never disagree.
  const figures = linked
    ? linkedMortgageFigures(linked.mortgages, today, linkedPercentBasis)
    : {
        monthlyPayment: loanMonthlyPayment(loan, today),
        rate: loan.rate ?? null,
        paidSoFar: loanPaidSoFar(loan),
        remaining: loanRemainingBalance(loan, today),
      };
  const payments = listLoanPayments(loan, linked?.mortgages ?? null);

  // Sub-line: the kind, plus the lending company or person — mirrors the
  // row. A linked loan's "Linked to …" text heads the linked-mortgages
  // list below instead, right above the names it summarises.
  const company =
    loan.companyId !== undefined
      ? companies.find((c) => c.id === loan.companyId)
      : undefined;
  const linkedLabel = linked
    ? linked.mortgages.length === 1
      ? t("loansSheet.linkedTo", { name: linked.property.name })
      : t("loansSheet.linkedToMany", {
          name: linked.property.name,
          n: linked.mortgages.length,
        })
    : undefined;
  const subParts: string[] = [t(LOAN_KIND_LABEL_KEY[loan.kind])];
  if (!linked) {
    if (company) {
      subParts.push(company.name);
    } else if (loan.lenderName !== undefined) {
      subParts.push(loan.lenderName);
    }
  }

  const termRows: Array<{ key: string; label: string; value: string }> = [];
  if (!linked) {
    if (loan.startDate !== undefined) {
      termRows.push({
        key: "startDate",
        label: t("loansSheet.startDate"),
        value: formatDate(loan.startDate, settings.dateFormat, lang),
      });
    }
    if (loan.startSum !== undefined) {
      termRows.push({
        key: "startSum",
        label: t("loansSheet.startSum"),
        value: formatBalance(loan.startSum, settings, {
          neverAbbreviate: true,
        }),
      });
    }
    if (loan.startFee !== undefined) {
      termRows.push({
        key: "startFee",
        label: t("loansSheet.startFee"),
        value: formatBalance(loan.startFee, settings, {
          neverAbbreviate: true,
        }),
      });
    }
  }

  const figureTiles: Array<{ key: string; label: string; value: string }> = [
    {
      key: "monthly",
      label: t("loansSheet.monthly"),
      value:
        figures.monthlyPayment !== null
          ? formatBalance(figures.monthlyPayment, settings)
          : "—",
    },
    {
      key: "rate",
      label: t("loansSheet.rate"),
      value:
        figures.rate !== null ? `${formatRate(figures.rate, settings)}%` : "—",
    },
    {
      key: "paid",
      label: t("loansSheet.paid"),
      value: formatBalance(figures.paidSoFar, settings),
    },
    {
      key: "remaining",
      label: t("loansSheet.remaining"),
      value:
        figures.remaining !== null
          ? formatBalance(figures.remaining, settings)
          : "—",
    },
  ];

  return (
    <Modal
      open
      centered
      onClose={onClose}
      labelledBy="loan-view-title"
      size="max-w-md"
    >
      <Modal.Header
        icon={
          <CategoryIconGlyph
            name={loan.glyph ?? LOAN_KIND_GLYPH[loan.kind]}
            size={14}
          />
        }
        title={loan.name}
        onClose={onClose}
      />
      <Modal.Body>
        <div className="flex flex-col gap-3">
          <p className="m-0 text-xs text-muted">{subParts.join(" · ")}</p>

          {loan.description !== undefined && loan.description !== "" && (
            <p className="m-0 text-sm text-fg">{loan.description}</p>
          )}

          <div className="grid grid-cols-2 gap-2">
            {figureTiles.map((tile) => (
              <div
                key={tile.key}
                className="flex flex-col gap-0.5 rounded border border-line bg-surface-2 px-3 py-2"
              >
                <span className="text-xs text-muted">{tile.label}</span>
                <span
                  className={`font-mono text-sm whitespace-nowrap text-fg-bright tabular-nums ${cellClass}`}
                >
                  {tile.value}
                </span>
              </div>
            ))}
          </div>

          {/* The mortgages behind a linked loan, by name — the table only
              shows a chain glyph, so this is where the link spells itself
              out, headed by the "Linked to …" summary. The terms
              themselves live on the Properties sheet. */}
          {linked && (
            <div className="flex flex-col gap-1 rounded border border-line bg-surface-2 px-3 py-2">
              <span className="text-xs text-muted">{linkedLabel}</span>
              {linked.mortgages.map((mortgage) => {
                const row = linkedMortgageRowFigures(
                  mortgage,
                  today,
                  linkedPercentBasis,
                );
                return (
                  <div
                    key={mortgage.id}
                    className="flex items-center gap-1.5 text-sm text-muted"
                  >
                    <Link2
                      size={12}
                      className="shrink-0"
                      aria-hidden
                      focusable={false}
                    />
                    <span className="flex-1 truncate">{mortgage.name}</span>
                    <span
                      className={`shrink-0 font-mono whitespace-nowrap tabular-nums text-fg ${cellClass}`}
                    >
                      {row.remaining !== null
                        ? formatBalance(row.remaining, settings)
                        : "—"}
                    </span>
                    <span className="shrink-0 font-mono whitespace-nowrap tabular-nums text-muted">
                      {row.rate !== null
                        ? `${formatRate(row.rate, settings)}%`
                        : "—"}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {termRows.length > 0 && (
            <div className="flex flex-col gap-1 rounded border border-line bg-surface-2 px-3 py-2">
              {termRows.map((row) => (
                <div key={row.key} className="flex items-center gap-2 text-sm">
                  <span className="shrink-0 text-muted">{row.label}</span>
                  <span
                    className={`flex-1 font-mono whitespace-nowrap text-fg tabular-nums ${cellClass}`}
                  >
                    {row.value}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <h3 className="m-0 text-xs font-bold tracking-wider uppercase text-muted">
              {t("loansSheet.paymentsTitle")}
            </h3>
            {payments.length === 0 ? (
              <p className="m-0 text-xs text-muted">
                {t("loansSheet.noPaymentsList")}
              </p>
            ) : (
              <ul className="m-0 flex max-h-64 list-none flex-col gap-1 overflow-y-auto p-0">
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
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Modal.Body>
      <Modal.Footer className="justify-between">
        <Button variant="secondary" withIcon onClick={() => onEdit(loan.id)}>
          <Pencil size={14} aria-hidden focusable={false} />
          {t("common.edit")}
        </Button>
        <Button variant="secondary" onClick={onClose}>
          {t("common.close")}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
