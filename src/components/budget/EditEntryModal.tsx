import { useCallback, useMemo, useRef, useState } from "react";
import { Pencil } from "lucide-react";

import { unlock } from "../../data/achievements";
import { findColumnByType } from "../../data/sheet";
import { nextOccurrenceWithSameDom } from "../../data/recurrence";
import type { RecurrenceRule } from "../../data/recurrence";
import type {
  Category,
  Column,
  Company,
  EntryType,
  Row,
  Settings,
} from "../../data/types";
import { useDesktopAutoFocus, useResetOnOpen } from "../../hooks";
import { useT } from "../../i18n";
import {
  formatAmount,
  formatAmountForInput,
  parseAmount,
} from "../../utils/format";
import { CompanyPicker } from "../CompanyPicker";
import { Modal } from "../Modal";
import {
  Button,
  Checkbox,
  ClearableInput,
  Radio,
  RadioGroup,
  SignedAmountInput,
} from "../form";
import { RecurrenceForm } from "./RecurrenceForm";
import { TypePicker } from "../TypePicker";

type Props = {
  open: boolean;
  row: Row | null;
  columns: Column[];
  categories: Category[];
  types: readonly EntryType[];
  companies: readonly Company[];
  settings: Settings;
  // Last known date in the same series — defaults the "until" date when
  // editing a series row. `null` if this row isn't part of a series.
  lastSeriesDate: string | null;
  // For history rows: an existing merchant hint that matches the row's
  // normalised description, used to pre-fill the category / type /
  // user description on the promote form so a returning user doesn't
  // retype labels they've already taught the app. Null when no hint
  // exists or the row isn't a history row.
  historyHintPrefill?: HistoryPromotePrefill | null;
  // For regular row promotions: bank-history entries on the same
  // account whose normalised description matches this row's. Shown
  // alongside the future-recurrence preview so the user can see what
  // past entries will adopt the typed label, and rendered greyed-out
  // because they're already settled — they get backfilled with the
  // tag and description via the merchant-hint store, not by minting
  // new rows.
  historyMatches?: ReadonlyArray<HistoryMatchPreview>;
  onClose: () => void;
  onConvertToRecurring: (
    rowId: string,
    dates: string[],
    typeId: string | null,
    companyId: string | null,
  ) => void;
  onEditSeries: (rowId: string, patch: EditPatch, scope: EditScope) => void;
  // Fires when the user submits the promote form on a synthesized
  // history row. The reducer mints the future series, stamps the
  // merchant hint so past entries display under the same label, and
  // records the category memory.
  onPromoteHistory: (
    historyEntryId: string,
    rawDescription: string,
    promotion: HistoryPromotion,
  ) => void;
  onCreateType: (draft: Omit<EntryType, "id">) => EntryType;
  onCreateCategory: (draft: Omit<Category, "id">) => Category;
  onCreateCompany: (draft: Omit<Company, "id">) => Company;
};

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export type HistoryPromotePrefill = {
  description: string | null;
  typeId: string | null;
  companyId: string | null;
};

export type HistoryMatchPreview = {
  id: string;
  date: string;
  description: string;
  amount: number;
  // Pre-existing per-entry opt-out from the merchant-hint overlay.
  // Set on prior submissions of this modal so the row renders
  // unchecked (excluded) when the user re-opens the promote flow for
  // the same merchant key.
  hintIgnored?: boolean;
};

export type HistoryPromotion = {
  // User-typed label. Empty string clears any override; otherwise
  // overlays past + future history rows that normalise to the same
  // merchant key.
  description: string;
  amount: number;
  typeId: string | null;
  // Company tagged on the promoted entry. Folded into the merchant-
  // hint alongside the type so future imports inherit both.
  companyId: string | null;
  dates: string[];
  // When false, the merchant-hint stamp is skipped so past entries
  // that share the merchant key keep their raw bank text. The future
  // series is still minted either way.
  applyToHistoric: boolean;
  // HistoryEntry ids that the user opted out of in the "Past matches"
  // list. The reducer stamps `hintIgnored: true` on each so the
  // synthesizer keeps its raw bank text while the remaining matches
  // adopt the new label. Ignored when `applyToHistoric` is false.
  excludedHistoryEntryIds: readonly string[];
};

export type { EditPatch, EditScope } from "../../data/action-payloads";
import type { EditPatch, EditScope } from "../../data/action-payloads";

