import { useEffect, useState } from "react";

import { Modal } from "./Modal";

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

  useEffect(() => {
    if (!open) return;
    setUntilEnabled(false);
    setUntilDate(lastSeriesDate ?? anchorDate);
  }, [open, anchorDate, lastSeriesDate]);

  return (
    <Modal
      open={open}
      onClose={onCancel}
      labelledBy="apply-series-title"
      role="alertdialog"
      size="max-w-md"
      scrollableBody={false}
    >
      <Modal.Header title="Apply to recurring entries?" onClose={onCancel} />
      <div className="border-b border-line px-4 py-3 text-sm text-fg">
        <p className="mb-2">
          {fieldLabel} updated on this entry ({anchorDate || "no date"}). Apply
          the same change to all following entries in this series?
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
    </Modal>
  );
}
