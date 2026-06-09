import { useCallback, useMemo, useState } from "react";

import type { ConfirmAction } from "../../ConfirmDialog";
import type { Action } from "../../../data/reducer";
import { resolveLinkedMortgage } from "../../../data/loans/balance";
import type { LoanPaymentCandidate } from "../../../data/loans/candidates";
import { learnPaymentPatterns } from "../../../data/loans/patterns";
import { newId } from "../../../data/sheet";
import type {
  Company,
  Loan,
  LoanPayment,
  MortgagePayment,
  UserData,
} from "../../../data/types";
import { useT } from "../../../i18n";
import { parseAmount } from "../../../utils/format";
import type { useToast } from "../../../hooks";
import type { LoanDraft } from "../../loans/LoanModal";

type Params = {
  data: UserData;
  dispatch: (action: Action) => void;
  toast: ReturnType<typeof useToast>;
};

type LoanModalState = { loan: Loan | null };
type DeleteLoanPrompt = { loanId: string; name: string };

type Result = {
  // LoanModal — null = closed; { loan: null } = create; otherwise edit.
  loanModal: LoanModalState | null;
  setLoanModal: (next: LoanModalState | null) => void;
  // Mortgage ids already linked by another loan — the modal's link picker
  // hides them so two loans can't shadow one mortgage.
  linkedMortgageIds: ReadonlySet<string>;
  // Delete confirmation, shared by the row trash button and the edit
  // modal's Delete button.
  deleteLoanPrompt: DeleteLoanPrompt | null;
  setDeleteLoanPrompt: (next: DeleteLoanPrompt | null) => void;
  deleteLoanActions: ConfirmAction[];

  onOpenCreateLoan: () => void;
  onOpenEditLoan: (loanId: string) => void;
  onSaveLoan: (draft: LoanDraft) => void;
  onDeleteLoanFromModal: () => void;
  onRequestDeleteLoan: (loanId: string, name: string) => void;
  onCreateCompany: (draft: Omit<Company, "id">) => Company;

  // Payments list modal.
  paymentsLoan: Loan | null;
  setPaymentsForId: (next: string | null) => void;
  onOpenPayments: (loanId: string) => void;
  onDeleteLoanPayment: (loanId: string, paymentId: string) => void;
  onDeleteAllLoanPayments: (loanId: string) => void;

  // Import-payments modal.
  importLoan: Loan | null;
  setImportForId: (next: string | null) => void;
  onOpenImportPayments: (loanId: string) => void;
  onImportPayments: (loanId: string, selected: LoanPaymentCandidate[]) => void;
};