export function EditEntryModal({
  open,
  row,
  columns,
  categories,
  types,
  companies,
  settings,
  lastSeriesDate,
  historyHintPrefill,
  historyMatches,
  onClose,
  onConvertToRecurring,
  onEditSeries,
  onPromoteHistory,
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

  const isHistory = !!row?.historyEntryId;

  const rawCellDescription =
    descCol && row && typeof row.cells[descCol.id] === "string"
      ? (row.cells[descCol.id] as string)
      : "";
  // History rows seed their `description` cell from any existing
  // merchant-hint override (so the synthesized row already shows the
  // user's label). The promote modal wants to start the input from
  // the prior hint's label too, so a returning user can tweak rather
  // than retype — fall back to whatever the cell holds when no hint
  // applies.
  const initialDescription =
    isHistory &&
    historyHintPrefill?.description !== null &&
    historyHintPrefill?.description !== undefined
      ? historyHintPrefill.description
      : rawCellDescription;
  const initialAmountText =
    amountCol && row && typeof row.cells[amountCol.id] === "number"
      ? formatAmountForInput(
          Math.abs(row.cells[amountCol.id] as number),
          settings,
        )
      : "";
  // Sign lives on a +/- toggle button; default to negative when no amount
  // is set, otherwise mirror the stored sign (treating 0 as negative too).
  const initialNegative =
    amountCol && row && typeof row.cells[amountCol.id] === "number"
      ? (row.cells[amountCol.id] as number) <= 0
      : true;
  const initialDate =
    dateCol && row && typeof row.cells[dateCol.id] === "string"
      ? (row.cells[dateCol.id] as string)
      : "";
  const initialTypeId: string | null = isHistory
    ? (historyHintPrefill?.typeId ?? null)
    : (row?.typeId ?? null);
  const initialCompanyId: string | null = isHistory
    ? (historyHintPrefill?.companyId ?? null)
    : (row?.companyId ?? null);

  const isSeries = !!row?.seriesId;

  // Default seed for the recurrence form on history-row promotions:
  // first month on or after today whose day-of-month matches the
  // history entry's day. A Feb-26 charge promoted on May 27 lands
  // June 26; the same charge promoted on May 25 lands May 26.
  const historySeedDate = useMemo(
    () => (isHistory ? nextOccurrenceWithSameDom(initialDate, todayIso()) : ""),
    [isHistory, initialDate],
  );

  const [description, setDescription] = useState(initialDescription);
  const [amount, setAmount] = useState(initialAmountText);
  const [negative, setNegative] = useState(initialNegative);
  const [typeId, setTypeId] = useState<string | null>(initialTypeId);
  const [companyId, setCompanyId] = useState<string | null>(initialCompanyId);

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

  const [recurringDates, setRecurringDates] = useState<string[]>([]);
  const [recurrenceResetKey, setRecurrenceResetKey] = useState(0);
  // Default to applying the metadata overlay to historic matches so
  // the legacy behaviour (always stamp the hint) is preserved when
  // the user opens and submits without touching the checkbox.
  const [applyToHistoric, setApplyToHistoric] = useState(true);
  // HistoryEntry ids the user opted out of in the "Past matches"
  // list. Seeded from each match's existing `hintIgnored` flag on
  // open so re-opening the modal preserves prior exclusions.
  const [excludedHistoryIds, setExcludedHistoryIds] = useState<
    ReadonlySet<string>
  >(() => new Set());

  const descriptionRef = useRef<HTMLInputElement>(null);
  useDesktopAutoFocus(descriptionRef, open && !!row, row?.id);

  useResetOnOpen(open, row?.id, () => {
    setDescription(initialDescription);
    setAmount(initialAmountText);
    setNegative(initialNegative);
    setTypeId(initialTypeId);
    setCompanyId(initialCompanyId);
    setScopeKind("just-this");
    setUntilEnabled(false);
    setUntilDate(lastSeriesDate ?? initialDate ?? "");
    setShiftDaysText("0");
    setRecurringDates([]);
    setRecurrenceResetKey((k) => k + 1);
    setApplyToHistoric(true);
    setExcludedHistoryIds(
      new Set(
        (historyMatches ?? []).filter((m) => m.hintIgnored).map((m) => m.id),
      ),
    );
  });

  const handleRuleChange = useCallback(
    (_rule: RecurrenceRule | null, dates: string[]) => {
      setRecurringDates(dates);
    },
    [],
  );

  if (!open || !row) return null;

  const parsedAbs = parseAmount(amount);
  const parsedAmount =
    parsedAbs === null
      ? null
      : negative
        ? -Math.abs(parsedAbs)
        : Math.abs(parsedAbs);
  const amountTouched =
    amount !== initialAmountText || negative !== initialNegative;

  function toggleSign() {
    setNegative((s) => !s);
  }

  const typeTouched = typeId !== initialTypeId;
  const companyTouched = companyId !== initialCompanyId;

  const parsedShiftDays = Number.parseInt(shiftDaysText, 10);
  const shiftDays =
    Number.isFinite(parsedShiftDays) && parsedShiftDays !== 0
      ? parsedShiftDays
      : 0;

  function handleSaveEdit() {
    if (!row) return;
    if (shiftDays !== 0) unlock("dateShifter");
    onEditSeries(
      row.id,
      {
        description: description.trim(),
        amount: amountTouched ? parsedAmount : null,
        typeId: typeTouched ? typeId : undefined,
        companyId: companyTouched ? companyId : undefined,
        dateShiftDays: shiftDays !== 0 ? shiftDays : undefined,
      },
      scopeKind === "just-this"
        ? { kind: "just-this" }
        : { kind: "future", untilIso: untilEnabled ? untilDate : null },
    );
  }

  function handleConvert() {
    if (!row) return;
    // Drop the seed date itself if the recurrence includes it — that row
    // already exists, the reducer dedupes anyway, but doing it here keeps
    // the action payload minimal.
    const extras = recurringDates.filter((d) => d !== initialDate);
    if (extras.length === 0) return;
    onConvertToRecurring(row.id, extras, typeId, companyId);
  }

  function handlePromoteHistory() {
    if (!row || !row.historyEntryId) return;
    if (parsedAmount === null) return;
    onPromoteHistory(row.historyEntryId, rawCellDescription, {
      description: description.trim(),
      amount: parsedAmount,
      typeId,
      companyId,
      dates: recurringDates,
      applyToHistoric,
      excludedHistoryEntryIds: applyToHistoric
        ? Array.from(excludedHistoryIds)
        : [],
    });
  }

  const canPromoteHistory =
    isHistory && parsedAmount !== null && recurringDates.length > 0;

  return (
    <Modal
      open={open && !!row}
      onClose={onClose}
      labelledBy="edit-entry-title"
      size="max-w-2xl"
    >
      <Modal.Header
        icon={<Pencil size={14} aria-hidden focusable={false} />}
        title={
          isSeries
            ? t("editEntry.titleEditSeries")
            : isHistory
              ? t("editEntry.titlePromoteHistory")
              : t("editEntry.titlePromote")
        }
        onClose={onClose}
      />
      <Modal.Body>
        {isSeries ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
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
              <div className="flex flex-col gap-1 sm:col-span-2">
                <span className="text-xs text-muted">
                  {t("editEntry.type")}
                </span>
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
                <span className="text-xs text-muted">
                  {t("editEntry.company")}
                </span>
                <CompanyPicker
                  variant="field"
                  companies={companies}
                  selectedId={companyId}
                  onSelect={setCompanyId}
                  onCreate={onCreateCompany}
                />
              </div>
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
                />
              </label>
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
                <Radio
                  value="future"
                  label={t("editEntry.scopeThisAndFuture")}
                />
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
          </>
        ) : isHistory ? (
          <>
            <p className="mb-3 text-sm text-muted">
              {t("editEntry.promoteHistoryHint")}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 sm:col-span-2">
                <span className="text-xs text-muted">
                  {t("editEntry.description")}
                </span>
                <ClearableInput
                  key={row.id}
                  ref={descriptionRef}
                  value={description}
                  onValueChange={setDescription}
                  className="field-input w-full min-w-0 rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-fg"
                />
              </label>
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
                />
              </label>
              <div className="flex flex-col gap-1 sm:col-span-2">
                <span className="text-xs text-muted">
                  {t("editEntry.type")}
                </span>
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
                <span className="text-xs text-muted">
                  {t("editEntry.company")}
                </span>
                <CompanyPicker
                  variant="field"
                  companies={companies}
                  selectedId={companyId}
                  onSelect={setCompanyId}
                  onCreate={onCreateCompany}
                />
              </div>
            </div>
            <div className="mt-4">
              <RecurrenceForm
                seedDate={historySeedDate}
                resetKey={recurrenceResetKey}
                includeOnce={false}
                onChange={handleRuleChange}
              />
            </div>
            {historyMatches && historyMatches.length > 0 ? (
              <fieldset className="mt-4 rounded border border-line bg-surface-3 p-3">
                <legend className="px-1 text-xs text-muted">
                  {t("editEntry.historicMatchesTitle")}
                </legend>
                <Checkbox
                  checked={applyToHistoric}
                  onChange={setApplyToHistoric}
                  label={
                    historyMatches.length === 1
                      ? t("editEntry.applyToHistoricLabelOne", {
                          n: historyMatches.length,
                        })
                      : t("editEntry.applyToHistoricLabelOther", {
                          n: historyMatches.length,
                        })
                  }
                  description={t("editEntry.applyToHistoricDescription")}
                />
                {applyToHistoric && (
                  <>
                    <p className="mt-3 text-xs text-muted">
                      {t("editEntry.excludeHistoricHint")}
                    </p>
                    <ul className="mt-2 flex max-h-48 flex-col gap-1 overflow-y-auto rounded border border-line bg-surface p-2 font-mono text-xs">
                      {historyMatches.map((m) => {
                        const included = !excludedHistoryIds.has(m.id);
                        return (
                          <li key={m.id}>
                            <Checkbox
                              checked={included}
                              onChange={(next) => {
                                setExcludedHistoryIds((prev) => {
                                  const out = new Set(prev);
                                  if (next) out.delete(m.id);
                                  else out.add(m.id);
                                  return out;
                                });
                              }}
                              className="w-full"
                              ariaLabel={t("editEntry.excludeHistoricAria", {
                                date: m.date,
                                description: m.description,
                              })}
                              label={
                                <span
                                  className={`flex items-baseline gap-2 ${
                                    included ? "" : "opacity-50"
                                  }`}
                                >
                                  <span className="text-path tabular-nums">
                                    {m.date}
                                  </span>
                                  <span
                                    className={`min-w-0 flex-1 truncate ${
                                      included
                                        ? "text-fg"
                                        : "text-muted line-through"
                                    }`}
                                  >
                                    {m.description}
                                  </span>
                                  <span className="tabular-nums text-meta">
                                    {formatAmount(m.amount, settings)}
                                  </span>
                                </span>
                              }
                            />
                          </li>
                        );
                      })}
                    </ul>
                  </>
                )}
              </fieldset>
            ) : (
              <p className="mt-3 rounded border border-line bg-surface-3 p-2 text-xs text-muted">
                {t("editEntry.promoteHistoryFooter")}
              </p>
            )}
          </>
        ) : (
          <>
            <p className="mb-3 text-sm text-muted">
              {t("editEntry.promoteIntro")}
            </p>
            <div className="mb-4 flex flex-col gap-1">
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
            <div className="mb-4 flex flex-col gap-1">
              <span className="text-xs text-muted">
                {t("editEntry.company")}
              </span>
              <CompanyPicker
                variant="field"
                companies={companies}
                selectedId={companyId}
                onSelect={setCompanyId}
                onCreate={onCreateCompany}
              />
            </div>
            <RecurrenceForm
              seedDate={initialDate}
              resetKey={recurrenceResetKey}
              includeOnce={false}
              historicDates={historyMatches?.map((m) => m.date)}
              onChange={handleRuleChange}
            />
            {historyMatches && historyMatches.length > 0 && (
              <p className="mt-3 rounded border border-line bg-surface-3 p-2 text-xs text-muted">
                {historyMatches.length === 1
                  ? t("editEntry.promoteBackfillOne", {
                      n: historyMatches.length,
                    })
                  : t("editEntry.promoteBackfillOther", {
                      n: historyMatches.length,
                    })}
              </p>
            )}
          </>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        {isSeries ? (
          <Button variant="primary" onClick={handleSaveEdit}>
            {t("common.save")}
          </Button>
        ) : isHistory ? (
          <Button
            variant="primary"
            onClick={handlePromoteHistory}
            disabled={!canPromoteHistory}
          >
            {(() => {
              const n = recurringDates.length;
              return n === 1
                ? t("editEntry.addFutureEntries", { n })
                : t("editEntry.addFutureEntriesPlural", { n });
            })()}
          </Button>
        ) : (
          <Button
            variant="primary"
            onClick={handleConvert}
            disabled={
              recurringDates.filter((d) => d !== initialDate).length === 0
            }
          >
            {(() => {
              const n = recurringDates.filter((d) => d !== initialDate).length;
              return n === 1
                ? t("editEntry.addFutureEntries", { n })
                : t("editEntry.addFutureEntriesPlural", { n });
            })()}
          </Button>
        )}
      </Modal.Footer>
    </Modal>
  );
}
