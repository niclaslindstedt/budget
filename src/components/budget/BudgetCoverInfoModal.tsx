import { useEffect, useState } from "react";
import { ArrowRight, Check, Copy, HandCoins } from "lucide-react";

import type { CoverTransfer } from "../../data/accounts/cover-transfer";
import type { HistoryEntry, Settings } from "../../data/types";
import { useT } from "../../i18n";
import {
  formatAmountForInput,
  formatDate,
  withCurrency,
} from "../../utils/format";
import { Modal } from "../Modal";
import { Button } from "../form";

type Props = {
  open: boolean;
  onClose: () => void;
  // The cover transfer to describe, plus the resolved entries it covers and
  // the human names of its two endpoints (resolved by the host since either
  // side can be an account or a saving).
  transfer: CoverTransfer | null;
  coveredEntries: HistoryEntry[];
  fromName: string;
  toName: string;
  settings: Settings;
};

export function BudgetCoverInfoModal({
  open,
  onClose,
  transfer,
  coveredEntries,
  fromName,
  toName,
  settings,
}: Props) {
  const t = useT();
  if (!transfer) return null;
  const amountText = formatAmountForInput(transfer.amount, settings);
  return (
    <Modal open={open} onClose={onClose} labelledBy="cover-info-title" centered>
      <Modal.Header
        icon={<HandCoins size={14} aria-hidden focusable={false} />}
        title={t("coverTransfer.infoTitle")}
        onClose={onClose}
      />
      <Modal.Body>
        <div className="flex flex-col gap-4">
          {/* Amount + message — the two values to copy into the bank. */}
          <div className="grid grid-cols-2 gap-2">
            <CopyField
              label={t("coverTransfer.amountToTransfer")}
              value={amountText}
              display={withCurrency(amountText, settings)}
              copyLabel={t("coverTransfer.copyAmount")}
            />
            <CopyField
              label={t("coverTransfer.messageLabel")}
              value={transfer.cover.message}
              display={transfer.cover.message}
              copyLabel={t("coverTransfer.copyMessage")}
            />
          </div>

          <p className="text-xs text-muted">
            {t("coverTransfer.instructions")}
          </p>

          {/* Route + status */}
          <div className="flex items-center justify-between rounded border border-line bg-surface-2 px-3 py-2 text-sm">
            <span className="flex min-w-0 items-center gap-2 text-fg-bright">
              <span className="truncate">{fromName}</span>
              <ArrowRight
                size={14}
                className="shrink-0 text-muted"
                aria-hidden
                focusable={false}
              />
              <span className="truncate">{toName}</span>
            </span>
            <span
              className={`shrink-0 text-xs font-bold ${
                transfer.completed ? "text-success" : "text-muted"
              }`}
            >
              {transfer.completed
                ? t("coverTransfer.statusCompleted")
                : t("coverTransfer.statusPending")}
            </span>
          </div>

          {transfer.cover.motivation.trim() !== "" && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-bold tracking-wider text-muted uppercase">
                {t("coverTransfer.motivationHeading")}
              </span>
              <p className="text-sm text-fg whitespace-pre-wrap">
                {transfer.cover.motivation}
              </p>
            </div>
          )}

          <div className="flex flex-col gap-1">
            <span className="text-xs font-bold tracking-wider text-muted uppercase">
              {t("coverTransfer.coveredHeading")}
            </span>
            <ul className="flex flex-col gap-1">
              {coveredEntries.map((e) => (
                <li
                  key={e.id}
                  className="flex items-center gap-2 text-xs text-fg"
                >
                  <span className="shrink-0 font-mono text-muted">
                    {formatDate(e.date, settings.dateFormat, settings.language)}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {e.description}
                  </span>
                  <span className="shrink-0 font-mono tabular-nums text-fg-bright">
                    {withCurrency(
                      formatAmountForInput(Math.abs(e.amount), settings),
                      settings,
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose}>
          {t("common.close")}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

// A boxed read-only value with a copy-to-clipboard button. `value` is the
// raw text written to the clipboard (the bare amount / message the bank
// wants); `display` is what's shown (the amount with its currency token).
function CopyField({
  label,
  value,
  display,
  copyLabel,
}: {
  label: string;
  value: string;
  display: string;
  copyLabel: string;
}) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(id);
  }, [copied]);
  const onCopy = () => {
    void navigator.clipboard?.writeText(value).then(
      () => setCopied(true),
      () => setCopied(false),
    );
  };
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-bold tracking-wider text-muted uppercase">
        {label}
      </span>
      <button
        type="button"
        onClick={onCopy}
        aria-label={copied ? t("coverTransfer.copied") : copyLabel}
        title={copied ? t("coverTransfer.copied") : copyLabel}
        className="flex cursor-pointer items-center justify-between gap-2 rounded border border-line bg-surface-2 px-2 py-1.5 text-left font-mono text-sm text-fg-bright hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <span className="min-w-0 truncate tabular-nums">{display}</span>
        {copied ? (
          <Check
            size={14}
            className="shrink-0 text-success"
            aria-hidden
            focusable={false}
          />
        ) : (
          <Copy
            size={14}
            className="shrink-0 text-muted"
            aria-hidden
            focusable={false}
          />
        )}
      </button>
    </div>
  );
}
