import { useEffect, useState } from "react";
import { Repeat } from "lucide-react";

import { useT } from "../i18n";
import { Checkbox } from "./form";
import { Modal } from "./Modal";

// "Apply this edit to the rest of the recurring series?" prompt staged
// after a description / amount commit on a series row. Universal — the
// budget page sweeps the real rows (`propagateCellToFuture`) and the
// scenarios page sweeps that scenario's overrides
// (`propagateScenarioOverrideToFuture`); this dialog only collects the
// decision and the optional "stop after" bound.

type Props = {
  open: boolean;
  // Human-readable field name for the description ("Description", "Amount",
  // "Category"). Drives the dialog copy so the user knows what propagates.
  fieldLabel: string;
  // Pre-translated body overriding the default "{field} updated…" copy —
  // for changes that aren't a field edit (e.g. excluding a row from a
  // scenario). `fieldLabel` is ignored when this is set.
  promptBody?: string;
  // ISO date of the row the user just edited — surfaced so the user can
  // see exactly where the "all following" sweep starts from.
  anchorDate: string;
  // Last ISO date in the same series; defaults the "stop after" picker
  // and acts as the right-edge clamp the user can pull leftward.
  lastSeriesDate: string | null;
  // Called when the user dismisses the dialog (X, Escape, backdrop
  // click) without choosing a scope. Dismissal means "never mind" —
  // callers that stage the change until this dialog resolves drop it
  // here; the budget page's cell commit (already written by the cell
  // editor) simply skips the sweep.
  onCancel: () => void;
  // Called when the user explicitly picks "just this entry": apply the
  // change to the anchor row only, no series sweep.
  onJustThis: () => void;
  // Called when the user confirms the sweep. `untilIso` is `null` for
  // "all future" and an ISO date for the bounded "stop after" case.
  onApplyToFuture: (untilIso: string | null) => void;
};

export function ApplySeriesDialog({
  open,
  fieldLabel,
  promptBody,
  anchorDate,
  lastSeriesDate,
  onCancel,
  onJustThis,
  onApplyToFuture,
}: Props) {
  const t = useT();
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
      centered
    >
      <Modal.Header
        icon={<Repeat size={14} aria-hidden focusable={false} />}
        title={t("applySeries.titleApplyRecurring")}
        onClose={onCancel}
      />
      <div className="border-b border-line px-4 py-3 text-sm text-fg">
        <p className="mb-2">
          {promptBody ??
            t("applySeries.promptBody", {
              field: fieldLabel,
              date: anchorDate || t("applySeries.noDate"),
            })}
        </p>
        <Checkbox
          checked={untilEnabled}
          onChange={setUntilEnabled}
          label={
            <span className="text-xs text-muted">
              {t("applySeries.stopAfterDate")}
            </span>
          }
          className="mt-2 items-center"
        />
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
          {t("applySeries.applyAllFollowing")}
        </button>
        <button
          type="button"
          onClick={onJustThis}
          className="cursor-pointer rounded border border-line px-3 py-2 text-left text-sm text-fg hover:border-accent hover:text-fg-bright"
        >
          {t("applySeries.justThis")}
        </button>
      </div>
    </Modal>
  );
}
