import { useEffect, useState } from "react";
import { Banknote } from "lucide-react";

import type { Employer, Salary, Settings } from "../../data/types";
import { salaryTax } from "../../data/salary/salary";
import { useLang, useT } from "../../i18n";
import {
  formatBalance,
  formatMonthLabel,
  parseAmount,
} from "../../utils/format";
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
  settings: Settings;
  onClose: () => void;
  onSave: (salaryId: string, patch: Partial<Omit<Salary, "id">>) => void;
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

export function SalaryEditModal({
  open,
  salary,
  employers,
  settings,
  onClose,
  onSave,
}: Props) {
  const t = useT();
  const lang = useLang();

  const [grossText, setGrossText] = useState("");
  const [netText, setNetText] = useState("");
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
  // Live tax preview from the two amounts the user has typed.
  const previewTax =
    parsedGross !== null ? Math.max(0, parsedGross - net) : salaryTax(salary);

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
            />
          </FormSection>

          <FormSection as="label" label={t("salary.netLabel")}>
            <ClearableInput
              inputMode="decimal"
              value={netText}
              onValueChange={setNetText}
              className={NUMBER_INPUT_CLASS}
            />
            <span className="text-xs text-muted">{t("salary.netHint")}</span>
          </FormSection>

          <FormSection as="label" label={t("salary.grossLabel")}>
            <ClearableInput
              inputMode="decimal"
              value={grossText}
              onValueChange={setGrossText}
              className={NUMBER_INPUT_CLASS}
            />
            <span className="text-xs text-muted">{t("salary.grossHint")}</span>
          </FormSection>

          <div className="flex items-baseline justify-between gap-3 rounded border border-line bg-surface-2 px-2.5 py-2 text-sm">
            <span className="text-muted">{t("salary.taxLabel")}</span>
            <span className="font-mono tabular-nums text-fg-bright">
              {formatBalance(previewTax, settings)}
            </span>
          </div>

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
