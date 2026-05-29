import { useCallback, useEffect, useMemo, useReducer } from "react";
import { ListChecks } from "lucide-react";

import { findColumnByType } from "../../data/sheet";
import type { RecurrenceRule } from "../../data/recurrence";
import type {
  Category,
  Column,
  EntryType,
  Row,
  Settings,
  Tag,
} from "../../data/types";
import { useT } from "../../i18n";
import { normalizeAmountInput, parseAmount } from "../../utils/format";
import { Modal } from "../Modal";
import { Button, Checkbox, ClearableInput } from "../form";
import { BudgetRecurrenceForm } from "./BudgetRecurrenceForm";
import { TagsPicker } from "../TagsPicker";
import { TypePicker } from "../TypePicker";
import {
  budgetBulkEditModalReducer,
  initialBulkEditState,
} from "./budget-bulk-edit-modal-reducer";

export type { BulkPatch } from "../../data/action-payloads";
import type { BulkPatch } from "../../data/action-payloads";

type Props = {
  open: boolean;
  rows: Row[];
  columns: Column[];
  categories: readonly Category[];
  types: readonly EntryType[];
  tags: readonly Tag[];
  settings: Settings;
  onClose: () => void;
  onApplyPatch: (rowIds: string[], patch: BulkPatch) => void;
  onApplyRecurring: (rowIds: string[], futureDates: string[]) => void;
  onCreateType: (draft: Omit<EntryType, "id">) => EntryType;
  onCreateCategory: (draft: Omit<Category, "id">) => Category;
  onCreateTag: (draft: Omit<Tag, "id">) => Tag;
};

