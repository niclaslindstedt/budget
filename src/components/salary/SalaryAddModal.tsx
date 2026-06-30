import { useState } from "react";
import { Banknote } from "lucide-react";

import { resolveSalary } from "../../data/salary/salary";
import { newId } from "../../data/sheet";
import type { Employer, Salary, TaxParams } from "../../data/types";
import { useResetOnOpen } from "../../hooks";
import { useT } from "../../i18n";
import { todayIso } from "../../utils/date";
import { parseAmount } from "../../utils/format";
import {
  Button,
  ClearableInput,
  ClearableTextarea,
  DATE_INPUT_CLASS,
  FormSection,
} from "../form";
import { Modal } from "../Modal";
import { EmployerPicker } from "./EmployerPicker";

// The manual "add a payslip" form — a salary with NO backing bank transaction,
// for paychecks older than the imported bank history reaches (or never seen by
// the ledger). The "Find salaries" discovery walk covers history-backed
// paychecks; this is the from-scratch path, so it leaves `sourceHistoryId` /
// `sourceRowId` absent. Mirrors `SalaryEditModal`'s field set (net / gross /
// absence-day counts / note) plus a pay-date picker, since a manual entry has
// no transaction date to inherit.
//
// Not `centered`: the net / gross / note fields open the soft keyboard, so the
// modal keeps the default fullscreen-on-mobile layout whose visual-viewport
// math keeps the footer above the keyboard.

type Props = {
  open: boolean;
  employers: readonly Employer[];
  // Tax params from the sheet's profile, or null for no estimation.
  taxParams: TaxParams | null;
  onClose: () => void;
  onAdd: (salary: Salary) => void;
  onCreateEmployer: (employer: Employer) => void;
};

const NUMBER_INPUT_CLASS =
  "field-input w-full min-w-0 rounded border border-line bg-surface-2 px-2 py-1.5 text-right font-mono tabular-nums text-sm text-fg-bright";

// Parse a whole-day count from free text: non-negative integer, or undefined
// when blank / invalid (leaves the field unset).
function parseDays(text: string): number | undefined {
  const trimmed = text.trim();
  if (trimmed === "") return undefined;
  const n = Math.floor(Number(trimmed));
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return n;
}

export function SalaryAddModal({
  open,
  employers,
  taxParams,
  onClose,
  onAdd,
  onCreateEmployer,
}: Props) {
  const t = useT();

  const [date, setDate] = useState("");
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

  useResetOnOpen(open, "add", () => {
    setDate(todayIso());
    setGrossText("");
    setNetText("");
    setTaxText("");
    setDriver("gross");
    setEmployerId(undefined);
    setCareOfChild("");
    setParentalLeave("");
    setVacation("");
    setSick("");
    setNote("");
  });

  if (!open) return null;

  const parsedNet = parseAmount(netText);
  const parsedGross = parseAmount(grossText);
  const net = parsedNet !== null ? Math.abs(parsedNet) : 0;
  const canSubmit = parsedNet !== null && net > 0 && date !== "";

  // Estimate gross from the typed net via the tax profile, so the gross and
  // tax fields show live placeholders before the user types either.
  const estimate = resolveSalary(
    { id: "draft", date: date || todayIso(), net, gross: undefined },
    taxParams,
  );
  const estimatedGross = estimate.estimated ? estimate.gross : null;

  // Gross and tax are two views of the same figure, anchored on net:
  // gross = net + tax. Typing one recomputes the other; a net edit
  // recomputes whichever the user did not type so their input stays put.
  function syncTaxFromGross(grossStr: string, netStr: string) {
    const g = parseAmount(grossStr);
    const n = parseAmount(netStr);
    setTaxText(
      g !== null && n !== null ? String(Math.abs(g) - Math.abs(n)) : "",
    );
  }
  function syncGrossFromTax(taxStr: string, netStr: string) {
    const tx = parseAmount(taxStr);
    const n = parseAmount(netStr);
    setGrossText(tx !== null && n !== null ? String(Math.abs(n) + tx) : "");
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

  function handleAdd() {
    if (!canSubmit || parsedNet === null) return;
    const salary: Salary = { id: newId(), date, net };
    if (parsedGross !== null) salary.gross = Math.abs(parsedGross);
    if (employerId) salary.employerId = employerId;
    const careOfChildDays = parseDays(careOfChild);
    if (careOfChildDays !== undefined) salary.careOfChildDays = careOfChildDays;
    const parentalLeaveDays = parseDays(parentalLeave);
    if (parentalLeaveDays !== undefined)
      salary.parentalLeaveDays = parentalLeaveDays;
    const vacationDays = parseDays(vacation);
    if (vacationDays !== undefined) salary.vacationDays = vacationDays;
    const sickDays = parseDays(sick);
    if (sickDays !== undefined) salary.sickDays = sickDays;
    const trimmedNote = note.trim();
    if (trimmedNote !== "") salary.note = trimmedNote;
    onAdd(salary);
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="salary-add-title"
      size="max-w-md"
    >
      <Modal.Header
        icon={<Banknote size={14} aria-hidden focusable={false} />}
        title={t("salary.addTitle")}
        onClose={onClose}
      />
      <Modal.Body>
        <div className="flex flex-col gap-3">
          <FormSection as="label" label={t("salary.payDateLabel")}>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={DATE_INPUT_CLASS}
            />
            <span className="text-xs text-muted">
              {t("salary.payDateHint")}
            </span>
          </FormSection>

          <FormSection label={t("salary.employer")}>
            <EmployerPicker
              value={employerId}
              employers={employers}
              onChange={setEmployerId}
              onCreate={onCreateEmployer}
            />
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
                  ? String(estimatedGross - net)
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
        <Button variant="primary" onClick={handleAdd} disabled={!canSubmit}>
          {t("salary.addPayslip")}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
