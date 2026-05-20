import { useEffect, useMemo, useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";

import { findColumnByType } from "../data/sheet";
import type { Category, Column, EntryType, Row, Settings } from "../data/types";
import { useDesktopAutoFocus } from "../hooks";
import { useT } from "../i18n";
import {
  formatAmountForInput,
  normalizeAmountInput,
  parseAmount,
} from "../utils/format";
import { Checkbox, Radio, RadioGroup } from "./form";
import { Modal } from "./Modal";
import { TypePicker } from "./TypePicker";

// Generic editor for a single budget row. Opened by long-pressing a row
// or pressing the pen action button. Edits date, description, amount,
// type, and completed in one place — separate from `EditEntryModal`,
// which owns the recurring-series promote flow.
//
// For rows that are part of a recurring series, a scope picker mirrors
// `EditEntryModal`'s "just this" / "this and all future" toggle. The
// scope only applies to the series-wide fields (description, amount,
// type) — date and completed are inherently per-occurrence and always
// land on the anchor row regardless of scope.

type Props = {
  open: boolean;
  row: Row | null;
  columns: Column[];
  categories: readonly Category[];
  types: readonly EntryType[];
  typeUsageById?: ReadonlyMap<string, number>;
  settings: Settings;
  // Last ISO date in the same series — defaults the "until" picker
  // when the user picks the future scope. `null` for one-off rows.
  lastSeriesDate: string | null;
  onClose: () => void;
  onSave: (rowId: string, patch: EditRowPatch, scope: EditRowScope) => void;
  onCreateType: (draft: Omit<EntryType, "id">) => EntryType;
};

export type EditRowPatch = {
  description: string;
  // `null` = leave the amount untouched (user cleared the field on a
  // row that already had a number); otherwise the new signed value.
  amount: number | null;
  date: string;
  typeId: string | null;
  completed: boolean;
};

export type EditRowScope =
  | { kind: "just-this" }
  | { kind: "future"; untilIso: string | null };

export function EditRowModal({
  open,
  row,
  columns,
  categories,
  types,
  typeUsageById,
  settings,
  lastSeriesDate,
  onClose,
  onSave,
  onCreateType,
}: Props) {
  const t = useT();
  const dateCol = useMemo(() => findColumnByType(columns, "date"), [columns]);
  const descCol = useMemo(
    () => findColumnByType(columns, "description"),
    [columns],
  );
  const amountCol = useMemo(
    () => findColumnByType(columns, "amount"),
    [columns],
  );
  const completedCol = useMemo(
    () => findColumnByType(columns, "completed"),
    [columns],
  );

  const initialDescription =
    descCol && row && typeof row.cells[descCol.id] === "string"
      ? (row.cells[descCol.id] as string)
      : "";
  const initialAmountText =
    amountCol && row && typeof row.cells[amountCol.id] === "number"
      ? formatAmountForInput(
          Math.abs(row.cells[amountCol.id] as number),
          settings,
        )
      : "";
  // Sign lives on a +/- toggle button; default to negative when no
  // amount is set, otherwise mirror the stored sign (treating 0 as
  // negative too).
  const initialNegative =
    amountCol && row && typeof row.cells[amountCol.id] === "number"
      ? (row.cells[amountCol.id] as number) <= 0
      : true;
  const initialDate =
    dateCol && row && typeof row.cells[dateCol.id] === "string"
      ? (row.cells[dateCol.id] as string)
      : "";
  const initialTypeId = row?.typeId ?? null;
  const initialCompleted =
    completedCol && row && typeof row.cells[completedCol.id] === "boolean"
      ? (row.cells[completedCol.id] as boolean)
      : false;

  const isSeries = !!row?.seriesId;

  const [description, setDescription] = useState(initialDescription);
  const [amount, setAmount] = useState(initialAmountText);
  const [negative, setNegative] = useState(initialNegative);
  const [date, setDate] = useState(initialDate);
  const [typeId, setTypeId] = useState<string | null>(initialTypeId);
  const [completed, setCompleted] = useState(initialCompleted);

  const [scopeKind, setScopeKind] = useState<"just-this" | "future">(
    "just-this",
  );
  const [untilEnabled, setUntilEnabled] = useState(false);
  const [untilDate, setUntilDate] = useState(
    lastSeriesDate ?? initialDate ?? "",
  );

  const descriptionRef = useRef<HTMLInputElement>(null);
  useDesktopAutoFocus(descriptionRef, open && !!row, row?.id);

  useEffect(() => {
    if (!open) return;
    setDescription(initialDescription);
    setAmount(initialAmountText);
    setNegative(initialNegative);
    setDate(initialDate);
    setTypeId(initialTypeId);
    setCompleted(initialCompleted);
    setScopeKind("just-this");
    setUntilEnabled(false);
    setUntilDate(lastSeriesDate ?? initialDate ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, row?.id]);

  if (!open || !row) return null;

  const parsedAbs = parseAmount(amount);
  const parsedAmount =
    parsedAbs === null
      ? null
      : negative
        ? -Math.abs(parsedAbs)
        : Math.abs(parsedAbs);

  function handleAmountChange(next: string) {
    // Sign lives on the toggle button — strip any minus the keyboard or
    // a paste produces so the input only ever shows the absolute value.
    const stripped = next.replace(/-/g, "");
    setAmount(normalizeAmountInput(stripped, settings));
  }

  function toggleSign() {
    setNegative((s) => !s);
  }

  function handleSave() {
    if (!row) return;
    onSave(
      row.id,
      {
        description: description.trim(),
        amount: parsedAmount,
        date,
        typeId,
        completed,
      },
      scopeKind === "just-this"
        ? { kind: "just-this" }
        : { kind: "future", untilIso: untilEnabled ? untilDate : null },
    );
  }

  return (
    <Modal
      open={open && !!row}
      onClose={onClose}
      labelledBy="edit-row-title"
      size="max-w-2xl"
    >
      <Modal.Header
        title={isSeries ? t("editRow.titleRecurring") : t("editRow.title")}
        onClose={onClose}
      />
      <Modal.Body>
        <div className="grid grid-cols-2 gap-3">
          <label className="col-span-2 flex flex-col gap-1">
            <span className="text-xs text-muted">
              {t("editEntry.description")}
            </span>
            <input
              ref={descriptionRef}
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="field-input rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-fg"
            />
          </label>
          {dateCol && (
            <label className="flex min-w-0 flex-col gap-1">
              <span className="text-xs text-muted">{t("sheet.date")}</span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="field-input min-w-0 rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-path"
              />
            </label>
          )}
          {amountCol && (
            <label className="flex min-w-0 flex-col gap-1">
              <span className="text-xs text-muted">
                {t("editEntry.amount")}
              </span>
              <div className="relative flex min-w-0">
                <button
                  type="button"
                  onClick={toggleSign}
                  aria-label={
                    negative
                      ? t("editEntry.makePositive")
                      : t("editEntry.makeNegative")
                  }
                  tabIndex={-1}
                  className={`absolute inset-y-0 left-0 z-10 flex w-7 cursor-pointer items-center justify-center border-0 bg-transparent p-0 hover:text-fg-bright ${
                    negative ? "text-negative" : "text-positive"
                  }`}
                >
                  {negative ? (
                    <Minus size={14} aria-hidden focusable={false} />
                  ) : (
                    <Plus size={14} aria-hidden focusable={false} />
                  )}
                </button>
                <input
                  type="text"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => handleAmountChange(e.target.value)}
                  className={`field-input min-w-0 flex-1 rounded border border-line bg-surface-2 py-1.5 pr-2 pl-7 text-right font-mono text-sm tabular-nums ${
                    parsedAbs !== null && parsedAbs !== 0
                      ? negative
                        ? "text-negative"
                        : "text-positive"
                      : "text-fg"
                  }`}
                />
              </div>
            </label>
          )}
          <div className="col-span-2 flex flex-col gap-1">
            <span className="text-xs text-muted">{t("editEntry.type")}</span>
            <TypePicker
              variant="field"
              types={types}
              categories={categories}
              selectedId={typeId}
              onSelect={setTypeId}
              onCreate={onCreateType}
              usageById={typeUsageById}
            />
          </div>
          {completedCol && (
            <div className="col-span-2">
              <Checkbox
                checked={completed}
                onChange={setCompleted}
                label={t("editRow.completed")}
                className="items-center"
              />
            </div>
          )}
        </div>

        {isSeries && (
          <fieldset className="mt-5 rounded border border-line bg-surface-3 p-3">
            <legend className="px-1 text-xs text-muted">
              {t("editRow.scopeApplyTo")}
            </legend>
            <RadioGroup
              name="edit-row-scope"
              value={scopeKind}
              onChange={(v) => setScopeKind(v as "just-this" | "future")}
            >
              <Radio
                value="just-this"
                label={t("editRow.scopeJustThisDate", {
                  date: initialDate || t("editEntry.noDate"),
                })}
              />
              <Radio value="future" label={t("editRow.scopeThisAndFuture")} />
              {scopeKind === "future" && (
                <div className="ml-6 mt-1 flex flex-col gap-1.5 rounded border border-line bg-surface px-2.5 py-2 text-xs text-muted">
                  <Checkbox
                    checked={untilEnabled}
                    onChange={setUntilEnabled}
                    label={t("editEntry.stopAfterDate")}
                    className="items-center"
                  />
                  {untilEnabled && (
                    <input
                      type="date"
                      value={untilDate}
                      onChange={(e) => setUntilDate(e.target.value)}
                      className="field-input rounded border border-line bg-surface-2 px-2 py-1 text-sm text-path"
                    />
                  )}
                </div>
              )}
            </RadioGroup>
            <p className="mt-2 text-xs text-muted">
              {t("editRow.scopeAlwaysJustThis")}
            </p>
          </fieldset>
        )}
      </Modal.Body>
      <Modal.Footer>
        <button
          type="button"
          onClick={onClose}
          className="cursor-pointer rounded border border-line px-3 py-1.5 text-sm text-muted hover:text-fg"
        >
          {t("common.cancel")}
        </button>
        <button
          type="button"
          onClick={handleSave}
          className="cursor-pointer rounded border border-accent bg-accent/10 px-3 py-1.5 text-sm font-bold text-accent hover:bg-accent/20"
        >
          {t("common.save")}
        </button>
      </Modal.Footer>
    </Modal>
  );
}
