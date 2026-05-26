import { useEffect, useMemo, useRef, useState } from "react";
import { Pencil } from "lucide-react";

import { findColumnByType, sortRowsByDate } from "../../data/sheet";
import type {
  Category,
  Column,
  EntryType,
  Row,
  SeriesMetadata,
  Settings,
} from "../../data/types";
import { useDesktopAutoFocus } from "../../hooks";
import { useT } from "../../i18n";
import {
  formatAmount,
  formatAmountForInput,
  formatShortDate,
  parseAmount,
} from "../../utils/format";
import {
  Checkbox,
  Button,
  ClearableInput,
  Radio,
  RadioGroup,
  SignedAmountInput,
} from "../form";
import { Modal } from "../Modal";
import { TypePicker } from "../TypePicker";

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
  settings: Settings;
  // Last ISO date in the same series — defaults the "until" picker
  // when the user picks the future scope. `null` for one-off rows.
  lastSeriesDate: string | null;
  // Every row in the same series, including the anchor, ordered
  // however the caller likes (the modal re-sorts by date). Empty for
  // one-off rows. Used to render the "Affected rows" preview list
  // under the scope picker so the user can see what they're about to
  // change before pressing Save.
  seriesRows: readonly Row[];
  // Current persisted metadata for the row's series (or undefined when
  // the row is one-off). Drives the "primary income" toggle's initial
  // value. Series-level edits dispatch through `onSetSeriesPrimaryIncome`
  // and don't ride on `onSave`.
  seriesMetadata?: SeriesMetadata;
  onClose: () => void;
  onSave: (rowId: string, patch: EditRowPatch, scope: EditRowScope) => void;
  // Set / clear the primary-income flag for the row's series. Fired
  // straight from the modal's toggle so the cascade applies immediately
  // — keeping the rest of the row save independent of this workspace-
  // level metadata change. `anchorDayOfMonth` is null when the user
  // turns the toggle off.
  onSetSeriesPrimaryIncome?: (
    seriesId: string,
    isPrimaryIncome: boolean,
    anchorDayOfMonth: number | null,
  ) => void;
  onCreateType: (draft: Omit<EntryType, "id">) => EntryType;
  onCreateCategory: (draft: Omit<Category, "id">) => Category;
};

export type EditRowPatch = {
  description: string;
  // `null` = leave the amount untouched (user cleared the field on a
  // row that already had a number); otherwise the new signed value.
  amount: number | null;
  date: string;
  typeId: string | null;
  completed: boolean;
  // Signed day-offset applied to every row in the chosen series
  // scope. Lets the user nudge a recurring series whose anchor day
  // was off (e.g. landed on day 24 but should be day 25). 0 means
  // "leave dates alone".
  dateShiftDays: number;
};

export type EditRowScope =
  | { kind: "just-this" }
  | { kind: "future"; untilIso: string | null }
  // Whole-series scope. The modal locks the amount input out under
  // this scope — changing the amount on past, already-reconciled
  // occurrences would silently rewrite history.
  | { kind: "all" };

