import { useMemo } from "react";

import { AccountModal } from "../accounts/AccountModal";
import { AccountCutHistoryModal } from "../accounts/AccountCutHistoryModal";
import { ImportDuplicatesModal } from "../accounts/ImportDuplicatesModal";
import { AccountReconciliationModal } from "../accounts/AccountReconciliationModal";
import { AccountRenamePredictorModal } from "../accounts/AccountRenamePredictorModal";
import { AccountTransferCollapseModal } from "../accounts/AccountTransferCollapseModal";
import { AccountTransferModal } from "../accounts/AccountTransferModal";
import { ConfirmDialog } from "../ConfirmDialog";
import { savingAsTransferEndpoint } from "../../data/savings/value";
import { HistoryModal } from "../accounts/HistoryModal";
import { ImportHistoryModal } from "../accounts/ImportHistoryModal";
import { UpdateBalanceModal } from "../accounts/UpdateBalanceModal";
import type { Category, EntryType, Settings, UserData } from "../../data/types";
import type { Action } from "../../data/reducer";
import { useLang, useT } from "../../i18n";
import { formatShortDate } from "../../utils/format";
import type { useAccountDialog } from "./hooks/useAccountDialog";
import type { useImportFlow } from "./hooks/useImportFlow";
import type { useTaxonomyCrud } from "./hooks/useTaxonomyCrud";
import type { useTransferFlow } from "./hooks/useTransferFlow";

type Props = {
  data: UserData;
  effectiveSettings: Settings;
  categories: Category[];
  types: EntryType[];
  accountDialog: ReturnType<typeof useAccountDialog>;
  importFlow: ReturnType<typeof useImportFlow>;
  transferFlow: ReturnType<typeof useTransferFlow>;
  dispatch: (action: Action) => void;
  onCreateType: ReturnType<typeof useTaxonomyCrud>["onCreateType"];
  onCreateCategory: ReturnType<typeof useTaxonomyCrud>["onCreateCategory"];
};

