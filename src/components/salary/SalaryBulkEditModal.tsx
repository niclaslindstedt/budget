import { useEffect, useState } from "react";
import { Layers } from "lucide-react";

import type { Employer } from "../../data/types";
import { useT } from "../../i18n";
import { Button, Checkbox, ClearableInput, FormSection } from "../form";
import { Modal } from "../Modal";
import { EmployerPicker } from "./EmployerPicker";

export type SalaryBulkApply = {
  setEmployer: boolean;
  employerId: string | undefined;
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
  const [taxEnabled, setTaxEnabled] = useState(false);
  const [taxText, setTaxText] = useState("");

  useEffect(() => {
    if (!open) return;
    setEmployerEnabled(false);
    setEmployerId(undefined);
    setTaxEnabled(false);
    setTaxText("");
  }, [open]);

  const percent = Number(taxText.replace(",", "."));
  const taxValid = Number.isFinite(percent) && percent >= 0 && percent < 100;
  const canApply = (employerEnabled || (taxEnabled && taxValid)) && count > 0;

  function handleApply() {
    onApply({
      setEmployer: employerEnabled,
      employerId,
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
      size="max-w-md"
    >
      <Modal.Header
        icon={<Layers size={14} aria-hidden focusable={false} />}
        title={t("salary.bulkTitle", { count: String(count) })}
        onClose={onClose}
      />
      <Modal.Body>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Checkbox
              checked={employerEnabled}
              onChange={setEmployerEnabled}
              label={t("salary.bulkEmployerToggle")}
            />
            {employerEnabled && (
              <EmployerPicker
                value={employerId}
                employers={employers}
                onChange={setEmployerId}
              />
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Checkbox
              checked={taxEnabled}
              onChange={setTaxEnabled}
              label={t("salary.bulkTaxRateToggle")}
            />
            {taxEnabled && (
              <FormSection as="label" label={t("salary.taxLabel")}>
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
                <span className="text-xs text-muted">
                  {t("salary.bulkTaxRateHint")}
                </span>
              </FormSection>
            )}
          </div>
        </div>
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
