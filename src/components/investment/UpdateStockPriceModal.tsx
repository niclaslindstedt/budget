import { useRef, useState } from "react";
import { Coins } from "lucide-react";

import type { ImportedPoint } from "../../data/import/value-import";
import { newId } from "../../data/sheet";
import type {
  Settings,
  StockPosition,
  StockPricePoint,
} from "../../data/types";
import { useResetOnOpen } from "../../hooks";
import { useLang, useT } from "../../i18n";
import { todayIso } from "../../utils/date";
import { formatBalance, formatDate, parseAmount } from "../../utils/format";
import { BatchValueImportModal } from "../BatchValueImportModal";
import {
  Button,
  ClearableInput,
  DATE_INPUT_CLASS,
  SelectPicker,
  type SelectOption,
} from "../form";
import { Modal } from "../Modal";

// Record the current price per share for a stock position — appends one
// point to its `priceHistory` (the current price is the latest point).
// Two input modes: enter the price of one share directly, or enter a
// total value plus a share count and let the modal derive the per-share
// price. Only the per-share price is stored.
//
// Not `centered`: the numeric fields open the soft keyboard.

type PriceMode = "perShare" | "total";

type Props = {
  open: boolean;
  position: StockPosition | null;
  settings: Settings;
  onClose: () => void;
  onAddPrice: (positionId: string, point: StockPricePoint) => void;
  onImportPrices: (positionId: string, points: ImportedPoint[]) => void;
  onDeletePrice: (positionId: string, pointId: string) => void;
};

export function UpdateStockPriceModal({
  open,
  position,
  settings,
  onClose,
  onAddPrice,
  onImportPrices,
  onDeletePrice,
}: Props) {
  const t = useT();
  const lang = useLang();
  const [mode, setMode] = useState<PriceMode>("perShare");
  const [perShare, setPerShare] = useState("");
  const [totalValue, setTotalValue] = useState("");
  const [shareCount, setShareCount] = useState("");
  const [date, setDate] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const firstInputRef = useRef<HTMLInputElement | null>(null);

  useResetOnOpen(open, position?.id, () => {
    setMode("perShare");
    setPerShare("");
    setTotalValue("");
    setShareCount("");
    setDate(todayIso());
  });

  if (!open || !position) return null;

  // Resolve the per-share price from whichever mode is active.
  const derivedPrice = (() => {
    if (mode === "perShare") {
      const p = parseAmount(perShare);
      return p === null ? null : Math.abs(p);
    }
    const total = parseAmount(totalValue);
    const count = parseAmount(shareCount);
    if (total === null || count === null || count === 0) return null;
    return Math.abs(total) / Math.abs(count);
  })();

  const canSubmit = derivedPrice !== null && date !== "";

  function handleAdd() {
    if (derivedPrice === null || date === "" || !position) return;
    onAddPrice(position.id, {
      id: newId(),
      date,
      pricePerShare: derivedPrice,
    });
    setPerShare("");
    setTotalValue("");
    setShareCount("");
    firstInputRef.current?.focus();
  }

  const modeOptions: SelectOption<PriceMode>[] = [
    { value: "perShare", label: t("investment.priceModePerShare") },
    { value: "total", label: t("investment.priceModeTotal") },
  ];

  const prices = [...position.priceHistory].sort((a, b) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : 0,
  );

  const inputClass =
    "field-input w-full min-w-0 rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-fg font-mono";

  return (
    <>
      <Modal
        open
        onClose={onClose}
        labelledBy="update-stock-price-modal-title"
        size="max-w-sm"
      >
        <Modal.Header
          icon={<Coins size={14} aria-hidden focusable={false} />}
          title={t("investment.updatePriceTitle")}
          onClose={onClose}
        />
        <Modal.Body>
          <div className="flex flex-col gap-3">
            <p className="m-0 text-sm font-bold text-fg-bright">
              {position.name}
            </p>

            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                handleAdd();
              }}
            >
              <SelectPicker
                value={mode}
                options={modeOptions}
                onChange={setMode}
                ariaLabel={t("investment.updatePriceTitle")}
              />

              {mode === "perShare" ? (
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-muted">
                    {t("investment.pricePerShare")}
                  </span>
                  <ClearableInput
                    ref={firstInputRef}
                    value={perShare}
                    onValueChange={setPerShare}
                    inputMode="decimal"
                    placeholder={t("investment.pricePlaceholder")}
                    className={inputClass}
                  />
                </label>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-muted">
                      {t("investment.totalValueLabel")}
                    </span>
                    <ClearableInput
                      ref={firstInputRef}
                      value={totalValue}
                      onValueChange={setTotalValue}
                      inputMode="decimal"
                      className={inputClass}
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-muted">
                      {t("investment.shareCountLabel")}
                    </span>
                    <ClearableInput
                      value={shareCount}
                      onValueChange={setShareCount}
                      inputMode="decimal"
                      className={inputClass}
                    />
                  </label>
                </div>
              )}

              {mode === "total" && derivedPrice !== null && (
                <p className="m-0 text-xs text-muted">
                  {t("investment.pricePerShare")}:{" "}
                  <span className="tabular-nums text-fg-bright">
                    {formatBalance(derivedPrice, settings, {
                      neverAbbreviate: true,
                    })}
                  </span>
                </p>
              )}

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
                {t("investment.priceHistory")}
              </span>
              {prices.length === 0 ? (
                <p className="m-0 text-xs text-muted">
                  {t("investment.noPriceHistory")}
                </p>
              ) : (
                <ul className="m-0 flex list-none flex-col gap-1 p-0">
                  {prices.map((point) => (
                    <li
                      key={point.id}
                      className="flex items-center justify-between gap-2 rounded border border-line bg-surface-2 px-2 py-1.5 text-sm"
                    >
                      <span className="text-muted">
                        {formatDate(point.date, settings.dateFormat, lang)}
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="tabular-nums text-fg-bright">
                          {formatBalance(point.pricePerShare, settings, {
                            neverAbbreviate: true,
                          })}
                        </span>
                        <button
                          type="button"
                          onClick={() => onDeletePrice(position.id, point.id)}
                          aria-label={t("investment.deletePrice")}
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
      <BatchValueImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        subject={position.name}
        valueLabel={t("investment.pricePerShare")}
        settings={settings}
        onImport={(points) => onImportPrices(position.id, points)}
      />
    </>
  );
}