export function AccountsModalHost(props: Props) {
  const {
    data,
    effectiveSettings,
    categories,
    types,
    accountDialog,
    importFlow,
    transferFlow,
    dispatch,
    onCreateType,
    onCreateCategory,
  } = props;
  const t = useT();
  const lang = useLang();
  // Transfer endpoints span regular accounts and savings accounts (both share
  // the transfer id-space), so the collapse modal and the transfer create /
  // edit picker resolve and offer both. Savings stay out of the Accounts
  // table — they're merged only into these transfer surfaces.
  const transferEndpoints = useMemo(
    () => [...data.accounts, ...data.savings.map(savingAsTransferEndpoint)],
    [data.accounts, data.savings],
  );
  const {
    accountModal,
    setAccountModal,
    deleteAccountPrompt,
    setDeleteAccountPrompt,
    deleteAccountActions,
    onSaveAccount,
    onDeleteFinancialAccount,
    setUpdateBalanceForId,
    updateBalanceAccount,
    updateBalanceCurrent,
    updateBalanceHasBudget,
    updateBalanceDate,
    onConfirmUpdateBalance,
  } = accountDialog;
  const {
    importHistoryAccount,
    setImportHistoryForId,
    onConfirmImportHistory,
    overlapConfirm,
    onConfirmImportOverlap,
    onCancelImportOverlap,
    viewHistoryAccount,
    setViewHistoryForId,
    onDeleteHistoryEntry,
    cutHistoryAccount,
    setCutHistoryForId,
    onConfirmCutHistory,
    reconciliation,
    onApplyReconciliation,
    onCancelReconciliation,
    manualTriage,
    setManualTriage,
    onApplyManualTriage,
    renamePredictor,
    onCommitRenamePredictor,
    onCancelRenamePredictor,
    importDuplicateGroups,
    importDuplicateOwner,
    clearImportDuplicates,
  } = importFlow;
  const {
    transferRequest,
    setTransferRequest,
    onCreateTransfer,
    onEditTransferSave,
    onDeleteTransferFromModal,
    uncollapsePrompt,
    setUncollapsePrompt,
    uncollapseActions,
    onUncollapseTransfer,
    transferModalOpen,
    setTransferModalOpen,
    onCollapseTransferPair,
    onDismissTransferPair,
  } = transferFlow;

  return (
    <>
      <AccountModal
        open={accountModal !== null}
        account={accountModal?.account ?? null}
        onClose={() => setAccountModal(null)}
        onSave={onSaveAccount}
        onDelete={onDeleteFinancialAccount}
      />
      <UpdateBalanceModal
        open={updateBalanceAccount !== null}
        account={updateBalanceAccount}
        currentBalance={updateBalanceCurrent}
        settings={effectiveSettings}
        date={updateBalanceDate}
        canRecord={updateBalanceHasBudget}
        onConfirm={onConfirmUpdateBalance}
        onCancel={() => setUpdateBalanceForId(null)}
      />
      <ImportHistoryModal
        open={importHistoryAccount !== null}
        account={importHistoryAccount}
        existing={
          importHistoryAccount
            ? (data.history[importHistoryAccount.id] ?? [])
            : []
        }
        settings={effectiveSettings}
        onCancel={() => setImportHistoryForId(null)}
        onConfirm={onConfirmImportHistory}
      />
      <ConfirmDialog
        open={overlapConfirm !== null}
        title={t("importHistory.overlapTitle")}
        description={
          overlapConfirm
            ? t("importHistory.overlapHint", {
                account:
                  data.accounts.find((a) => a.id === overlapConfirm.accountId)
                    ?.name ?? overlapConfirm.accountId,
                start: formatShortDate(
                  overlapConfirm.overlap.start,
                  effectiveSettings.shortDateFormat,
                  lang,
                ),
                end: formatShortDate(
                  overlapConfirm.overlap.end,
                  effectiveSettings.shortDateFormat,
                  lang,
                ),
              })
            : null
        }
        actions={[
          {
            label: t("importHistory.overlapConfirm"),
            onSelect: onConfirmImportOverlap,
          },
        ]}
        onCancel={onCancelImportOverlap}
      />
      <AccountReconciliationModal
        open={reconciliation !== null}
        onCancel={onCancelReconciliation}
        onApply={onApplyReconciliation}
        accountId={reconciliation?.accountId ?? ""}
        preImportData={reconciliation?.preImportData ?? data}
        newEntries={reconciliation?.newEntries ?? []}
        candidates={reconciliation?.candidates ?? []}
        orphans={reconciliation?.orphans ?? []}
        settings={effectiveSettings}
      />
      {/* Second mount, scoped to the retrospective orphan-triage CTA
          fired from the budget-page BudgetMonthTable footer. Same modal
          component as the import-time one — just fed an empty
          `newEntries` / `candidates` so only the orphan section
          renders, and committed via `onApplyManualTriage` which
          dispatches `applyReconciliation` standalone (no
          `importBankHistory` in flight). */}
      <AccountReconciliationModal
        open={manualTriage !== null}
        onCancel={() => setManualTriage(null)}
        onApply={onApplyManualTriage}
        accountId={manualTriage?.accountId ?? ""}
        preImportData={manualTriage?.preImportData ?? data}
        newEntries={[]}
        candidates={[]}
        orphans={manualTriage?.orphans ?? []}
        settings={effectiveSettings}
      />
      <AccountRenamePredictorModal
        open={renamePredictor !== null}
        suggestions={renamePredictor?.suggestions ?? []}
        settings={effectiveSettings}
        onCancel={onCancelRenamePredictor}
        onCommit={onCommitRenamePredictor}
      />
      {/* Import-scoped duplicate picker — auto-opens after a commit when
          the freshly-imported rows collide with rows in another account.
          One owner choice for the whole batch (see ImportDuplicatesModal),
          distinct from the per-group menu-opened "Find duplicates". */}
      <ImportDuplicatesModal
        open={importDuplicateGroups.length > 0}
        onClose={clearImportDuplicates}
        groups={importDuplicateGroups}
        suggestedOwner={importDuplicateOwner}
        data={data}
        settings={effectiveSettings}
        dispatch={dispatch}
      />
      <AccountCutHistoryModal
        open={cutHistoryAccount !== null}
        account={cutHistoryAccount}
        history={
          cutHistoryAccount ? (data.history[cutHistoryAccount.id] ?? []) : []
        }
        transfers={data.transfers}
        onCancel={() => setCutHistoryForId(null)}
        onConfirm={onConfirmCutHistory}
      />
      <HistoryModal
        open={viewHistoryAccount !== null}
        account={viewHistoryAccount}
        entries={
          viewHistoryAccount ? (data.history[viewHistoryAccount.id] ?? []) : []
        }
        settings={effectiveSettings}
        onCancel={() => setViewHistoryForId(null)}
        onDeleteEntry={onDeleteHistoryEntry}
      />
      <AccountTransferCollapseModal
        open={transferModalOpen}
        history={data.history}
        accounts={transferEndpoints}
        dismissedPairKeys={data.transferCollapseDismissals}
        settings={effectiveSettings}
        onClose={() => setTransferModalOpen(false)}
        onCollapse={onCollapseTransferPair}
        onDismiss={onDismissTransferPair}
      />
      <AccountTransferModal
        open={transferRequest !== null}
        request={transferRequest}
        accounts={transferEndpoints}
        categories={categories}
        types={types}
        settings={effectiveSettings}
        onClose={() => setTransferRequest(null)}
        onCreate={onCreateTransfer}
        onEdit={onEditTransferSave}
        onDelete={onDeleteTransferFromModal}
        onUncollapse={onUncollapseTransfer}
        onCreateType={onCreateType}
        onCreateCategory={onCreateCategory}
      />
      <ConfirmDialog
        open={deleteAccountPrompt !== null}
        title={t("app.deleteAccount")}
        description={
          deleteAccountPrompt
            ? t("confirm.deleteAccountHint", { name: deleteAccountPrompt.name })
            : null
        }
        actions={deleteAccountActions}
        onCancel={() => setDeleteAccountPrompt(null)}
      />
      <ConfirmDialog
        open={uncollapsePrompt !== null}
        title={t("transfer.uncollapseTitle")}
        description={t("transfer.uncollapseHint")}
        actions={uncollapseActions}
        onCancel={() => setUncollapsePrompt(null)}
      />
    </>
  );
}
