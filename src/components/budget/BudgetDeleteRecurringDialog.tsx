import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader } from "lucide-react";

import { rowsInSeriesFrom } from "../../data/budget/rows";
import type { Row, Settings } from "../../data/types";
import { useT } from "../../i18n";
import { formatDate } from "../../utils/format";
import { Checkbox } from "../form";
import { Modal } from "../Modal";

type Props = {
  open: boolean;
  row: Row | null;
  rows: readonly Row[];
  dateColumnId: string | null;
  lastSeriesDate: string | null;
  settings: Settings;
  onCancel: () => void;
  // Called with the ids the user wants removed. Always includes the
  // anchor row; for the future-scope path, includes every remaining row
  // in the series, optionally bounded by the "stop after" date.
  onDelete: (rowIds: string[]) => void;
};

// Scope picker for deleting a row that belongs to a recurring series.
// Modelled on ApplySeriesDialog — the user picks "just this", or
// "this and all future", and can optionally clamp the future sweep to
// an inclusive end date (useful for stopping a salary stream during
// parental leave and resuming it later).
export function BudgetDeleteRecurringDialog({
  open,
  row,
  rows,
  dateColumnId,
  lastSeriesDate,
  settings,
  onCancel,
  onDelete,
}: Props) {
  const t = useT();
  const anchorDate =
    row && dateColumnId && typeof row.cells[dateColumnId] === "string"
      ? (row.cells[dateColumnId] as string)
      : "";
  const initialUntil = lastSeriesDate ?? anchorDate;
  const [untilEnabled, setUntilEnabled] = useState(false);
  const [untilDate, setUntilDate] = useState(initialUntil);
  const [pendingIndex, setPendingIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setUntilEnabled(false);
    setUntilDate(initialUntil);
    setPendingIndex(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, row?.id]);

  const seriesIds = useMemo<string[]>(() => {
    if (!row?.seriesId || !dateColumnId) return [];
    return rowsInSeriesFrom(
      rows as Row[],
      row,
      dateColumnId,
      untilEnabled ? untilDate : null,
    ).map((r) => r.id);
  }, [row, rows, dateColumnId, untilEnabled, untilDate]);

  if (!row) return null;

  const isPending = pendingIndex !== null;

  const runAction = (index: number, onSelect: () => void) => {
    if (isPending) return;
    setPendingIndex(index);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => onSelect());
    });
  };

  const handleClose = () => {
    if (isPending) return;
    onCancel();
  };

  const formattedUntil = untilDate
    ? formatDate(untilDate, settings.dateFormat, settings.language)
    : "";

  const futureLabel =
    untilEnabled && formattedUntil
      ? t("app.thisAndAllThrough", {
          date: formattedUntil,
          n: seriesIds.length,
        })
      : t("app.thisAndAllFuture", { n: seriesIds.length });

  const buttons: {
    label: string;
    onSelect: () => void;
    disabled?: boolean;
  }[] = [
    {
      label: t("app.justThisOne"),
      onSelect: () => onDelete([row.id]),
    },
    {
      label: futureLabel,
      disabled: seriesIds.length === 0,
      onSelect: () => onDelete(seriesIds),
    },
  ];

  return (
    <Modal
      open={open}
      onClose={handleClose}
      labelledBy="delete-recurring-title"
      role="alertdialog"
      size="max-w-md"
      scrollableBody={false}
      centered
    >
      <Modal.Header
        icon={<AlertTriangle size={14} aria-hidden focusable={false} />}
        title={t("confirm.deleteRecurring")}
        onClose={handleClose}
      />
      <div className="flex flex-1 flex-col justify-center">
        <div className="border-b border-line px-4 py-3 text-sm text-fg">
          <p>{t("confirm.deleteRecurringHint")}</p>
          <div className="mt-3 flex flex-col gap-1.5 rounded border border-line bg-surface px-2.5 py-2 text-xs text-muted">
            <Checkbox
              checked={untilEnabled}
              onChange={setUntilEnabled}
              label={t("confirm.deleteRecurringStopAfter")}
              className="items-center"
            />
            {untilEnabled && (
              <input
                type="date"
                value={untilDate}
                min={anchorDate || undefined}
                onChange={(e) => setUntilDate(e.target.value)}
                className="field-input rounded border border-line bg-surface-2 px-2 py-1 text-sm text-path"
              />
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2 px-4 py-3">
          {buttons.map((btn, i) => {
            const buttonPending = pendingIndex === i;
            return (
              <button
                key={i}
                type="button"
                onClick={() => runAction(i, btn.onSelect)}
                disabled={isPending || btn.disabled}
                aria-busy={buttonPending || undefined}
                className={`flex items-center justify-center gap-2 rounded border border-danger/60 bg-danger/10 px-3 py-2 text-center text-sm font-medium text-danger hover:bg-danger/20 disabled:cursor-not-allowed disabled:opacity-50 ${
                  isPending && !buttonPending ? "opacity-50" : ""
                } ${isPending || btn.disabled ? "" : "cursor-pointer"}`}
              >
                <span>{btn.label}</span>
                {buttonPending && (
                  <Loader
                    size={14}
                    aria-hidden
                    focusable={false}
                    className="animate-spin"
                  />
                )}
              </button>
            );
          })}
          <button
            type="button"
            onClick={handleClose}
            disabled={isPending}
            className={`rounded border border-line px-3 py-2 text-sm text-muted hover:text-fg disabled:cursor-not-allowed disabled:opacity-50 ${
              isPending ? "" : "cursor-pointer"
            }`}
          >
            {t("common.cancel")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
