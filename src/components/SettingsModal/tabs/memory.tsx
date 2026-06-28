import { useT } from "../../../i18n";
import { Section } from "./shared";

export function MemoryTab({
  merchantHintCount,
  recurringDismissalCount,
  transferDismissalCount,
  duplicateIgnoreCount,
  onClearMerchantHints,
  onClearRecurringDismissals,
  onClearTransferDismissals,
  onClearDuplicateIgnores,
}: {
  merchantHintCount: number;
  recurringDismissalCount: number;
  transferDismissalCount: number;
  duplicateIgnoreCount: number;
  onClearMerchantHints: () => void;
  onClearRecurringDismissals: () => void;
  onClearTransferDismissals: () => void;
  onClearDuplicateIgnores: () => void;
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
