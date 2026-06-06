import { useMemo, useState } from "react";
import { Drill, PaintRoller, Plus, ReceiptText, Wrench } from "lucide-react";

import type { RepairCandidate } from "../../data/property-repairs/candidates";
import { PRESET_TYPE_RENOVATIONS_ID } from "../../data/presets/types";
import { newId } from "../../data/sheet";
import type { PropertyRepair, Settings } from "../../data/types";
import { useResetOnOpen } from "../../hooks";
import { useLang, useT } from "../../i18n";
import { formatBalance, formatShortDate } from "../../utils/format";
import { Button } from "../form";
import { Modal } from "../Modal";

// The "Add repairs / renovations" picker: every unused Repairs / Renovations
// charge across all accounts, multi-selected and committed as the property's
// repairs. A repair sources from exactly one charge and a charge backs at
// most one property, so `candidates` already excludes anything any property
// has consumed.

type Props = {
  open: boolean;
  candidates: RepairCandidate[];
  settings: Settings;
  onClose: () => void;
  onAdd: (repairs: PropertyRepair[]) => void;
};

export function RepairsAddModal({
  open,
  candidates,
  settings,
  onClose,
  onAdd,
}: Props) {
  const t = useT();
  const lang = useLang();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());

  useResetOnOpen(open, undefined, () => setSelected(new Set()));

  const selectedCount = selected.size;
  const orderedCandidates = useMemo(() => candidates, [candidates]);

  function toggle(entryId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(entryId)) next.delete(entryId);
      else next.add(entryId);
      return next;
    });
  }

  function handleAdd() {
    const repairs: PropertyRepair[] = orderedCandidates
      .filter((c) => selected.has(c.entryId))
      .map((c) => ({
        id: newId(),
        date: c.date,
        amount: c.amount,
        description: c.description,
        typeId: c.typeId,
        accountId: c.accountId,
        sourceHistoryId: c.entryId,
      }));
    if (repairs.length > 0) onAdd(repairs);
    onClose();
  }

  if (!open) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="repairs-add-title"
      size="max-w-xl"
      centered
    >
      <Modal.Header
        icon={<Wrench size={14} aria-hidden focusable={false} />}
        title={t("properties.addRepairsTitle")}
        onClose={onClose}
      />
      <Modal.Body>
        {orderedCandidates.length === 0 ? (
          <p className="m-0 py-6 text-center text-sm text-muted">
            {t("properties.addRepairsEmpty")}
          </p>
        ) : (
          <>
            <span className="mb-2 block text-xs font-bold tracking-wider text-muted uppercase">
              {t("properties.addRepairsSelect")}
            </span>
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
              {orderedCandidates.map((candidate) => (
                <RepairCandidateRow
                  key={`${candidate.accountId}:${candidate.entryId}`}
                  candidate={candidate}
                  settings={settings}
                  lang={lang}
                  checked={selected.has(candidate.entryId)}
                  onToggle={() => toggle(candidate.entryId)}
                />
              ))}
            </ul>
          </>
        )}
      </Modal.Body>
      {orderedCandidates.length > 0 && (
        <Modal.Footer>
          <Button
            variant="primary"
            withIcon
            disabled={selectedCount === 0}
            onClick={handleAdd}
          >
            <Plus size={16} aria-hidden focusable={false} />
            {selectedCount === 1
              ? t("properties.addRepairsOne", { count: selectedCount })
              : t("properties.addRepairsOther", { count: selectedCount })}
          </Button>
        </Modal.Footer>
      )}
    </Modal>
  );
}

function RepairCandidateRow({
  candidate,
  settings,
  lang,
  checked,
  onToggle,
}: {
  candidate: RepairCandidate;
  settings: Settings;
  lang: ReturnType<typeof useLang>;
  checked: boolean;
  onToggle: () => void;
}) {
  const t = useT();
  const isRenovation = candidate.typeId === PRESET_TYPE_RENOVATIONS_ID;
  const Glyph = isRenovation ? PaintRoller : Drill;
  const typeLabel = isRenovation
    ? t("properties.repairTypeRenovations")
    : t("properties.repairTypeRepairs");

  return (
    <li>
      <label className="flex cursor-pointer items-center gap-2.5 rounded border border-line bg-surface-2 px-3 py-2 text-sm hover:bg-surface">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          className="size-4 shrink-0 accent-accent"
        />
        <Glyph
          size={16}
          className="shrink-0 text-accent"
          aria-label={typeLabel}
          focusable={false}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-fg-bright">
            {candidate.description || typeLabel}
          </span>
          <span className="block truncate text-xs text-muted tabular-nums">
            {formatShortDate(candidate.date, settings.shortDateFormat, lang)}
          </span>
        </span>
        {candidate.hasReceipt && (
          <ReceiptText
            size={14}
            className="shrink-0 text-success"
            aria-label={t("properties.repairHasReceipt")}
            focusable={false}
          />
        )}
        <span className="shrink-0 tabular-nums text-fg-bright">
          {formatBalance(candidate.amount, settings, { neverAbbreviate: true })}
        </span>
      </label>
    </li>
  );
}
