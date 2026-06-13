import { useRef, useState } from "react";
import { Check, ChevronDown, Landmark, Plus, X } from "lucide-react";

import { resolveMonthlyAmortization } from "../../data/finance/amortization";
import { newId } from "../../data/sheet";
import type {
  Mortgage,
  MortgageAmortization,
  MortgageRateChange,
  Settings,
} from "../../data/types";
import { useResetOnOpen, type FloatingPlacement } from "../../hooks";
import { useT } from "../../i18n";
import {
  formatAmountForInput,
  formatBalance,
  parseAmount,
} from "../../utils/format";
import { FloatingPanel } from "../FloatingPanel";
import { Button, ClearableInput, DATE_INPUT_CLASS } from "../form";
import { Modal } from "../Modal";

// The payment-frequency presets offered in the editor, in months. Most loans
// charge monthly; the rest cover the common quarterly / semi-annual / annual
// cases. A loaded value outside this set still renders (via a generic label),
// it just isn't one of the quick picks.
const CADENCE_OPTIONS = [1, 3, 6, 12] as const;

// Create / edit one mortgage (loan) under a property — its name, loan
// terms, interest history, and amortisation. The bank account "Find
// payments" scans lives on the parent property, not here, so it's edited
// from the property editor instead.
//
// Not `centered`: the name field opens the soft keyboard.

type Props = {
  open: boolean;
  // The mortgage to edit, or null in create mode.
  mortgage: Mortgage | null;
  settings: Settings;
  onClose: () => void;
  onSubmit: (mortgageId: string, patch: Partial<Omit<Mortgage, "id">>) => void;
  onCreate: (mortgage: Mortgage) => void;
};

function seedAmount(value: number | undefined, settings: Settings): string {
  if (value === undefined) return "";
  return formatAmountForInput(Math.abs(value), settings);
}

// One editable interest-rate period: a (possibly blank) effective date and
// the rate as typed text.
type RateRow = { id: string; date: string; rate: string };

// Seed the rate-history editor: the stored history when present, else a
// single row carrying the legacy `interestRate` (or an empty starter row).
function seedRateRows(mortgage: Mortgage | null): RateRow[] {
  const history = mortgage?.rateHistory;
  if (history && history.length > 0)
    return history.map((rc) => ({
      id: rc.id,
      date: rc.date,
      rate: String(rc.rate),
    }));
  if (mortgage?.interestRate !== undefined)
    return [{ id: newId(), date: "", rate: String(mortgage.interestRate) }];
  return [{ id: newId(), date: "", rate: "" }];
}

