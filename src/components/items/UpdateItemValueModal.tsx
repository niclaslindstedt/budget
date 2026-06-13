import { useRef, useState } from "react";
import { Coins } from "lucide-react";

import {
  isItemPurchaseValuePoint,
  resolveItemValueHistory,
} from "../../data/items/value";
import { newId } from "../../data/sheet";
import type { Item, ItemValuePoint, Settings } from "../../data/types";
import { useResetOnOpen } from "../../hooks";
import { useLang, useT } from "../../i18n";
import { todayIso } from "../../utils/date";
import { formatBalance, formatDate, parseAmount } from "../../utils/format";
import { Button, ClearableInput, DATE_INPUT_CLASS } from "../form";
import { Modal } from "../Modal";

// Record a new value for an owned item — appends one point to its
// `valueHistory` (the current value is the latest point on or before
// today). Lets an item that appreciates (art, sculptures, collectibles)
// track a rising value over time, which feeds the net-worth roll-up and
// graph. Lists the recorded history so the user can see and delete past
// snapshots. The item's purchase shows as the first value via
// `resolveItemValueHistory`; it's owned by the item's purchase fields, so
// it has no delete affordance. Mirrors `UpdateHoldingValueModal`.
//
// The inline "Add" button (and Enter in either field) appends without
// closing — every add persists immediately, so the user can record a run
// of snapshots back-to-back.
//
// Not `centered`: the value field opens the soft keyboard.

type Props = {
  open: boolean;
  item: Item | null;
  settings: Settings;
  onClose: () => void;
  onAddValue: (itemId: string, point: ItemValuePoint) => void;
  onDeleteValue: (itemId: string, pointId: string) => void;
};

export function UpdateItemValueModal({
  open,
  item,
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

  useResetOnOpen(open, item?.id, () => {
    setValue("");
    setDate(todayIso());
  });

  if (!open || !item) return null;

  const parsed = parseAmount(value);
  const canSubmit = parsed !== null && date !== "";

  function handleAdd() {
    if (parsed === null || date === "" || !item) return;
    onAddValue(item.id, { id: newId(), date, value: Math.abs(parsed) });
    setValue("");
    valueInputRef.current?.focus();
  }

  // Newest first, with the synthesised purchase point folded in.
  const history = resolveItemValueHistory(item).sort((a, b) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : 0,
  );

  const amountInputClass =
    "field-input w-full min-w-0 rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-fg";

  return (
    <Modal
      open
      onClose={onClose}
      labelledBy="update-item-value-modal-title"
      size="max-w-sm"
    >
      <Modal.Header
        icon={<Coins size={14} aria-hidden focusable={false} />}
        title={t("items.updateValueTitle")}
        onClose={onClose}
      />
      <Modal.Body>
        <div className="flex flex-col gap-3">
          <p className="m-0 text-sm font-bold text-fg-bright">{item.name}</p>

          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              handleAdd();
            }}
          >
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted">
                {t("items.valueLabel")}
              </span>
              <ClearableInput
                ref={valueInputRef}
                value={value}
                onValueChange={setValue}
                inputMode="decimal"
                placeholder={t("items.valuePlaceholder")}
                className={amountInputClass}
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted">{t("items.asOfLabel")}</span>
              <input
                type="date"
                value={date}
                max={todayIso()}
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
              {t("items.valueHistoryHeading")}
            </span>
            {history.length === 0 ? (
              <p className="m-0 text-xs text-muted">
                {t("items.noValueHistory")}
              </p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-1 p-0">
                {history.map((point) => {
                  const isPurchase = isItemPurchaseValuePoint(point);
                  return (
                    <li
                      key={point.id}
                      className="flex items-center justify-between gap-2 rounded border border-line bg-surface-2 px-2 py-1.5 text-sm"
                    >
                      <span className="flex items-center gap-2 text-muted">
                        {formatDate(point.date, settings.dateFormat, lang)}
                        {isPurchase && (
                          <span className="rounded-full border border-line px-1.5 text-[0.65rem] tracking-wider uppercase text-muted">
                            {t("items.purchaseValueTag")}
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
                          <span aria-hidden className="px-1 text-xs opacity-0">
                            ✕
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onDeleteValue(item.id, point.id)}
                            aria-label={t("items.deleteValue")}
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
