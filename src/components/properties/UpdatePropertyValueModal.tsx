import { useRef, useState } from "react";
import { TrendingUp } from "lucide-react";

import {
  isPurchaseValuePoint,
  resolveValueHistory,
} from "../../data/property-value/value";
import { newId } from "../../data/sheet";
import type { Property, PropertyValuePoint, Settings } from "../../data/types";
import { useResetOnOpen } from "../../hooks";
import { useLang, useT } from "../../i18n";
import { todayIso } from "../../utils/date";
import { formatBalance, formatDate, parseAmount } from "../../utils/format";
import { Button, ClearableInput, DATE_INPUT_CLASS } from "../form";
import { Modal } from "../Modal";

// Record a new market value for a property — appends one point to its
// `valueHistory` (the current value is the latest point). Also lists the
// recorded history so the user can see and delete past snapshots. The
// property's purchase (`purchaseAmount` at `purchaseDate`) shows as the first
// value via `resolveValueHistory`; it's owned by the property's purchase
// fields, so it has no delete affordance — change it by editing the property.
//
// The inline "Add" button (and Enter in either field) appends a point without
// closing the modal — every add persists immediately, so the user can record a
// run of snapshots back-to-back. The footer just dismisses.
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
  const valueInputRef = useRef<HTMLInputElement | null>(null);

  useResetOnOpen(open, property?.id, () => {
    setValue("");
    setDate(todayIso());
  });

  if (!open || !property) return null;

  const parsed = parseAmount(value);
  const canSubmit = parsed !== null && date !== "";

  // Append the snapshot but keep the modal open so the user can record a run
  // of values. Clear the amount (the date stays so consecutive snapshots can
  // share it) and refocus it for the next entry.
  function handleAdd() {
    if (parsed === null || date === "" || !property) return;
    onAddValue(property.id, {
      id: newId(),
      date,
      value: Math.abs(parsed),
    });
    setValue("");
    valueInputRef.current?.focus();
  }

  // Newest snapshot first. Includes the synthesised purchase point (the
  // property's first value) so the list is never empty for a dated purchase.
  const history = resolveValueHistory(property).sort((a, b) =>
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

          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              handleAdd();
            }}
          >
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted">
                {t("properties.valueLabel")}
              </span>
              <ClearableInput
                ref={valueInputRef}
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

            <Button type="submit" variant="primary" disabled={!canSubmit}>
              {t("common.add")}
            </Button>
          </form>

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
                {history.map((point) => {
                  const isPurchase = isPurchaseValuePoint(point);
                  return (
                    <li
                      key={point.id}
                      className="flex items-center justify-between gap-2 rounded border border-line bg-surface-2 px-2 py-1.5 text-sm"
                    >
                      <span className="flex items-center gap-2 text-muted">
                        {formatDate(point.date, settings.dateFormat, lang)}
                        {isPurchase && (
                          <span className="rounded-full border border-line px-1.5 text-[0.65rem] tracking-wider uppercase text-muted">
                            {t("properties.purchaseValueTag")}
                          </span>
                        )}
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="tabular-nums text-fg-bright">
                          {formatBalance(point.value, settings, {
                            neverAbbreviate: true,
                          })}
                        </span>
                        {isPurchase ? (
                          // The purchase value is owned by the property's
                          // purchase fields — change it by editing the
                          // property, not by deleting a snapshot here.
                          <span aria-hidden className="px-1 text-xs opacity-0">
                            ✕
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onDeleteValue(property.id, point.id)}
                            aria-label={t("properties.delete")}
                            className="cursor-pointer rounded border-0 bg-transparent px-1 text-xs text-muted hover:text-danger"
                          >
                            ✕
                          </button>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose}>
          {t("common.done")}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