export function MortgageEditorModal({
  open,
  mortgage,
  settings,
  onClose,
  onSubmit,
  onCreate,
}: Props) {
  const t = useT();
  const [name, setName] = useState("");
  const [loanAmount, setLoanAmount] = useState("");
  const [currentBalance, setCurrentBalance] = useState("");
  // Effective-dated interest rates, newest editing at the bottom. The most
  // recent by date is the current rate; a blank date marks the original.
  const [rateRows, setRateRows] = useState<RateRow[]>([]);
  const [rateChangeMonths, setRateChangeMonths] = useState("");
  const [nextRateChangeDate, setNextRateChangeDate] = useState("");
  const [amortMode, setAmortMode] = useState<"percent" | "fixed">("percent");
  const [amortValue, setAmortValue] = useState("");
  // How often amortisation + interest is charged, in months (1 = monthly).
  const [cadenceMonths, setCadenceMonths] = useState(1);
  const [cadenceOpen, setCadenceOpen] = useState(false);
  const [loanStartDate, setLoanStartDate] = useState("");

  useResetOnOpen(open, mortgage?.id ?? "__create__", () => {
    setName(mortgage?.name ?? "");
    setLoanAmount(seedAmount(mortgage?.loanAmount, settings));
    setCurrentBalance(seedAmount(mortgage?.currentBalance, settings));
    setRateRows(seedRateRows(mortgage));
    setRateChangeMonths(
      mortgage?.rateChangeMonths !== undefined
        ? String(mortgage.rateChangeMonths)
        : "",
    );
    setNextRateChangeDate(mortgage?.nextRateChangeDate ?? "");
    setCadenceMonths(mortgage?.paymentCadenceMonths ?? 1);
    setCadenceOpen(false);
    setLoanStartDate(mortgage?.loanStartDate ?? "");
    const amort = mortgage?.amortization;
    setAmortMode(amort?.mode ?? "percent");
    if (!amort) setAmortValue("");
    else if (amort.mode === "percent") setAmortValue(String(amort.percent));
    else setAmortValue(seedAmount(amort.amount, settings));
  });

  if (!open) return null;

  const trimmedName = name.trim();
  const canSubmit = trimmedName.length > 0;

  // Parse a non-negative number (amount, interest %, or month count), or
  // undefined when blank / unparseable so the field clears on save.
  function num(text: string): number | undefined {
    const parsed = parseAmount(text);
    return parsed === null ? undefined : Math.abs(parsed);
  }

  // Build the amortisation value for the active mode, or undefined when the
  // value is blank / unparseable so the field clears on save.
  function buildAmortization(): MortgageAmortization | undefined {
    const v = num(amortValue);
    if (v === undefined) return undefined;
    return amortMode === "percent"
      ? { mode: "percent", percent: v }
      : { mode: "fixed", amount: v };
  }

  // Collapse the rate rows into the current rate + an optional history.
  // A single original-rate row (blank date) is just a current rate, so it
  // stores `interestRate` only — no `rateHistory` clutter.
  function buildRateTerms(): {
    interestRate?: number;
    rateHistory?: MortgageRateChange[];
  } {
    const parsed = rateRows
      .map((r) => ({ id: r.id, date: r.date.trim(), rate: num(r.rate) }))
      .filter(
        (r): r is { id: string; date: string; rate: number } =>
          r.rate !== undefined,
      )
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    if (parsed.length === 0)
      return { interestRate: undefined, rateHistory: undefined };
    const interestRate = parsed[parsed.length - 1].rate;
    if (parsed.length === 1 && parsed[0].date === "")
      return { interestRate, rateHistory: undefined };
    return { interestRate, rateHistory: parsed };
  }

  function buildTerms(): Partial<Omit<Mortgage, "id">> {
    const { interestRate, rateHistory } = buildRateTerms();
    return {
      loanAmount: num(loanAmount),
      currentBalance: num(currentBalance),
      interestRate,
      rateHistory,
      rateChangeMonths: num(rateChangeMonths),
      nextRateChangeDate:
        nextRateChangeDate !== "" ? nextRateChangeDate : undefined,
      amortization: buildAmortization(),
      // Monthly is the default — store the cadence only when it differs, so a
      // plain monthly loan stays byte-clean.
      paymentCadenceMonths: cadenceMonths === 1 ? undefined : cadenceMonths,
      loanStartDate: loanStartDate !== "" ? loanStartDate : undefined,
    };
  }

  function updateRateRow(id: string, patch: Partial<Omit<RateRow, "id">>) {
    setRateRows((rows) =>
      rows.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    );
  }
  function addRateRow() {
    setRateRows((rows) => [...rows, { id: newId(), date: "", rate: "" }]);
  }
  function removeRateRow(id: string) {
    setRateRows((rows) => rows.filter((r) => r.id !== id));
  }

  function handleSubmit() {
    if (!canSubmit) return;
    if (mortgage) {
      onSubmit(mortgage.id, {
        name: trimmedName,
        ...buildTerms(),
      });
      return;
    }
    // Create mode: drop every `undefined` so the new mortgage is byte-clean
    // (absent optional fields aren't stored).
    const fresh: Mortgage = {
      id: newId(),
      name: trimmedName,
      payments: [],
    };
    const terms = buildTerms();
    if (terms.loanAmount !== undefined) fresh.loanAmount = terms.loanAmount;
    if (terms.currentBalance !== undefined)
      fresh.currentBalance = terms.currentBalance;
    if (terms.interestRate !== undefined)
      fresh.interestRate = terms.interestRate;
    if (terms.rateHistory !== undefined) fresh.rateHistory = terms.rateHistory;
    if (terms.rateChangeMonths !== undefined)
      fresh.rateChangeMonths = terms.rateChangeMonths;
    if (terms.nextRateChangeDate !== undefined)
      fresh.nextRateChangeDate = terms.nextRateChangeDate;
    if (terms.amortization !== undefined)
      fresh.amortization = terms.amortization;
    if (terms.paymentCadenceMonths !== undefined)
      fresh.paymentCadenceMonths = terms.paymentCadenceMonths;
    if (terms.loanStartDate !== undefined)
      fresh.loanStartDate = terms.loanStartDate;
    onCreate(fresh);
  }

  const fieldClass =
    "field-input w-full min-w-0 rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-fg";

  // Live preview of the resolved monthly amortisation, reusing the same
  // resolver the card and data layer use. `null` when there's nothing to
  // show yet (blank value, or percent mode without a loan amount to take
  // the percentage of).
  const amortValueNum = num(amortValue);
  const amortPreview =
    amortValueNum === undefined
      ? null
      : resolveMonthlyAmortization({
          id: "",
          name: "",
          payments: [],
          loanAmount: num(loanAmount),
          amortization:
            amortMode === "percent"
              ? { mode: "percent", percent: amortValueNum }
              : { mode: "fixed", amount: amortValueNum },
        });

  return (
    <Modal
      open
      onClose={onClose}
      labelledBy="mortgage-editor-modal-title"
      size="max-w-sm"
    >
      <Modal.Header
        icon={<Landmark size={14} aria-hidden focusable={false} />}
        title={
          mortgage
            ? t("properties.editMortgageTitle")
            : t("properties.newMortgageTitle")
        }
        onClose={onClose}
      />
      <Modal.Body>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">
              {t("properties.mortgageNameLabel")}
            </span>
            <ClearableInput
              value={name}
              onValueChange={setName}
              placeholder={t("properties.mortgageNamePlaceholder")}
              className={fieldClass}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">
              {t("properties.loanAmountLabel")}
            </span>
            <ClearableInput
              value={loanAmount}
              onValueChange={setLoanAmount}
              inputMode="decimal"
              placeholder={t("properties.loanAmountPlaceholder")}
              className={fieldClass}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">
              {t("properties.currentBalanceLabel")}
            </span>
            <ClearableInput
              value={currentBalance}
              onValueChange={setCurrentBalance}
              inputMode="decimal"
              placeholder={t("properties.currentBalancePlaceholder")}
              className={fieldClass}
            />
          </label>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-muted">
              {t("properties.interestRateLabel")}
            </span>
            <div className="flex flex-col gap-1.5">
              {rateRows.map((row) => (
                <div key={row.id} className="flex items-center gap-1.5">
                  <input
                    type="date"
                    value={row.date}
                    onChange={(e) =>
                      updateRateRow(row.id, { date: e.target.value })
                    }
                    aria-label={t("properties.rateChangeDateLabel")}
                    className={DATE_INPUT_CLASS}
                  />
                  <ClearableInput
                    value={row.rate}
                    onValueChange={(v) => updateRateRow(row.id, { rate: v })}
                    inputMode="decimal"
                    placeholder={t("properties.interestRatePlaceholder")}
                    aria-label={t("properties.rateChangeRateLabel")}
                    className={`${fieldClass} flex-1`}
                  />
                  {rateRows.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeRateRow(row.id)}
                      aria-label={t("properties.removeRateChange")}
                      className="cursor-pointer rounded border-0 bg-transparent p-1 text-muted hover:text-danger"
                    >
                      <X size={14} aria-hidden focusable={false} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addRateRow}
              className="inline-flex cursor-pointer items-center gap-1 self-start rounded border-0 bg-transparent px-1 text-xs text-accent hover:underline"
            >
              <Plus size={14} aria-hidden focusable={false} />
              {t("properties.addRateChange")}
            </button>
            <p className="m-0 text-xs text-muted">
              {t("properties.rateHistoryHint")}
            </p>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">
              {t("properties.rateChangeMonthsLabel")}
            </span>
            <ClearableInput
              value={rateChangeMonths}
              onValueChange={setRateChangeMonths}
              inputMode="numeric"
              placeholder={t("properties.rateChangeMonthsPlaceholder")}
              className={fieldClass}
            />
            <p className="m-0 text-xs text-muted">
              {t("properties.rateChangeMonthsHint")}
            </p>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">
              {t("properties.nextRateChangeLabel")}
            </span>
            <input
              type="date"
              value={nextRateChangeDate}
              onChange={(e) => setNextRateChangeDate(e.target.value)}
              className={DATE_INPUT_CLASS}
            />
          </label>

          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted">
              {amortMode === "percent"
                ? t("properties.amortizationYearlyLabel")
                : t("properties.amortizationLabel")}
            </span>
            <div className="flex rounded border border-line bg-surface-2 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setAmortMode("percent")}
                aria-pressed={amortMode === "percent"}
                className={`flex-1 cursor-pointer rounded px-2 py-1 ${
                  amortMode === "percent"
                    ? "bg-accent text-page-bg"
                    : "bg-transparent text-muted hover:text-fg"
                }`}
              >
                {t("properties.amortModePercent")}
              </button>
              <button
                type="button"
                onClick={() => setAmortMode("fixed")}
                aria-pressed={amortMode === "fixed"}
                className={`flex-1 cursor-pointer rounded px-2 py-1 ${
                  amortMode === "fixed"
                    ? "bg-accent text-page-bg"
                    : "bg-transparent text-muted hover:text-fg"
                }`}
              >
                {t("properties.amortModeFixed")}
              </button>
            </div>
            <ClearableInput
              value={amortValue}
              onValueChange={setAmortValue}
              inputMode="decimal"
              placeholder={
                amortMode === "percent"
                  ? t("properties.amortPercentPlaceholder")
                  : t("properties.amortFixedPlaceholder")
              }
              className={fieldClass}
            />
            {amortPreview !== null ? (
              <p className="m-0 text-xs text-muted">
                {t("properties.amortPreview", {
                  amount: formatBalance(amortPreview, settings, {
                    neverAbbreviate: true,
                  }),
                })}
              </p>
            ) : (
              <p className="m-0 text-xs text-muted">
                {amortMode === "percent"
                  ? t("properties.amortPercentHint")
                  : t("properties.amortFixedHint")}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted">
              {t("properties.cadenceLabel")}
            </span>
            <CadencePicker
              value={cadenceMonths}
              open={cadenceOpen}
              onToggle={() => setCadenceOpen((v) => !v)}
              onClose={() => setCadenceOpen(false)}
              onPick={(months) => {
                setCadenceMonths(months);
                setCadenceOpen(false);
              }}
            />
            <p className="m-0 text-xs text-muted">
              {t("properties.cadenceHint")}
            </p>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">
              {t("properties.loanStartLabel")}
            </span>
            <input
              type="date"
              value={loanStartDate}
              onChange={(e) => setLoanStartDate(e.target.value)}
              className={DATE_INPUT_CLASS}
            />
            <p className="m-0 text-xs text-muted">
              {t("properties.loanStartHint")}
            </p>
          </label>
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button variant="primary" onClick={handleSubmit} disabled={!canSubmit}>
          {mortgage ? t("properties.save") : t("properties.create")}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

const CADENCE_PICKER_PLACEMENT: FloatingPlacement = {
  // minPx 0 ⇒ the panel grows to the trigger's width and no wider.
  width: { kind: "min", minPx: 0 },
  anchor: "left",
  coordinateSpace: "viewport",
};

// A custom dropdown for the payment frequency — never a native <select>, per
// the project's picker convention. Offers the common presets; a loaded value
// outside the presets still reads via the generic "Every {n} months" label.
function CadencePicker({
  value,
  open,
  onToggle,
  onClose,
  onPick,
}: {
  value: number;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  onPick: (months: number) => void;
}) {
  const t = useT();
  const triggerRef = useRef<HTMLDivElement>(null);
  const label = (months: number): string => {
    switch (months) {
      case 1:
        return t("properties.cadenceMonthly");
      case 3:
        return t("properties.cadenceQuarterly");
      case 6:
        return t("properties.cadenceSemiAnnual");
      case 12:
        return t("properties.cadenceAnnual");
      default:
        return t("properties.cadenceEveryN", { n: months });
    }
  };
  // Surface a non-preset loaded value as an extra option so it stays selectable.
  const options = CADENCE_OPTIONS.includes(
    value as (typeof CADENCE_OPTIONS)[number],
  )
    ? CADENCE_OPTIONS
    : [...CADENCE_OPTIONS, value];
  return (
    <div ref={triggerRef} className="relative">
      <button
        type="button"
        onClick={onToggle}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="field-input flex w-full cursor-pointer items-center gap-2 rounded border border-line bg-surface-2 px-2 py-1.5 text-left text-sm text-fg hover:border-accent focus-visible:outline-none"
      >
        <span className="flex-1 truncate">{label(value)}</span>
        <ChevronDown size={14} className="shrink-0 text-muted" aria-hidden />
      </button>
      <FloatingPanel
        open={open}
        onClose={onClose}
        triggerRef={triggerRef}
        placement={CADENCE_PICKER_PLACEMENT}
      >
        <ul role="listbox" className="max-h-64 overflow-auto py-1">
          {options.map((months) => (
            <li key={months}>
              <button
                type="button"
                role="option"
                aria-selected={months === value}
                onClick={() => onPick(months)}
                className="flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-3 py-2 text-left text-sm text-fg hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
              >
                <span className="flex-1 truncate">{label(months)}</span>
                {months === value && (
                  <Check size={14} className="text-accent" aria-hidden />
                )}
              </button>
            </li>
          ))}
        </ul>
      </FloatingPanel>
    </div>
  );
}
