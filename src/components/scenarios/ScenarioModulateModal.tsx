import { useRef, useState } from "react";
import { SlidersHorizontal, Trash2 } from "lucide-react";

import { modulateAmount } from "../../data/scenarios/apply";
import type { ScenarioAmountModulation, Settings } from "../../data/types";
import { useDesktopAutoFocus, useResetOnOpen } from "../../hooks";
import { useT } from "../../i18n";
import { formatBalance, parseAmount } from "../../utils/format";
import {
  Button,
  ClearableInput,
  FormSection,
  SelectPicker,
  type SelectOption,
} from "../form";
import { Modal } from "../Modal";
import { formatModulation } from "./modulation";

type Props = {
  open: boolean;
  // The base row being adjusted — id keys the reset, name and amount
  // feed the copy and the live preview.
  rowId: string | null;
  rowName: string;
  baseAmount: number;
  // The row's current adjustment, or null when adding a fresh one.
  modulation: ScenarioAmountModulation | null;
  settings: Settings;
  onClose: () => void;
  onSave: (modulation: ScenarioAmountModulation) => void;
  onRemove: () => void;
};

// Attach a live amount adjustment (+5000, ×2, +300 %) to a base budget
// row inside the active scenario. Unlike a typed-in fixed amount, the
// adjustment is re-applied against the base amount on every compute,
// so a base-row edit (a raise lands, a bill changes) flows straight
// through the scenario. Not `centered`: the value field opens the soft
// keyboard.
export function ScenarioModulateModal({
  open,
  rowId,
  rowName,
  baseAmount,
  modulation,
  settings,
  onClose,
  onSave,
  onRemove,
}: Props) {
  const t = useT();
  const [op, setOp] = useState<ScenarioAmountModulation["op"]>("add");
  const [valueText, setValueText] = useState("");

  const valueRef = useRef<HTMLInputElement>(null);
  useDesktopAutoFocus(valueRef, open);

  useResetOnOpen(open, rowId, () => {
    setOp(modulation?.op ?? "add");
    setValueText(modulation === null ? "" : String(modulation.value));
  });

  const opOptions: SelectOption<ScenarioAmountModulation["op"]>[] = [
    { value: "add", label: t("scenarios.modulateOpAdd") },
    { value: "multiply", label: t("scenarios.modulateOpMultiply") },
    { value: "percent", label: t("scenarios.modulateOpPercent") },
  ];

  const parsed = parseAmount(valueText);
  const draft: ScenarioAmountModulation | null =
    parsed === null ? null : { op, value: parsed };
  const canSave = draft !== null;

  function handleSave() {
    if (draft === null) return;
    onSave(draft);
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="scenario-modulate-modal-title"
    >
      <Modal.Header
        icon={<SlidersHorizontal size={14} aria-hidden focusable={false} />}
        title={t("scenarios.modulateTitle")}
        onClose={onClose}
      />
      <Modal.Body>
        <div className="flex flex-col gap-4">
          <p className="m-0 text-xs text-muted">
            {t("scenarios.modulateBody")}
          </p>

          <FormSection label={t("scenarios.modulateOpLabel")}>
            <SelectPicker
              value={op}
              options={opOptions}
              onChange={setOp}
              ariaLabel={t("scenarios.modulateOpLabel")}
            />
          </FormSection>

          <FormSection as="label" label={t("scenarios.modulateValueLabel")}>
            <ClearableInput
              value={valueText}
              onValueChange={setValueText}
              inputMode="decimal"
              onKeyDown={(e) => {
                if (e.key === "Enter" && canSave) {
                  e.preventDefault();
                  handleSave();
                }
              }}
              wrapperClassName="w-full min-w-0"
              className="field-input w-full min-w-0 rounded border border-line bg-surface-2 px-2 py-1.5 text-right font-mono text-sm text-fg"
              ref={valueRef}
            />
          </FormSection>

          <div className="flex flex-col gap-1 rounded border border-line bg-surface-2 px-3 py-2">
            <span className="min-w-0 truncate text-xs text-muted">
              {rowName}
            </span>
            <div className="flex items-center justify-between gap-2 font-mono text-sm tabular-nums">
              <span className="text-muted">
                {formatBalance(baseAmount, settings)}
              </span>
              <span aria-hidden className="text-muted">
                →
              </span>
              <span className="flex items-center gap-2">
                {draft !== null && (
                  <span className="text-meta">
                    {formatModulation(draft, settings)}
                  </span>
                )}
                <span className="text-accent">
                  {draft === null
                    ? "—"
                    : formatBalance(
                        modulateAmount(baseAmount, draft),
                        settings,
                      )}
                </span>
              </span>
            </div>
          </div>
        </div>
      </Modal.Body>
      <Modal.Footer className="justify-between">
        <div>
          {modulation !== null && (
            <Button
              variant="danger"
              withIcon
              onClick={() => {
                onRemove();
                onClose();
              }}
            >
              <Trash2 size={14} aria-hidden focusable={false} />
              {t("scenarios.modulateRemove")}
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" onClick={handleSave} disabled={!canSave}>
            {t("common.save")}
          </Button>
        </div>
      </Modal.Footer>
    </Modal>
  );
}