export function EditRowModal({
  open,
  row,
  columns,
  categories,
  types,
  settings,
  lastSeriesDate,
  seriesRows,
  seriesMetadata,
  onClose,
  onSave,
  onSetSeriesPrimaryIncome,
  onCreateType,
  onCreateCategory,
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

  // Primary-income toggle state. Initialised from the persisted
  // metadata so the toggle reflects whatever the user picked last time;
  // saved straight to the workspace through `onSetSeriesPrimaryIncome`
  // when the user changes it (no need to wait for the row save).
  const initialIsPrimary = seriesMetadata?.isPrimaryIncome === true;
  const initialAnchorDay = seriesMetadata?.anchorDayOfMonth ?? 25;
  const [isPrimaryIncome, setIsPrimaryIncome] = useState(initialIsPrimary);
  const [anchorDayText, setAnchorDayText] = useState(String(initialAnchorDay));

  const [scopeKind, setScopeKind] = useState<"just-this" | "future" | "all">(
    "just-this",
  );
  const [untilEnabled, setUntilEnabled] = useState(false);
  const [untilDate, setUntilDate] = useState(
    lastSeriesDate ?? initialDate ?? "",
  );
  // Signed day-offset applied to every row in the chosen scope so the
  // user can nudge a recurring series whose anchor day was off (e.g.
  // landed on day 24 but should be day 25). Stored as a string so the
  // input can hold transient state (lone `-`, empty) without snapping.
  const [shiftDaysText, setShiftDaysText] = useState("0");

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
    setIsPrimaryIncome(initialIsPrimary);
    setAnchorDayText(String(initialAnchorDay));
    setScopeKind("just-this");
    setUntilEnabled(false);
    setUntilDate(lastSeriesDate ?? initialDate ?? "");
    setShiftDaysText("0");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, row?.id]);

  // Rows that the chosen scope will touch. Recomputed on every render
  // — the source list, the anchor date, and the optional "until" date
  // can all change between renders, and the picker is cheap to walk.
  // Returns an empty array for "just-this" and for non-series rows so
  // the preview list collapses cleanly.
  const affectedRows = useMemo<readonly Row[]>(() => {
    if (!row?.seriesId || !dateCol) return [];
    if (scopeKind === "just-this") return [];
    const sorted = sortRowsByDate([...seriesRows], dateCol.id);
    if (scopeKind === "all") return sorted;
    const anchorDate = initialDate;
    if (!anchorDate) return [];
    const until = untilEnabled ? untilDate : null;
    return sorted.filter((r) => {
      const d = r.cells[dateCol.id];
      if (typeof d !== "string") return false;
      if (d < anchorDate) return false;
      if (until && d > until) return false;
      return true;
    });
  }, [
    row?.seriesId,
    dateCol,
    scopeKind,
    seriesRows,
    initialDate,
    untilEnabled,
    untilDate,
  ]);

  if (!open || !row) return null;

  const parsedAbs = parseAmount(amount);
  const parsedAmount =
    parsedAbs === null
      ? null
      : negative
        ? -Math.abs(parsedAbs)
        : Math.abs(parsedAbs);
  // The picker filter follows the +/- toggle (and the parsed value
  // when present) so flipping the sign immediately changes which
  // types are offered.
  const pickerSign: "positive" | "negative" | "any" =
    parsedAmount !== null && parsedAmount > 0
      ? "positive"
      : parsedAmount !== null && parsedAmount < 0
        ? "negative"
        : amountCol
          ? negative
            ? "negative"
            : "positive"
          : "any";

  function toggleSign() {
    setNegative((s) => !s);
  }

  const parsedShiftDays = Number.parseInt(shiftDaysText, 10);
  const shiftDays = Number.isFinite(parsedShiftDays) ? parsedShiftDays : 0;

  function handleSave() {
    if (!row) return;
    // "all" scope explicitly skips the amount — the input is disabled
    // in the UI so the user can see why, but force-null it here too
    // in case anything ever bypasses the disabled state.
    const patchAmount = scopeKind === "all" ? null : parsedAmount;
    onSave(
      row.id,
      {
        description: description.trim(),
        amount: patchAmount,
        date,
        typeId,
        completed,
        dateShiftDays: shiftDays,
      },
      scopeKind === "just-this"
        ? { kind: "just-this" }
        : scopeKind === "all"
          ? { kind: "all" }
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
        icon={<Pencil size={14} aria-hidden focusable={false} />}
        title={isSeries ? t("editRow.titleRecurring") : t("editRow.title")}
        onClose={onClose}
      />
      <Modal.Body>
        <div className="grid grid-cols-2 gap-3">
          <label className="col-span-2 flex flex-col gap-1">
            <span className="text-xs text-muted">
              {t("editEntry.description")}
            </span>
            <ClearableInput
              ref={descriptionRef}
              value={description}
              onValueChange={setDescription}
              className="field-input w-full min-w-0 rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-fg"
            />
          </label>
          {dateCol && (
            <label className="flex min-w-0 flex-col gap-1">
              <span className="text-xs text-muted">{t("budget.date")}</span>
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
              <SignedAmountInput
                value={amount}
                negative={negative}
                onValueChange={setAmount}
                onToggleSign={toggleSign}
                settings={settings}
                ariaLabel={t("editEntry.amount")}
                disabled={scopeKind === "all"}
              />
              {scopeKind === "all" && (
                <span className="text-xs text-muted">
                  {t("editRow.scopeAllAmountDisabled")}
                </span>
              )}
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
              onCreateCategory={onCreateCategory}
              amountSign={pickerSign}
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
              onChange={(v) =>
                setScopeKind(v as "just-this" | "future" | "all")
              }
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
              <Radio value="all" label={t("editRow.scopeAll")} />
            </RadioGroup>
            <p className="mt-2 text-xs text-muted">
              {t("editRow.scopeAlwaysJustThis")}
            </p>
            {affectedRows.length > 0 && (
              <div className="mt-3 flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs text-muted">
                    {t("editRow.affectedRows")}
                  </span>
                  <span className="text-xs text-muted">
                    {affectedRows.length === 1
                      ? t("editRow.affectedRowsCountOne", {
                          n: String(affectedRows.length),
                        })
                      : t("editRow.affectedRowsCountOther", {
                          n: String(affectedRows.length),
                        })}
                  </span>
                </div>
                <ul className="max-h-40 overflow-y-auto rounded border border-line bg-surface">
                  {affectedRows.map((r) => {
                    const rowDate =
                      dateCol && typeof r.cells[dateCol.id] === "string"
                        ? (r.cells[dateCol.id] as string)
                        : "";
                    const rowDesc =
                      descCol && typeof r.cells[descCol.id] === "string"
                        ? (r.cells[descCol.id] as string)
                        : "";
                    const rowAmount =
                      amountCol && typeof r.cells[amountCol.id] === "number"
                        ? (r.cells[amountCol.id] as number)
                        : null;
                    const isAnchor = r.id === row?.id;
                    return (
                      <li
                        key={r.id}
                        className={`flex items-baseline gap-2 px-2 py-1 font-mono text-xs ${
                          isAnchor ? "bg-surface-2 text-fg" : "text-muted"
                        }`}
                      >
                        <span className="w-16 shrink-0 text-path">
                          {rowDate
                            ? formatShortDate(
                                rowDate,
                                settings.shortDateFormat,
                                settings.language,
                              )
                            : "—"}
                        </span>
                        <span className="min-w-0 flex-1 truncate">
                          {rowDesc || "—"}
                          {isAnchor && (
                            <span className="ml-1.5 text-muted">
                              ({t("editRow.affectedRowsCurrent")})
                            </span>
                          )}
                        </span>
                        <span
                          className={`shrink-0 tabular-nums ${
                            rowAmount === null
                              ? "text-muted"
                              : rowAmount < 0
                                ? "text-negative"
                                : "text-positive"
                          }`}
                        >
                          {rowAmount === null
                            ? "—"
                            : formatAmount(rowAmount, settings)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            <label className="mt-3 flex flex-col gap-1">
              <span className="text-xs text-muted">
                {t("editEntry.shiftDaysBy")}
              </span>
              <ClearableInput
                type="number"
                inputMode="numeric"
                step={1}
                value={shiftDaysText}
                onValueChange={setShiftDaysText}
                aria-label={t("editEntry.shiftDaysBy")}
                wrapperClassName="min-w-0"
                className="field-input w-full min-w-0 rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-fg"
              />
              <span className="text-xs text-muted">
                {t("editEntry.shiftDaysByHint")}
              </span>
            </label>
          </fieldset>
        )}

        {isSeries && onSetSeriesPrimaryIncome && row?.seriesId && (
          <fieldset className="mt-5 rounded border border-line bg-surface-3 p-3">
            <legend className="px-1 text-xs text-muted">
              {t("editRow.primaryIncomeTitle")}
            </legend>
            <Checkbox
              checked={isPrimaryIncome}
              onChange={(next) => {
                setIsPrimaryIncome(next);
                const day = Number.parseInt(anchorDayText, 10);
                const dayClamped =
                  Number.isFinite(day) && day >= 1 && day <= 31 ? day : 25;
                onSetSeriesPrimaryIncome(
                  row.seriesId as string,
                  next,
                  next ? dayClamped : null,
                );
              }}
              label={t("editRow.primaryIncomeToggle")}
              className="items-center"
            />
            <p className="mt-2 text-xs text-muted">
              {t("editRow.primaryIncomeHelp")}
            </p>
            {isPrimaryIncome && (
              <label className="mt-3 flex flex-col gap-1">
                <span className="text-xs text-muted">
                  {t("editRow.primaryIncomeAnchorDay")}
                </span>
                <ClearableInput
                  type="number"
                  inputMode="numeric"
                  step={1}
                  min={1}
                  max={31}
                  value={anchorDayText}
                  onValueChange={(next) => {
                    setAnchorDayText(next);
                    const day = Number.parseInt(next, 10);
                    if (Number.isFinite(day) && day >= 1 && day <= 31) {
                      onSetSeriesPrimaryIncome(
                        row.seriesId as string,
                        true,
                        day,
                      );
                    }
                  }}
                  aria-label={t("editRow.primaryIncomeAnchorDay")}
                  wrapperClassName="min-w-0"
                  className="field-input w-24 min-w-0 rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-fg"
                />
              </label>
            )}
          </fieldset>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button variant="primary" onClick={handleSave}>
          {t("common.save")}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
