import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

import type { Row } from "../data/types";
import { useBodyScrollLock } from "../utils/scroll-lock";

type Props = {
  open: boolean;
  mode: "move" | "copy";
  rows: Row[];
  // Source month(s) the selection currently spans — those are disabled in
  // the picker so the user can't accidentally pick a no-op target.
  sourceMonths: ReadonlySet<string>;
  onClose: () => void;
  onSubmit: (targetMonths: string[]) => void;
};

const monthFormat = new Intl.DateTimeFormat(undefined, { month: "short" });
const yearMonthFormat = new Intl.DateTimeFormat(undefined, {
  month: "long",
  year: "numeric",
});

function monthKey(y: number, m: number): string {
  return `${y}-${String(m).padStart(2, "0")}`;
}

export function MoveCopyModal({
  open,
  mode,
  rows,
  sourceMonths,
  onClose,
  onSubmit,
}: Props) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useBodyScrollLock(open);

  useEffect(() => {
    if (!open) return;
    setYear(today.getFullYear());
    setSelected(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  const months = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => {
        const m = i + 1;
        const key = monthKey(year, m);
        return {
          key,
          label: monthFormat.format(new Date(year, i, 1)),
          isSource: sourceMonths.has(key),
        };
      }),
    [year, sourceMonths],
  );

  if (!open) return null;

  const isMove = mode === "move";

  function toggle(key: string) {
    if (isMove) {
      setSelected(new Set([key]));
      return;
    }
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function handleSubmit() {
    if (selected.size === 0) return;
    onSubmit([...selected].sort());
  }

  const noun = rows.length === 1 ? "entry" : "entries";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="move-copy-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[95vh] w-full max-w-md flex-col overflow-hidden rounded-t-lg bg-surface shadow-2xl sm:rounded-lg">
        <header className="flex items-center justify-between border-b border-line bg-surface-3 px-4 py-3">
          <h2
            id="move-copy-title"
            className="text-sm font-bold tracking-wide text-fg-bright"
          >
            {isMove ? "Move" : "Copy"} {rows.length} {noun}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded text-muted hover:bg-surface-2 hover:text-fg"
          >
            <X size={18} aria-hidden focusable={false} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          <p className="mb-3 text-xs text-muted">
            {isMove
              ? "Pick a target month. Day-of-month is preserved (clamped to month length)."
              : "Pick one or more target months. Each selected entry is duplicated into every target, preserving day-of-month."}
          </p>

          <div className="mb-3 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setYear((y) => y - 1)}
              aria-label="Previous year"
              className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded border border-line text-muted hover:border-accent hover:text-accent"
            >
              <ChevronLeft size={16} aria-hidden focusable={false} />
            </button>
            <span className="text-sm font-bold tracking-wider text-fg-bright tabular-nums">
              {year}
            </span>
            <button
              type="button"
              onClick={() => setYear((y) => y + 1)}
              aria-label="Next year"
              className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded border border-line text-muted hover:border-accent hover:text-accent"
            >
              <ChevronRight size={16} aria-hidden focusable={false} />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {months.map((m) => {
              const isSelected = selected.has(m.key);
              const cls = m.isSource
                ? "cursor-not-allowed border-line/50 text-muted/50"
                : isSelected
                  ? "border-accent bg-accent/15 text-accent"
                  : "border-line text-fg hover:border-accent hover:text-accent";
              return (
                <button
                  key={m.key}
                  type="button"
                  disabled={m.isSource}
                  onClick={() => toggle(m.key)}
                  className={`cursor-pointer rounded border px-2 py-2 text-sm font-medium tracking-wide uppercase ${cls}`}
                >
                  {m.label}
                </button>
              );
            })}
          </div>

          {selected.size > 0 && (
            <div className="mt-4 rounded border border-line bg-surface-3 p-3 text-xs">
              <div className="mb-1 text-muted">Targets</div>
              <div className="flex flex-wrap gap-1.5">
                {[...selected].sort().map((k) => {
                  const [y, m] = k.split("-").map(Number);
                  return (
                    <span
                      key={k}
                      className="rounded border border-line bg-surface px-1.5 py-0.5 font-mono text-path"
                    >
                      {yearMonthFormat.format(new Date(y, m - 1, 1))}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-line bg-surface-3 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded border border-line px-3 py-1.5 text-sm text-muted hover:text-fg"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={selected.size === 0}
            className="cursor-pointer rounded border border-accent bg-accent/10 px-3 py-1.5 text-sm font-bold text-accent hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isMove
              ? "Move"
              : `Copy to ${selected.size} ${selected.size === 1 ? "month" : "months"}`}
          </button>
        </footer>
      </div>
    </div>
  );
}
