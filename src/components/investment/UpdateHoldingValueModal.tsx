import { useRef, useState } from "react";
import { TrendingUp } from "lucide-react";

import type { ImportedPoint } from "../../data/import/value-import";
import {
  isHoldingPurchaseValuePoint,
  resolveHoldingValueHistory,
} from "../../data/investment/holdings";
import { newId } from "../../data/sheet";
import type {
  InvestmentHolding,
  InvestmentValuePoint,
  Settings,
} from "../../data/types";
import { useResetOnOpen } from "../../hooks";
import { useLang, useT } from "../../i18n";
import { todayIso } from "../../utils/date";
import { formatBalance, formatDate, parseAmount } from "../../utils/format";
import { BatchValueImportModal } from "../BatchValueImportModal";
import { Button, ClearableInput, DATE_INPUT_CLASS } from "../form";
import { Modal } from "../Modal";

// Record a new market value for a holding — appends one point to its
// `valueHistory` (the current value is the latest point). Lists the
// recorded history so the user can see and delete past snapshots. The
// holding's purchase shows as the first value via
// `resolveHoldingValueHistory`; it's owned by the holding's purchase
// fields, so it has no delete affordance. Mirrors
// `UpdatePropertyValueModal`.
//
// The inline "Add" button (and Enter in either field) appends without
// closing — every add persists immediately, so the user can record a run
// of snapshots back-to-back.
//
// Not `centered`: the value field opens the soft keyboard.

type Props = {
  open: boolean;
  holding: InvestmentHolding | null;
  settings: Settings;
  onClose: () => void;
  onAddValue: (holdingId: string, point: InvestmentValuePoint) => void;
  onImportValues: (holdingId: string, points: ImportedPoint[]) => void;
  onDeleteValue: (holdingId: string, pointId: string) => void;
};

export function UpdateHoldingValueModal({
  open,
  holding,
  settings,
  onClose,
  onAddValue,
  onImportValues,
  onDeleteValue,
}: Props) {
  const t = useT();
  const lang = useLang();
  const [value, setValue] = useState("");
  const [date, setDate] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const valueInputRef = useRef<HTMLInputElement | null>(null);

  useResetOnOpen(open, holding?.id, () => {
    setValue("");
    setDate(todayIso());
  });

  if (!open || !holding) return null;

  const parsed = parseAmount(value);
  const canSubmit = parsed !== null && date !== "";

  function handleAdd() {
    if (parsed === null || date === "" || !holding) return;
    onAddValue(holding.id, { id: newId(), date, value: Math.abs(parsed) });
    setValue("");
    valueInputRef.current?.focus();
  }

  // Newest first, with the synthesised purchase point folded in.
  const history = resolveHoldingValueHistory(holding).sort((a, b) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : 0,
  );

  const amountInputClass =
    "field-input w-full min-w-0 rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-fg";

  return (
    <>
      <Modal
        open
        onClose={onClose}
        labelledBy="update-holding-value-modal-title"
        size="max-w-sm"
      >
        <Modal.Header
          icon={<TrendingUp size={14} aria-hidden focusable={false} />}
          title={t("investment.updateValueTitle")}
          onClose={onClose}
        />
        <Modal.Body>
          <div className="flex flex-col gap-3">
            <p className="m-0 text-sm font-bold text-fg-bright">
              {holding.name}
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
                  {t("investment.valueLabel")}
                </span>
                <ClearableInput
                  ref={valueInputRef}
                  value={value}
                  onValueChange={setValue}
                  inputMode="decimal"
                  placeholder={t("investment.valuePlaceholder")}
                  className={amountInputClass}
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted">
                  {t("investment.asOfLabel")}
                </span>
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

            <Button
              type="button"
              variant="secondary"
              onClick={() => setImportOpen(true)}
            >
              {t("valueImport.trigger")}
            </Button>

            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-bold tracking-wider uppercase text-muted">
                {t("investment.valueHistory")}
              </span>
              {history.length === 0 ? (
                <p className="m-0 text-xs text-muted">
                  {t("investment.noValueHistory")}
                </p>
              ) : (
                <ul className="m-0 flex list-none flex-col gap-1 p-0">
                  {history.map((point) => {
                    const isPurchase = isHoldingPurchaseValuePoint(point);
                    return (
                      <li
                        key={point.id}
                        className="flex items-center justify-between gap-2 rounded border border-line bg-surface-2 px-2 py-1.5 text-sm"
                      >
                        <span className="flex items-center gap-2 text-muted">
                          {formatDate(point.date, settings.dateFormat, lang)}
                          {isPurchase && (
                            <span className="rounded-full border border-line px-1.5 text-[0.65rem] tracking-wider uppercase text-muted">
                              {t("investment.purchaseValueTag")}
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
                            <span
                              aria-hidden
                              className="px-1 text-xs opacity-0"
                            >
                              ✕
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                onDeleteValue(holding.id, point.id)
                              }
                              aria-label={t("investment.deleteValue")}
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
      <BatchValueImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        subject={holding.name}
        valueLabel={t("investment.valueLabel")}
        settings={settings}
        onImport={(points) => onImportValues(holding.id, points)}
      />
    </>
  );
}
