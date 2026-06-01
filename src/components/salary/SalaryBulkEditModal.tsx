import { useEffect, useState } from "react";
import { ListChecks } from "lucide-react";

import type { Employer } from "../../data/types";
import { useT } from "../../i18n";
import { Button, Checkbox, ClearableInput } from "../form";
import { Modal } from "../Modal";
import { EmployerPicker } from "./EmployerPicker";

export type SalaryBulkApply = {
  setEmployer: boolean;
  employerId: string | undefined;
  setRole: boolean;
  // Trimmed at apply; an empty title clears the role on every selected
  // salary instead of assigning one.
  roleTitle: string;
  setTaxRate: boolean;
  // Fraction of gross (0..1), derived from the percent the user typed.
  rate: number;
};

type Props = {
  open: boolean;
  count: number;
  employers: readonly Employer[];
  onClose: () => void;
  onApply: (args: SalaryBulkApply) => void;
};

export function SalaryBulkEditModal({
  open,
  count,
  employers,
  onClose,
  onApply,
}: Props) {
  const t = useT();
  const [employerEnabled, setEmployerEnabled] = useState(false);
  const [employerId, setEmployerId] = useState<string | undefined>(undefined);
  const [roleEnabled, setRoleEnabled] = useState(false);
  const [roleText, setRoleText] = useState("");
  const [taxEnabled, setTaxEnabled] = useState(false);
  const [taxText, setTaxText] = useState("");

  useEffect(() => {
    if (!open) return;
    setEmployerEnabled(false);
    setEmployerId(undefined);
    setRoleEnabled(false);
    setRoleText("");
    setTaxEnabled(false);
    setTaxText("");
  }, [open]);

  const percent = Number(taxText.replace(",", "."));
  const taxValid = Number.isFinite(percent) && percent >= 0 && percent < 100;
  const canApply =
    (employerEnabled || roleEnabled || (taxEnabled && taxValid)) && count > 0;

  function handleApply() {
    onApply({
      setEmployer: employerEnabled,
      employerId,
      setRole: roleEnabled,
      roleTitle: roleText.trim(),
      setTaxRate: taxEnabled && taxValid,
      rate: taxValid ? percent / 100 : 0,
    });
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="salary-bulk-title"
      size="max-w-lg"
    >
      <Modal.Header
        icon={<ListChecks size={14} aria-hidden focusable={false} />}
        title={t("salary.bulkTitle", { count: String(count) })}
        onClose={onClose}
      />
      <Modal.Body>
        <Toggle
          label={t("salary.bulkEmployerToggle")}
          enabled={employerEnabled}
          onToggle={setEmployerEnabled}
        >
          <EmployerPicker
            value={employerId}
            employers={employers}
            onChange={setEmployerId}
          />
        </Toggle>

        <Toggle
          label={t("salary.bulkRoleToggle")}
          enabled={roleEnabled}
          onToggle={setRoleEnabled}
          hint={t("salary.bulkRoleHint")}
        >
          <ClearableInput
            value={roleText}
            onValueChange={setRoleText}
            placeholder={t("salary.bulkRolePlaceholder")}
            className="field-input w-full rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-fg"
          />
        </Toggle>

        <Toggle
          label={t("salary.bulkTaxRateToggle")}
          enabled={taxEnabled}
          onToggle={setTaxEnabled}
          hint={t("salary.bulkTaxRateHint")}
        >
          <div className="flex items-center gap-2">
            <ClearableInput
              inputMode="decimal"
              value={taxText}
              onValueChange={setTaxText}
              placeholder={t("salary.bulkTaxRatePlaceholder")}
              className="field-input w-24 min-w-0 rounded border border-line bg-surface-2 px-2 py-1.5 text-right font-mono tabular-nums text-sm text-fg-bright"
            />
            <span className="text-sm text-muted">%</span>
          </div>
        </Toggle>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button variant="primary" onClick={handleApply} disabled={!canApply}>
          {t("salary.apply")}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

// Bordered "enable this change" fieldset, mirroring the budget mass-edit
// modal: a checkbox in the legend gates a dimmed body until it's ticked.
function Toggle({
  label,
  enabled,
  onToggle,
  hint,
  children,
}: {
  label: string;
  enabled: boolean;
  onToggle: (next: boolean) => void;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="mt-3 rounded border border-line bg-surface-3 p-3">
      <legend className="px-1">
        <Checkbox
          checked={enabled}
          onChange={onToggle}
          label={label}
          className="items-center"
        />
      </legend>
      {hint && <p className="mb-2 text-xs text-muted">{hint}</p>}
      <div
        className={enabled ? "" : "pointer-events-none opacity-50 select-none"}
        aria-hidden={!enabled}
      >
        {children}
      </div>
    </fieldset>
  );
}
