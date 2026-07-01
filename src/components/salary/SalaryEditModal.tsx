import { useEffect, useState } from "react";
import { Banknote } from "lucide-react";

import type { Employer, Salary, TaxParams } from "../../data/types";
import { resolveSalary } from "../../data/salary/salary";
import { useLang, useT } from "../../i18n";
import { formatMonthLabel, parseAmount } from "../../utils/format";
import {
  Button,
  ClearableInput,
  ClearableTextarea,
  FormSection,
} from "../form";
import { Modal } from "../Modal";
import { EmployerPicker } from "./EmployerPicker";

type Props = {
  open: boolean;
  salary: Salary | null;
  employers: readonly Employer[];
  // Tax params from the sheet's profile, or null for no estimation.
  taxParams: TaxParams | null;
  onClose: () => void;
  onSave: (salaryId: string, patch: Partial<Omit<Salary, "id">>) => void;
  onCreateEmployer: (employer: Employer) => void;
};

const NUMBER_INPUT_CLASS =
  "field-input w-full min-w-0 rounded border border-line bg-surface-2 px-2 py-1.5 text-right font-mono tabular-nums text-sm text-fg-bright";

// Parse a whole-day count from free text: non-negative integer, or
// undefined when blank / invalid (clears the field).
function parseDays(text: string): number | undefined {
  const trimmed = text.trim();
  if (trimmed === "") return undefined;
  const n = Math.floor(Number(trimmed));
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return n;
}

function daysText(n: number | undefined): string {
  return n === undefined ? "" : String(n);
}

