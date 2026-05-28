import { useCallback, useMemo, useReducer, useRef } from "react";
import { Pencil } from "lucide-react";

import { sortRowsByDate } from "../../data/budget/rows";
import { autoTypeForCompany } from "../../data/company-type-suggestions";
import { findColumnByType } from "../../data/sheet";
import type {
  Category,
  Column,
  Company,
  EntryType,
  Row,
  SeriesMetadata,
  Settings,
} from "../../data/types";
import { useDesktopAutoFocus, useResetOnOpen } from "../../hooks";
import { useT } from "../../i18n";
import { formatAmount, formatShortDate, parseAmount } from "../../utils/format";
import { parseInt32 } from "../../utils/parse";
import { Checkbox, Button, ClearableInput, Radio, RadioGroup } from "../form";
import { CompanyPicker } from "../CompanyPicker";
import { Modal } from "../Modal";
import { TypePicker } from "../TypePicker";
import { BudgetAmountSpanFields } from "./BudgetAmountSpanFields";
import { resolveAmountSpan } from "./budget-amount-span";
import {
  budgetEditEntryFullModalReducer,
  initialEditFullState,
} from "./budget-edit-entry-full-modal-reducer";

// Generic editor for a single budget row. Opened by long-pressing a row
// or pressing the pen action button. Edits date, description, amount,
// type, and completed in one place — separate from `BudgetEditEntryModal`,
// which owns the recurring-series promote flow.
//
// For rows that are part of a recurring series, a scope picker mirrors
// `BudgetEditEntryModal`'s "just this" / "this and all future" toggle. The
// scope only applies to the series-wide fields (description, amount,
// type) — date and completed are inherently per-occurrence and always
// land on the anchor row regardless of scope.

type Props = {
  open: boolean;
  row: Row | null;
  columns: Column[];
  categories: readonly Category[];
  types: readonly EntryType[];
  companies: readonly Company[];
  // companyId → suggested typeId for the auto-fill. See
  // `computeCompanyTypeSuggestions` in `src/data/company-type-suggestions.ts`.
  companyTypeSuggestions: ReadonlyMap<string, string>;
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
  onCreateCompany: (draft: Omit<Company, "id">) => Company;
};

export type EditRowPatch = {
  description: string;
  // `null` = leave the amount untouched (user cleared the field on a
  // row that already had a number); otherwise the new signed value.
  amount: number | null;
  date: string;
  typeId: string | null;
  // `undefined` = don't touch the row's company; `null` = clear it;
  // a string sets the companyId.
  companyId: string | null | undefined;
  // `undefined` = don't touch; `true` flags the row as an inter-
  // account transfer; `false` clears the flag.
  isTransfer: boolean | undefined;
  completed: boolean;
  // Signed day-offset applied to every row in the chosen series
  // scope. Lets the user nudge a recurring series whose anchor day
  // was off (e.g. landed on day 24 but should be day 25). 0 means
  // "leave dates alone".
  dateShiftDays: number;
  // Optional signed estimate band. `undefined` leaves the row's range
  // untouched; `null` clears it back to an exact row; a number sets the
  // bound. Both bounds move together.
  amountMin: number | null | undefined;
  amountMax: number | null | undefined;
};

export type EditRowScope =
  | { kind: "just-this" }
  | { kind: "future"; untilIso: string | null }
  // Whole-series scope. The modal locks the amount input out under
  // this scope — changing the amount on past, already-reconciled
  // occurrences would silently rewrite history.
  | { kind: "all" };

