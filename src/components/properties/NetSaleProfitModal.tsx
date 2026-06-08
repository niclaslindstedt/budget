import { useState } from "react";
import { Calculator } from "lucide-react";

import { currentPropertyValue } from "../../data/property-value/value";
import { computePropertySale } from "../../data/tax/engine";
import type {
  BrokerCost,
  Property,
  PropertySaleEstimate,
  Settings,
} from "../../data/types";
import { useResetOnOpen } from "../../hooks";
import { useT } from "../../i18n";
import { formatBalance, parseAmount } from "../../utils/format";
import { Button, ClearableInput, SelectPicker, Slider } from "../form";
import { Modal } from "../Modal";

// Estimate the net proceeds of selling a property: sale price less broker
// fee, advertising, repairs/renovations, the purchase price, and the
// location's capital-gains tax. A slider lets the user sweep the sale
// price and watch the bottom line move. The broker is modelled by a mode
// picker (none / fixed / percent / tiered) with that mode's inputs.
//
// Repairs and purchase price prefill live from the property; only the
// broker model, advertising cost, and the slider's last sale price are
// persisted (`Property.saleEstimate`) — and only when the user changes
// something, so merely opening the estimator never writes history.
//
// Not `centered`: the cost fields open the soft keyboard.

type Props = {
  open: boolean;
  property: Property | null;
  settings: Settings;
  onClose: () => void;
  onSaveEstimate: (propertyId: string, estimate: PropertySaleEstimate) => void;
};

type BrokerMode = BrokerCost["mode"];

// A round slider step that yields ~200 stops across the range, so a drag
// feels smooth at every property scale.
function sliderStep(max: number): number {
  const raw = max / 200;
  const magnitude = Math.pow(10, Math.floor(Math.log10(Math.max(1, raw))));
  return Math.max(magnitude, 1);
}

