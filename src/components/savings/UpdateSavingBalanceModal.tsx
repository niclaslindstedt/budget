import { useRef, useState } from "react";
import { Scale } from "lucide-react";

import { newId } from "../../data/sheet";
import type { Saving, SavingBalancePoint, Settings } from "../../data/types";
import { useResetOnOpen } from "../../hooks";
import { useLang, useT } from "../../i18n";
import { todayIso } from "../../utils/date";
import { formatBalance, formatDate, parseAmount } from "../../utils/format";
import { Button, ClearableInput } from "../form";
import { Modal } from "../Modal";
import { DATE_INPUT_CLASS } from "../properties/date-input";

// Record a new balance for a savings account — appends one point to its
// `balanceHistory` (the current balance is the latest point). Lists the
// recorded history so the user can see and delete past snapshots. Mirrors
// the property "Update value" modal.
//
// The inline "Add" button (and Enter in either field) appends a point without
// closing the modal — every add persists immediately, so the user can record a
// run of snapshots back-to-back. The footer just dismisses.
//
// Not `centered`: the balance field opens the soft keyboard.

type Props = {
  open: boolean;
  saving: Saving | null;
  settings: Settings;
  onClose: () => void;
  onAddBalance: (savingId: string, point: SavingBalancePoint) => void;
  onDeleteBalance: (savingId: string, pointId: string) => void;
};

export function UpdateSavingBalanceModal({
  open,
  saving,
  settings,
  onClose,
  onAddBalance,
  onDeleteBalance,
}: Props) {
  const t = useT();
  const lang = useLang();
  const [value, setValue] = useState("");
  const [date, setDate] = useState("");
  const valueInputRef = useRef<HTMLInputElement | null>(null);

  useResetOnOpen(open, saving?.id, () => {
    setValue("");
    setDate(todayIso());
  });

  if (!open || !saving) return null;

  const parsed = parseAmount(value);
  const canSubmit = parsed !== null && date !== "";

  // Append the snapshot but keep the modal open so the user can record a run
  // of values. Clear the amount (the date stays) and refocus for the next.
  function handleAdd() {
    if (parsed === null || date === "" || !saving) return;
    onAddBalance(saving.id, { id: newId(), date, value: parsed });
    setValue("");
    valueInputRef.current?.focus();
  }

  // Newest snapshot first.
  const history = saving.balanceHistory
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  const amountInputClass =
    "field-input w-full min-w-0 rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-fg";

  return (
    <Modal
      open
      onClose={onClose}
      labelledBy="update-saving-balance-title"
      size="max-w-sm"
    >
      <Modal.Header
        icon={<Scale size={14} aria-hidden focusable={false} />}
        title={t("savingsSheet.updateBalanceTitle")}
        onClose={onClose}
      />
      <Modal.Body>
        <div className="flex flex-col gap-3">
          <p className="m-0 text-sm font-bold text-fg-bright">{saving.name}</p>

          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              handleAdd();
            }}
          >
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted">
                {t("savingsSheet.balanceLabel")}
              </span>
              <ClearableInput
                ref={valueInputRef}
                value={value}
                onValueChange={setValue}
                inputMode="decimal"
                placeholder={t("savingsSheet.balancePlaceholder")}
                className={amountInputClass}
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted">
                {t("savingsSheet.asOfLabel")}
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
              {t("savingsSheet.balanceHistory")}
            </span>
            {history.length === 0 ? (
              <p className="m-0 text-xs text-muted">
                {t("savingsSheet.noBalanceHistory")}
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
                        onClick={() => onDeleteBalance(saving.id, point.id)}
                        aria-label={t("savingsSheet.deleteBalanceAria")}
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
          {t("common.done")}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