export function BudgetEditEntryFullModal({
  open,
  row,
  columns,
  categories,
  types,
  companies,
  companyTypeSuggestions,
  settings,
  lastSeriesDate,
  seriesRows,
  seriesMetadata,
  onClose,
  onSave,
  onSetSeriesPrimaryIncome,
  onCreateType,
  onCreateCategory,
  onCreateCompany,
}: Props) {
  const t = useT();
  const dateCol = useMemo(() => findColumnByType(columns, "date"), [columns]);
  const amountCol = useMemo(
    () => findColumnByType(columns, "amount"),
    [columns],
  );
  const descCol = useMemo(
    () => findColumnByType(columns, "description"),
    [columns],
  );
  const completedCol = useMemo(
    () => findColumnByType(columns, "completed"),
    [columns],
  );

  // Snapshot the props into a single initial state. The `useReducer`
  // initialiser captures the first snapshot at mount; `useResetOnOpen`
  // dispatches a `reset` carrying a fresh snapshot when the row id
  // changes. The same snapshot is used as the reference point for the
  // "touched" comparisons in `handleSave`.
  const initialState = useMemo(
    () =>
      initialEditFullState(
        row,
        columns,
        settings,
        seriesMetadata,
        lastSeriesDate,
      ),
    [row, columns, settings, seriesMetadata, lastSeriesDate],
  );

  const isSeries = !!row?.seriesId;

  const [state, dispatch] = useReducer(
    budgetEditEntryFullModalReducer,
    initialState,
  );
  const {
    description,
    amount,
    negative,
    amountMode,
    amountMin,
    amountMax,
    date,
    typeId,
    companyId,
    isTransfer,
    completed,
    isPrimaryIncome,
    anchorDayText,
    scopeKind,
    untilEnabled,
    untilDate,
    shiftDaysText,
  } = state;

  const handlePickCompany = useCallback(
    (next: string | null) => {
      const auto = autoTypeForCompany(typeId, next, companyTypeSuggestions);
      dispatch({ kind: "pickCompany", companyId: next, autoTypeId: auto });
    },
    [typeId, companyTypeSuggestions],
  );

  const descriptionRef = useRef<HTMLInputElement>(null);
  useDesktopAutoFocus(descriptionRef, open && !!row, row?.id);

  useResetOnOpen(open, row?.id, () => {
    dispatch({ kind: "reset", state: initialState });
  });

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
    const anchorDate = initialState.date;
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
    initialState.date,
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
  // Whether this row reads as income — drives the gate on the
  // primary-income toggle below. A row is income when its sign toggle
  // says positive OR when its typeId resolves to a `kind: "income"`
  // type. An already-flagged series stays visible even on a negative
  // amount so the user can clear the flag without flipping the sign.
  const selectedType = typeId ? types.find((tt) => tt.id === typeId) : null;
  const isIncomeRow = !negative || selectedType?.kind === "income";
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
    dispatch({ kind: "toggleNegative" });
  }

  const parsedShiftDays = parseInt32(shiftDaysText);
  const shiftDays = parsedShiftDays ?? 0;

  function handleSave() {
    if (!row) return;
    // "all" scope explicitly skips the amount — the input is disabled
    // in the UI so the user can see why, but force-null it here too
    // in case anything ever bypasses the disabled state.
    const span = resolveAmountSpan(
      amountMode,
      negative,
      amount,
      amountMin,
      amountMax,
    );
    const skipAmount = scopeKind === "all";
    const patchAmount = skipAmount ? null : span.amount;
    // `null` clears any existing band back to exact; the bounds ride the
    // same disabled-under-"all"-scope rule as the amount.
    const patchMin = skipAmount ? undefined : span.amountMin;
    const patchMax = skipAmount ? undefined : span.amountMax;
    const companyTouched = companyId !== initialState.companyId;
    const transferTouched = isTransfer !== initialState.isTransfer;
    onSave(
      row.id,
      {
        description: description.trim(),
        amount: patchAmount,
        amountMin: patchMin,
        amountMax: patchMax,
        date,
        typeId,
        companyId: companyTouched ? companyId : undefined,
        isTransfer: transferTouched ? isTransfer : undefined,
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
              onValueChange={(v) =>
                dispatch({ kind: "setDescription", value: v })
              }
              className="field-input w-full min-w-0 rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-fg"
            />
          </label>
          {dateCol && (
            <label className="flex min-w-0 flex-col gap-1">
              <span className="text-xs text-muted">{t("budget.date")}</span>
              <input
                type="date"
                value={date}
                onChange={(e) =>
                  dispatch({ kind: "setDate", value: e.target.value })
                }
                className="field-input min-w-0 rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-path"
              />
            </label>
          )}
          {amountCol && (
            <div className="flex min-w-0 flex-col gap-1">
              <BudgetAmountSpanFields
                mode={amountMode}
                onModeChange={(v) =>
                  dispatch({ kind: "setAmountMode", value: v })
                }
                negative={negative}
                onToggleSign={toggleSign}
                amount={amount}
                onAmountChange={(v) =>
                  dispatch({ kind: "setAmount", value: v })
                }
                min={amountMin}
                onMinChange={(v) =>
                  dispatch({ kind: "setAmountMin", value: v })
                }
                max={amountMax}
                onMaxChange={(v) =>
                  dispatch({ kind: "setAmountMax", value: v })
                }
                settings={settings}
                disabled={scopeKind === "all"}
              />
              {scopeKind === "all" && (
                <span className="text-xs text-muted">
                  {t("editRow.scopeAllAmountDisabled")}
                </span>
              )}
            </div>
          )}
          <div className="col-span-2 flex flex-col gap-1">
            <span className="text-xs text-muted">{t("editEntry.type")}</span>
            <TypePicker
              variant="field"
              types={types}
              categories={categories}
              selectedId={typeId}
              onSelect={(v) => dispatch({ kind: "setTypeId", value: v })}
              onCreate={onCreateType}
              onCreateCategory={onCreateCategory}
              amountSign={pickerSign}
            />
          </div>
          <div className="col-span-2 flex flex-col gap-1">
            <span className="text-xs text-muted">{t("editEntry.company")}</span>
            <CompanyPicker
              variant="field"
              companies={companies}
              selectedId={companyId}
              onSelect={handlePickCompany}
              onCreate={onCreateCompany}
            />
          </div>
          <div className="col-span-2">
            <Checkbox
              checked={isTransfer}
              onChange={(v) => dispatch({ kind: "setIsTransfer", value: v })}
              label={t("editRow.isTransfer")}
              className="items-center"
            />
          </div>
          {completedCol && (
            <div className="col-span-2">
              <Checkbox
                checked={completed}
                onChange={(v) => dispatch({ kind: "setCompleted", value: v })}
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
                dispatch({
                  kind: "setScopeKind",
                  value: v as "just-this" | "future" | "all",
                })
              }
            >
              <Radio
                value="just-this"
                label={t("editRow.scopeJustThisDate", {
                  date: initialState.date || t("editEntry.noDate"),
                })}
              />
              <Radio value="future" label={t("editRow.scopeThisAndFuture")} />
              {scopeKind === "future" && (
                <div className="ml-6 mt-1 flex flex-col gap-1.5 rounded border border-line bg-surface px-2.5 py-2 text-xs text-muted">
                  <Checkbox
                    checked={untilEnabled}
                    onChange={(v) =>
                      dispatch({ kind: "setUntilEnabled", value: v })
                    }
                    label={t("editEntry.stopAfterDate")}
                    className="items-center"
                  />
                  {untilEnabled && (
                    <input
                      type="date"
                      value={untilDate}
                      onChange={(e) =>
                        dispatch({
                          kind: "setUntilDate",
                          value: e.target.value,
                        })
                      }
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
                onValueChange={(v) =>
                  dispatch({ kind: "setShiftDaysText", value: v })
                }
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

        {isSeries &&
          onSetSeriesPrimaryIncome &&
          row?.seriesId &&
          (isIncomeRow || isPrimaryIncome) && (
            <fieldset className="mt-5 rounded border border-line bg-surface-3 p-3">
              <legend className="px-1 text-xs text-muted">
                {t("editRow.primaryIncomeTitle")}
              </legend>
              <Checkbox
                checked={isPrimaryIncome}
                onChange={(next) => {
                  dispatch({ kind: "setIsPrimaryIncome", value: next });
                  const day = parseInt32(anchorDayText);
                  const dayClamped =
                    day !== null && day >= 1 && day <= 31 ? day : 25;
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
                      dispatch({ kind: "setAnchorDayText", value: next });
                      const day = parseInt32(next);
                      if (day !== null && day >= 1 && day <= 31) {
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