export function NetSaleProfitModal({
  open,
  property,
  settings,
  onClose,
  onSaveEstimate,
}: Props) {
  const t = useT();

  const [sellPrice, setSellPrice] = useState(0);
  const [advertisement, setAdvertisement] = useState("");
  const [repairs, setRepairs] = useState("");
  const [purchase, setPurchase] = useState("");
  const [brokerMode, setBrokerMode] = useState<BrokerMode>("percent");
  const [brokerAmount, setBrokerAmount] = useState("");
  const [brokerPercent, setBrokerPercent] = useState("");
  const [brokerBase, setBrokerBase] = useState("");
  const [brokerThreshold, setBrokerThreshold] = useState("");
  // Only persist when the user actually edits something — opening and
  // closing the estimator must not write an undo entry.
  const [dirty, setDirty] = useState(false);

  useResetOnOpen(open, property?.id, () => {
    if (!property) return;
    const est = property.saleEstimate;
    const broker = est?.broker ?? { mode: "percent", percent: 2.5 };
    const repairsTotal = property.repairs.reduce((sum, r) => sum + r.amount, 0);

    setSellPrice(
      est?.sellPrice ??
        currentPropertyValue(property) ??
        property.purchaseAmount ??
        0,
    );
    setAdvertisement(
      est?.advertisementCost !== undefined ? String(est.advertisementCost) : "",
    );
    setRepairs(repairsTotal > 0 ? String(repairsTotal) : "");
    setPurchase(
      property.purchaseAmount !== undefined
        ? String(property.purchaseAmount)
        : "",
    );
    setBrokerMode(broker.mode);
    setBrokerAmount(broker.mode === "fixed" ? String(broker.amount) : "");
    setBrokerPercent(
      broker.mode === "percent" || broker.mode === "tiered"
        ? String(broker.percent)
        : "2.5",
    );
    setBrokerBase(broker.mode === "tiered" ? String(broker.base) : "");
    setBrokerThreshold(
      broker.mode === "tiered" ? String(broker.threshold) : "",
    );
    setDirty(false);
  });

  if (!open || !property) return null;

  function num(text: string): number {
    return parseAmount(text) ?? 0;
  }

  function buildBroker(): BrokerCost {
    switch (brokerMode) {
      case "none":
        return { mode: "none" };
      case "fixed":
        return { mode: "fixed", amount: num(brokerAmount) };
      case "percent":
        return { mode: "percent", percent: num(brokerPercent) };
      case "tiered":
        return {
          mode: "tiered",
          base: num(brokerBase),
          threshold: num(brokerThreshold),
          percent: num(brokerPercent),
        };
    }
  }

  const broker = buildBroker();
  const result = computePropertySale(settings.location, {
    sellPrice,
    purchasePrice: num(purchase),
    repairs: num(repairs),
    advertisementCost: num(advertisement),
    broker,
  });

  const baseValue =
    currentPropertyValue(property) ?? property.purchaseAmount ?? sellPrice ?? 0;
  const sliderMax = baseValue > 0 ? Math.ceil(baseValue * 2) : 5_000_000;
  const step = sliderStep(sliderMax);

  function handleClose() {
    if (property && dirty) {
      onSaveEstimate(property.id, {
        sellPrice,
        advertisementCost: num(advertisement),
        broker: buildBroker(),
      });
    }
    onClose();
  }

  const brokerOptions = (["none", "fixed", "percent", "tiered"] as const).map(
    (mode) => ({
      value: mode,
      label: t(`properties.netSale.broker.${mode}`),
    }),
  );

  const numberInputClass =
    "field-input w-full min-w-0 rounded border border-line bg-surface-2 px-2 py-1.5 text-right font-mono tabular-nums text-sm text-fg-bright";

  // The cost lines (everything except the trailing tax line, which we
  // render below the taxable-gain subtotal).
  const costLines = result.lineItems.filter((it) => it.key !== "tax");
  const taxLine = result.lineItems.find((it) => it.key === "tax");

  const profit = result.netProfit >= 0;

  return (
    <Modal
      open
      onClose={handleClose}
      labelledBy="net-sale-profit-title"
      size="max-w-md"
    >
      <Modal.Header
        icon={<Calculator size={14} aria-hidden focusable={false} />}
        title={t("properties.netSaleProfit")}
        onClose={handleClose}
      />
      <Modal.Body>
        <div className="flex flex-col gap-4">
          <p className="m-0 text-sm font-bold text-fg-bright">
            {property.name}
          </p>

          {/* Sale-price slider */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs text-muted">
                {t("properties.netSale.sliderLabel")}
              </span>
              <span className="font-mono text-sm font-bold tabular-nums text-fg-bright">
                {formatBalance(sellPrice, settings, { neverAbbreviate: true })}
              </span>
            </div>
            <Slider
              min={0}
              max={sliderMax}
              step={step}
              value={sellPrice}
              onChange={(v) => {
                setSellPrice(v);
                setDirty(true);
              }}
              ariaLabel={t("properties.netSale.sliderLabel")}
              formatValueText={(v) =>
                formatBalance(v, settings, { neverAbbreviate: true })
              }
            />
          </div>

          {/* Cost inputs */}
          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">
              {t("properties.netSale.purchasePrice")}
            </span>
            <ClearableInput
              value={purchase}
              onValueChange={(v) => {
                setPurchase(v);
                setDirty(true);
              }}
              inputMode="decimal"
              className={numberInputClass}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">
              {t("properties.netSale.repairs")}
            </span>
            <ClearableInput
              value={repairs}
              onValueChange={(v) => {
                setRepairs(v);
                setDirty(true);
              }}
              inputMode="decimal"
              className={numberInputClass}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-muted">
              {t("properties.netSale.advertisement")}
            </span>
            <ClearableInput
              value={advertisement}
              onValueChange={(v) => {
                setAdvertisement(v);
                setDirty(true);
              }}
              inputMode="decimal"
              className={numberInputClass}
            />
          </label>

          {/* Broker model */}
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted">
              {t("properties.netSale.broker.label")}
            </span>
            <SelectPicker<BrokerMode>
              value={brokerMode}
              options={brokerOptions}
              onChange={(v) => {
                setBrokerMode(v);
                setDirty(true);
              }}
              ariaLabel={t("properties.netSale.broker.label")}
            />
          </div>

          {brokerMode === "fixed" && (
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted">
                {t("properties.netSale.broker.amount")}
              </span>
              <ClearableInput
                value={brokerAmount}
                onValueChange={(v) => {
                  setBrokerAmount(v);
                  setDirty(true);
                }}
                inputMode="decimal"
                className={numberInputClass}
              />
            </label>
          )}

          {brokerMode === "percent" && (
            <label className="flex flex-col gap-1">
              <span className="text-xs text-muted">
                {t("properties.netSale.broker.percentRate")}
              </span>
              <ClearableInput
                value={brokerPercent}
                onValueChange={(v) => {
                  setBrokerPercent(v);
                  setDirty(true);
                }}
                inputMode="decimal"
                className={numberInputClass}
              />
            </label>
          )}

          {brokerMode === "tiered" && (
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted">
                  {t("properties.netSale.broker.base")}
                </span>
                <ClearableInput
                  value={brokerBase}
                  onValueChange={(v) => {
                    setBrokerBase(v);
                    setDirty(true);
                  }}
                  inputMode="decimal"
                  className={numberInputClass}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted">
                  {t("properties.netSale.broker.threshold")}
                </span>
                <ClearableInput
                  value={brokerThreshold}
                  onValueChange={(v) => {
                    setBrokerThreshold(v);
                    setDirty(true);
                  }}
                  inputMode="decimal"
                  className={numberInputClass}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-muted">
                  {t("properties.netSale.broker.percentRate")}
                </span>
                <ClearableInput
                  value={brokerPercent}
                  onValueChange={(v) => {
                    setBrokerPercent(v);
                    setDirty(true);
                  }}
                  inputMode="decimal"
                  className={numberInputClass}
                />
              </label>
              <p className="m-0 text-xs text-muted">
                {t("properties.netSale.broker.tieredHint")}
              </p>
            </div>
          )}

          {/* Breakdown */}
          <div className="flex flex-col gap-2 rounded border border-line bg-surface-2 p-3">
            {costLines.map((it) => (
              <div
                key={it.key}
                className="flex items-baseline justify-between gap-3 text-sm"
              >
                <span className="text-muted">
                  {t(`properties.netSale.line.${it.key}`)}
                </span>
                <span className="font-mono tabular-nums text-fg-bright">
                  {it.sign === -1 ? "−" : ""}
                  {formatBalance(it.amount, settings, {
                    neverAbbreviate: true,
                  })}
                </span>
              </div>
            ))}
            <div className="my-1 border-t border-line" />
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="text-muted">
                {t("properties.netSale.taxableGain")}
              </span>
              <span className="font-mono tabular-nums text-fg-bright">
                {formatBalance(result.taxableGain, settings, {
                  neverAbbreviate: true,
                })}
              </span>
            </div>
            {taxLine && (
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-muted">
                  {t("properties.netSale.line.tax")}
                </span>
                <span className="font-mono tabular-nums text-fg-bright">
                  −
                  {formatBalance(taxLine.amount, settings, {
                    neverAbbreviate: true,
                  })}
                </span>
              </div>
            )}
          </div>

          {/* Standout net result */}
          <div
            className={`flex items-baseline justify-between gap-3 rounded border px-3 py-3 ${
              profit
                ? "border-success/40 bg-success/10"
                : "border-danger/40 bg-danger/10"
            }`}
          >
            <span className="text-sm font-bold text-fg-bright">
              {profit
                ? t("properties.netSale.netProfit")
                : t("properties.netSale.netLoss")}
            </span>
            <span
              className={`font-mono text-lg font-bold tabular-nums ${
                profit ? "text-success" : "text-danger"
              }`}
            >
              {formatBalance(result.netProfit, settings, {
                neverAbbreviate: true,
              })}
            </span>
          </div>
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="primary" onClick={handleClose}>
          {t("common.done")}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
