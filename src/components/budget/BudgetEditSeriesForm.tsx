import { useCallback, useMemo, useState } from "react";

import { unlock } from "../../data/achievements";
import type { EditPatch, EditScope } from "../../data/action-payloads";
import { autoTypeForCompany } from "../../data/budget/company-type-suggestions";
import { findColumnByType } from "../../data/sheet";
import type {
  Category,
  Column,
  Company,
  EntryType,
  Row,
  Settings,
} from "../../data/types";
import { useT } from "../../i18n";
import { formatAmountForInput } from "../../utils/format";
import { parseInt32 } from "../../utils/parse";
import { CompanyPicker } from "../CompanyPicker";
import { Modal } from "../Modal";
import { Button, Checkbox, ClearableInput, Radio, RadioGroup } from "../form";
import { TypePicker } from "../TypePicker";
import { BudgetAmountSpanFields } from "./BudgetAmountSpanFields";
import {
  amountModeFromRow,
  resolveAmountSpan,
  spanInputStringsFromBounds,
} from "./budget-amount-span";

type Props = {
  row: Row;
  columns: Column[];
  categories: Category[];
  types: readonly EntryType[];
  companies: readonly Company[];
  // companyId → suggested typeId for the auto-fill. When the user
  // picks a company on a row whose type isn't set and the company has
  // a confident suggestion, the type picker auto-fills behind the
  // CompanyPicker.
  companyTypeSuggestions: ReadonlyMap<string, string>;
  settings: Settings;
  // Last known date in the same series — defaults the "until" date when
  // editing a series row.
  lastSeriesDate: string | null;
  onClose: () => void;
  onSubmit: (rowId: string, patch: EditPatch, scope: EditScope) => void;
  onCreateType: (draft: Omit<EntryType, "id">) => EntryType;
  onCreateCategory: (draft: Omit<Category, "id">) => Category;
  onCreateCompany: (draft: Omit<Company, "id">) => Company;
};

