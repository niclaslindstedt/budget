import { useCallback, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import type { ScenarioAddedRow, Settings } from "../../data/types";
import { newId } from "../../data/sheet";
import { useDesktopAutoFocus, useResetOnOpen } from "../../hooks";
import { useT } from "../../i18n";
import { parseAmount } from "../../utils/format";
import {
  Button,
  ClearableInput,
  DATE_INPUT_CLASS,
  FormSection,
  SignedAmountInput,
} from "../form";
import { Modal } from "../Modal";
import { RecurrenceForm } from "../RecurrenceForm";

type Props = {
  open: boolean;
  // Null ⇒ creating a new row; the seed date prefills the date field.
  row: ScenarioAddedRow | null;
  seedDate: string;
  settings: Settings;
  onClose: () => void;
  // Add mode delivers one row per recurrence date (sharing a fresh
  // `seriesId` when there is more than one); edit mode delivers the
  // single edited row.
  onSave: (rows: ScenarioAddedRow[]) => void;
  onDelete?: (rowId: string) => void;
};

// Add / edit a scenario-only row (date, description, amount). Add mode
// swaps the single date field for the recurrence form, so a what-if
// expense or income can land on one date or fan out as a recurring
// series. Edit mode edits one occurrence and keeps the plain date
// field — series membership is fixed at add time. Not `centered`: the
// description and amount fields open the soft keyboard.
export function ScenarioRowModal({
  open,
  row,
  seedDate,
  settings,
  onClose,
  onSave,
  onDelete,
}: Props) {
  const t = useT();
  const isEdit = row !== null;
  const [date, setDate] = useState(seedDate);
  const [description, setDescription] = useState("");
  const [amountText, setAmountText] = useState("");
  const [negative, setNegative] = useState(true);
  const [recurrenceDates, setRecurrenceDates] = useState<string[]>([]);
  // Bumped on every open so the recurrence form re-seeds from the
  // month the "+" was pressed in instead of keeping stale state.
  const [resetKey, setResetKey] = useState(0);

  const descriptionRef = useRef<HTMLInputElement>(null);
  useDesktopAutoFocus(descriptionRef, open);

  useResetOnOpen(open, row?.id ?? null, () => {
    setDate(row?.date ?? seedDate);
    setDescription(row?.description ?? "");
    setAmountText(row === null ? "" : String(Math.abs(row.amount)));
    // New rows default to an expense — the most common what-if addition
    // after the income replacement.
    setNegative(row === null ? true : row.amount < 0);
    setRecurrenceDates([]);
    setResetKey((k) => k + 1);
  });

  const handleRecurrenceChange = useCallback(
    (_rule: unknown, dates: string[]) => {
      setRecurrenceDates(dates);
    },
    [],
  );

  const parsedAmount = parseAmount(amountText);
  const canSave =
    (isEdit ? /^\d{4}-\d{2}-\d{2}$/.test(date) : recurrenceDates.length > 0) &&
    description.trim() !== "" &&
    parsedAmount !== null;

  function handleSave() {
    if (!canSave || parsedAmount === null) return;
    const amount = negative ? -Math.abs(parsedAmount) : Math.abs(parsedAmount);
    if (isEdit) {
      onSave([{ ...row, date, description: description.trim(), amount }]);
    } else {
      // Every row minted from one recurring add shares a seriesId so
      // the tables show the Repeat glyph and the delete flow can offer
      // a this-and-future sweep. One-off rows stay series-less.
      const seriesId = recurrenceDates.length > 1 ? newId() : undefined;
      onSave(
        recurrenceDates.map((d) => ({
          id: newId(),
          date: d,
          description: description.trim(),
          amount,
          ...(seriesId !== undefined ? { seriesId } : {}),
        })),
      );
    }
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} labelledBy="scenario-row-modal-title">
      <Modal.Header
        icon={<Plus size={14} aria-hidden focusable={false} />}
        title={
          isEdit
            ? t("scenarios.rowModalTitleEdit")
            : t("scenarios.rowModalTitleAdd")
        }
        onClose={onClose}
      />
      <Modal.Body>
        <div className="flex flex-col gap-4">
          {isEdit && (
            <FormSection as="label" label={t("scenarios.rowDate")}>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={DATE_INPUT_CLASS}
              />
            </FormSection>
          )}

          <FormSection as="label" label={t("scenarios.rowDescription")}>
            <ClearableInput
              value={description}
              onValueChange={setDescription}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canSave) {
                  e.preventDefault();
                  handleSave();
                }
              }}
              wrapperClassName="w-full min-w-0"
              className="field-input w-full min-w-0 rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-fg"
              ref={descriptionRef}
            />
          </FormSection>

          <FormSection label={t("scenarios.rowAmount")}>
            <SignedAmountInput
              value={amountText}
              negative={negative}
              onValueChange={setAmountText}
              onToggleSign={() => setNegative((n) => !n)}
              settings={settings}
              ariaLabel={t("scenarios.rowAmount")}
            />
          </FormSection>

          {!isEdit && (
            <FormSection label={t("scenarios.rowRecurrence")}>
              <RecurrenceForm
                seedDate={seedDate}
                resetKey={resetKey}
                onChange={handleRecurrenceChange}
              />
            </FormSection>
          )}
        </div>
      </Modal.Body>
      <Modal.Footer className="justify-between">
        <div>
          {isEdit && onDelete && (
            <Button
              variant="danger"
              withIcon
              onClick={() => {
                onDelete(row.id);
                onClose();
              }}
            >
              <Trash2 size={14} aria-hidden focusable={false} />
              {t("scenarios.rowDelete")}
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" onClick={handleSave} disabled={!canSave}>
            {isEdit
              ? t("common.save")
              : recurrenceDates.length === 1
                ? t("scenarios.addRowsOne", { n: 1 })
                : recurrenceDates.length > 1
                  ? t("scenarios.addRowsOther", { n: recurrenceDates.length })
                  : t("scenarios.addRow")}
          </Button>
        </div>
      </Modal.Footer>
    </Modal>
  );
}