export function BudgetBulkEditModal({
  open,
  rows,
  columns,
  categories,
  types,
  tags,
  settings,
  onClose,
  onApplyPatch,
  onApplyRecurring,
  onCreateType,
  onCreateCategory,
  onCreateTag,
}: Props) {
  const t = useT();
  const dateCol = useMemo(() => findColumnByType(columns, "date"), [columns]);
  const amountCol = useMemo(
    () => findColumnByType(columns, "amount"),
    [columns],
  );

  // Only expose the amount field when every selected row already shares the
  // same amount — guard against silently overwriting unrelated values.
  const sharedAmount = useMemo<number | null>(() => {
    if (!amountCol || rows.length === 0) return null;
    const values = rows.map((r) => r.cells[amountCol.id]);
    const first = values[0];
    if (typeof first !== "number") return null;
    return values.every((v) => v === first) ? first : null;
  }, [rows, amountCol]);

  // Seed BudgetRecurrenceForm with the earliest date in the selection so the
  // generated horizon starts somewhere relevant.
  const seedDate = useMemo<string>(() => {
    if (!dateCol) return "";
    const dates = rows
      .map((r) => r.cells[dateCol.id])
      .filter((d): d is string => typeof d === "string");
    return dates.sort()[0] ?? "";
  }, [rows, dateCol]);

  const [state, dispatch] = useReducer(
    budgetBulkEditModalReducer,
    { seedDate: "", sharedAmount: null, settings },
    initialBulkEditState,
  );
  const {
    typeEnabled,
    typeId,
    tagsEnabled,
    tagIds,
    dateEnabled,
    dateValue,
    amountEnabled,
    amountText,
    transferEnabled,
    transferValue,
    recurringEnabled,
    recurringDates,
    recurrenceResetKey,
  } = state;

  useEffect(() => {
    if (!open) return;
    dispatch({ kind: "reset", seed: { seedDate, sharedAmount, settings } });
  }, [open, seedDate, sharedAmount, settings]);

  const handleRuleChange = useCallback(
    (_rule: RecurrenceRule | null, dates: string[]) => {
      dispatch({ kind: "setRecurringDates", value: dates });
    },
    [],
  );

  if (!open) return null;

  const parsedAmount = parseAmount(amountText);
  const rowIds = rows.map((r) => r.id);

  const patchHasChanges =
    typeEnabled ||
    tagsEnabled ||
    dateEnabled ||
    (amountEnabled && sharedAmount !== null && parsedAmount !== null) ||
    transferEnabled;
  const recurringHasDates = recurringEnabled && recurringDates.length > 0;
  const canSubmit = patchHasChanges || recurringHasDates;

  function handleSubmit() {
    const patch: BulkPatch = {};
    if (typeEnabled) patch.typeId = typeId;
    if (tagsEnabled) patch.tagIds = tagIds;
    if (dateEnabled && dateCol && dateValue) patch.date = dateValue;
    if (
      amountEnabled &&
      amountCol &&
      sharedAmount !== null &&
      parsedAmount !== null
    ) {
      patch.amount = parsedAmount;
    }
    if (transferEnabled) patch.isTransfer = transferValue;
    if (Object.keys(patch).length > 0) onApplyPatch(rowIds, patch);
    if (recurringEnabled && recurringDates.length > 0) {
      onApplyRecurring(rowIds, recurringDates);
    }
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="bulk-edit-title"
      size="max-w-2xl"
    >
      <Modal.Header
        icon={<ListChecks size={14} aria-hidden focusable={false} />}
        title={
          rows.length === 1
            ? t("bulkEdit.titleOne")
            : t("bulkEdit.title", { n: rows.length })
        }
        onClose={onClose}
      />
      <Modal.Body>
        <Toggle
          label={t("bulkEdit.changeType")}
          enabled={typeEnabled}
          onToggle={(value) => dispatch({ kind: "setTypeEnabled", value })}
        >
          <TypePicker
            variant="field"
            types={types}
            categories={categories}
            selectedId={typeId}
            onSelect={(value) => dispatch({ kind: "setTypeId", value })}
            onCreate={onCreateType}
            onCreateCategory={onCreateCategory}
          />
        </Toggle>

        <Toggle
          label={t("bulkEdit.changeTags")}
          enabled={tagsEnabled}
          onToggle={(value) => dispatch({ kind: "setTagsEnabled", value })}
          hint={t("bulkEdit.changeTagsHint")}
        >
          <TagsPicker
            tags={tags}
            selectedIds={tagIds}
            onChange={(ids) => dispatch({ kind: "setTagIds", value: ids })}
            onCreate={onCreateTag}
          />
        </Toggle>

        <Toggle
          label={t("bulkEdit.changeDate")}
          enabled={dateEnabled}
          onToggle={(value) => dispatch({ kind: "setDateEnabled", value })}
        >
          <input
            type="date"
            value={dateValue}
            onChange={(e) =>
              dispatch({ kind: "setDateValue", value: e.target.value })
            }
            className="field-input rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-path"
          />
        </Toggle>

        {sharedAmount !== null ? (
          <Toggle
            label={t("bulkEdit.changeAmount")}
            enabled={amountEnabled}
            onToggle={(value) => dispatch({ kind: "setAmountEnabled", value })}
            hint={t("bulkEdit.sharedAmountHint", {
              n: rows.length,
              amount: sharedAmount,
            })}
          >
            <ClearableInput
              inputMode="decimal"
              value={amountText}
              onValueChange={(next) =>
                dispatch({
                  kind: "setAmountText",
                  value: normalizeAmountInput(next, settings),
                })
              }
              className={`field-input w-full rounded border border-line bg-surface-2 px-2 py-1.5 text-right font-mono text-sm tabular-nums ${
                parsedAmount !== null && parsedAmount < 0
                  ? "text-danger"
                  : parsedAmount !== null && parsedAmount > 0
                    ? "text-meta"
                    : "text-fg"
              }`}
            />
          </Toggle>
        ) : (
          <p className="mt-3 rounded border border-line bg-surface-3 px-3 py-2 text-xs text-muted">
            {t("bulkEdit.differentAmountsHint")}
          </p>
        )}

        <Toggle
          label={t("bulkEdit.markAsTransfer")}
          enabled={transferEnabled}
          onToggle={(value) => dispatch({ kind: "setTransferEnabled", value })}
          hint={t("bulkEdit.markAsTransferHint")}
        >
          <Checkbox
            checked={transferValue}
            onChange={(value) => dispatch({ kind: "setTransferValue", value })}
            label={
              transferValue
                ? t("bulkEdit.markAsTransferOn")
                : t("bulkEdit.markAsTransferOff")
            }
          />
        </Toggle>

        <Toggle
          label={t("bulkEdit.makeEachRecurring")}
          enabled={recurringEnabled}
          onToggle={(value) => dispatch({ kind: "setRecurringEnabled", value })}
          hint={t("bulkEdit.makeEachRecurringHint")}
        >
          <BudgetRecurrenceForm
            seedDate={seedDate}
            resetKey={recurrenceResetKey}
            includeOnce={false}
            onChange={handleRuleChange}
          />
        </Toggle>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button variant="primary" onClick={handleSubmit} disabled={!canSubmit}>
          {t("common.apply")}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

function Toggle({
  label,
  enabled,
  onToggle,
  hint,
  children,
}: {
  label: string;
  enabled: boolean;
  onToggle: (next: boolean) => void;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="mt-3 rounded border border-line bg-surface-3 p-3">
      <legend className="px-1">
        <Checkbox
          checked={enabled}
          onChange={onToggle}
          label={label}
          className="items-center"
        />
      </legend>
      {hint && <p className="mb-2 text-xs text-muted">{hint}</p>}
      <div
        className={enabled ? "" : "pointer-events-none opacity-50 select-none"}
        aria-hidden={!enabled}
      >
        {children}
      </div>
    </fieldset>
  );
}
