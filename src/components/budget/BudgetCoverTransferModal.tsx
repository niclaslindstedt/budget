import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, HandCoins, Wallet } from "lucide-react";

import type { Account, HistoryEntry, Saving, Settings } from "../../data/types";
import { type FloatingPlacement } from "../../hooks";
import { useT } from "../../i18n";
import {
  formatAmountForInput,
  formatDate,
  withCurrency,
} from "../../utils/format";
import { tintBorder, tintFill } from "../../utils/tint";
import type { CategoryIcon } from "../../data/types";
import { FloatingPanel } from "../FloatingPanel";
import { Modal } from "../Modal";
import { Button, ClearableTextarea, FormSection } from "../form";
import { CategoryIconGlyph } from "../icons";

// One selectable money source — an `Account` or a `Saving` flattened to the
// fields the picker renders. The cover transfer's `from` may be either, since
// both keep transactions under their id in `UserData.history`.
type Source = {
  id: string;
  name: string;
  glyph?: CategoryIcon;
  color?: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  // The imported transactions being reimbursed and their summed magnitude.
  coveredEntries: HistoryEntry[];
  total: number;
  // The account the covered transactions live on — excluded from the
  // "from" list (you can't cover an account from itself).
  toAccountId: string;
  accounts: Account[];
  savings: Saving[];
  settings: Settings;
  // (fromAccountId, motivation) — the rest is derived by the flow hook.
  onCreate: (fromAccountId: string, motivation: string) => void;
};

