import { useRef, useState } from "react";
import { ArrowLeftRight } from "lucide-react";

import { newId } from "../../data/sheet";
import type {
  Settings,
  StockPosition,
  StockTransaction,
} from "../../data/types";
import { useResetOnOpen } from "../../hooks";
import { useLang, useT } from "../../i18n";
import { todayIso } from "../../utils/date";
import { formatBalance, formatDate, parseAmount } from "../../utils/format";
import {
  Button,
  ClearableInput,
  DateField,
  SelectPicker,
  type SelectOption,
} from "../form";
import { Modal } from "../Modal";

// Record a buy or sell on a stock position — appends one signed-shares
// transaction (positive buy, negative sell). The share count and average
// cost are derived from the log, so this is the only place trades are
// entered. Lists past trades newest-first with a delete affordance. The
// inline "Add" button appends without closing so a run of trades can be
// entered back-to-back.
//
// Not `centered`: the share / price fields open the soft keyboard.

type TradeKind = "buy" | "sell";

type Props = {
  open: boolean;
  position: StockPosition | null;
  settings: Settings;
  onClose: () => void;
  onAddTransaction: (positionId: string, tx: StockTransaction) => void;
  onDeleteTransaction: (positionId: string, txId: string) => void;
};

export function StockTransactionModal({
  open,
  position,
  settings,
  onClose,
  onAddTransaction,
  onDeleteTransaction,
}: Props) {
  const t = useT();
  const lang = useLang();
  const [kind, setKind] = useState<TradeKind>("buy");
  const [shares, setShares] = useState("");
  const [price, setPrice] = useState("");
  const [date, setDate] = useState("");
  const sharesRef = useRef<HTMLInputElement | null>(null);

  useResetOnOpen(open, position?.id, () => {
    setKind("buy");
    setShares("");
    setPrice("");
    setDate(todayIso());
  });

  if (!open || !position) return null;

  const parsedShares = parseAmount(shares);
  const parsedPrice = parseAmount(price);
  const canSubmit =
    parsedShares !== null &&
    parsedShares > 0 &&
    parsedPrice !== null &&
    parsedPrice >= 0 &&
    date !== "";

  function handleAdd() {
    if (
      parsedShares === null ||
      parsedShares <= 0 ||
      parsedPrice === null ||
      date === "" ||
      !position
    )
      return;
    const signed =
      kind === "sell" ? -Math.abs(parsedShares) : Math.abs(parsedShares);
    onAddTransaction(position.id, {
      id: newId(),
      date,
      shares: signed,
      pricePerShare: Math.abs(parsedPrice),
    });
    setShares("");
    setPrice("");
    sharesRef.current?.focus();
  }

  const kindOptions: SelectOption<TradeKind>[] = [
    { value: "buy", label: t("investment.buy") },
    { value: "sell", label: t("investment.sell") },
  ];

  // Newest first.
  const trades = [...position.transactions].sort((a, b) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : 0,
  );

  const inputClass =
    "field-input w-full min-w-0 rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-fg font-mono";

  return (
    <Modal
      open
      onClose={onClose}
      labelledBy="stock-transaction-modal-title"
      size="max-w-sm"
    >
      <Modal.Header
        icon={<ArrowLeftRight size={14} aria-hidden focusable={false} />}
        title={t("investment.tradeTitle")}
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
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted">
                {t("investment.tradeKindLabel")}
              </span>
              <SelectPicker
                value={kind}
                options={kindOptions}
                onChange={setKind}
                ariaLabel={t("investment.tradeKindLabel")}
              />
            </label>

            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted">
                  {t("investment.sharesLabel")}
                </span>
                <ClearableInput
                  ref={sharesRef}
                  value={shares}
                  onValueChange={setShares}
                  inputMode="decimal"
                  className={inputClass}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted">
                  {t("investment.priceLabel")}
                </span>
                <ClearableInput
                  value={price}
                  onValueChange={setPrice}
                  inputMode="decimal"
                  className={inputClass}
                />
              </label>
            </div>

            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted">
                {t("investment.tradeDateLabel")}
              </span>
              <DateField value={date} max={todayIso()} onChange={setDate} />
            </label>

            <Button type="submit" variant="primary" disabled={!canSubmit}>
              {t("common.add")}
            </Button>
          </form>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-bold tracking-wider uppercase text-muted">
              {t("investment.tradeHistory")}
            </span>
            {trades.length === 0 ? (
              <p className="m-0 text-xs text-muted">
                {t("investment.noTrades")}
              </p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-1 p-0">
                {trades.map((tx) => {
                  const isSell = tx.shares < 0;
                  const count = Math.abs(tx.shares);
                  return (
                    <li
                      key={tx.id}
                      className="flex items-center justify-between gap-2 rounded border border-line bg-surface-2 px-2 py-1.5 text-sm"
                    >
                      <span className="flex flex-col gap-0.5">
                        <span
                          className={isSell ? "text-negative" : "text-positive"}
                        >
                          {isSell
                            ? t("investment.tradeSell", { shares: count })
                            : t("investment.tradeBuy", { shares: count })}
                        </span>
                        <span className="text-xs text-muted">
                          {formatDate(tx.date, settings.dateFormat, lang)} ·{" "}
                          {formatBalance(tx.pricePerShare, settings, {
                            neverAbbreviate: true,
                          })}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => onDeleteTransaction(position.id, tx.id)}
                        aria-label={t("investment.deleteTrade")}
                        className="cursor-pointer rounded border-0 bg-transparent px-1 text-xs text-muted hover:text-danger"
                      >
                        ✕
                      </button>
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
