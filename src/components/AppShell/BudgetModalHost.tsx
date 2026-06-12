import { useCallback, useMemo } from "react";

import { ApplySeriesDialog } from "../ApplySeriesDialog";
import { BudgetBulkEditModal } from "../budget/BudgetBulkEditModal";
import { BudgetComplexEntryModal } from "../budget/BudgetComplexEntryModal";
import { BudgetDeleteRecurringDialog } from "../budget/BudgetDeleteRecurringDialog";
import {
  BudgetEditEntryModal,
  type EditPatch,
  type EditScope,
} from "../budget/BudgetEditEntryModal";
import {
  BudgetEditEntryFullModal,
  type EditRowPatch,
  type EditRowScope,
} from "../budget/BudgetEditEntryFullModal";
import { BudgetMatchRuleModal } from "../budget/BudgetMatchRuleModal";
import { BudgetMoveCopyModal } from "../budget/BudgetMoveCopyModal";
import {
  BudgetSplitEntryModal,
  type SplitSubmission,
} from "../budget/BudgetSplitEntryModal";
import {
  BudgetLineItemsModal,
  type ItemPriceUpdate,
} from "../budget/BudgetLineItemsModal";
import { ConfirmDialog, type ConfirmAction } from "../ConfirmDialog";
import { EditHistoryEntryModal } from "../accounts/EditHistoryEntryModal";
import { unlock as unlockAchievement } from "../../data/achievements";
import { unlinkedItems } from "../../data/items/link";
import { itemSubtypes } from "../../data/items/subtypes";
import { findColumnByType } from "../../data/sheet";
import type { Action } from "../../data/reducer";
import type {
  AccountBudget,
  Category,
  Column,
  EntryType,
  HistoryEntrySplit,
  LineItemLink,
  Settings,
  UserData,
} from "../../data/types";
import { useT } from "../../i18n";
import type { useBulkSelection } from "./hooks/useBulkSelection";
import type { useComplexEntry } from "./hooks/useComplexEntry";
import type { useDeletePrompts } from "./hooks/useDeletePrompts";
import type { useEditPrompts } from "./hooks/useEditPrompts";
import { useHistoryEntryActions } from "./hooks/useHistoryEntryActions";
import type { useMatchRuleUi } from "./hooks/useMatchRuleUi";
import { usePromptDerivations } from "./hooks/usePromptDerivations";
import type { useTaxonomyCrud } from "./hooks/useTaxonomyCrud";

type Props = {
  data: UserData;
  effectiveSettings: Settings;
  categories: Category[];
  types: EntryType[];
  // Memoized companyId → typeId map from the AppShell — the modal host
  // forwards it to every modal that has a CompanyPicker so they can
  // auto-fill the row's type when the user picks a company on a row
  // whose type isn't set yet. `companyTypeHints` is the companyId →
  // ranked hint typeIds map, forwarded the same way so each modal's
  // TypePicker can render its "Suggested" band.
  companyTypeSuggestions: ReadonlyMap<string, string>;
  companyTypeHints: ReadonlyMap<string, readonly string[]>;
  sheetId: string;
  itemId: string;
  activeItem: AccountBudget;
  dateCol: Column | undefined;
  dispatch: (action: Action) => void;
  editPrompts: ReturnType<typeof useEditPrompts>;
  deletePrompts: ReturnType<typeof useDeletePrompts>;
  complexEntry: ReturnType<typeof useComplexEntry>;
  matchRuleUi: ReturnType<typeof useMatchRuleUi>;
  bulkSelection: ReturnType<typeof useBulkSelection>;
  onCreateType: ReturnType<typeof useTaxonomyCrud>["onCreateType"];
  onCreateCategory: ReturnType<typeof useTaxonomyCrud>["onCreateCategory"];
  onCreateCompany: ReturnType<typeof useTaxonomyCrud>["onCreateCompany"];
  onCreateTag: ReturnType<typeof useTaxonomyCrud>["onCreateTag"];
  onCreateSubtype: ReturnType<typeof useTaxonomyCrud>["onCreateSubtype"];
  onCreateItem: ReturnType<typeof useTaxonomyCrud>["onCreateItem"];
  onSetSeriesPrimaryIncome: (
    seriesId: string,
    isPrimaryIncome: boolean,
    anchorDayOfMonth: number | null,
  ) => void;
};