// Round a derived gross / tax figure to at most two decimals. Typing one
// of gross / tax back-computes the other by adding / subtracting net;
// with decimal inputs that subtraction drifts into a long floating-point
// tail (0.3 - 0.1 → 0.19999999999999998), so we snap it to öre before it
// reaches the input.
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function SalaryEditModal({
  open,
  salary,
  employers,
  taxParams,
  onClose,
  onSave,
  onCreateEmployer,
}: Props) {
  const t = useT();
  const lang = useLang();

  const [grossText, setGrossText] = useState("");
  const [netText, setNetText] = useState("");
  const [taxText, setTaxText] = useState("");
  // Which of gross / tax the user last typed. The other is derived from it
  // plus net (gross = net + tax). On a net edit we recompute whichever the
  // user did NOT type, so their last figure stays put.
  const [driver, setDriver] = useState<"gross" | "tax">("gross");
  const [employerId, setEmployerId] = useState<string | undefined>(undefined);
  const [careOfChild, setCareOfChild] = useState("");
  const [parentalLeave, setParentalLeave] = useState("");
  const [vacation, setVacation] = useState("");
  const [sick, setSick] = useState("");
  const [note, setNote] = useState("");

  // Reseed the form whenever a new salary opens. Keyed on id + open so a
  // re-render mid-edit doesn't wipe the user's input.
  useEffect(() => {
    if (!open || !salary) return;
    setGrossText(salary.gross !== undefined ? String(salary.gross) : "");
    setNetText(String(salary.net));
    setTaxText(
      salary.gross !== undefined
        ? String(round2(salary.gross - salary.net))
        : "",
    );
    setDriver("gross");
    setEmployerId(salary.employerId);
    setCareOfChild(daysText(salary.careOfChildDays));
    setParentalLeave(daysText(salary.parentalLeaveDays));
    setVacation(daysText(salary.vacationDays));
    setSick(daysText(salary.sickDays));
    setNote(salary.note ?? "");
  }, [open, salary]);

  if (!salary) return null;

  const parsedNet = parseAmount(netText);
  const parsedGross = parseAmount(grossText);
  const net = parsedNet ?? salary.net;
  // Estimate gross from the currently-typed net via the tax profile, so the
  // gross and tax fields show live placeholders before the user types
  // either. Force estimation by dropping any stored gross on the synthetic
  // salary.
  const estimate = resolveSalary(
    { ...salary, net, gross: undefined },
    taxParams,
  );
  const estimatedGross = estimate.estimated ? estimate.gross : null;

  // Gross and tax are two views of the same figure, anchored on net:
  // gross = net + tax. Typing one recomputes the other; a net edit
  // recomputes whichever the user did not type so their input stays put.
  function syncTaxFromGross(grossStr: string, netStr: string) {
    const g = parseAmount(grossStr);
    const n = parseAmount(netStr);
    setTaxText(g !== null && n !== null ? String(round2(g - n)) : "");
  }
  function syncGrossFromTax(taxStr: string, netStr: string) {
    const tx = parseAmount(taxStr);
    const n = parseAmount(netStr);
    setGrossText(tx !== null && n !== null ? String(round2(n + tx)) : "");
  }
  function handleGrossChange(v: string) {
    setGrossText(v);
    setDriver("gross");
    syncTaxFromGross(v, netText);
  }
  function handleTaxChange(v: string) {
    setTaxText(v);
    setDriver("tax");
    syncGrossFromTax(v, netText);
  }
  function handleNetChange(v: string) {
    setNetText(v);
    if (driver === "tax") syncGrossFromTax(taxText, v);
    else syncTaxFromGross(grossText, v);
  }

  function handleSave() {
    if (!salary) return;
    const patch: Partial<Omit<Salary, "id">> = {
      net: parsedNet ?? salary.net,
      gross: parsedGross !== null ? parsedGross : undefined,
      employerId: employerId,
      careOfChildDays: parseDays(careOfChild),
      parentalLeaveDays: parseDays(parentalLeave),
      vacationDays: parseDays(vacation),
      sickDays: parseDays(sick),
      note: note.trim() !== "" ? note.trim() : undefined,
    };
    onSave(salary.id, patch);
    onClose();
  }

  const monthLabel = formatMonthLabel(salary.date.slice(0, 7), lang);

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="salary-edit-title"
      size="max-w-md"
    >
      <Modal.Header
        icon={<Banknote size={14} aria-hidden focusable={false} />}
        title={`${t("salary.editTitle")} · ${monthLabel}`}
        onClose={onClose}
      />
      <Modal.Body>
        <div className="flex flex-col gap-3">
          <FormSection label={t("salary.employer")}>
            <EmployerPicker
              value={employerId}
              employers={employers}
              onChange={setEmployerId}
              onCreate={onCreateEmployer}
            />
          </FormSection>

          <FormSection as="label" label={t("salary.grossLabel")}>
            <ClearableInput
              inputMode="decimal"
              value={grossText}
              onValueChange={handleGrossChange}
              placeholder={
                estimatedGross !== null ? String(estimatedGross) : undefined
              }
              className={NUMBER_INPUT_CLASS}
            />
            <span className="text-xs text-muted">
              {estimatedGross !== null && grossText.trim() === ""
                ? t("tax.estimatedTitle")
                : t("salary.grossHint")}
            </span>
          </FormSection>

          <FormSection as="label" label={t("salary.taxLabel")}>
            <ClearableInput
              inputMode="decimal"
              value={taxText}
              onValueChange={handleTaxChange}
              placeholder={
                estimatedGross !== null
                  ? String(round2(estimatedGross - net))
                  : undefined
              }
              className={NUMBER_INPUT_CLASS}
            />
            <span className="text-xs text-muted">
              {estimatedGross !== null && taxText.trim() === ""
                ? t("tax.estimatedTitle")
                : t("salary.taxHint")}
            </span>
          </FormSection>

          <FormSection as="label" label={t("salary.netLabel")}>
            <ClearableInput
              inputMode="decimal"
              value={netText}
              onValueChange={handleNetChange}
              className={NUMBER_INPUT_CLASS}
            />
            <span className="text-xs text-muted">{t("salary.netHint")}</span>
          </FormSection>

          <div className="grid grid-cols-2 gap-3">
            <FormSection as="label" label={t("salary.careOfChildDaysLabel")}>
              <ClearableInput
                inputMode="numeric"
                value={careOfChild}
                onValueChange={setCareOfChild}
                className={NUMBER_INPUT_CLASS}
              />
            </FormSection>
            <FormSection as="label" label={t("salary.parentalLeaveDaysLabel")}>
              <ClearableInput
                inputMode="numeric"
                value={parentalLeave}
                onValueChange={setParentalLeave}
                className={NUMBER_INPUT_CLASS}
              />
            </FormSection>
            <FormSection as="label" label={t("salary.vacationDaysLabel")}>
              <ClearableInput
                inputMode="numeric"
                value={vacation}
                onValueChange={setVacation}
                className={NUMBER_INPUT_CLASS}
              />
            </FormSection>
            <FormSection as="label" label={t("salary.sickDaysLabel")}>
              <ClearableInput
                inputMode="numeric"
                value={sick}
                onValueChange={setSick}
                className={NUMBER_INPUT_CLASS}
              />
            </FormSection>
          </div>

          <FormSection as="label" label={t("salary.noteLabel")}>
            <ClearableTextarea
              value={note}
              onValueChange={setNote}
              rows={2}
              placeholder={t("salary.notePlaceholder")}
              wrapperClassName="w-full"
              className="field-input w-full resize-none rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-fg"
            />
          </FormSection>
        </div>
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
