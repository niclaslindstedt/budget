import { useState } from "react";
import { Ban, EyeOff, Plus, Search } from "lucide-react";

import type { CarExpenseCandidate } from "../../data/cars/find";
import { newId } from "../../data/sheet";
import type { Car, CarExpense, EntryType, Settings } from "../../data/types";
import { useResetOnOpen } from "../../hooks";
import { useLang, useT } from "../../i18n";
import { displayTypeName } from "../../i18n/preset-names";
import {
  distanceUnitLabel,
  formatBalance,
  formatDate,
  parseAmount,
} from "../../utils/format";
import { Button, Checkbox } from "../form";
import { CategoryIconGlyph } from "../icons";
import { Modal } from "../Modal";

// The "Find car expenses" picker: every transport-typed bank charge not
// yet attributed to a car, multi-selected and committed as one
// `addCarExpenses` undo entry. Bulk-select like the repairs picker
// (transport charges are high-volume — select-all-then-add beats a
// one-at-a-time walk), with the items finder's persisted dismissals per
// row: Ignore drops one charge forever, Exclude similar drops every
// charge sharing the description. Both dispatch immediately — the
// candidate list recomputes and the row disappears.
//
// `centered`: checkboxes and buttons only — nothing opens the soft
// keyboard.

type Props = {
  open: boolean;
  car: Car | null;
  candidates: CarExpenseCandidate[];
  settings: Settings;
  // Merged preset + user types, for each candidate's type name + glyph.
  typesById: ReadonlyMap<string, EntryType>;
  onClose: () => void;
  onAdd: (carId: string, expenses: CarExpense[]) => void;
  onIgnore: (entryId: string) => void;
  onExcludeSimilar: (description: string) => void;
};

