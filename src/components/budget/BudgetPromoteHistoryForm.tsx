import { useCallback, useMemo, useRef, useState } from "react";

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
import {
  useAutoTypeForCompany,
  useDesktopAutoFocus,
  useStandardColumns,
} from "../../hooks";
import { useT } from "../../i18n";
import { todayIso } from "../../utils/date";
import {
  formatAmount,
  formatAmountForInput,
  parseAmount,
} from "../../utils/format";
import { CompanyPicker } from "../CompanyPicker";
import { Modal } from "../Modal";
import { Button, Checkbox, ClearableInput } from "../form";
import { RecurrenceForm } from "../RecurrenceForm";
import { TypePicker } from "../TypePicker";
import { BudgetAmountSpanFields } from "./BudgetAmountSpanFields";
import {
  amountModeFromRow,
  resolveAmountSpan,
  spanInputStringsFromBounds,
  type AmountMode,
} from "./budget-amount-span";

// Prior merchant-hint label / type / company shared by past rows that
// normalise to this row's description. Lets the promote form open with
// the user's existing taxonomy choices instead of empty fields.
export type HistoryPromotePrefill = {
  description: string | null;
  typeId: string | null;
  companyId: string | null;
};

// Bank-history rows that normalise to the same merchant key as the
// row being promoted. Rendered as the historic-matches checklist so
// the user can opt individual rows out of the merchant-hint overlay.
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