export function BudgetEditSeriesForm({
  row,
  columns,
  categories,
  types,
  companies,
  companyTypeSuggestions,
  settings,
  lastSeriesDate,
  onClose,
  onSubmit,
  onCreateType,
  onCreateCategory,
  onCreateCompany,
}: Props) {
  const t = useT();
  const descCol = useMemo(
    () => findColumnByType(columns, "description"),
    [columns],
  );
  const amountCol = useMemo(
    () => findColumnByType(columns, "amount"),
    [columns],
  );
  const dateCol = useMemo(() => findColumnByType(columns, "date"), [columns]);

  const initialDescription =
    descCol && typeof row.cells[descCol.id] === "string"
      ? (row.cells[descCol.id] as string)
      : "";
  const initialAmountText =
    amountCol && typeof row.cells[amountCol.id] === "number"
      ? formatAmountForInput(
          Math.abs(row.cells[amountCol.id] as number),
          settings,
        )
      : "";
  // Sign lives on a +/- toggle button; default to negative when no amount
  // is set, otherwise mirror the stored sign (treating 0 as negative too).
  const initialNegative =
    amountCol && typeof row.cells[amountCol.id] === "number"
      ? (row.cells[amountCol.id] as number) <= 0
      : true;
  const initialDate =
    dateCol && typeof row.cells[dateCol.id] === "string"
      ? (row.cells[dateCol.id] as string)
      : "";
  const initialTypeId: string | null = row.typeId ?? null;
  const initialCompanyId: string | null = row.companyId ?? null;
  const initialAmountMode = amountModeFromRow(row.amountMin, row.amountMax);
  const initialBand =
    row.amountMin !== undefined && row.amountMax !== undefined
      ? spanInputStringsFromBounds(row.amountMin, row.amountMax, settings)
      : { min: "", max: "" };

  const [description, setDescription] = useState(initialDescription);
  const [amount, setAmount] = useState(initialAmountText);
  const [negative, setNegative] = useState(initialNegative);
  const [amountMode, setAmountMode] = useState(initialAmountMode);
  const [amountMin, setAmountMin] = useState(initialBand.min);
  const [amountMax, setAmountMax] = useState(initialBand.max);
  const [typeId, setTypeId] = useState<string | null>(initialTypeId);
  const [companyId, setCompanyId] = useState<string | null>(initialCompanyId);
  // Wrap the company picker's onSelect so a confident company → type
  // pairing auto-fills the empty type. The user can still override
  // either field afterwards.
  const handlePickCompany = useCallback(
    (next: string | null) => {
      setCompanyId(next);
      const auto = autoTypeForCompany(typeId, next, companyTypeSuggestions);
      if (auto !== undefined) setTypeId(auto);
    },
    [typeId, companyTypeSuggestions],
  );

  // "Just this" vs "this and all future"; the latter optionally clamped
  // to a date so temporary price changes can revert later.
  const [scopeKind, setScopeKind] = useState<"just-this" | "future">(
    "just-this",
  );
  const [untilEnabled, setUntilEnabled] = useState(false);
  const [untilDate, setUntilDate] = useState(
    lastSeriesDate ?? initialDate ?? "",
  );

  // Signed day-offset applied to every row in the scope. Lets the
  // user nudge a series whose anchor day was off (e.g. landed on day
  // 24 but should be day 25). Stored as a string so the user can
  // type a leading `-`, an empty input, or transient state without
  // the field snapping back to a parsed number.
  const [shiftDaysText, setShiftDaysText] = useState("0");

  const amountTouched =
    amount !== initialAmountText || negative !== initialNegative;
  const bandTouched =
    amountMode !== initialAmountMode ||
    amountMin !== initialBand.min ||
    amountMax !== initialBand.max;

  const typeTouched = typeId !== initialTypeId;
  const companyTouched = companyId !== initialCompanyId;

  const parsedShiftDays = parseInt32(shiftDaysText);
  const shiftDays =
    parsedShiftDays !== null && parsedShiftDays !== 0 ? parsedShiftDays : 0;

  function toggleSign() {
    setNegative((s) => !s);
  }

  function handleSubmit() {
    if (shiftDays !== 0) unlock("dateShifter");
    const span = resolveAmountSpan(
      amountMode,
      negative,
      amount,
      amountMin,
      amountMax,
    );
    onSubmit(
      row.id,
      {
        description: description.trim(),
        amount: amountTouched ? span.amount : null,
        // `undefined` leaves bounds untouched; `null` clears to exact;
        // numbers set the band. Only send when the band inputs changed.
        amountMin: bandTouched ? span.amountMin : undefined,
        amountMax: bandTouched ? span.amountMax : undefined,
        typeId: typeTouched ? typeId : undefined,
        companyId: companyTouched ? companyId : undefined,
        dateShiftDays: shiftDays !== 0 ? shiftDays : undefined,
      },
      scopeKind === "just-this"
        ? { kind: "just-this" }
        : { kind: "future", untilIso: untilEnabled ? untilDate : null },
    );
  }

  return (
    <>
      <Modal.Body>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-xs text-muted">{t("editEntry.type")}</span>
            <TypePicker
              variant="field"
              types={types}
              categories={categories}
              selectedId={typeId}
              onSelect={setTypeId}
              onCreate={onCreateType}
              onCreateCategory={onCreateCategory}
            />
          </div>
          <div className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-xs text-muted">{t("editEntry.company")}</span>
            <CompanyPicker
              variant="field"
              companies={companies}
              selectedId={companyId}
              onSelect={handlePickCompany}
              onCreate={onCreateCompany}
            />
          </div>
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-xs text-muted">
              {t("editEntry.description")}
            </span>
            <ClearableInput
              value={description}
              onValueChange={setDescription}
              className="field-input w-full min-w-0 rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-fg"
            />
          </label>
          <div className="flex min-w-0 flex-col gap-1">
            <BudgetAmountSpanFields
              mode={amountMode}
              onModeChange={setAmountMode}
              negative={negative}
              onToggleSign={toggleSign}
              amount={amount}
              onAmountChange={setAmount}
              min={amountMin}
              onMinChange={setAmountMin}
              max={amountMax}
              onMaxChange={setAmountMax}
              settings={settings}
            />
          </div>
          <label className="flex min-w-0 flex-col gap-1">
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
        </div>

        <fieldset className="mt-5 rounded border border-line bg-surface-3 p-3">
          <legend className="px-1 text-xs text-muted">
            {t("editEntry.scope")}
          </legend>
          <RadioGroup
            name="edit-scope"
            value={scopeKind}
            onChange={(v) => setScopeKind(v as "just-this" | "future")}
          >
            <Radio
              value="just-this"
              label={t("editEntry.scopeJustThisDate", {
                date: initialDate || t("editEntry.noDate"),
              })}
            />
            <Radio value="future" label={t("editEntry.scopeThisAndFuture")} />
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
        </fieldset>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button variant="primary" onClick={handleSubmit}>
          {t("common.save")}
        </Button>
      </Modal.Footer>
    </>
  );
}
