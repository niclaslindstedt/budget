import { useState } from "react";
import { ReceiptText } from "lucide-react";

import { CAR_EXPENSE_TYPE_IDS } from "../../data/presets/types";
import { newId } from "../../data/sheet";
import type { Car, CarExpense, EntryType, Settings } from "../../data/types";
import { useResetOnOpen } from "../../hooks";
import { useT } from "../../i18n";
import { displayTypeName } from "../../i18n/preset-names";
import { todayIso } from "../../utils/date";
import { formatAmountForInput, parseAmount } from "../../utils/format";
import {
  Button,
  ClearableInput,
  DATE_INPUT_CLASS,
  SelectPicker,
  type SelectOption,
} from "../form";
import { CategoryIconGlyph } from "../icons";
import { Modal } from "../Modal";

// Add or edit a car expense with no backing bank transaction — cash
// fuel, costs predating the imported history, a car-pool invoice on
// someone else's account. Fields are entered directly; the type picker
// offers the nine transport presets the finder scans for. Mirrors
// `ManualRepairModal` in spirit.
//
// Not `centered`: the description / amount fields open the soft
// keyboard.

const AMOUNT_INPUT_CLASS =
  "field-input w-full min-w-0 rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-fg";
const TEXT_INPUT_CLASS =
  "field-input w-full min-w-0 rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-fg";

type Props = {
  open: boolean;
  car: Car | null;
  // The expense to edit, or null in add mode.
  expense: CarExpense | null;
  settings: Settings;
  // Merged preset + user types — resolves the transport presets' names.
  typesById: ReadonlyMap<string, EntryType>;
  onClose: () => void;
  onAdd: (carId: string, expense: CarExpense) => void;
  onUpdate: (
    carId: string,
    expenseId: string,
    patch: Partial<Omit<CarExpense, "id">>,
  ) => void;
};

export function ManualCarExpenseModal({
  open,
  car,
  expense,
  settings,
  typesById,
  onClose,
  onAdd,
  onUpdate,
}: Props) {
  const t = useT();
  const isEdit = expense !== null;

  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [typeId, setTypeId] = useState("preset-type-fuel");

  useResetOnOpen(open, expense?.id ?? car?.id, () => {
    setDescription(expense?.description ?? "");
    setAmount(
      expense !== null ? formatAmountForInput(expense.amount, settings) : "",
    );
    setDate(expense?.date ?? todayIso());
    setTypeId(expense?.typeId ?? "preset-type-fuel");
  });

  if (!open || !car) return null;

  const parsed = parseAmount(amount);
  const canSubmit = description.trim() !== "" && parsed !== null && date !== "";

  const typeOptions: SelectOption<string>[] = [...CAR_EXPENSE_TYPE_IDS].map(
    (id) => {
      const type = typesById.get(id);
      return {
        value: id,
        label: (
          <span className="inline-flex items-center gap-2">
            {type && (
              <CategoryIconGlyph
                name={type.glyph}
                size={14}
                className="shrink-0 text-accent"
              />
            )}
            {type ? displayTypeName(type, t) : id}
          </span>
        ),
      };
    },
  );

  function handleSubmit() {
    if (!car || parsed === null || !canSubmit) return;
    const fields = {
      date,
      amount: Math.abs(parsed),
      description: description.trim(),
      typeId,
    };
    if (isEdit && expense) {
      onUpdate(car.id, expense.id, fields);
    } else {
      onAdd(car.id, { id: newId(), ...fields });
    }
    onClose();
  }

  return (
    <Modal
      open
      onClose={onClose}
      labelledBy="manual-car-expense-title"
      size="max-w-sm"
    >
      <Modal.Header
        icon={<ReceiptText size={14} aria-hidden focusable={false} />}
        title={
          isEdit
            ? t("carsSheet.editExpenseTitle")
            : t("carsSheet.manualExpenseTitle")
        }
        onClose={onClose}
      />
      <Modal.Body>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
        >
          <p className="m-0 text-sm font-bold text-fg-bright">{car.name}</p>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">
              {t("carsSheet.expenseDescription")}
            </span>
            <ClearableInput
              value={description}
              onValueChange={setDescription}
              placeholder={t("carsSheet.expenseDescriptionPlaceholder")}
              className={TEXT_INPUT_CLASS}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">
              {t("carsSheet.expenseAmount")}
            </span>
            <ClearableInput
              value={amount}
              onValueChange={setAmount}
              inputMode="decimal"
              className={AMOUNT_INPUT_CLASS}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">
              {t("carsSheet.expenseDate")}
            </span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={DATE_INPUT_CLASS}
            />
          </label>

          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted">
              {t("carsSheet.expenseType")}
            </span>
            <SelectPicker
              value={typeId}
              options={typeOptions}
              onChange={setTypeId}
              ariaLabel={t("carsSheet.expenseType")}
            />
          </div>
        </form>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button variant="primary" disabled={!canSubmit} onClick={handleSubmit}>
          {isEdit ? t("common.save") : t("common.add")}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