// Payload submitted on history-row promotion: the validated future
// series + the historic-matches overlay decisions.
export type HistoryPromotion = {
  // User-typed label. Empty string clears any override; otherwise
  // overlays past + future history rows that normalise to the same
  // merchant key.
  description: string;
  amount: number;
  // Optional inclusive estimate band for a bill that varies within a
  // range (electricity, water, …). The estimate drives `amount`; the
  // bounds only widen what an imported bank amount may be and still
  // reconcile. Both present together or both absent — an exact promote
  // sends neither.
  amountMin?: number;
  amountMax?: number;
  typeId: string | null;
  // Company tagged on the promoted entry. Folded into the merchant-
  // hint alongside the type so future imports inherit both.
  companyId: string | null;
  // Explicit "omit company" decision. When true the minted rows are
  // flagged `noCompany` (mutually exclusive with `companyId`, held
  // empty here) and the merchant hint clears any company for the key.
  noCompany: boolean;
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

type Props = {
  open: boolean;
  row: Row;
  columns: Column[];
  categories: Category[];
  types: readonly EntryType[];
  companies: readonly Company[];
  // companyId → suggested typeId for the auto-fill. When the user
  // picks a company on a row whose type isn't set and the company has
  // a confident suggestion, the type picker auto-fills behind the
  // CompanyPicker. `companyTypeHints` is the companyId → ranked hint
  // typeIds map for the picker's "Suggested" band. See
  // `src/data/company-type-hints.ts`.
  companyTypeSuggestions: ReadonlyMap<string, string>;
  companyTypeHints: ReadonlyMap<string, readonly string[]>;
  settings: Settings;
  hintPrefill?: HistoryPromotePrefill | null;
  matches?: ReadonlyArray<HistoryMatchPreview>;
  onClose: () => void;
  onSubmit: (
    historyEntryId: string,
    rawDescription: string,
    promotion: HistoryPromotion,
  ) => void;
  onCreateType: (draft: Omit<EntryType, "id">) => EntryType;
  onCreateCategory: (draft: Omit<Category, "id">) => Category;
  onCreateCompany: (draft: Omit<Company, "id">) => Company;
};

export function BudgetPromoteHistoryForm({
  open,
  row,
  columns,
  categories,
  types,
  companies,
  companyTypeSuggestions,
  companyTypeHints,
  settings,
  hintPrefill,
  matches,
  onClose,
  onSubmit,
  onCreateType,
  onCreateCategory,
  onCreateCompany,
}: Props) {
  const t = useT();
  const { descCol, amountCol, dateCol } = useStandardColumns(columns);

  const rawCellDescription =
    descCol && typeof row.cells[descCol.id] === "string"
      ? (row.cells[descCol.id] as string)
      : "";
  // History rows seed their `description` cell from any existing
  // merchant-hint override (so the synthesized row already shows the
  // user's label). The promote modal wants to start the input from
  // the prior hint's label too, so a returning user can tweak rather
  // than retype — fall back to whatever the cell holds when no hint
  // applies.
  const initialDescription =
    hintPrefill?.description !== null && hintPrefill?.description !== undefined
      ? hintPrefill.description
      : rawCellDescription;
  const initialAmountText =
    amountCol && typeof row.cells[amountCol.id] === "number"
      ? formatAmountForInput(
          Math.abs(row.cells[amountCol.id] as number),
          settings,
        )
      : "";
  const initialNegative =
    amountCol && typeof row.cells[amountCol.id] === "number"
      ? (row.cells[amountCol.id] as number) <= 0
      : true;
  // Seed the estimate band from any bounds the source row already
  // carries (a historic row usually has none, so this defaults to the
  // "exact" single-amount input). The min / max strings are positive
  // magnitudes the shared sign re-signs on submit.
  const initialAmountMode = amountModeFromRow(row.amountMin, row.amountMax);
  const initialSpanStrings =
    row.amountMin !== undefined && row.amountMax !== undefined
      ? spanInputStringsFromBounds(row.amountMin, row.amountMax, settings)
      : { min: "", max: "" };
  const initialDate =
    dateCol && typeof row.cells[dateCol.id] === "string"
      ? (row.cells[dateCol.id] as string)
      : "";
  // Seed the type / company pickers from the row's already-resolved
  // taxonomy first (synthesis folds the entry's own `userTypeId` /
  // `userCompanyId`, then any match rule, then the merchant hint into
  // `row.typeId` / `row.companyId`), so editing a historic item that
  // already has a company and type connected opens with them pre-chosen.
  // Fall back to the bare merchant-hint prefill when the row carries
  // nothing resolved.
  const initialTypeId: string | null =
    row.typeId ?? hintPrefill?.typeId ?? null;
  const initialCompanyId: string | null =
    row.companyId ?? hintPrefill?.companyId ?? null;
  // Seed the "omit company" flag from the source row, but only when no
  // company resolved — a real company always wins over a stale omit.
  const initialNoCompany = initialCompanyId === null && row.noCompany === true;

  // Default seed for the recurrence form on history-row promotions:
  // first month on or after today whose day-of-month matches the
  // history entry's day. A Feb-26 charge promoted on May 27 lands
  // June 26; the same charge promoted on May 25 lands May 26.
  const historySeedDate = useMemo(
    () => nextOccurrenceWithSameDom(initialDate, todayIso()),
    [initialDate],
  );

  const [description, setDescription] = useState(initialDescription);
  const [amount, setAmount] = useState(initialAmountText);
  const [negative, setNegative] = useState(initialNegative);
  const [amountMode, setAmountMode] = useState<AmountMode>(initialAmountMode);
  const [amountMinText, setAmountMinText] = useState(initialSpanStrings.min);
  const [amountMaxText, setAmountMaxText] = useState(initialSpanStrings.max);
  const [typeId, setTypeId] = useState<string | null>(initialTypeId);
  const [companyId, setCompanyId] = useState<string | null>(initialCompanyId);
  // Explicit "omit company" flag — mutually exclusive with a picked
  // company (the CompanyPicker enforces the exclusivity as the user
  // toggles between them).
  const [noCompany, setNoCompany] = useState(initialNoCompany);
  // Wrap the company picker's onSelect so a confident company → type
  // pairing auto-fills the empty type. The user can still override
  // either field afterwards.
  const autoTypeForPickedCompany = useAutoTypeForCompany(
    typeId,
    companyTypeSuggestions,
  );
  const handlePickCompany = useCallback(
    (next: string | null) => {
      setCompanyId(next);
      const auto = autoTypeForPickedCompany(next);
      if (auto !== undefined) setTypeId(auto);
    },
    [autoTypeForPickedCompany],
  );

  const [recurringDates, setRecurringDates] = useState<string[]>([]);
  // Default to applying the metadata overlay to historic matches so
  // submitting without touching the checkbox stamps the hint.
  const [applyToHistoric, setApplyToHistoric] = useState(true);
  // HistoryEntry ids the user opted out of in the "Past matches"
  // list. Seeded from each match's existing `hintIgnored` flag on
  // open so re-opening the modal preserves prior exclusions.
  const [excludedHistoryIds, setExcludedHistoryIds] = useState<
    ReadonlySet<string>
  >(
    () =>
      new Set((matches ?? []).filter((m) => m.hintIgnored).map((m) => m.id)),
  );

  const descriptionRef = useRef<HTMLInputElement>(null);
  useDesktopAutoFocus(descriptionRef, open, row.id);

  const handleRuleChange = useCallback(
    (_rule: RecurrenceRule | null, dates: string[]) => {
      setRecurringDates(dates);
    },
    [],
  );

  const parsedAbs = parseAmount(amount);
  const parsedAmount =
    parsedAbs === null
      ? null
      : negative
        ? -Math.abs(parsedAbs)
        : Math.abs(parsedAbs);

  function toggleSign() {
    setNegative((s) => !s);
  }

  function handleSubmit() {
    if (row.kind !== "historic") return;
    if (parsedAmount === null) return;
    const span = resolveAmountSpan(
      amountMode,
      negative,
      amount,
      amountMinText,
      amountMaxText,
    );
    onSubmit(row.historyEntryId, rawCellDescription, {
      description: description.trim(),
      amount: parsedAmount,
      // Only attach a band when both bounds parsed (estimate mode).
      ...(span.amountMin !== null && span.amountMax !== null
        ? { amountMin: span.amountMin, amountMax: span.amountMax }
        : {}),
      typeId,
      companyId,
      noCompany,
      dates: recurringDates,
      applyToHistoric,
      excludedHistoryEntryIds: applyToHistoric
        ? Array.from(excludedHistoryIds)
        : [],
    });
  }

  const canSubmit = parsedAmount !== null && recurringDates.length > 0;

  return (
    <>
      <Modal.Body>
        <p className="mb-3 text-sm text-muted">
          {t("editEntry.promoteHistoryHint")}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-xs text-muted">{t("editEntry.company")}</span>
            <CompanyPicker
              variant="field"
              companies={companies}
              selectedId={companyId}
              noCompany={noCompany}
              onSelect={handlePickCompany}
              onOmitChange={setNoCompany}
              onCreate={onCreateCompany}
            />
          </div>
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
              hintTypeIds={
                companyId ? (companyTypeHints.get(companyId) ?? []) : []
              }
            />
          </div>
          <label className="flex flex-col gap-1 sm:col-span-2">
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
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-xs text-muted">{t("editEntry.amount")}</span>
            <BudgetAmountSpanFields
              mode={amountMode}
              onModeChange={setAmountMode}
              negative={negative}
              onToggleSign={toggleSign}
              amount={amount}
              onAmountChange={setAmount}
              min={amountMinText}
              onMinChange={setAmountMinText}
              max={amountMaxText}
              onMaxChange={setAmountMaxText}
              settings={settings}
              hideLabel
            />
          </div>
        </div>
        <div className="mt-4">
          <RecurrenceForm
            seedDate={historySeedDate}
            resetKey={row.id}
            includeOnce={false}
            onChange={handleRuleChange}
          />
        </div>
        {matches && matches.length > 0 ? (
          <fieldset className="mt-4 rounded border border-line bg-surface-3 p-3">
            <legend className="px-1 text-xs text-muted">
              {t("editEntry.historicMatchesTitle")}
            </legend>
            <Checkbox
              checked={applyToHistoric}
              onChange={setApplyToHistoric}
              label={
                matches.length === 1
                  ? t("editEntry.applyToHistoricLabelOne", {
                      n: matches.length,
                    })
                  : t("editEntry.applyToHistoricLabelOther", {
                      n: matches.length,
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
                  {matches.map((m) => {
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
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button variant="primary" onClick={handleSubmit} disabled={!canSubmit}>
          {(() => {
            const n = recurringDates.length;
            return n === 1
              ? t("editEntry.addFutureEntries", { n })
              : t("editEntry.addFutureEntriesPlural", { n });
          })()}
        </Button>
      </Modal.Footer>
    </>
  );
}
