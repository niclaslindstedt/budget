import type { Settings } from "../../data/types";
import { useT } from "../../i18n";
import { ConfirmDialog } from "../ConfirmDialog";
import { SavingsModal } from "../savings/SavingsModal";
import { UpdateSavingBalanceModal } from "../savings/UpdateSavingBalanceModal";
import type { useSavingDialog } from "./hooks/useSavingDialog";

type Props = {
  effectiveSettings: Settings;
  savingDialog: ReturnType<typeof useSavingDialog>;
};

// Renders the Savings sheet's CRUD + balance modals, fed the state the
// `useSavingDialog` hook owns. Mirrors `AccountsModalHost`.
export function SavingsModalHost({ effectiveSettings, savingDialog }: Props) {
  const t = useT();
  const {
    savingModal,
    setSavingModal,
    deleteSavingPrompt,
    setDeleteSavingPrompt,
    deleteSavingActions,
    onSaveSaving,
    onDeleteSavingFromModal,
    updateBalanceSaving,
    setUpdateBalanceForId,
    onAddSavingBalance,
    onImportSavingBalances,
    onDeleteSavingBalance,
  } = savingDialog;

  return (
    <>
      <SavingsModal
        open={savingModal !== null}
        saving={savingModal?.saving ?? null}
        settings={effectiveSettings}
        onClose={() => setSavingModal(null)}
        onSave={onSaveSaving}
        onDelete={onDeleteSavingFromModal}
      />
      <UpdateSavingBalanceModal
        open={updateBalanceSaving !== null}
        saving={updateBalanceSaving}
        settings={effectiveSettings}
        onClose={() => setUpdateBalanceForId(null)}
        onAddBalance={onAddSavingBalance}
        onImportBalances={onImportSavingBalances}
        onDeleteBalance={onDeleteSavingBalance}
      />
      <ConfirmDialog
        open={deleteSavingPrompt !== null}
        title={t("savingsSheet.deleteTitle")}
        description={
          deleteSavingPrompt
            ? t("savingsSheet.deleteConfirm", { name: deleteSavingPrompt.name })
            : null
        }
        actions={deleteSavingActions}
        onCancel={() => setDeleteSavingPrompt(null)}
      />
    </>
  );
}