export function CarExpenseFinderModal({
  open,
  car,
  candidates,
  settings,
  typesById,
  onClose,
  onAdd,
  onIgnore,
  onExcludeSimilar,
}: Props) {
  const t = useT();
  const lang = useLang();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  // Per-candidate distance strings, keyed by entry id — only collected
  // for a car-pool import (see `isPool`).
  const [distances, setDistances] = useState<ReadonlyMap<string, string>>(
    new Map(),
  );

  useResetOnOpen(open, car?.id, () => {
    setSelected(new Set());
    setDistances(new Map());
  });

  if (!open || !car) return null;

  // Car pool: a pool car has no odometer of its own, so every imported
  // usage must carry the distance it covered — that per-trip distance is
  // the only way the pool car's total distance and cost-per-distance can
  // be known. The unit is a display label; the number is stored as typed.
  const isPool = car.ownership === "pool";
  const unit = distanceUnitLabel(settings);

  const selectedCandidates = candidates.filter((c) => selected.has(c.entryId));
  const selectedCount = selectedCandidates.length;
  const allSelected =
    candidates.length > 0 && selectedCount === candidates.length;
  // Every selected pool trip needs a positive distance before the import
  // can commit; a non-pool import has no such gate.
  const allSelectedHaveDistance =
    !isPool ||
    selectedCandidates.every((c) => {
      const d = parseAmount(distances.get(c.entryId) ?? "");
      return d !== null && d > 0;
    });

  function setDistance(entryId: string, value: string) {
    setDistances((prev) => {
      const next = new Map(prev);
      next.set(entryId, value);
      return next;
    });
  }

  function toggle(entryId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(entryId)) next.delete(entryId);
      else next.add(entryId);
      return next;
    });
  }

  function toggleAll() {
    setSelected(
      allSelected ? new Set() : new Set(candidates.map((c) => c.entryId)),
    );
  }

  function handleAdd() {
    if (!car) return;
    const expenses: CarExpense[] = candidates
      .filter((c) => selected.has(c.entryId))
      .map((c) => {
        const d = isPool ? parseAmount(distances.get(c.entryId) ?? "") : null;
        return {
          id: newId(),
          date: c.date,
          amount: c.amount,
          description: c.description,
          typeId: c.typeId,
          accountId: c.accountId,
          sourceHistoryId: c.entryId,
          ...(d !== null && d > 0 ? { distance: Math.abs(d) } : {}),
        };
      });
    if (expenses.length > 0) onAdd(car.id, expenses);
    onClose();
  }

  return (
    <Modal
      open
      onClose={onClose}
      labelledBy="car-expense-finder-title"
      size="max-w-xl"
      // A pool import adds a per-row distance field, which opens the soft
      // keyboard — so it can't be centered (the footer must clear the
      // keyboard). A non-pool import is checkboxes only and stays centered.
      centered={!isPool}
    >
      <Modal.Header
        icon={<Search size={14} aria-hidden focusable={false} />}
        title={t("carsSheet.findTitle")}
        onClose={onClose}
      />
      <Modal.Body>
        {candidates.length === 0 ? (
          <p className="m-0 py-6 text-center text-sm text-muted">
            {t("carsSheet.findEmpty")}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="m-0 text-xs text-muted">
              {t("carsSheet.findIntro", { name: car.name })}
            </p>
            {isPool && (
              <p className="m-0 text-xs text-muted">
                {t("carsSheet.findDistanceHint", { unit })}
              </p>
            )}
            <Checkbox
              checked={allSelected}
              onChange={toggleAll}
              label={t("carsSheet.selectAll")}
            />
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
              {candidates.map((candidate) => {
                const type = typesById.get(candidate.typeId);
                return (
                  <li key={`${candidate.accountId}:${candidate.entryId}`}>
                    <div className="flex items-center gap-2.5 rounded border border-line bg-surface-2 px-3 py-2 text-sm hover:bg-surface">
                      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5">
                        <input
                          type="checkbox"
                          checked={selected.has(candidate.entryId)}
                          onChange={() => toggle(candidate.entryId)}
                          className="size-4 shrink-0 accent-accent"
                        />
                        <CategoryIconGlyph
                          name={type?.glyph ?? "receipt"}
                          size={16}
                          className="shrink-0 text-accent"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-fg-bright">
                            {candidate.description}
                          </span>
                          <span className="block truncate text-xs text-muted">
                            {formatDate(
                              candidate.date,
                              settings.dateFormat,
                              lang,
                            )}
                            {type ? ` · ${displayTypeName(type, t)}` : ""}
                          </span>
                        </span>
                        <span className="shrink-0 tabular-nums text-fg-bright">
                          {formatBalance(candidate.amount, settings, {
                            neverAbbreviate: true,
                          })}
                        </span>
                      </label>
                      {isPool && (
                        <input
                          type="text"
                          inputMode="decimal"
                          value={distances.get(candidate.entryId) ?? ""}
                          onChange={(e) =>
                            setDistance(candidate.entryId, e.target.value)
                          }
                          placeholder={unit}
                          aria-label={t("carsSheet.findDistanceAria", { unit })}
                          className="field-input w-16 shrink-0 rounded border border-line bg-surface-2 px-2 py-1 text-right text-sm tabular-nums text-fg"
                        />
                      )}
                      <button
                        type="button"
                        onClick={() => onIgnore(candidate.entryId)}
                        aria-label={t("carsSheet.ignoreEntry")}
                        title={t("carsSheet.ignoreEntryHint")}
                        className="cursor-pointer rounded border-0 bg-transparent p-1 text-muted hover:text-danger"
                      >
                        <EyeOff size={14} aria-hidden focusable={false} />
                      </button>
                      <button
                        type="button"
                        onClick={() => onExcludeSimilar(candidate.description)}
                        aria-label={t("carsSheet.excludeSimilar")}
                        title={t("carsSheet.excludeSimilarHint")}
                        className="cursor-pointer rounded border-0 bg-transparent p-1 text-muted hover:text-danger"
                      >
                        <Ban size={14} aria-hidden focusable={false} />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
            {isPool && selectedCount > 0 && !allSelectedHaveDistance && (
              <p className="m-0 text-xs text-danger">
                {t("carsSheet.findDistanceMissing")}
              </p>
            )}
          </div>
        )}
      </Modal.Body>
      {candidates.length > 0 && (
        <Modal.Footer>
          <Button
            variant="primary"
            withIcon
            disabled={selectedCount === 0 || !allSelectedHaveDistance}
            onClick={handleAdd}
          >
            <Plus size={16} aria-hidden focusable={false} />
            {selectedCount === 1
              ? t("carsSheet.addCountOne", { n: selectedCount })
              : t("carsSheet.addCountOther", { n: selectedCount })}
          </Button>
        </Modal.Footer>
      )}
    </Modal>
  );
}
