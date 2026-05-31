import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";

import type { SalaryCandidate } from "../../data/salary/detection";
import type { Settings } from "../../data/types";
import { useLang, useT } from "../../i18n";
import { formatBalance, formatMonthLabel } from "../../utils/format";
import { Button } from "../form";
import { Modal } from "../Modal";

type Props = {
  open: boolean;
  candidates: readonly SalaryCandidate[];
  // Candidate indices where a new employer group starts — drives the
  // "likely new employer" separators.
  boundaries: readonly number[];
  settings: Settings;
  onClose: () => void;
  onAdd: (selected: SalaryCandidate[]) => void;
};

function confidenceLabel(t: ReturnType<typeof useT>, confidence: number) {
  if (confidence >= 0.75) return t("salary.confidenceHigh");
  if (confidence >= 0.5) return t("salary.confidenceMedium");
  return t("salary.confidenceLow");
}

export function SalaryFindModal({
  open,
  candidates,
  boundaries,
  settings,
  onClose,
  onAdd,
}: Props) {
  const t = useT();
  const lang = useLang();

  // Selection by sourceRowId; everything starts checked so "Add" with no
  // fiddling keeps all detected salaries.
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    if (!open) return;
    setSelected(new Set(candidates.map((c) => c.sourceRowId)));
  }, [open, candidates]);

  const boundarySet = useMemo(() => new Set(boundaries), [boundaries]);
  const selectedCount = selected.size;

  function toggle(sourceRowId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(sourceRowId)) next.delete(sourceRowId);
      else next.add(sourceRowId);
      return next;
    });
  }

  function handleAdd() {
    const picked = candidates.filter((c) => selected.has(c.sourceRowId));
    if (picked.length > 0) onAdd(picked);
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="salary-find-title"
      size="max-w-lg"
      centered
    >
      <Modal.Header
        icon={<Search size={14} aria-hidden focusable={false} />}
        title={t("salary.findTitle")}
        onClose={onClose}
      />
      <Modal.Body>
        {candidates.length === 0 ? (
          <p className="px-1 py-6 text-center text-sm text-muted">
            {t("salary.findNone")}
          </p>
        ) : (
          <>
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-xs text-muted">{t("salary.findIntro")}</p>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setSelected(new Set(candidates.map((c) => c.sourceRowId)))
                  }
                  className="cursor-pointer rounded border border-line px-2 py-1 text-xs text-muted hover:text-fg"
                >
                  {t("salary.addAll")}
                </button>
                <button
                  type="button"
                  onClick={() => setSelected(new Set())}
                  className="cursor-pointer rounded border border-line px-2 py-1 text-xs text-muted hover:text-fg"
                >
                  {t("salary.discardAll")}
                </button>
              </div>
            </div>
            <ul className="flex flex-col gap-1">
              {candidates.map((c, i) => {
                const checked = selected.has(c.sourceRowId);
                return (
                  <li key={c.sourceRowId}>
                    {boundarySet.has(i) && i > 0 && (
                      <div className="mt-2 mb-1 flex items-center gap-2 text-[10px] font-bold tracking-wider uppercase text-meta">
                        <span className="h-px flex-1 bg-line" />
                        {t("salary.likelyNewEmployer")}
                        <span className="h-px flex-1 bg-line" />
                      </div>
                    )}
                    <label className="flex cursor-pointer items-center gap-3 rounded border border-line bg-surface-2 px-3 py-2 hover:border-accent">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(c.sourceRowId)}
                        className="h-4 w-4 shrink-0 accent-accent"
                      />
                      <span className="flex-1 font-mono text-sm text-fg-bright">
                        {formatMonthLabel(c.monthKey, lang)}
                      </span>
                      <span className="rounded-full border border-line px-1.5 py-0.5 text-[10px] text-muted">
                        {confidenceLabel(t, c.confidence)}
                      </span>
                      <span className="w-28 text-right font-mono tabular-nums text-sm text-fg">
                        {formatBalance(c.net, settings)}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        {candidates.length > 0 && (
          <Button
            variant="primary"
            onClick={handleAdd}
            disabled={selectedCount === 0}
          >
            {`${t("salary.add")} · ${selectedCount}`}
          </Button>
        )}
      </Modal.Footer>
    </Modal>
  );
}
