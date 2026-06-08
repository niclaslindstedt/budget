import { useState } from "react";
import { TrendingUp } from "lucide-react";

import { newId } from "../../data/sheet";
import type { Property, PropertyValuePoint, Settings } from "../../data/types";
import { useResetOnOpen } from "../../hooks";
import { useLang, useT } from "../../i18n";
import { todayIso } from "../../utils/date";
import { formatBalance, formatDate, parseAmount } from "../../utils/format";
import { Button, ClearableInput } from "../form";
import { Modal } from "../Modal";
import { DATE_INPUT_CLASS } from "./date-input";

// Record a new market value for a property — appends one point to its
// `valueHistory` (the current value is the latest point). Also lists the
// recorded history so the user can see and delete past snapshots.
//
// Not `centered`: the value field opens the soft keyboard.

type Props = {
  open: boolean;
  property: Property | null;
  settings: Settings;
  onClose: () => void;
  onAddValue: (propertyId: string, point: PropertyValuePoint) => void;
  onDeleteValue: (propertyId: string, pointId: string) => void;
};

export function UpdatePropertyValueModal({
  open,
  property,
  settings,
  onClose,
  onAddValue,
  onDeleteValue,
}: Props) {
  const t = useT();
  const lang = useLang();
  const [value, setValue] = useState("");
  const [date, setDate] = useState("");

  useResetOnOpen(open, property?.id, () => {
    setValue("");
    setDate(todayIso());
  });

  if (!open || !property) return null;

  const parsed = parseAmount(value);
  const canSubmit = parsed !== null && date !== "";

  function handleAdd() {
    if (parsed === null || date === "" || !property) return;
    onAddValue(property.id, {
      id: newId(),
      date,
      value: Math.abs(parsed),
    });
    onClose();
  }

  // Newest snapshot first.
  const history = [...property.valueHistory].sort((a, b) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : 0,
  );

  const amountInputClass =
    "field-input w-full min-w-0 rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-fg";

  return (
    <Modal
      open
      onClose={onClose}
      labelledBy="update-value-modal-title"
      size="max-w-sm"
    >
      <Modal.Header
        icon={<TrendingUp size={14} aria-hidden focusable={false} />}
        title={t("properties.updateValueTitle")}
        onClose={onClose}
      />
      <Modal.Body>
        <div className="flex flex-col gap-3">
          <p className="m-0 text-sm font-bold text-fg-bright">
            {property.name}
          </p>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">
              {t("properties.valueLabel")}
            </span>
            <ClearableInput
              value={value}
              onValueChange={setValue}
              inputMode="decimal"
              placeholder={t("properties.valuePlaceholder")}
              className={amountInputClass}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">
              {t("properties.asOfLabel")}
            </span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={DATE_INPUT_CLASS}
            />
          </label>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-bold tracking-wider uppercase text-muted">
              {t("properties.valueHistory")}
            </span>
            {history.length === 0 ? (
              <p className="m-0 text-xs text-muted">
                {t("properties.noValueHistory")}
              </p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-1 p-0">
                {history.map((point) => (
                  <li
                    key={point.id}
                    className="flex items-center justify-between gap-2 rounded border border-line bg-surface-2 px-2 py-1.5 text-sm"
                  >
                    <span className="text-muted">
                      {formatDate(point.date, settings.dateFormat, lang)}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="tabular-nums text-fg-bright">
                        {formatBalance(point.value, settings, {
                          neverAbbreviate: true,
                        })}
                      </span>
                      <button
                        type="button"
                        onClick={() => onDeleteValue(property.id, point.id)}
                        aria-label={t("properties.delete")}
                        className="cursor-pointer rounded border-0 bg-transparent px-1 text-xs text-muted hover:text-danger"
                      >
                        ✕
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button variant="primary" onClick={handleAdd} disabled={!canSubmit}>
          {t("properties.save")}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