// Workspace-level loan CRUD + payment import. Mirrors `useSavingDialog`.
// The payment flows fork on the mortgage link: a linked loan's payments
// live on the linked `Mortgage` (shared with the Properties sheet), so
// import / delete route to the mortgage actions instead of the loan's own.
export function useLoanDialog({ data, dispatch, toast }: Params): Result {
  const t = useT();
  const [loanModal, setLoanModal] = useState<LoanModalState | null>(null);
  const [deleteLoanPrompt, setDeleteLoanPrompt] =
    useState<DeleteLoanPrompt | null>(null);
  const [paymentsForId, setPaymentsForId] = useState<string | null>(null);
  const [importForId, setImportForId] = useState<string | null>(null);

  const linkedMortgageIds: ReadonlySet<string> = useMemo(() => {
    const ids = new Set<string>();
    for (const loan of data.loans) {
      if (loan.mortgageId !== undefined) ids.add(loan.mortgageId);
    }
    return ids;
  }, [data.loans]);

  const onOpenCreateLoan = useCallback(() => {
    setLoanModal({ loan: null });
  }, []);
  const onOpenEditLoan = useCallback(
    (loanId: string) => {
      const target = data.loans.find((l) => l.id === loanId);
      if (target) setLoanModal({ loan: target });
    },
    [data.loans],
  );

  const onSaveLoan = useCallback(
    (draft: LoanDraft) => {
      const startSum = parseAmount(draft.startSum);
      const monthlyPayment = parseAmount(draft.monthlyPayment);
      const rate = parseAmount(draft.rate);
      const startFee = parseAmount(draft.startFee);
      // Sanitised term values: parseAmount tolerates signs, so clamp the
      // nonsensical negatives away rather than persisting them.
      const clean = (n: number | null): number | undefined =>
        n !== null && n >= 0 ? n : undefined;
      if (loanModal?.loan) {
        // Edit: a full-field patch — explicit `undefined` deletes a key,
        // so clearing the rate input really drops `rate` from the record.
        dispatch({
          type: "updateLoan",
          loanId: loanModal.loan.id,
          patch: {
            name: draft.name,
            kind: draft.kind,
            description: draft.description || undefined,
            glyph: draft.glyph ?? undefined,
            color: draft.color ?? undefined,
            startDate: draft.startDate || undefined,
            startSum: clean(startSum),
            monthlyPayment: clean(monthlyPayment),
            rate: clean(rate),
            startFee: clean(startFee),
            lenderName: draft.lenderName || undefined,
            companyId: draft.companyId ?? undefined,
            propertyId: draft.link?.propertyId,
            mortgageId: draft.link?.mortgageId,
          },
        });
      } else {
        const loan: Loan = {
          id: newId(),
          name: draft.name,
          kind: draft.kind,
          payments: [],
          ...(draft.description && { description: draft.description }),
          ...(draft.glyph && { glyph: draft.glyph }),
          ...(draft.color && { color: draft.color }),
          ...(draft.startDate && { startDate: draft.startDate }),
          ...(clean(startSum) !== undefined && { startSum: clean(startSum) }),
          ...(clean(monthlyPayment) !== undefined && {
            monthlyPayment: clean(monthlyPayment),
          }),
          ...(clean(rate) !== undefined && { rate: clean(rate) }),
          ...(clean(startFee) !== undefined && { startFee: clean(startFee) }),
          ...(draft.lenderName && { lenderName: draft.lenderName }),
          ...(draft.companyId && { companyId: draft.companyId }),
          ...(draft.link && {
            propertyId: draft.link.propertyId,
            mortgageId: draft.link.mortgageId,
          }),
        };
        dispatch({ type: "addLoan", loan });
      }
      setLoanModal(null);
    },
    [dispatch, loanModal],
  );

  const onDeleteLoanFromModal = useCallback(() => {
    if (!loanModal?.loan) return;
    setDeleteLoanPrompt({
      loanId: loanModal.loan.id,
      name: loanModal.loan.name,
    });
  }, [loanModal]);

  const onRequestDeleteLoan = useCallback((loanId: string, name: string) => {
    setDeleteLoanPrompt({ loanId, name });
  }, []);

  const deleteLoanActions: ConfirmAction[] = useMemo(() => {
    if (!deleteLoanPrompt) return [];
    const target = deleteLoanPrompt;
    return [
      {
        label: t("common.delete"),
        tone: "danger",
        onSelect: () => {
          dispatch({ type: "deleteLoan", loanId: target.loanId });
          setDeleteLoanPrompt(null);
          setLoanModal(null);
          toast.push({
            kind: "success",
            message: t("loansSheet.deleteAria", { name: target.name }),
          });
        },
      },
    ];
  }, [deleteLoanPrompt, dispatch, t, toast]);

  // Inline company creation from the modal's lender picker — mirrors
  // `handleCreateCompany` on the Properties page.
  const onCreateCompany = useCallback(
    (draft: Omit<Company, "id">): Company => {
      const company: Company = { id: newId(), ...draft };
      dispatch({ type: "addCompany", company });
      return company;
    },
    [dispatch],
  );

  const paymentsLoan = useMemo(
    () =>
      paymentsForId
        ? (data.loans.find((l) => l.id === paymentsForId) ?? null)
        : null,
    [paymentsForId, data.loans],
  );
  const onOpenPayments = useCallback((loanId: string) => {
    setPaymentsForId(loanId);
  }, []);

  const onDeleteLoanPayment = useCallback(
    (loanId: string, paymentId: string) => {
      const loan = data.loans.find((l) => l.id === loanId);
      const linked = loan ? resolveLinkedMortgage(loan, data.properties) : null;
      if (loan && linked) {
        dispatch({
          type: "deleteMortgagePayment",
          propertyId: linked.property.id,
          mortgageId: linked.mortgage.id,
          paymentId,
        });
      } else {
        dispatch({ type: "deleteLoanPayment", loanId, paymentId });
      }
    },
    [data.loans, data.properties, dispatch],
  );
  const onDeleteAllLoanPayments = useCallback(
    (loanId: string) => {
      const loan = data.loans.find((l) => l.id === loanId);
      const linked = loan ? resolveLinkedMortgage(loan, data.properties) : null;
      if (loan && linked) {
        // No per-mortgage clear action exists; delete the linked
        // mortgage's payments one by one in a burst (each is undoable).
        for (const payment of linked.mortgage.payments) {
          dispatch({
            type: "deleteMortgagePayment",
            propertyId: linked.property.id,
            mortgageId: linked.mortgage.id,
            paymentId: payment.id,
          });
        }
      } else {
        dispatch({ type: "deleteAllLoanPayments", loanId });
      }
    },
    [data.loans, data.properties, dispatch],
  );

  const importLoan = useMemo(
    () =>
      importForId
        ? (data.loans.find((l) => l.id === importForId) ?? null)
        : null,
    [importForId, data.loans],
  );
  const onOpenImportPayments = useCallback((loanId: string) => {
    setImportForId(loanId);
  }, []);

  const onImportPayments = useCallback(
    (loanId: string, selected: LoanPaymentCandidate[]) => {
      const loan = data.loans.find((l) => l.id === loanId);
      if (!loan || selected.length === 0) return;
      const linked = resolveLinkedMortgage(loan, data.properties);
      if (linked) {
        // Linked mortgage loan: the payments belong to the mortgage —
        // recorded there, shared with the Properties sheet. Patterns are
        // not learned (the mortgage discovery flow owns that surface).
        const payments: MortgagePayment[] = selected.map(({ entry }) => ({
          id: newId(),
          date: entry.date,
          amount: Math.abs(entry.amount),
          sourceHistoryId: entry.id,
        }));
        dispatch({
          type: "addMortgagePayments",
          propertyId: linked.property.id,
          mortgageId: linked.mortgage.id,
          payments,
        });
        return;
      }
      const payments: LoanPayment[] = selected.map(({ entry }) => ({
        id: newId(),
        date: entry.date,
        amount: Math.abs(entry.amount),
        sourceHistoryId: entry.id,
      }));
      // Learn the raw bank descriptions so the next statement import
      // attaches matching charges without the modal.
      const patterns = learnPaymentPatterns(
        loan.paymentPatterns,
        selected.map(({ entry }) => entry.description),
      );
      dispatch({ type: "addLoanPayments", loanId, payments, patterns });
    },
    [data.loans, data.properties, dispatch],
  );

  return {
    loanModal,
    setLoanModal,
    linkedMortgageIds,
    deleteLoanPrompt,
    setDeleteLoanPrompt,
    deleteLoanActions,
    onOpenCreateLoan,
    onOpenEditLoan,
    onSaveLoan,
    onDeleteLoanFromModal,
    onRequestDeleteLoan,
    onCreateCompany,
    paymentsLoan,
    setPaymentsForId,
    onOpenPayments,
    onDeleteLoanPayment,
    onDeleteAllLoanPayments,
    importLoan,
    setImportForId,
    onOpenImportPayments,
    onImportPayments,
  };
}
