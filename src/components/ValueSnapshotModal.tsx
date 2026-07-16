import { useRef, useState, type ReactNode } from "react";

import type { ImportedPoint } from "../data/import/value-import";
import { newId } from "../data/sheet";
import type { Settings } from "../data/types";
import { useResetOnOpen } from "../hooks";
import { useT } from "../i18n";
import { todayIso } from "../utils/date";
import { parseAmount } from "../utils/format";
import { BatchValueImportModal } from "./BatchValueImportModal";
import { Button, ClearableInput, DateField } from "./form";
import { Modal } from "./Modal";

// Shared shell for every "record a dated value/balance over time" modal
// (loans, savings, items, properties, and future balance-snapshot sheet
// types). Owns the value + date form, the inline batch-import wiring, and
// the recorded-history section; each page supplies its own labels, the
// icon, per-point commit callbacks, and the history-row renderer (the row
// layout genuinely diverges — loans align on the amount column, items /
// properties tag the synthesised purchase point). The accounts
// "Update balance" modal deliberately stays separate: it has a delta-prose
// UI, not a snapshot list.
//
// The inline "Add" button (and Enter in either field) appends a point
// without closing the modal — every add persists immediately, so the user
// can record a run of snapshots back-to-back. The footer just dismisses.
//
// Not `centered`: the value field opens the soft keyboard.

const AMOUNT_INPUT_CLASS =
  "field-input w-full min-w-0 rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-fg";

// Every history point is `{ id, date, value }`; the sheet-specific point
// types (`LoanBalancePoint`, `SavingBalancePoint`, `ItemValuePoint`,
// `PropertyValuePoint`) are structurally this shape.
export type ValueSnapshotPoint = { id: string; date: string; value: number };

type Props<P extends { id: string }> = {
  open: boolean;
  // Entity id — re-seeds the form when it changes under an already-open
  // modal (see `useResetOnOpen`).
  resetKey: string | undefined;
  icon: ReactNode;
  title: string;
  labelledBy: string;
  // Entity name, shown as the subheading and passed to the importer.
  subject: string;
  settings: Settings;
  // Optional explanatory paragraph under the subject (loans only).
  hint?: string;
  valueLabel: string;
  valuePlaceholder: string;
  asOfLabel: string;
  // Upper bound for the date input (items cap "as of" at today).
  dateMax?: string;
  historyHeading: string;
  emptyHistoryText: string;
  // Column-role label passed to the batch importer.
  importValueLabel: string;
  // Savings can go negative (overdraft); every other history stores a
  // magnitude, so the importer takes the absolute value by default.
  allowNegativeImport?: boolean;
  // Extra guard on the parsed amount beyond "parseable and a date is set".
  // Loans reject a negative balance; other snapshots accept it.
  validateAmount?: (parsed: number) => boolean;
  // Normalise the committed amount. Items / properties store magnitudes
  // (`Math.abs`); loans / savings keep the sign.
  normalizeAmount?: (parsed: number) => number;
  // Recorded history, already sorted for display.
  history: P[];
  renderHistoryRow: (point: P) => ReactNode;
  onClose: () => void;
  onAdd: (point: ValueSnapshotPoint) => void;
  onImport: (points: ImportedPoint[]) => void;
};

export function ValueSnapshotModal<P extends { id: string }>({
  open,
  resetKey,
  icon,
  title,
  labelledBy,
  subject,
  settings,
  hint,
  valueLabel,
  valuePlaceholder,
  asOfLabel,
  dateMax,
  historyHeading,
  emptyHistoryText,
  importValueLabel,
  allowNegativeImport,
  validateAmount,
  normalizeAmount,
  history,
  renderHistoryRow,
  onClose,
  onAdd,
  onImport,
}: Props<P>) {
  const t = useT();
  const [value, setValue] = useState("");
  const [date, setDate] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const valueInputRef = useRef<HTMLInputElement | null>(null);

  useResetOnOpen(open, resetKey, () => {
    setValue("");
    setDate(todayIso());
  });

  const parsed = parseAmount(value);
  const canSubmit =
    parsed !== null &&
    date !== "" &&
    (validateAmount === undefined || validateAmount(parsed));

  // Append the snapshot but keep the modal open so the user can record a run
  // of values. Clear the amount (the date stays) and refocus for the next.
  function handleAdd() {
    if (parsed === null || !canSubmit) return;
    onAdd({
      id: newId(),
      date,
      value: normalizeAmount ? normalizeAmount(parsed) : parsed,
    });
    setValue("");
    valueInputRef.current?.focus();
  }

  return (
    <>
      <Modal open onClose={onClose} labelledBy={labelledBy} size="max-w-sm">
        <Modal.Header icon={icon} title={title} onClose={onClose} />
        <Modal.Body>
          <div className="flex flex-col gap-3">
            <p className="m-0 text-sm font-bold text-fg-bright">{subject}</p>

            {hint !== undefined && (
              <p className="m-0 text-xs text-muted">{hint}</p>
            )}

            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                handleAdd();
              }}
            >
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted">{valueLabel}</span>
                <ClearableInput
                  ref={valueInputRef}
                  value={value}
                  onValueChange={setValue}
                  inputMode="decimal"
                  placeholder={valuePlaceholder}
                  className={AMOUNT_INPUT_CLASS}
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted">{asOfLabel}</span>
                <DateField value={date} max={dateMax} onChange={setDate} />
              </label>

              <Button type="submit" variant="primary" disabled={!canSubmit}>
                {t("common.add")}
              </Button>
            </form>

            <Button
              type="button"
              variant="secondary"
              onClick={() => setImportOpen(true)}
            >
              {t("valueImport.trigger")}
            </Button>

            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-bold tracking-wider uppercase text-muted">
                {historyHeading}
              </span>
              {history.length === 0 ? (
                <p className="m-0 text-xs text-muted">{emptyHistoryText}</p>
              ) : (
                <ul className="m-0 flex list-none flex-col gap-1 p-0">
                  {history.map(renderHistoryRow)}
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
      <BatchValueImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        subject={subject}
        valueLabel={importValueLabel}
        settings={settings}
        allowNegative={allowNegativeImport}
        onImport={onImport}
      />
    </>
  );
}
