import { useCallback, useMemo, useState } from "react";

import type { ConfirmAction } from "../../ConfirmDialog";
import type { ImportedPoint } from "../../../data/import/value-import";
import type { Action, LoanImportEntryOverride } from "../../../data/reducer";
import { resolveLinkedMortgages } from "../../../data/loans/balance";
import { splitPaymentAcrossMortgages } from "../../../data/finance/payment";
import type { LoanPaymentCandidate } from "../../../data/loans/candidates";
import { learnPaymentPatterns } from "../../../data/loans/patterns";
import { LOAN_PRESET_TYPE_BY_KIND } from "../../../data/loans/presets";
import { newId } from "../../../data/sheet";
import type {
  Company,
  Loan,
  LoanBalancePoint,
  LoanPayment,
  MortgagePayment,
  UserData,
} from "../../../data/types";
import { useT } from "../../../i18n";
import { parseAmount } from "../../../utils/format";
import type { useToast } from "../../../hooks";
import type { LoanImportOptions } from "../../loans/LoanImportPaymentsModal";
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

  // Read-only loan view — opened by tapping a loan row.
  viewLoan: Loan | null;
  setViewForId: (next: string | null) => void;
  onOpenViewLoan: (loanId: string) => void;

  // Update-balance modal — appends / deletes dated balance snapshots.
  updateBalanceLoan: Loan | null;
  setUpdateBalanceForId: (next: string | null) => void;
  onOpenUpdateBalance: (loanId: string) => void;
  onAddLoanBalance: (loanId: string, point: LoanBalancePoint) => void;
  onImportLoanBalances: (loanId: string, points: ImportedPoint[]) => void;
  onDeleteLoanBalance: (loanId: string, pointId: string) => void;

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
  onImportPayments: (
    loanId: string,
    selected: LoanPaymentCandidate[],
    options: LoanImportOptions,
  ) => void;
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
  const [viewForId, setViewForId] = useState<string | null>(null);
  const [paymentsForId, setPaymentsForId] = useState<string | null>(null);
  const [importForId, setImportForId] = useState<string | null>(null);
  const [updateBalanceForId, setUpdateBalanceForId] = useState<string | null>(
    null,
  );

  const linkedMortgageIds: ReadonlySet<string> = useMemo(() => {
    const ids = new Set<string>();
    for (const loan of data.loans) {
      for (const mortgageId of loan.mortgageIds ?? []) ids.add(mortgageId);
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
            rate: clean(rate),
            startFee: clean(startFee),
            lenderName: draft.lenderName || undefined,
            companyId: draft.companyId ?? undefined,
            propertyId: draft.link?.propertyId,
            mortgageIds: draft.link?.mortgageIds,
          },
        });
      } else {
        const loan: Loan = {
          id: newId(),
          name: draft.name,
          kind: draft.kind,
          payments: [],
          balanceHistory: [],
          ...(draft.description && { description: draft.description }),
          ...(draft.glyph && { glyph: draft.glyph }),
          ...(draft.color && { color: draft.color }),
          ...(draft.startDate && { startDate: draft.startDate }),
          ...(clean(startSum) !== undefined && { startSum: clean(startSum) }),
          ...(clean(rate) !== undefined && { rate: clean(rate) }),
          ...(clean(startFee) !== undefined && { startFee: clean(startFee) }),
          ...(draft.lenderName && { lenderName: draft.lenderName }),
          ...(draft.companyId && { companyId: draft.companyId }),
          ...(draft.link && {
            propertyId: draft.link.propertyId,
            mortgageIds: draft.link.mortgageIds,
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

  const viewLoan = useMemo(
    () =>
      viewForId ? (data.loans.find((l) => l.id === viewForId) ?? null) : null,
    [viewForId, data.loans],
  );
  const onOpenViewLoan = useCallback((loanId: string) => {
    setViewForId(loanId);
  }, []);

  const updateBalanceLoan = useMemo(
    () =>
      updateBalanceForId
        ? (data.loans.find((l) => l.id === updateBalanceForId) ?? null)
        : null,
    [updateBalanceForId, data.loans],
  );
  const onOpenUpdateBalance = useCallback((loanId: string) => {
    setUpdateBalanceForId(loanId);
  }, []);
  const onAddLoanBalance = useCallback(
    (loanId: string, point: LoanBalancePoint) => {
      dispatch({ type: "addLoanBalance", loanId, point });
    },
    [dispatch],
  );
  const onImportLoanBalances = useCallback(
    (loanId: string, points: ImportedPoint[]) => {
      dispatch({ type: "importLoanBalances", loanId, points });
    },
    [dispatch],
  );
  const onDeleteLoanBalance = useCallback(
    (loanId: string, pointId: string) => {
      dispatch({ type: "deleteLoanBalance", loanId, pointId });
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
      const linked = loan
        ? resolveLinkedMortgages(loan, data.properties)
        : null;
      if (loan && linked) {
        // The payments modal lists a combined charge as ONE row even
        // though it's recorded as one split per linked mortgage, all
        // sharing the charge's `sourceHistoryId`. Deleting the row
        // deletes every leg of that charge; a hand-entered payment (no
        // source entry) deletes just itself.
        let sourceId: string | undefined;
        for (const mortgage of linked.mortgages) {
          const hit = mortgage.payments.find((p) => p.id === paymentId);
          if (hit) {
            sourceId = hit.sourceHistoryId;
            break;
          }
        }
        for (const mortgage of linked.mortgages) {
          for (const payment of mortgage.payments) {
            const isLeg =
              payment.id === paymentId ||
              (sourceId !== undefined && payment.sourceHistoryId === sourceId);
            if (!isLeg) continue;
            dispatch({
              type: "deleteMortgagePayment",
              propertyId: linked.property.id,
              mortgageId: mortgage.id,
              paymentId: payment.id,
            });
          }
        }
      } else {
        dispatch({ type: "deleteLoanPayment", loanId, paymentId });
      }
    },
    [data.loans, data.properties, dispatch],
  );
  const onDeleteAllLoanPayments = useCallback(
    (loanId: string) => {
      const loan = data.loans.find((l) => l.id === loanId);
      const linked = loan
        ? resolveLinkedMortgages(loan, data.properties)
        : null;
      if (loan && linked) {
        // No per-mortgage clear action exists; delete the linked
        // mortgages' payments one by one in a burst (each is undoable).
        for (const mortgage of linked.mortgages) {
          for (const payment of mortgage.payments) {
            dispatch({
              type: "deleteMortgagePayment",
              propertyId: linked.property.id,
              mortgageId: mortgage.id,
              paymentId: payment.id,
            });
          }
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
    (
      loanId: string,
      selected: LoanPaymentCandidate[],
      options: LoanImportOptions,
    ) => {
      const loan = data.loans.find((l) => l.id === loanId);
      if (!loan || selected.length === 0) return;
      const linked = resolveLinkedMortgages(loan, data.properties);
      if (linked) {
        // Linked mortgage loan: the payments belong to the mortgages —
        // recorded there, shared with the Properties sheet. A combined
        // bank charge is split across the linked mortgages with the same
        // amortisation-first logic the Find-mortgage-payments walk uses,
        // falling back to the first mortgage when no loan resolves any
        // terms. Patterns are not learned (the mortgage discovery flow
        // owns that surface). One action — one undo entry.
        const byMortgage: Record<string, MortgagePayment[]> = {};
        for (const { entry } of selected) {
          const amount = Math.abs(entry.amount);
          const split = splitPaymentAcrossMortgages(
            linked.mortgages,
            amount,
            entry.date,
          );
          const shares: Array<[string, number]> =
            split.size > 0
              ? [...split.entries()]
              : [[linked.mortgages[0].id, amount]];
          for (const [mortgageId, share] of shares) {
            (byMortgage[mortgageId] ??= []).push({
              id: newId(),
              date: entry.date,
              amount: share,
              sourceHistoryId: entry.id,
            });
          }
        }
        dispatch({
          type: "addMortgagePaymentsForProperty",
          propertyId: linked.property.id,
          paymentsByMortgageId: byMortgage,
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
      // The modal's "set type" / "rename" checkboxes: stamp the loan
      // kind's preset type and / or the loan's name back onto the
      // imported entries as per-entry overrides — metadata flows both
      // ways. The modal forces both off for a linked loan, so this
      // branch never stamps on the Properties-owned path above.
      const stampTypeId = options.applyType
        ? LOAN_PRESET_TYPE_BY_KIND[loan.kind]
        : undefined;
      const entryOverrides: LoanImportEntryOverride[] | undefined =
        options.applyType || options.applyName
          ? selected.map(({ accountId, entry }) => ({
              accountId,
              entryId: entry.id,
              ...(stampTypeId !== undefined && { userTypeId: stampTypeId }),
              ...(options.applyName && { userDescription: loan.name }),
            }))
          : undefined;
      dispatch({
        type: "addLoanPayments",
        loanId,
        payments,
        patterns,
        ...(entryOverrides !== undefined && { entryOverrides }),
      });
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
    viewLoan,
    setViewForId,
    onOpenViewLoan,
    updateBalanceLoan,
    setUpdateBalanceForId,
    onOpenUpdateBalance,
    onAddLoanBalance,
    onImportLoanBalances,
    onDeleteLoanBalance,
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
