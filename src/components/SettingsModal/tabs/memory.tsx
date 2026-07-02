import { useT } from "../../../i18n";
import { Section } from "./shared";

export function MemoryTab({
  merchantHintCount,
  recurringDismissalCount,
  transferDismissalCount,
  duplicateIgnoreCount,
  ignoredCarExpenseCount,
  carExpenseExclusionCount,
  onClearMerchantHints,
  onClearRecurringDismissals,
  onClearTransferDismissals,
  onClearDuplicateIgnores,
  onClearIgnoredCarExpenses,
  onClearCarExpenseExclusions,
}: {
  merchantHintCount: number;
  recurringDismissalCount: number;
  transferDismissalCount: number;
  duplicateIgnoreCount: number;
  ignoredCarExpenseCount: number;
  carExpenseExclusionCount: number;
  onClearMerchantHints: () => void;
  onClearRecurringDismissals: () => void;
  onClearTransferDismissals: () => void;
  onClearDuplicateIgnores: () => void;
  onClearIgnoredCarExpenses: () => void;
  onClearCarExpenseExclusions: () => void;
}) {
  const t = useT();
  return (
    <Section title={t("settings.tabs.memory")}>
      <ClearRow
        label={t("settings.memory.merchantTitle")}
        count={merchantHintCount}
        hint={
          merchantHintCount === 0
            ? t("settings.memory.none")
            : t("settings.memory.merchantHint")
        }
        buttonLabel={t("settings.memory.clearMerchants")}
        onClear={onClearMerchantHints}
      />
      <ClearRow
        label={t("settings.memory.dismissedRecurringTitle")}
        count={recurringDismissalCount}
        hint={
          recurringDismissalCount === 0
            ? t("settings.memory.none")
            : t("settings.memory.dismissedRecurringHint")
        }
        buttonLabel={t("settings.memory.clearDismissed")}
        onClear={onClearRecurringDismissals}
      />
      <ClearRow
        label={t("settings.memory.dismissedTransferTitle")}
        count={transferDismissalCount}
        hint={
          transferDismissalCount === 0
            ? t("settings.memory.none")
            : t("settings.memory.dismissedTransferHint")
        }
        buttonLabel={t("settings.memory.clearDismissed")}
        onClear={onClearTransferDismissals}
      />
      <ClearRow
        label={t("settings.memory.duplicateIgnoreTitle")}
        count={duplicateIgnoreCount}
        hint={
          duplicateIgnoreCount === 0
            ? t("settings.memory.none")
            : t("settings.memory.duplicateIgnoreHint")
        }
        buttonLabel={t("settings.memory.clearDismissed")}
        onClear={onClearDuplicateIgnores}
      />
      <ClearRow
        label={t("settings.cars.ignoredLabel")}
        count={ignoredCarExpenseCount}
        hint={
          ignoredCarExpenseCount === 0
            ? t("settings.cars.ignoredNone")
            : t("settings.cars.ignoredHint", { n: ignoredCarExpenseCount })
        }
        buttonLabel={t("settings.cars.clearIgnored")}
        onClear={onClearIgnoredCarExpenses}
      />
      <ClearRow
        label={t("settings.cars.excludedLabel")}
        count={carExpenseExclusionCount}
        hint={
          carExpenseExclusionCount === 0
            ? t("settings.cars.excludedNone")
            : t("settings.cars.excludedHint", { n: carExpenseExclusionCount })
        }
        buttonLabel={t("settings.cars.clearExcluded")}
        onClear={onClearCarExpenseExclusions}
      />
    </Section>
  );
}

function ClearRow({
  label,
  count,
  hint,
  buttonLabel,
  onClear,
}: {
  label: string;
  count: number;
  hint: string;
  buttonLabel: string;
  onClear: () => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-fg">{label}</span>
        <button
          type="button"
          onClick={onClear}
          disabled={count === 0}
          className="cursor-pointer rounded border border-line px-2.5 py-1 text-xs text-muted hover:border-danger hover:text-danger disabled:cursor-not-allowed disabled:opacity-50"
        >
          {buttonLabel}
        </button>
      </div>
      <p className="text-xs text-muted">{hint}</p>
    </div>
  );
}
