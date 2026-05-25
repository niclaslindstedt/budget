import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Copy, Move } from "lucide-react";

import type { Row } from "../data/types";
import { useLang, useT } from "../i18n";
import { bcp47, type Lang } from "../i18n/locale";
import { Button } from "./form";
import { Modal } from "./Modal";

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

const monthCache = new Map<Lang, Intl.DateTimeFormat>();
const yearMonthCache = new Map<Lang, Intl.DateTimeFormat>();

function monthFmt(lang: Lang): Intl.DateTimeFormat {
  let f = monthCache.get(lang);
  if (!f) {
    f = new Intl.DateTimeFormat(bcp47(lang), { month: "short" });
    monthCache.set(lang, f);
  }
  return f;
}

function yearMonthFmt(lang: Lang): Intl.DateTimeFormat {
  let f = yearMonthCache.get(lang);
  if (!f) {
    f = new Intl.DateTimeFormat(bcp47(lang), {
      month: "long",
      year: "numeric",
    });
    yearMonthCache.set(lang, f);
  }
  return f;
}

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
  const t = useT();
  const lang = useLang();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    setYear(today.getFullYear());
    setSelected(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const months = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => {
        const m = i + 1;
        const key = monthKey(year, m);
        return {
          key,
          label: monthFmt(lang).format(new Date(year, i, 1)),
          isSource: sourceMonths.has(key),
        };
      }),
    [year, sourceMonths, lang],
  );

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

  const titleKey = isMove
    ? rows.length === 1
      ? "moveCopy.moveTitle"
      : "moveCopy.moveTitlePlural"
    : rows.length === 1
      ? "moveCopy.copyTitle"
      : "moveCopy.copyTitlePlural";

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="move-copy-title"
      size="max-w-md"
      centered
    >
      <Modal.Header
        icon={
          isMove ? (
            <Move size={14} aria-hidden focusable={false} />
          ) : (
            <Copy size={14} aria-hidden focusable={false} />
          )
        }
        title={t(titleKey, { n: rows.length })}
        onClose={onClose}
      />
      <Modal.Body>
        <p className="mb-3 text-xs text-muted">
          {isMove ? t("moveCopy.moveHint") : t("moveCopy.copyHint")}
        </p>

        <div className="mb-3 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setYear((y) => y - 1)}
            aria-label={t("moveCopy.prevYear")}
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
            aria-label={t("moveCopy.nextYear")}
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
            <div className="mb-1 text-muted">{t("moveCopy.targets")}</div>
            <div className="flex flex-wrap gap-1.5">
              {[...selected].sort().map((k) => {
                const [y, m] = k.split("-").map(Number);
                return (
                  <span
                    key={k}
                    className="rounded border border-line bg-surface px-1.5 py-0.5 font-mono text-path"
                  >
                    {yearMonthFmt(lang).format(new Date(y, m - 1, 1))}
                  </span>
                );
              })}
            </div>
          </div>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button
          variant="primary"
          onClick={handleSubmit}
          disabled={selected.size === 0}
        >
          {isMove
            ? t("moveCopy.move")
            : selected.size === 1
              ? t("moveCopy.copyTo", { n: selected.size })
              : t("moveCopy.copyToPlural", { n: selected.size })}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
