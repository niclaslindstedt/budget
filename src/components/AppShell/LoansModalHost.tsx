import type { Settings, UserData } from "../../data/types";
import { useT } from "../../i18n";
import { ConfirmDialog } from "../ConfirmDialog";
import { LoanImportPaymentsModal } from "../loans/LoanImportPaymentsModal";
import { LoanModal } from "../loans/LoanModal";
import { LoanPaymentsModal } from "../loans/LoanPaymentsModal";
import { LoanUpdateBalanceModal } from "../loans/LoanUpdateBalanceModal";
import { LoanViewModal } from "../loans/LoanViewModal";
import type { useLoanDialog } from "./hooks/useLoanDialog";

type Props = {
  data: UserData;
  effectiveSettings: Settings;
  loanDialog: ReturnType<typeof useLoanDialog>;
};

// Renders the Loans sheet's CRUD + payment modals, fed the state the
// `useLoanDialog` hook owns. Mirrors `SavingsModalHost`.
export function LoansModalHost({ data, effectiveSettings, loanDialog }: Props) {
  const t = useT();
  const {
    loanModal,
    setLoanModal,
    linkedMortgageIds,
    deleteLoanPrompt,
    setDeleteLoanPrompt,
    deleteLoanActions,
    onSaveLoan,
    onDeleteLoanFromModal,
    onCreateCompany,
    onOpenEditLoan,
    viewLoan,
    setViewForId,
    updateBalanceLoan,
    setUpdateBalanceForId,
    onAddLoanBalance,
    onDeleteLoanBalance,
    paymentsLoan,
    setPaymentsForId,
    onDeleteLoanPayment,
    onDeleteAllLoanPayments,
    importLoan,
    setImportForId,
    onImportPayments,
  } = loanDialog;

  return (
    <>
      <LoanModal
        open={loanModal !== null}
        loan={loanModal?.loan ?? null}
        settings={effectiveSettings}
        properties={data.properties}
        companies={data.companies}
        linkedMortgageIds={linkedMortgageIds}
        onClose={() => setLoanModal(null)}
        onSave={onSaveLoan}
        onDelete={onDeleteLoanFromModal}
        onCreateCompany={onCreateCompany}
      />
      <LoanViewModal
        open={viewLoan !== null}
        loan={viewLoan}
        properties={data.properties}
        companies={data.companies}
        settings={effectiveSettings}
        onClose={() => setViewForId(null)}
        onEdit={(loanId) => {
          setViewForId(null);
          onOpenEditLoan(loanId);
        }}
      />
      <LoanUpdateBalanceModal
        open={updateBalanceLoan !== null}
        loan={updateBalanceLoan}
        settings={effectiveSettings}
        onClose={() => setUpdateBalanceForId(null)}
        onAddBalance={onAddLoanBalance}
        onDeleteBalance={onDeleteLoanBalance}
      />
      <LoanPaymentsModal
        open={paymentsLoan !== null}
        loan={paymentsLoan}
        properties={data.properties}
        settings={effectiveSettings}
        onClose={() => setPaymentsForId(null)}
        onDeletePayment={onDeleteLoanPayment}
        onDeleteAllPayments={onDeleteAllLoanPayments}
      />
      <LoanImportPaymentsModal
        open={importLoan !== null}
        loan={importLoan}
        data={data}
        settings={effectiveSettings}
        onClose={() => setImportForId(null)}
        onImport={onImportPayments}
      />
      <ConfirmDialog
        open={deleteLoanPrompt !== null}
        title={t("loansSheet.deleteTitle")}
        description={
          deleteLoanPrompt
            ? t("loansSheet.deleteConfirm", { name: deleteLoanPrompt.name })
            : null
        }
        actions={deleteLoanActions}
        onCancel={() => setDeleteLoanPrompt(null)}
      />
    </>
  );
}
