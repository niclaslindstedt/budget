import { useEffect, useState } from "react";
import { X } from "lucide-react";

import { useBodyScrollLock } from "../utils/scroll-lock";

type Props = {
  open: boolean;
  // Human-readable field name for the description ("Description", "Amount",
  // "Category"). Drives the dialog copy so the user knows what propagates.
  fieldLabel: string;
  // ISO date of the row the user just edited — surfaced so the user can
  // see exactly where the "all following" sweep starts from.
  anchorDate: string;
  // Last ISO date in the same series; defaults the "stop after" picker
  // and acts as the right-edge clamp the user can pull leftward.
  lastSeriesDate: string | null;
  // Called when the user dismisses the dialog without propagating. The
  // already-applied edit on the anchor row stays in place — only the
  // series-wide sweep is skipped.
  onCancel: () => void;
  // Called when the user confirms the sweep. `untilIso` is `null` for
  // "all future" and an ISO date for the bounded "stop after" case.
  onApplyToFuture: (untilIso: string | null) => void;
};

export function ApplySeriesEditDialog({
  open,
  fieldLabel,
  anchorDate,
  lastSeriesDate,
  onCancel,
  onApplyToFuture,
}: Props) {
  const [untilEnabled, setUntilEnabled] = useState(false);
  const [untilDate, setUntilDate] = useState(lastSeriesDate ?? anchorDate);

  useBodyScrollLock(open);

  useEffect(() => {
    if (!open) return;
    setUntilEnabled(false);
    setUntilDate(lastSeriesDate ?? anchorDate);
  }, [open, anchorDate, lastSeriesDate]);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="apply-series-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="flex w-full max-w-md flex-col overflow-hidden rounded-t-lg bg-surface shadow-2xl sm:rounded-lg">
        <header className="flex items-center justify-between border-b border-line bg-surface-3 px-4 py-3">
          <h2
            id="apply-series-title"
            className="text-sm font-bold tracking-wide text-fg-bright"
          >
            Apply to recurring entries?
          </h2>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close"
            className="-mr-1 inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded text-muted hover:bg-surface-2 hover:text-fg"
          >
            <X size={18} aria-hidden focusable={false} />
          </button>
        </header>

        <div className="border-b border-line px-4 py-3 text-sm text-fg">
          <p className="mb-2">
            {fieldLabel} updated on this entry ({anchorDate || "no date"}).
            Apply the same change to all following entries in this series?
          </p>
          <label className="mt-2 inline-flex cursor-pointer items-center gap-2 text-xs text-muted">
            <input
              type="checkbox"
              checked={untilEnabled}
              onChange={(e) => setUntilEnabled(e.target.checked)}
            />
            Stop after a date (temporary change)
          </label>
          {untilEnabled && (
            <input
              type="date"
              value={untilDate}
              onChange={(e) => setUntilDate(e.target.value)}
              className="field-input mt-1.5 ml-6 rounded border border-line bg-surface-2 px-2 py-1 text-sm text-path"
            />
          )}
        </div>

        <div className="flex flex-col gap-2 px-4 py-3">
          <button
            type="button"
            onClick={() => onApplyToFuture(untilEnabled ? untilDate : null)}
            className="cursor-pointer rounded border border-accent bg-accent/10 px-3 py-2 text-left text-sm font-medium text-accent hover:bg-accent/20"
          >
            Apply to all following entries
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="cursor-pointer rounded border border-line px-3 py-2 text-left text-sm text-fg hover:border-accent hover:text-fg-bright"
          >
            Just this entry
          </button>
        </div>
      </div>
    </div>
  );
}
