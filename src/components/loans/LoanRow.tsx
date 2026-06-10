import { memo } from "react";
import { Link2, Pencil, Trash2 } from "lucide-react";

import {
  linkedMortgageFigures,
  loanMonthlyPayment,
  loanPaidSoFar,
  loanRemainingBalance,
  resolveLinkedMortgages,
} from "../../data/loans/balance";
import type { Company, Loan, Property, Settings } from "../../data/types";
import { useAmountColumns } from "../../hooks";
import { useT } from "../../i18n";
import { todayIso } from "../../utils/date";
import { formatBalance, formatRate } from "../../utils/format";
import { tintBorder, tintFill } from "../../utils/tint";
import { CategoryIconGlyph } from "../icons";
import { useRowSwipeAndClaim } from "../useRowSwipeAndClaim";
import { LoanActionsMenu } from "./LoanActionsMenu";
import { LOAN_KIND_GLYPH, LOAN_KIND_LABEL_KEY } from "./loan-kind";

type Props = {
  loan: Loan;
  settings: Settings;
  properties: readonly Property[];
  companies: readonly Company[];
  onEditLoan: (loanId: string) => void;
  onDeleteLoan: (loanId: string, name: string) => void;
  onUpdateBalance: (loanId: string) => void;
  onImportPayments: (loanId: string) => void;
  onViewPayments: (loanId: string) => void;
};

function LoanRowImpl({
  loan,
  settings,
  properties,
  companies,
  onEditLoan,
  onDeleteLoan,
  onUpdateBalance,
  onImportPayments,
  onViewPayments,
}: Props) {
  const t = useT();
  const { cellClass } = useAmountColumns();
  // A swiped row claims the active-row slot (folded into the hook) so a tap
  // elsewhere dismisses it before firing the underlying control.
  const { swiped, setSwiped, touchHandlers } = useRowSwipeAndClaim(loan.id);

  const today = todayIso();
  const linked = resolveLinkedMortgages(loan, properties);
  const figures = linked
    ? linkedMortgageFigures(linked.mortgages, today)
    : {
        monthlyPayment: loanMonthlyPayment(loan, today),
        rate: loan.rate ?? null,
        paidSoFar: loanPaidSoFar(loan),
        remaining: loanRemainingBalance(loan, today),
      };
  const hasPayments = linked
    ? linked.mortgages.some((m) => m.payments.length > 0)
    : loan.payments.length > 0;

  // Sub-line: the kind, plus where the money came from — the linked
  // property, the lending company, or the person.
  const kindLabel = t(LOAN_KIND_LABEL_KEY[loan.kind]);
  const company =
    loan.companyId !== undefined
      ? companies.find((c) => c.id === loan.companyId)
      : undefined;
  const subParts: string[] = [kindLabel];
  if (linked) {
    subParts.push(
      linked.mortgages.length === 1
        ? t("loansSheet.linkedTo", { name: linked.property.name })
        : t("loansSheet.linkedToMany", {
            name: linked.property.name,
            n: linked.mortgages.length,
          }),
    );
  } else if (company) {
    subParts.push(company.name);
  } else if (loan.lenderName !== undefined) {
    subParts.push(loan.lenderName);
  }

  const color = loan.color;
  const rowClass = [
    swiped ? "is-swiped" : "",
    "border-b border-line last:border-b-0 hover:bg-surface-2",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <tr
      className={rowClass}
      data-row-id={loan.id}
      data-swipe-handled
      onClick={() => {
        if (swiped) setSwiped(false);
      }}
      {...touchHandlers}
    >
      <td className="w-10 px-2.5 py-2 align-middle">
        <span
          aria-hidden
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line text-muted"
          style={
            color
              ? {
                  color,
                  backgroundColor: tintFill(color),
                  borderColor: tintBorder(color),
                }
              : undefined
          }
        >
          <CategoryIconGlyph
            name={loan.glyph ?? LOAN_KIND_GLYPH[loan.kind]}
            size={14}
          />
        </span>
      </td>
      <td className="px-2.5 py-2 align-middle">
        <span className="flex items-center gap-1.5 font-mono font-bold text-fg-bright">
          <span className="truncate">{loan.name}</span>
          {linked && (
            <Link2
              size={12}
              className="shrink-0 text-muted"
              aria-hidden
              focusable={false}
            />
          )}
        </span>
        <span className="block truncate text-xs text-muted">
          {subParts.join(" · ")}
        </span>
      </td>
      <td className="loans-secondary-cell hidden px-2.5 py-2 text-right align-middle font-mono text-xs whitespace-nowrap text-muted tabular-nums md:table-cell">
        {figures.monthlyPayment !== null
          ? formatBalance(figures.monthlyPayment, settings)
          : "—"}
      </td>
      <td className="loans-secondary-cell hidden px-2.5 py-2 text-right align-middle font-mono text-xs whitespace-nowrap text-muted tabular-nums md:table-cell">
        {figures.rate !== null ? formatRate(figures.rate, settings) : "—"}
      </td>
      <td className="loans-secondary-cell hidden px-2.5 py-2 text-right align-middle font-mono text-xs whitespace-nowrap text-muted tabular-nums md:table-cell">
        {formatBalance(figures.paidSoFar, settings)}
      </td>
      <td
        className={`px-2.5 py-2 align-middle font-mono whitespace-nowrap text-fg tabular-nums ${cellClass}`}
      >
        <span>
          {figures.remaining !== null
            ? formatBalance(figures.remaining, settings)
            : "—"}
        </span>
      </td>
      <td className="swipe-action-cell loans-action-cell w-32 p-0 align-middle">
        <div className="flex h-full w-full items-stretch justify-end">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setSwiped(false);
              onEditLoan(loan.id);
            }}
            aria-label={t("loansSheet.editAria", { name: loan.name })}
            title={t("loansSheet.editTitle")}
            className="action-btn action-btn-pen inline-flex h-full flex-1 cursor-pointer items-center justify-center border-0 bg-transparent p-2 text-white md:text-muted md:hover:bg-surface-2 md:hover:text-accent"
          >
            <Pencil size={16} aria-hidden focusable={false} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setSwiped(false);
              onDeleteLoan(loan.id, loan.name);
            }}
            aria-label={t("loansSheet.deleteAria", { name: loan.name })}
            title={t("loansSheet.deleteTitle")}
            className="action-btn action-btn-delete inline-flex h-full flex-1 cursor-pointer items-center justify-center border-0 bg-transparent p-2 text-white md:text-muted md:hover:bg-surface-2 md:hover:text-danger"
          >
            <Trash2 size={16} aria-hidden focusable={false} />
          </button>
          <LoanActionsMenu
            loan={loan}
            isLinked={linked !== null}
            hasPayments={hasPayments}
            onUpdateBalance={onUpdateBalance}
            onImportPayments={onImportPayments}
            onViewPayments={onViewPayments}
            onAction={() => setSwiped(false)}
          />
        </div>
      </td>
    </tr>
  );
}

// Memoised so a swipe on one row doesn't re-render every sibling — matches
// SavingsRow / AccountRow.
export const LoanRow = memo(LoanRowImpl);
