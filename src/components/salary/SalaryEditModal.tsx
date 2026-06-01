import { useEffect, useRef, useState } from "react";
import { Banknote, FileText } from "lucide-react";

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
  onCreateEmployer: (employer: Employer) => void;
  // Payslip attachment — gated on a storage backend that advertises the
  // `payslips` capability (folder + cloud). When `onUploadPayslip` is
  // absent the section is hidden entirely (the field is left untouched
  // on save); when it's present but `canUploadPayslip` is false, a hint
  // explains how to switch backends.
  canUploadPayslip?: boolean;
  onUploadPayslip?: (file: File) => Promise<string>;
  onViewPayslip?: (path: string) => Promise<void>;
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
  onCreateEmployer,
  canUploadPayslip = false,
  onUploadPayslip,
  onViewPayslip,
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

  // Payslip path is committed onto the salary on Save (mirrors the
  // budget receipt flow). `undefined` means "no payslip"; the upload
  // itself writes the file immediately and hands back the stored path.
  const [payslipPath, setPayslipPath] = useState<string | undefined>(
    salary?.payslipPath,
  );
  const [payslipBusy, setPayslipBusy] = useState(false);
  const [payslipError, setPayslipError] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    setPayslipPath(salary.payslipPath);
    setPayslipBusy(false);
    setPayslipError(false);
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
    // Only touch the payslip field when the section was available;
    // otherwise leave whatever was stored untouched. An explicit
    // `undefined` clears it (the reducer deletes the key).
    if (onUploadPayslip) patch.payslipPath = payslipPath;
    onSave(salary.id, patch);
    onClose();
  }

  async function handlePayslipPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset so picking the same file again still fires onChange.
    e.target.value = "";
    if (!file || !onUploadPayslip) return;
    setPayslipBusy(true);
    setPayslipError(false);
    try {
      const path = await onUploadPayslip(file);
      setPayslipPath(path);
    } catch {
      setPayslipError(true);
    } finally {
      setPayslipBusy(false);
    }
  }

  async function handleViewPayslip() {
    if (!payslipPath || !onViewPayslip) return;
    setPayslipError(false);
    try {
      await onViewPayslip(payslipPath);
    } catch {
      setPayslipError(true);
    }
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

          {onUploadPayslip && (
            <div className="flex flex-col gap-2 rounded border border-line bg-surface-3 p-3">
              <span className="text-xs text-muted">{t("salary.payslip")}</span>
              {!canUploadPayslip ? (
                <p className="text-xs text-muted">
                  {t("salary.payslipUnsupported")}
                </p>
              ) : (
                <>
                  {payslipPath !== undefined && (
                    <div className="flex items-center gap-2">
                      <FileText
                        size={14}
                        aria-hidden
                        focusable={false}
                        className="shrink-0 text-muted"
                      />
                      <span className="min-w-0 flex-1 truncate text-sm text-fg">
                        {payslipPath}
                      </span>
                      <button
                        type="button"
                        onClick={handleViewPayslip}
                        className="cursor-pointer rounded border border-line px-2 py-1 text-xs text-muted hover:border-accent hover:text-accent"
                      >
                        {t("salary.payslipView")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setPayslipPath(undefined)}
                        className="cursor-pointer rounded border border-line px-2 py-1 text-xs text-muted hover:border-danger hover:text-danger"
                      >
                        {t("salary.payslipRemove")}
                      </button>
                    </div>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={handlePayslipPicked}
                    className="hidden"
                  />
                  <button
                    type="button"
                    disabled={payslipBusy}
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex cursor-pointer items-center gap-1 self-start rounded border border-line px-2.5 py-1 text-xs text-muted hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {payslipBusy
                      ? t("salary.payslipUploading")
                      : payslipPath !== undefined
                        ? t("salary.payslipReplace")
                        : t("salary.payslipUpload")}
                  </button>
                  {payslipError && (
                    <p className="text-xs text-danger">
                      {t("salary.payslipError")}
                    </p>
                  )}
                </>
              )}
            </div>
          )}
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