export function BudgetCoverTransferModal({
  open,
  onClose,
  coveredEntries,
  total,
  toAccountId,
  accounts,
  savings,
  settings,
  onCreate,
}: Props) {
  const t = useT();
  const [fromId, setFromId] = useState("");
  const [motivation, setMotivation] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);

  // Reset the draft each time the modal opens for a fresh selection.
  useEffect(() => {
    if (open) {
      setFromId("");
      setMotivation("");
      setPickerOpen(false);
    }
  }, [open]);

  const accountSources: Source[] = accounts
    .filter((a) => a.id !== toAccountId)
    .map((a) => ({ id: a.id, name: a.name, glyph: a.glyph, color: a.color }));
  const savingSources: Source[] = savings
    .filter((s) => s.id !== toAccountId)
    .map((s) => ({ id: s.id, name: s.name, glyph: s.glyph, color: s.color }));
  const selected =
    [...accountSources, ...savingSources].find((s) => s.id === fromId) ?? null;

  const canCreate = fromId !== "";
  const handleCreate = () => {
    if (!canCreate) return;
    onCreate(fromId, motivation);
  };

  const count = coveredEntries.length;

  return (
    <Modal open={open} onClose={onClose} labelledBy="cover-modal-title">
      <Modal.Header
        icon={<HandCoins size={14} aria-hidden focusable={false} />}
        title={t("coverTransfer.createTitle")}
        onClose={onClose}
      />
      <Modal.Body>
        <div className="flex flex-col gap-4">
          <p className="text-xs text-muted">{t("coverTransfer.createHint")}</p>

          <FormSection label={t("coverTransfer.fromLabel")}>
            <SourcePicker
              selected={selected}
              accountSources={accountSources}
              savingSources={savingSources}
              open={pickerOpen}
              onToggle={() => setPickerOpen((v) => !v)}
              onClose={() => setPickerOpen(false)}
              onPick={(id) => {
                setFromId(id);
                setPickerOpen(false);
              }}
            />
          </FormSection>

          <FormSection as="label" label={t("coverTransfer.motivationLabel")}>
            <ClearableTextarea
              value={motivation}
              onValueChange={setMotivation}
              placeholder={t("coverTransfer.motivationPlaceholder")}
              rows={2}
              className="field-input w-full min-w-0 rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-fg"
            />
          </FormSection>

          <div className="flex flex-col gap-2 rounded border border-line bg-surface-2 p-3">
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-muted">
                {count === 1
                  ? t("coverTransfer.coveringOne", { n: count })
                  : t("coverTransfer.coveringOther", { n: count })}
              </span>
              <span className="font-mono text-base font-bold tabular-nums text-fg-bright">
                {withCurrency(formatAmountForInput(total, settings), settings)}
              </span>
            </div>
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
          {t("common.cancel")}
        </Button>
        <Button variant="primary" onClick={handleCreate} disabled={!canCreate}>
          {t("coverTransfer.create")}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

const SOURCE_PICKER_PLACEMENT: FloatingPlacement = {
  width: { kind: "min", minPx: 240 },
  anchor: "left",
  coordinateSpace: "viewport",
};

function SourcePicker({
  selected,
  accountSources,
  savingSources,
  open,
  onToggle,
  onClose,
  onPick,
}: {
  selected: Source | null;
  accountSources: Source[];
  savingSources: Source[];
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  onPick: (id: string) => void;
}) {
  const t = useT();
  const triggerRef = useRef<HTMLDivElement>(null);
  return (
    <div ref={triggerRef} className="relative">
      <button
        type="button"
        onClick={onToggle}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="field-input flex w-full cursor-pointer items-center gap-2 rounded border border-line bg-surface px-2 py-1.5 text-left text-sm text-fg-bright hover:border-accent focus-visible:outline-none"
      >
        <SourceGlyph source={selected} />
        <span className="flex-1 truncate">
          {selected ? selected.name : t("coverTransfer.fromPlaceholder")}
        </span>
        <ChevronDown
          size={14}
          className="shrink-0 text-muted"
          aria-hidden
          focusable={false}
        />
      </button>
      <FloatingPanel
        open={open}
        onClose={onClose}
        triggerRef={triggerRef}
        placement={SOURCE_PICKER_PLACEMENT}
      >
        <ul role="listbox" className="max-h-64 overflow-auto py-1">
          <SourceGroup
            label={t("coverTransfer.accountsGroup")}
            sources={accountSources}
            selectedId={selected?.id ?? null}
            onPick={onPick}
          />
          <SourceGroup
            label={t("coverTransfer.savingsGroup")}
            sources={savingSources}
            selectedId={selected?.id ?? null}
            onPick={onPick}
          />
        </ul>
      </FloatingPanel>
    </div>
  );
}

function SourceGroup({
  label,
  sources,
  selectedId,
  onPick,
}: {
  label: string;
  sources: Source[];
  selectedId: string | null;
  onPick: (id: string) => void;
}) {
  if (sources.length === 0) return null;
  return (
    <>
      <li className="px-3 pt-2 pb-1 text-[0.65rem] font-bold tracking-wider text-muted uppercase">
        {label}
      </li>
      {sources.map((s) => (
        <li key={s.id}>
          <button
            type="button"
            role="option"
            aria-selected={s.id === selectedId}
            onClick={() => onPick(s.id)}
            className="flex w-full cursor-pointer items-center gap-2 border-0 bg-transparent px-3 py-2 text-left text-sm text-fg hover:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
          >
            <SourceGlyph source={s} />
            <span className="flex-1 truncate">{s.name}</span>
            {s.id === selectedId && (
              <Check
                size={14}
                className="text-accent"
                aria-hidden
                focusable={false}
              />
            )}
          </button>
        </li>
      ))}
    </>
  );
}

function SourceGlyph({ source }: { source: Source | null }) {
  return (
    <span
      aria-hidden
      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border"
      style={{
        color: source?.color,
        backgroundColor: source?.color ? tintFill(source.color) : undefined,
        borderColor: source?.color ? tintBorder(source.color) : undefined,
      }}
    >
      {source?.glyph ? (
        <CategoryIconGlyph name={source.glyph} size={12} />
      ) : (
        <Wallet size={12} aria-hidden focusable={false} />
      )}
    </span>
  );
}
