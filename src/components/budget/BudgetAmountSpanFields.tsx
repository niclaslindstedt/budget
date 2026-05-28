import type { Settings } from "../../data/types";
import { useT } from "../../i18n";
import { SelectPicker, SignedAmountInput } from "../form";
import type { AmountMode } from "./budget-amount-span";

// Amount editor with an exact / estimate mode toggle, shared by every
// entry add / edit modal. "Exact" (the default) is a single signed
// amount — today's behaviour. "Estimate" exposes a signed minimum /
// estimate / maximum band: the estimate drives the running balance and
// the table cell, while [min, max] only widens what an imported bank
// amount may be and still reconcile to the row (see `amountWithinSpan`
// in `src/data/reconciliation.ts`). The sign toggle is shared across all
// three inputs so a single +/- flips the whole band.
//
// Controlled component — each modal owns its own state slice (the mode,
// the three magnitude strings, and the shared sign) and feeds it back
// through the callbacks. The component stays pure and stateless.

type Props = {
  mode: AmountMode;
  onModeChange: (next: AmountMode) => void;
  // Shared sign across exact + all three estimate inputs.
  negative: boolean;
  onToggleSign: () => void;
  // The exact amount in "exact" mode; the estimate in "estimate" mode.
  amount: string;
  onAmountChange: (next: string) => void;
  min: string;
  onMinChange: (next: string) => void;
  max: string;
  onMaxChange: (next: string) => void;
  settings: Settings;
  disabled?: boolean;
  // Background surface for the inputs — matches the surrounding modal.
  surface?: "surface" | "surface-2";
  // Suppress the leading "Amount" caption when the host already renders
  // one (the complex modal pairs it with an `fx` toggle). The mode
  // picker keeps its accessible name via `ariaLabel`.
  hideLabel?: boolean;
};

export function BudgetAmountSpanFields({
  mode,
  onModeChange,
  negative,
  onToggleSign,
  amount,
  onAmountChange,
  min,
  onMinChange,
  max,
  onMaxChange,
  settings,
  disabled = false,
  surface = "surface-2",
  hideLabel = false,
}: Props) {
  const t = useT();

  const picker = (
    <SelectPicker<AmountMode>
      value={mode}
      onChange={onModeChange}
      disabled={disabled}
      ariaLabel={t("editEntry.amount")}
      options={[
        {
          value: "exact",
          label: t("editEntry.amountModeExact"),
          hint: t("editEntry.amountModeExactHint"),
        },
        {
          value: "estimate",
          label: t("editEntry.amountModeEstimate"),
          hint: t("editEntry.amountModeEstimateHint"),
        },
      ]}
    />
  );

  return (
    <div className="flex min-w-0 flex-col gap-2">
      {hideLabel ? (
        picker
      ) : (
        <label className="flex min-w-0 flex-col gap-1">
          <span className="text-xs text-muted">{t("editEntry.amount")}</span>
          {picker}
        </label>
      )}

      {mode === "exact" ? (
        <SignedAmountInput
          value={amount}
          negative={negative}
          onValueChange={onAmountChange}
          onToggleSign={onToggleSign}
          settings={settings}
          ariaLabel={t("editEntry.amount")}
          surface={surface}
          disabled={disabled}
        />
      ) : (
        <div className="grid grid-cols-[auto_1fr] items-center gap-x-2 gap-y-1.5">
          <span className="text-xs text-muted">{t("editEntry.amountMin")}</span>
          <SignedAmountInput
            value={min}
            negative={negative}
            onValueChange={onMinChange}
            onToggleSign={onToggleSign}
            settings={settings}
            ariaLabel={t("editEntry.amountMin")}
            surface={surface}
            disabled={disabled}
          />
          <span className="text-xs text-muted">
            {t("editEntry.amountEstimate")}
          </span>
          <SignedAmountInput
            value={amount}
            negative={negative}
            onValueChange={onAmountChange}
            onToggleSign={onToggleSign}
            settings={settings}
            ariaLabel={t("editEntry.amountEstimate")}
            surface={surface}
            disabled={disabled}
          />
          <span className="text-xs text-muted">{t("editEntry.amountMax")}</span>
          <SignedAmountInput
            value={max}
            negative={negative}
            onValueChange={onMaxChange}
            onToggleSign={onToggleSign}
            settings={settings}
            ariaLabel={t("editEntry.amountMax")}
            surface={surface}
            disabled={disabled}
          />
        </div>
      )}
    </div>
  );
}