export function BudgetModalHost(props: Props) {
  const {
    data,
    effectiveSettings,
    categories,
    types,
    companyTypeSuggestions,
    companyTypeHints,
    sheetId,
    itemId,
    activeItem,
    dateCol,
    dispatch,
    editPrompts,
    deletePrompts,
    complexEntry,
    matchRuleUi,
    bulkSelection,
    onCreateType,
    onCreateCategory,
    onCreateCompany,
    onCreateTag,
    onCreateSubtype,
    onCreateItem,
    onSetSeriesPrimaryIncome,
  } = props;
  const t = useT();
  const {
    editPrompt,
    setEditPrompt,
    editRowPrompt,
    setEditRowPrompt,
    splitPrompt,
    setSplitPrompt,
    lineItemsPrompt,
    setLineItemsPrompt,
    pendingSeriesEdit,
    setPendingSeriesEdit,
  } = editPrompts;
  const {
    deletePrompt,
    setDeletePrompt,
    correctionDeletePrompt,
    setCorrectionDeletePrompt,
    historyEditPrompt,
    setHistoryEditPrompt,
  } = deletePrompts;
  // Pure props derived from the currently-open prompt + the active
  // budget item, and the history-entry edit / primary-income actions.
  // Both depend only on state this host already receives, so they're
  // computed here rather than threaded down from AppShell.
  const promptDerivations = usePromptDerivations({
    editPrompt,
    editRowPrompt,
    splitPrompt,
    deletePrompt,
    historyEditPrompt,
    activeItem,
    dateCol,
    data,
  });
  const historyEntryActions = useHistoryEntryActions({
    activeAccountId: activeItem.accountId,
    historyEditPrompt,
    dispatch,
    setHistoryEditPrompt,
  });
  const {
    editLastSeriesDate,
    editRowLastSeriesDate,
    deleteLastSeriesDate,
    editRowSeriesRows,
    splitInitialSplits,
    splitAuthoritativeAmount,
    splitAuthoritativeDescription,
    historyEditEntry,
    editHistoryHintPrefill,
    editHistoryMatches,
  } = promptDerivations;
  const {
    complexOpen,
    setComplexOpen,
    complexSeedDate,
    complexSeed,
    setComplexSeed,
    recurringPromoteContext,
    setRecurringPromoteContext,
    onComplexSubmit,
    onPromoteHistory,
  } = complexEntry;
  const {
    matchRulePrompt,
    setMatchRulePrompt,
    matchRuleSeed,
    matchRuleExisting,
    matchRuleAllEntries,
    onSubmitMatchRule,
    onDeleteMatchRule,
  } = matchRuleUi;
  const {
    selectedRows,
    bulkEditOpen,
    setBulkEditOpen,
    onApplyBulkPatch,
    onApplyBulkRecurring,
    bulkDeletePrompt,
    setBulkDeletePrompt,
    bulkDeleteActions,
    moveCopyPrompt,
    setMoveCopyPrompt,
    moveCopySourceMonths,
    handleMoveCopySubmit,
  } = bulkSelection;
  const { onSubmitHistoryEdit, onSetHistoryEntryPrimaryIncome } =
    historyEntryActions;

  const onApplyPendingToFuture = useCallback(
    (untilIso: string | null) => {
      if (!pendingSeriesEdit) return;
      dispatch({
        type: "propagateCellToFuture",
        sheetId,
        itemId,
        rowId: pendingSeriesEdit.rowId,
        columnId: pendingSeriesEdit.columnId,
        value: pendingSeriesEdit.value,
        untilIso,
      });
      setPendingSeriesEdit(null);
    },
    [dispatch, pendingSeriesEdit, sheetId, itemId, setPendingSeriesEdit],
  );
  const onDismissPendingSeriesEdit = useCallback(() => {
    setPendingSeriesEdit(null);
  }, [setPendingSeriesEdit]);
  const onConvertToRecurring = useCallback(
    (
      rowId: string,
      futureDates: string[],
      typeId: string | null,
      companyId: string | null,
    ) => {
      dispatch({
        type: "convertToRecurring",
        sheetId,
        itemId,
        rowId,
        futureDates,
        typeId,
        companyId,
      });
      setEditPrompt(null);
    },
    [dispatch, sheetId, itemId, setEditPrompt],
  );
  const onEditSeries = useCallback(
    (rowId: string, patch: EditPatch, scope: EditScope) => {
      unlockAchievement("secondDraft");
      dispatch({ type: "editSeries", sheetId, itemId, rowId, patch, scope });
      setEditPrompt(null);
    },
    [dispatch, sheetId, itemId, setEditPrompt],
  );
  const onSplitSubmit = useCallback(
    (rowId: string, splits: SplitSubmission[], remainderAmount: number) => {
      const row = splitPrompt?.row;
      if (!row) {
        setSplitPrompt(null);
        return;
      }
      if (row.kind === "historic" && activeItem.accountId) {
        // History rows can't be replaced inline — the entry is the
        // bank's authoritative record and its amount must be preserved.
        // Fold any remainder into a final split that keeps the entry's
        // raw bank description so the on-screen presentation still
        // mirrors what the bank reported. The splits' signed amounts
        // sum exactly to `entry.amount` after this fold.
        const entries = data.history[activeItem.accountId] ?? [];
        const entry = entries.find((e) => e.id === row.historyEntryId);
        if (!entry) {
          setSplitPrompt(null);
          return;
        }
        const fullSplits: HistoryEntrySplit[] = splits.map((s) => ({
          description: s.description,
          amount: s.amount,
          typeId: s.typeId,
        }));
        if (remainderAmount !== 0) {
          fullSplits.push({
            description: entry.description,
            amount: remainderAmount,
            typeId: null,
          });
        }
        dispatch({
          type: "splitHistoryEntry",
          accountId: activeItem.accountId,
          entryId: row.historyEntryId,
          splits: fullSplits,
        });
        unlockAchievement("splitTheBill");
        setSplitPrompt(null);
        return;
      }
      dispatch({
        type: "splitRow",
        sheetId,
        itemId,
        rowId,
        splits,
        remainderAmount,
      });
      unlockAchievement("splitTheBill");
      setSplitPrompt(null);
    },
    [
      dispatch,
      sheetId,
      itemId,
      splitPrompt,
      activeItem.accountId,
      data.history,
      setSplitPrompt,
    ],
  );
  // Drop a history entry's persisted split decomposition. The
  // reducer's `splitHistoryEntry` action treats an empty splits
  // array as "clear the field", so the synthesizer falls back to
  // rendering a single row for the bank entry on the next pass.
  // Only history rows can be reverted — regular row splits create
  // independent rows that no longer share an id linking them back
  // to the original.
  const onSplitRevert = useCallback(() => {
    const row = splitPrompt?.row;
    if (row?.kind !== "historic" || !activeItem.accountId) {
      setSplitPrompt(null);
      return;
    }
    dispatch({
      type: "splitHistoryEntry",
      accountId: activeItem.accountId,
      entryId: row.historyEntryId,
      splits: [],
    });
    setSplitPrompt(null);
  }, [dispatch, splitPrompt, activeItem.accountId, setSplitPrompt]);

  // Attach / replace the owned-item links on the prompted row. Historic
  // rows route to `linkLineItemsToHistoryEntry` (their links live on the
  // backing `HistoryEntry`); user / correction rows route to
  // `setRowLineItems`. Mirrors `onSplitSubmit`'s kind branch.
  const onLineItemsSubmit = useCallback(
    (
      rowId: string,
      lineItems: LineItemLink[],
      itemPrices: ItemPriceUpdate[],
    ) => {
      const row = lineItemsPrompt?.row;
      if (!row) {
        setLineItemsPrompt(null);
        return;
      }
      // The amount typed for each line item is the item's purchase price —
      // write it onto the item (the link no longer carries a price).
      for (const { itemId: linkedItemId, purchasePrice } of itemPrices) {
        dispatch({
          type: "updateItem",
          itemId: linkedItemId,
          patch: { purchasePrice },
        });
      }
      // The receipt is managed from the linked item's "…" menu on the Items
      // sheet, not here, so neither dispatch touches `receiptPath` (omitting
      // it leaves any existing reference untouched).
      if (row.kind === "historic" && activeItem.accountId) {
        dispatch({
          type: "linkLineItemsToHistoryEntry",
          accountId: activeItem.accountId,
          entryId: row.historyEntryId,
          lineItems,
        });
        setLineItemsPrompt(null);
        return;
      }
      dispatch({
        type: "setRowLineItems",
        sheetId,
        itemId,
        rowId,
        lineItems,
      });
      setLineItemsPrompt(null);
    },
    [
      dispatch,
      sheetId,
      itemId,
      lineItemsPrompt,
      activeItem.accountId,
      setLineItemsPrompt,
    ],
  );

  const onSaveEditRow = useCallback(
    (rowId: string, patch: EditRowPatch, scope: EditRowScope) => {
      // Description / amount / category / type are series-wide fields —
      // `editSeries` with a `just-this` scope is the same as a single-
      // row write, so the same dispatch covers both the one-off and
      // recurring cases uniformly. `dateShiftDays` also rides this
      // dispatch so a series-wide nudge lands on every row in scope.
      // Completed is inherently per-occurrence and always lands on the
      // anchor via `updateCell` regardless of scope.
      dispatch({
        type: "editSeries",
        sheetId,
        itemId,
        rowId,
        patch: {
          description: patch.description,
          amount: patch.amount,
          amountMin: patch.amountMin,
          amountMax: patch.amountMax,
          typeId: patch.typeId,
          companyId: patch.companyId,
          tagIds: patch.tagIds,
          isTransfer: patch.isTransfer,
          dateShiftDays:
            patch.dateShiftDays !== 0 ? patch.dateShiftDays : undefined,
        },
        scope,
      });
      const dateColLocal = findColumnByType(activeItem.columns, "date");
      const row = activeItem.rows.find((r) => r.id === rowId);
      const currentDate =
        dateColLocal && row && typeof row.cells[dateColLocal.id] === "string"
          ? (row.cells[dateColLocal.id] as string)
          : "";
      // Only stamp the date when the user actually typed a new one — a
      // redundant write here would overwrite (and undo) the shift the
      // editSeries dispatch just applied to the anchor row.
      if (dateColLocal && patch.date !== currentDate) {
        dispatch({
          type: "updateCell",
          sheetId,
          itemId,
          rowId,
          columnId: dateColLocal.id,
          value: patch.date,
        });
      }
      const completedCol = findColumnByType(activeItem.columns, "completed");
      if (completedCol) {
        dispatch({
          type: "updateCell",
          sheetId,
          itemId,
          rowId,
          columnId: completedCol.id,
          value: patch.completed,
        });
      }
      setEditRowPrompt(null);
    },
    [
      activeItem.columns,
      activeItem.rows,
      dispatch,
      sheetId,
      itemId,
      setEditRowPrompt,
    ],
  );
  const onDeleteRecurringRows = useCallback(
    (rowIds: string[]) => {
      dispatch({ type: "deleteRows", sheetId, itemId, rowIds });
      setDeletePrompt(null);
    },
    [dispatch, sheetId, itemId, setDeletePrompt],
  );

  // Series rows are handled by `BudgetDeleteRecurringDialog` (which owns
  // its own scope picker, optional date bound, and button labels). This
  // memo only feeds `ConfirmDialog` for the single-row fallback path
  // (one-off rows, or series rows on a sheet with no date column).
  const deleteActions: ConfirmAction[] = useMemo(() => {
    if (!deletePrompt) return [];
    const row = deletePrompt.row;
    return [
      {
        label: t("app.deleteThisRow"),
        tone: "danger",
        onSelect: () => {
          dispatch({
            type: "deleteRows",
            sheetId,
            itemId,
            rowIds: [row.id],
          });
          setDeletePrompt(null);
        },
      },
    ];
  }, [deletePrompt, dispatch, sheetId, itemId, t, setDeletePrompt]);

  const correctionDeleteActions: ConfirmAction[] = useMemo(() => {
    if (!correctionDeletePrompt) return [];
    const target = correctionDeletePrompt;
    return [
      {
        label: t("app.removeCorrection"),
        tone: "danger",
        onSelect: () => {
          dispatch({
            type: "deleteRows",
            sheetId: target.sheetId,
            itemId: target.itemId,
            rowIds: [target.rowId],
          });
          setCorrectionDeletePrompt(null);
        },
      },
    ];
  }, [correctionDeletePrompt, dispatch, t, setCorrectionDeletePrompt]);

  return (
    <>
      <BudgetComplexEntryModal
        open={complexOpen}
        initialDate={complexSeedDate}
        categories={categories}
        types={types}
        companies={data.companies}
        tags={data.tags}
        companyTypeSuggestions={companyTypeSuggestions}
        companyTypeHints={companyTypeHints}
        settings={effectiveSettings}
        sheets={data.sheets}
        currentSheetId={sheetId}
        seed={complexSeed}
        title={
          recurringPromoteContext ? t("complex.promoteCandidate") : undefined
        }
        submitVerb={
          recurringPromoteContext ? t("complex.promoteVerb") : undefined
        }
        onClose={() => {
          setComplexOpen(false);
          setComplexSeed(null);
          setRecurringPromoteContext(null);
        }}
        onCreate={onComplexSubmit}
        onCreateType={onCreateType}
        onCreateCategory={onCreateCategory}
        onCreateCompany={onCreateCompany}
        onCreateTag={onCreateTag}
      />
      <BudgetEditEntryModal
        open={editPrompt !== null}
        row={editPrompt?.row ?? null}
        columns={activeItem.columns}
        categories={categories}
        types={types}
        companies={data.companies}
        companyTypeSuggestions={companyTypeSuggestions}
        companyTypeHints={companyTypeHints}
        settings={effectiveSettings}
        lastSeriesDate={editLastSeriesDate}
        historyHintPrefill={editHistoryHintPrefill}
        historyMatches={editHistoryMatches ?? undefined}
        onClose={() => setEditPrompt(null)}
        onConvertToRecurring={onConvertToRecurring}
        onEditSeries={onEditSeries}
        onPromoteHistory={onPromoteHistory}
        onCreateType={onCreateType}
        onCreateCategory={onCreateCategory}
        onCreateCompany={onCreateCompany}
      />
      <BudgetEditEntryFullModal
        open={editRowPrompt !== null}
        row={editRowPrompt?.row ?? null}
        columns={activeItem.columns}
        categories={categories}
        types={types}
        companies={data.companies}
        tags={data.tags}
        companyTypeSuggestions={companyTypeSuggestions}
        companyTypeHints={companyTypeHints}
        settings={effectiveSettings}
        lastSeriesDate={editRowLastSeriesDate}
        seriesRows={editRowSeriesRows}
        seriesMetadata={
          editRowPrompt?.row.seriesId
            ? data.seriesMetadata[editRowPrompt.row.seriesId]
            : undefined
        }
        onClose={() => setEditRowPrompt(null)}
        onSave={onSaveEditRow}
        onSetSeriesPrimaryIncome={onSetSeriesPrimaryIncome}
        onCreateType={onCreateType}
        onCreateCategory={onCreateCategory}
        onCreateCompany={onCreateCompany}
        onCreateTag={onCreateTag}
      />
      <BudgetSplitEntryModal
        open={splitPrompt !== null}
        row={splitPrompt?.row ?? null}
        columns={activeItem.columns}
        categories={categories}
        types={types}
        settings={effectiveSettings}
        initialSplits={splitInitialSplits}
        authoritativeAmount={splitAuthoritativeAmount}
        authoritativeDescription={splitAuthoritativeDescription}
        onClose={() => setSplitPrompt(null)}
        onSplit={onSplitSubmit}
        onRevert={onSplitRevert}
        onCreateType={onCreateType}
        onCreateCategory={onCreateCategory}
      />
      <BudgetLineItemsModal
        open={lineItemsPrompt !== null}
        row={lineItemsPrompt?.row ?? null}
        columns={activeItem.columns}
        settings={effectiveSettings}
        items={unlinkedItems(data, lineItemsPrompt?.row?.lineItems)}
        subtypes={itemSubtypes(data.subtypes)}
        types={types}
        categories={categories}
        onClose={() => setLineItemsPrompt(null)}
        onSubmit={onLineItemsSubmit}
        onCreateItem={onCreateItem}
        onCreateSubtype={onCreateSubtype}
        onCreateType={onCreateType}
        onCreateCategory={onCreateCategory}
      />
      <BudgetMatchRuleModal
        open={
          matchRulePrompt !== null &&
          (matchRulePrompt.kind === "edit"
            ? matchRuleExisting !== null
            : matchRuleSeed !== null)
        }
        seedEntry={matchRuleSeed}
        allEntries={matchRuleAllEntries}
        existing={matchRuleExisting}
        categories={categories}
        types={types}
        companies={data.companies}
        tags={data.tags}
        settings={effectiveSettings}
        onClose={() => setMatchRulePrompt(null)}
        onSubmit={onSubmitMatchRule}
        onDelete={
          matchRulePrompt?.kind === "edit" ? onDeleteMatchRule : undefined
        }
        onCreateType={onCreateType}
        onCreateCategory={onCreateCategory}
        onCreateCompany={onCreateCompany}
        onCreateTag={onCreateTag}
      />
      <EditHistoryEntryModal
        open={historyEditPrompt !== null && historyEditEntry !== null}
        entry={historyEditEntry}
        categories={categories}
        types={types}
        companies={data.companies}
        tags={data.tags}
        companyTypeSuggestions={companyTypeSuggestions}
        companyTypeHints={companyTypeHints}
        settings={effectiveSettings}
        primaryIncomeMerchants={data.primaryIncomeMerchants}
        onClose={() => setHistoryEditPrompt(null)}
        onSubmit={onSubmitHistoryEdit}
        onSetPrimaryIncome={onSetHistoryEntryPrimaryIncome}
        onCreateType={onCreateType}
        onCreateCategory={onCreateCategory}
        onCreateCompany={onCreateCompany}
        onCreateTag={onCreateTag}
      />
      <ApplySeriesDialog
        open={pendingSeriesEdit !== null}
        fieldLabel={pendingSeriesEdit?.fieldLabel ?? ""}
        anchorDate={pendingSeriesEdit?.anchorDate ?? ""}
        lastSeriesDate={pendingSeriesEdit?.lastSeriesDate ?? null}
        onCancel={onDismissPendingSeriesEdit}
        onJustThis={onDismissPendingSeriesEdit}
        onApplyToFuture={onApplyPendingToFuture}
      />
      <BudgetBulkEditModal
        open={bulkEditOpen && selectedRows.length > 0}
        rows={selectedRows}
        columns={activeItem.columns}
        categories={categories}
        types={types}
        tags={data.tags}
        settings={effectiveSettings}
        onClose={() => setBulkEditOpen(false)}
        onApplyPatch={onApplyBulkPatch}
        onApplyRecurring={onApplyBulkRecurring}
        onCreateType={onCreateType}
        onCreateCategory={onCreateCategory}
        onCreateTag={onCreateTag}
      />
      <BudgetMoveCopyModal
        open={moveCopyPrompt !== null}
        mode={moveCopyPrompt?.kind ?? "move"}
        rows={moveCopyPrompt?.rows ?? []}
        sourceMonths={moveCopySourceMonths}
        onClose={() => setMoveCopyPrompt(null)}
        onSubmit={handleMoveCopySubmit}
      />
      <ConfirmDialog
        open={
          deletePrompt !== null &&
          !(deletePrompt.row.seriesId && dateCol !== undefined)
        }
        title={t("confirm.deleteRow")}
        description={t("confirm.deleteRowHint")}
        actions={deleteActions}
        onCancel={() => setDeletePrompt(null)}
      />
      <BudgetDeleteRecurringDialog
        open={
          deletePrompt !== null &&
          !!deletePrompt.row.seriesId &&
          dateCol !== undefined
        }
        row={deletePrompt?.row ?? null}
        rows={activeItem.rows}
        dateColumnId={dateCol?.id ?? null}
        lastSeriesDate={deleteLastSeriesDate}
        settings={effectiveSettings}
        onCancel={() => setDeletePrompt(null)}
        onDelete={onDeleteRecurringRows}
      />
      <ConfirmDialog
        open={bulkDeletePrompt !== null}
        title={t("app.deleteSelected")}
        description={
          (bulkDeletePrompt?.rowIds.length ?? 0) === 1
            ? t("confirm.deleteSelectedHintOne", {
                n: bulkDeletePrompt?.rowIds.length ?? 0,
              })
            : t("confirm.deleteSelectedHintOther", {
                n: bulkDeletePrompt?.rowIds.length ?? 0,
              })
        }
        actions={bulkDeleteActions}
        onCancel={() => setBulkDeletePrompt(null)}
      />
      <ConfirmDialog
        open={correctionDeletePrompt !== null}
        title={t("app.removeBalanceCorrection")}
        description={
          correctionDeletePrompt
            ? t("confirm.correctionRemoveHint", {
                delta: correctionDeletePrompt.deltaText,
              })
            : ""
        }
        actions={correctionDeleteActions}
        onCancel={() => setCorrectionDeletePrompt(null)}
      />
    </>
  );
}
